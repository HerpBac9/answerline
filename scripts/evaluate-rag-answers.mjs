/**
 * Real end-to-end answer evaluation for the current retrieval index and loaded
 * local LLM. It runs 70 natural interview questions covering recruiter themes
 * and the user's own project, retrieves a personal answer and general knowledge
 * answers through separate filters, asks the LLM independently for each answer,
 * and writes machine-readable and human-readable reports.
 *
 *   npm run rag:answers
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadSystemPrompt, systemPromptPath } from './load-system-prompt.mjs'
import { llmRequestOptions, readLlmSettings } from './llm-settings.mjs'
import { SERVICE_DEFAULTS, readUserConfig } from './runtime-config.mjs'
import { formatEmbeddingInput } from './embedding-input.mjs'
import { loadQuestionSet } from './question-set.mjs'

const root = resolve(process.cwd())
const outputJson = resolve(process.env.RAG_ANSWER_OUTPUT ?? join(root, 'out', 'rag-answer-evaluation.json'))
const outputMarkdown = outputJson.replace(/\.json$/iu, '.md')

function loadDotEnv() {
  const path = join(root, '.env')
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!key || key in process.env) continue
    process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/s, '$2')
  }
}

loadDotEnv()

const defaults = SERVICE_DEFAULTS
const fileConfig = readUserConfig().config
const config = {
  ...defaults,
  llmBaseUrl: fileConfig.llmBaseUrl ?? defaults.llmBaseUrl,
  llmModel: fileConfig.llmModel ?? defaults.llmModel,
  answerMaxTokens: fileConfig.answerMaxTokens ?? defaults.answerMaxTokens,
  qdrantUrl: process.env.QDRANT_URL ?? fileConfig.ragQdrantUrl ?? defaults.qdrantUrl,
  collection: process.env.QDRANT_COLLECTION ?? fileConfig.ragCollection ?? defaults.collection,
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? fileConfig.ragEmbeddingBaseUrl ?? defaults.embeddingBaseUrl,
  embeddingModel: process.env.EMBEDDING_MODEL ?? fileConfig.ragEmbeddingModel ?? defaults.embeddingModel,
  generalTopK: Number.parseInt(process.env.RAG_GENERAL_TOP_K ?? process.env.RAG_TOP_K ?? fileConfig.ragGeneralTopK ?? defaults.ragGeneralTopK ?? fileConfig.ragTopK ?? defaults.topK, 10),
  personalTopK: Number.parseInt(process.env.RAG_PERSONAL_TOP_K ?? fileConfig.ragPersonalTopK ?? defaults.ragPersonalTopK ?? 1, 10),
  personalMinScore: Number.parseFloat(process.env.RAG_PERSONAL_MIN_SCORE ?? fileConfig.ragPersonalMinScore ?? defaults.ragPersonalMinScore ?? 0.60),
  maxContextTokens: Number.parseInt(process.env.RAG_MAX_CONTEXT_TOKENS ?? fileConfig.ragMaxContextTokens ?? defaults.maxContextTokens, 10),
  minScore: Number.parseFloat(process.env.RAG_MIN_SCORE ?? fileConfig.ragMinScore ?? defaults.minScore),
}
const contextDisabled = process.env.RAG_DISABLE_CONTEXT === '1'
for (const key of ['llmBaseUrl', 'qdrantUrl', 'embeddingBaseUrl']) config[key] = config[key].replace(/\/$/u, '')
const llm = readLlmSettings({
  baseUrl: config.llmBaseUrl,
  model: config.llmModel,
  maxTokens: config.answerMaxTokens,
})

const CANDIDATE_MULTIPLIER = 4
const PERSONAL_AUTHORITIES = ['internal_project', 'personal_experience']
const LEXICAL_WEIGHT = 0.15
const RETRIEVAL_STOPWORDS = new Set([
  'а', 'без', 'бы', 'в', 'во', 'вот', 'вы', 'где', 'для', 'до', 'же', 'за', 'и', 'из', 'или',
  'как', 'какая', 'какие', 'каким', 'какой', 'когда', 'кто', 'на', 'над', 'не', 'но', 'о', 'об',
  'от', 'по', 'под', 'при', 'про', 'с', 'со', 'так', 'то', 'у', 'что', 'чем', 'это', 'я',
  'the', 'and', 'are', 'for', 'how', 'what', 'why', 'with', 'from', 'when', 'which',
])

/** Natural interview questions, not copied from source headings. */
const defaultQueries = [
  { id: 'interview-01', focus: 'general', question: 'Чем AI-агент отличается от обычного вызова LLM и от чат-бота с RAG?' },
  { id: 'interview-02', focus: 'general', question: 'Почему вам интересна позиция руководителя команды ML и AI-агентов?' },
  { id: 'interview-03', focus: 'personal', question: 'Расскажите о вашем опыте руководства проектами по разработке AI-решений.' },
  { id: 'interview-04', focus: 'general', question: 'Как вы проектируете мультиагентную систему и разделяете роли между агентами?' },
  { id: 'interview-05', focus: 'personal', question: 'Приведите пример мультиагентной системы, которую вы спроектировали.' },
  { id: 'interview-06', focus: 'general', question: 'Что вы обычно мониторите в промышленной AI-системе кроме времени ответа модели?' },
  { id: 'interview-07', focus: 'general', question: 'Как выстраиваете AI Product Development Lifecycle от идеи до production?' },
  { id: 'interview-08', focus: 'personal', question: 'Как бы вы за минуту описали ваш проект техническому руководителю?' },
  { id: 'interview-09', focus: 'personal', question: 'Какую часть вашего проекта вы сделали лично и за что отвечали как руководитель?' },
  { id: 'interview-10', focus: 'personal', question: 'Какую конкретную проблему вашей предметной области решает этот проект?' },
  { id: 'interview-11', focus: 'personal', question: 'Как появилась идея этого проекта и с какого прототипа вы начинали?' },
  { id: 'interview-12', focus: 'personal', question: 'Был ли проект в production и кто сейчас им пользуется?' },
  { id: 'interview-13', focus: 'personal', question: 'Какой практический эффект от внедрения проекта вы можете назвать?' },
  { id: 'interview-14', focus: 'personal', question: 'Какие варианты входных данных принимает проект?' },
  { id: 'interview-15', focus: 'personal', question: 'Как проект обрабатывает PDF со спецификацией?' },
  { id: 'interview-16', focus: 'personal', question: 'Как система получает описание задачи, если на вход подали номер в Яндекс Трекере?' },
  { id: 'interview-17', focus: 'personal', question: 'Что делает агент после того, как получил текст функционального дизайна?' },
  { id: 'interview-18', focus: 'personal', question: 'Как проект понимает требование добавить поле в таблицу, если оно написано обычным языком?' },
  { id: 'interview-19', focus: 'personal', question: 'Что происходит, если в функциональном дизайне прямо указана таблица InventTable?' },
  { id: 'interview-20', focus: 'personal', question: 'Как вы находите нужную таблицу, если в требованиях написано только «таблица номенклатур»?' },
  { id: 'interview-21', focus: 'personal', question: 'Что такое label в D365 F&O и почему его нельзя подменять похожим текстом?' },
  { id: 'interview-22', focus: 'personal', question: 'Что делает проект, если одна метка используется в нескольких объектах?' },
  { id: 'interview-23', focus: 'personal', question: 'Какую информацию возвращает поиск по индексу metadata?' },
  { id: 'interview-24', focus: 'personal', question: 'Как устроена база объектов и методов проекта и какого она размера?' },
  { id: 'interview-25', focus: 'personal', question: 'Зачем вам нужен metadata graph и что в нём хранится?' },
  { id: 'interview-26', focus: 'personal', question: 'Какие базы знаний кроме основной metadata базы используются в проекте?' },
  { id: 'interview-27', focus: 'personal', question: 'Что в проекте является источником истины: SQLite, Qdrant, модель или XML?' },
  { id: 'interview-28', focus: 'personal', question: 'Что вы называете snapshot базы знаний и зачем храните commit?' },
  { id: 'interview-29', focus: 'personal', question: 'Как каждый день обновляются базы знаний проекта?' },
  { id: 'interview-30', focus: 'personal', question: 'Что делает команда обновления базы знаний и почему обновление выполняется инкрементально?' },
  { id: 'interview-31', focus: 'personal', question: 'Какие файлы или базы обновляются при новом commit metadata?' },
  { id: 'interview-32', focus: 'personal', question: 'Когда вы строите embeddings и почему не перестраиваете их каждое утро?' },
  { id: 'interview-33', focus: 'personal', question: 'Что именно попадает в embedding текста label и что вы туда намеренно не добавляете?' },
  { id: 'interview-34', focus: 'personal', question: 'Как вы измеряли качество поиска labels с опечатками и какие метрики использовали?' },
  { id: 'interview-35', focus: 'personal', question: 'Как в проекте разделены русские и английские метки и title/message сценарии?' },
  { id: 'interview-36', focus: 'personal', question: 'Как система выбирает маршрут поиска для object ID, FD, label и метода?' },
  { id: 'interview-37', focus: 'personal', question: 'Когда вы используете FTS5, а когда vector retrieval?' },
  { id: 'interview-38', focus: 'personal', question: 'Как вы не даёте RAG-результату стать неподтверждённым фактом о metadata?' },
  { id: 'interview-39', focus: 'personal', question: 'Как проект находит каноническую метку, если пользователь допустил опечатку в её тексте?' },
  { id: 'interview-40', focus: 'personal', question: 'Почему после vector retrieval вы всё равно разрешаете результат через точную SQLite/FTS5-базу?' },
  { id: 'interview-41', focus: 'personal', question: 'Как проект строит план разработки по найденным требованиям?' },
  { id: 'interview-42', focus: 'personal', question: 'Зачем в вашем процессе нужен approval плана человеком?' },
  { id: 'interview-43', focus: 'personal', question: 'Что именно получает инструмент после подтверждения плана?' },
  { id: 'interview-44', focus: 'personal', question: 'Почему агент не должен сам вручную редактировать XML после анализа?' },
  { id: 'interview-45', focus: 'personal', question: 'Что делает отдельный агент проверки после выполнения изменений?' },
  { id: 'interview-46', focus: 'personal', question: 'Как проект создаёт ветку и возвращает разработчику результат?' },
  { id: 'interview-47', focus: 'personal', question: 'Где заканчивается ответственность проекта и начинается code review разработчика?' },
  { id: 'interview-48', focus: 'personal', question: 'Какие этапы проходит одна задача от FD до итогового manifest?' },
  { id: 'interview-49', focus: 'personal', question: 'Какие артефакты сохраняются по каждой задаче и зачем?' },
  { id: 'interview-50', focus: 'personal', question: 'Как проект восстанавливает незавершённую задачу после перезапуска сервера?' },
  { id: 'interview-51', focus: 'personal', question: 'Что происходит с планом, если пользователь ответил на уточняющий вопрос и изменил решение?' },
  { id: 'interview-52', focus: 'personal', question: 'Как вы связываете утверждённый plan, payload и фактический diff?' },
  { id: 'interview-53', focus: 'personal', question: 'Что хранится в реестре workflow и зачем он нужен агенту?' },
  { id: 'interview-54', focus: 'personal', question: 'Что входит в контракт этого инструмента?' },
  { id: 'interview-55', focus: 'personal', question: 'Как валидируется payload до того, как он изменит metadata?' },
  { id: 'interview-56', focus: 'personal', question: 'Как вы ограничиваете пути записи и права инструментов?' },
  { id: 'interview-57', focus: 'personal', question: 'Как работает preflight и что именно может откатить transaction?' },
  { id: 'interview-58', focus: 'personal', question: 'Как вы проверяете, что изменение затронуло только нужные файлы, поля и методы?' },
  { id: 'interview-59', focus: 'personal', question: 'Как обрабатываете ошибку инструмента и повторную попытку?' },
  { id: 'interview-60', focus: 'personal', question: 'Какие операции с таблицами, формами, меню, security и отчётами поддерживает ваш контур?' },
  { id: 'interview-61', focus: 'personal', question: 'Как была устроена первая версия проекта на Python, XML и CLI?' },
  { id: 'interview-62', focus: 'personal', question: 'Почему вы переносите инструменты с Python/XML на C# MCP-сервер?' },
  { id: 'interview-63', focus: 'personal', question: 'Что такое MCP в этом проекте и какую границу он задаёт между моделью и инструментом?' },
  { id: 'interview-64', focus: 'personal', question: 'Что делает C# MetadataHost и зачем ему Microsoft.Dynamics.AX.Metadata.dll?' },
  { id: 'interview-65', focus: 'personal', question: 'Почему официальный Metadata API лучше прямого редактирования XML при смене версий D365?' },
  { id: 'interview-66', focus: 'personal', question: 'Почему Python остаётся в новой архитектуре, если запись metadata переносится в C#?' },
  { id: 'interview-67', focus: 'personal', question: 'Как вы организовали очередь для 13 разработчиков и почему выбрали последовательную обработку?' },
  { id: 'interview-68', focus: 'personal', question: 'Как устроены права, service accounts, токены и аудит между CLI, проектом и MCP?' },
  { id: 'interview-69', focus: 'personal', question: 'Как вы связываете task ID, утверждённый план, фактический diff и commit?' },
  { id: 'interview-70', focus: 'personal', question: 'Какие метрики retrieval вы используете и как объясняете Recall@5, MRR и top_k на собеседовании?' },
]
const queries = loadQuestionSet(root, defaultQueries)

const configuredPromptPath = process.env.RAG_SYSTEM_PROMPT_FILE?.trim() || systemPromptPath(root, config.personalTopK)
const SYSTEM = loadSystemPrompt(root, configuredPromptPath)


function stripUntrusted(text) {
  return String(text).replace(/<\/?(?:transcript|question|retrieved_context|evidence|personal_experience|knowledge_context|role|security)\b[^>]*>/giu, '').replace(/<\|[^|]*\|>/gu, '')
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

function normalizeAnswerFormatting(text) {
  return String(text)
    .replace(/\$\\leftrightarrow\$/giu, '↔')
    .replace(/\\leftrightarrow/giu, '↔')
    .replace(/\$\\(?:rightarrow|longrightarrow|to)\$/giu, '→')
    .replace(/\\(?:rightarrow|longrightarrow|to)/giu, '→')
    .replace(/\$([^$\r\n]+)\$/gu, '$1')
    .trim()
}

async function readResponse(response) {
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

async function embed(query) {
  const response = await fetch(`${config.embeddingBaseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: [formatEmbeddingInput(config.embeddingModel, stripUntrusted(query), 'query')],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = await readResponse(response)
  const vector = body?.data?.[0]?.embedding
  if (!Array.isArray(vector)) throw new Error('embedding endpoint returned no vector')
  return vector
}

async function retrieve(query) {
  if (contextDisabled) {
    return {
      text: '',
      hits: [],
      contextHits: 0,
      personalContextHits: 0,
      generalContextHits: 0,
      personalScore: null,
      contextTokens: 0,
      latencyMs: 0,
    }
  }
  const started = performance.now()
  const vector = await embed(query)
  const personalCandidateTopK = Math.max(config.personalTopK, 5)
  const [personalCandidates, generalCandidates] = await Promise.all([
    config.personalTopK === 0 ? Promise.resolve([]) : search(vector, personalCandidateTopK, personalFilter()),
    search(vector, config.generalTopK, generalFilter()),
  ])
  const personalHit = rerankCandidates(query, personalCandidates, config.personalTopK)
    .at(0) ?? null
  const rankedGeneral = rerankCandidates(query, generalCandidates, config.generalTopK)
  const generalHits = rankedGeneral
  const context = buildContextSections(personalHit ? [personalHit] : [], generalHits)
  const hits = personalHit ? [personalHit, ...generalHits] : generalHits
  return {
    text: context.text,
    hits,
    contextHits: context.contextHits,
    personalContextHits: context.personalContextHits,
    generalContextHits: context.generalContextHits,
    personalScore: personalHit?.semanticScore ?? null,
    contextTokens: estimateTokens(context.text),
    latencyMs: Math.round(performance.now() - started),
  }
}

async function search(vector, limit, filter) {
  const response = await fetch(`${config.qdrantUrl}/collections/${encodeURIComponent(config.collection)}/points/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      vector,
      limit: Math.max(limit * CANDIDATE_MULTIPLIER, limit),
      filter,
      with_payload: true,
      with_vector: false,
    }),
    signal: AbortSignal.timeout(5_000),
  })
  const body = await readResponse(response)
  return (body?.result ?? [])
    .filter((hit) => typeof hit.payload?.question === 'string' && typeof hit.payload?.answer === 'string' && Number.isFinite(Number(hit.score)))
    .map((hit) => ({
      ...hit,
      score: Number(hit.score),
      semanticScore: Number(hit.score),
      lexicalScore: 0,
    }))
}

function personalFilter() {
  return {
    should: [
      ...PERSONAL_AUTHORITIES.map((authority) => ({ key: 'authority', match: { value: authority } })),
    ],
  }
}

function generalFilter() {
  return {
    must_not: [
      ...PERSONAL_AUTHORITIES.map((authority) => ({ key: 'authority', match: { value: authority } })),
    ],
  }
}

function rerankCandidates(query, candidates, limit) {
  const ranked = candidates
    .map((hit) => ({
      ...hit,
      lexicalScore: lexicalOverlap(query, [hit.payload.question, ...(Array.isArray(hit.payload.aliases) ? hit.payload.aliases : [])].join(' ')),
      score: hit.semanticScore + lexicalOverlap(query, [hit.payload.question, ...(Array.isArray(hit.payload.aliases) ? hit.payload.aliases : [])].join(' ')) * LEXICAL_WEIGHT,
    }))
    .sort((left, right) => right.score - left.score)
  const seen = new Set()
  return ranked.filter((hit) => {
    const key = hit.payload.record_key
      ?? hit.payload.question.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru-RU')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, limit)
}

function buildContextSections(personalHits, generalHits) {
  const sections = []
  const personalContextHits = appendContextSection(sections, 'personal_experience', personalHits)
  const generalContextHits = appendContextSection(sections, 'knowledge_context', generalHits)
  const text = sections.length ? `<retrieved_context>\n${sections.join('\n\n')}\n</retrieved_context>` : ''
  return { text, contextHits: personalContextHits + generalContextHits, personalContextHits, generalContextHits }
}

function appendContextSection(sections, sectionName, hits) {
  if (hits.length === 0) return 0
  const blocks = []
  for (const hit of hits) {
    const payload = hit.payload
    const source = String(payload.source_file ?? 'qdrant').replace(/[<>"]/gu, '')
    const module = String(payload.module ?? 'unknown').replace(/[<>"]/gu, '')
    const block = `<evidence source="${source}" module="${module}" score="${Number(hit.score).toFixed(3)}">\nQuestion: ${stripUntrusted(payload.question)}\nAnswer: ${stripUntrusted(payload.answer)}\n</evidence>`
    const candidateSection = `<${sectionName}>\n${[...blocks, block].join('\n\n')}\n</${sectionName}>`
    const candidate = [...sections, candidateSection].join('\n\n')
    if (estimateTokens(`<retrieved_context>\n${candidate}\n</retrieved_context>`) > config.maxContextTokens) break
    blocks.push(block)
  }
  if (blocks.length === 0) return 0
  sections.push(`<${sectionName}>\n${blocks.join('\n\n')}\n</${sectionName}>`)
  return blocks.length
}

async function resolveModel() {
  if (llm.model && llm.model !== 'auto') return llm.model
  const response = await fetch(`${llm.baseUrl}/api/v1/models`, { signal: AbortSignal.timeout(5_000) })
  const body = await readResponse(response)
  const loaded = (body.models ?? []).filter((model) => model.type === 'llm' && model.loaded_instances?.length > 0)
  if (loaded.length !== 1) throw new Error(`expected exactly one loaded LLM, found ${loaded.length}`)
  return loaded[0].key
}

async function generate(model, question, context) {
  const started = performance.now()
  const userTurn = `<transcript>\n(нет предыдущей реплики)\n</transcript>\n\n${context.text}\n\n<question>\n${stripUntrusted(question)}\n</question>`
  const response = await fetch(`${llm.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userTurn }], ...llmRequestOptions(llm) }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok || !response.body) throw new Error(`LLM HTTP ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  let answer = ''
  let ttftMs = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffered += decoder.decode(value, { stream: true })
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      const delta = parseSseDelta(line)
      if (delta) {
        if (ttftMs === null) ttftMs = performance.now() - started
        answer += delta
      }
    }
  }
  const tail = parseSseDelta(buffered)
  if (tail) answer += tail
  return { answer: normalizeAnswerFormatting(answer), ttftMs: ttftMs === null ? null : Math.round(ttftMs), totalMs: Math.round(performance.now() - started) }
}

function parseSseDelta(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return ''
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return ''
  try {
    const delta = JSON.parse(data)?.choices?.[0]?.delta?.content
    return typeof delta === 'string' ? delta : ''
  } catch {
    return ''
  }
}

function lexicalOverlap(query, candidateQuestion) {
  const queryTokens = new Set((query.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? []).filter((word) => !RETRIEVAL_STOPWORDS.has(word)))
  const candidateTokens = new Set((candidateQuestion.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? []).filter((word) => !RETRIEVAL_STOPWORDS.has(word)))
  if (queryTokens.size === 0) return 0
  return [...queryTokens].filter((word) => candidateTokens.has(word)).length / queryTokens.size
}

function evidenceOverlap(answer, hits) {
  const answerWords = new Set((answer.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{3,}/giu) ?? []))
  const evidenceWords = new Set((hits.flatMap((hit) => [hit.payload.question, hit.payload.answer]).join(' ').toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{3,}/giu) ?? []))
  const meaningful = [...answerWords].filter((word) => !/^(это|также|когда|чтобы|можно|нужно|если|для|при|как|что|this|that|with|from|then|were|have)$/iu.test(word))
  if (meaningful.length === 0) return 0
  return meaningful.filter((word) => evidenceWords.has(word)).length / meaningful.length
}

function markdownReport(report) {
  const lines = [
    '# Real RAG answer evaluation',
    '',
    `Generated: ${report.generated_at}`,
    `Model: ${report.llm_model}`,
    `Embedding: ${report.embedding_model}`,
    '',
    `- Questions: ${report.summary.count}`,
    `- Personal experience: top-${report.personal_top_k} personal-pool hit; cosine is logged but does not gate the slot`,
    `- Knowledge context: top-${report.general_top_k} general-pool hits`,
    `- Context mode: ${report.context_mode}`,
    `- Full contexts passed to LLM: ${report.summary.full_context_percent}%`,
    `- Substantive answers (>=80 chars): ${report.summary.substantive_percent}%`,
    `- Average LLM total: ${report.summary.average_llm_ms} ms`,
    `- Average TTFT: ${report.summary.average_ttft_ms} ms`,
    '',
  ]
  for (const item of report.results) {
    if (item.error) {
      lines.push(`## ${item.id}`, `**Question:** ${item.question}`, `**Error:** ${item.error}`, '')
      continue
    }
    lines.push(`## ${item.id}`)
    lines.push(`**Question:** ${item.question}`)
    lines.push(`**Focus:** ${item.focus ?? 'n/a'}`)
    lines.push(`**Retrieval:** personal=${item.personal_experience_hits} (cosine=${item.personal_score ?? 'n/a'}), knowledge=${item.knowledge_context_hits}, context=${item.context_hits} chunks/${item.context_tokens} tokens, latency=${item.retrieval_ms} ms`)
    lines.push(`**LLM:** TTFT=${item.ttft_ms ?? 'n/a'} ms, total=${item.llm_total_ms} ms, chars=${item.answer.length}, overlap=${Math.round(item.evidence_overlap * 100)}%`)
    lines.push('', item.answer || '_empty answer_', '')
  }
  return `${lines.join('\n')}\n`
}

const model = await resolveModel()
console.log(`Model: ${model}`)
console.log(`Embedding: ${config.embeddingModel}`)
console.log(`Questions: ${queries.length}`)
console.log('Running sequentially to keep the local LLM load deterministic…\n')

const results = []
for (let index = 0; index < queries.length; index += 1) {
  const query = queries[index]
  const started = performance.now()
  try {
    const context = await retrieve(query.question)
    const generated = await generate(model, query.question, context)
    const item = {
      ...query,
      retrieval_ms: context.latencyMs,
      context_hits: context.contextHits,
      personal_experience_hits: context.personalContextHits,
      knowledge_context_hits: context.generalContextHits,
      personal_present: context.personalContextHits > 0,
      personal_score: context.personalScore,
      context_tokens: context.contextTokens,
      context_text: context.text,
      hits: context.hits.map((hit) => ({
        score: hit.score,
        semantic_score: hit.semanticScore,
        lexical_score: hit.lexicalScore,
        record_key: hit.payload.record_key ?? null,
        module: hit.payload.module,
        question: hit.payload.question,
        matched_question: hit.payload.matched_question ?? null,
        variant_index: hit.payload.variant_index ?? null,
        source_file: hit.payload.source_file,
        section_index: hit.payload.section_index,
      })),
      ttft_ms: generated.ttftMs,
      llm_total_ms: generated.totalMs,
      total_ms: Math.round(performance.now() - started),
      answer: generated.answer,
      substantive: generated.answer.length >= 80,
      evidence_overlap: evidenceOverlap(generated.answer, context.hits),
      forbidden_markers: /<\/?(?:system|user|assistant|instructions|retrieved_context|personal_experience|knowledge_context|evidence)\b[^>]*>/iu.test(generated.answer),
    }
    results.push(item)
    console.log(`\n=== ${String(index + 1).padStart(2, '0')}/${queries.length} ${item.id} ===`)
    console.log(`Question: ${item.question}`)
    console.log(`Retrieved context: personal=${item.personal_experience_hits} (cosine=${item.personal_score ?? 'n/a'}), knowledge=${item.knowledge_context_hits}, ${item.context_hits}/${context.hits.length} chunks, ~${item.context_tokens} tokens, ${item.retrieval_ms}ms`)
    console.log(`LLM: TTFT=${item.ttft_ms ?? 'n/a'}ms, total=${item.llm_total_ms}ms, chars=${item.answer.length}`)
    console.log('Answer:')
    console.log(item.answer || '(empty)')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({ ...query, error: message, total_ms: Math.round(performance.now() - started), hits: [] })
    console.log(`${String(index + 1).padStart(2, '0')}/${queries.length} ERROR ${message}`)
  }
}

const completed = results.filter((item) => !item.error)
const substantive = completed.filter((item) => item.substantive).length
const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
const report = {
  generated_at: new Date().toISOString(),
  collection: config.collection,
  llm_model: model,
  llm_settings: llm,
  embedding_model: config.embeddingModel,
  system_prompt_file: configuredPromptPath,
  context_mode: contextDisabled ? 'disabled' : 'rag',
  general_top_k: config.generalTopK,
  personal_top_k: config.personalTopK,
  max_context_tokens: config.maxContextTokens,
  results,
  summary: {
    count: results.length,
    completed: completed.length,
    errors: results.length - completed.length,
    full_context_percent: results.length ? Math.round(completed.filter((item) => item.knowledge_context_hits === config.generalTopK && item.context_hits === item.hits.length).length / results.length * 1000) / 10 : 0,
    substantive_percent: results.length ? Math.round(substantive / results.length * 1000) / 10 : 0,
    average_retrieval_ms: average(completed.map((item) => item.retrieval_ms)),
    average_llm_ms: average(completed.map((item) => item.llm_total_ms)),
    average_ttft_ms: average(completed.filter((item) => item.ttft_ms !== null).map((item) => item.ttft_ms)),
    average_answer_chars: average(completed.map((item) => item.answer.length)),
    average_context_tokens: average(completed.map((item) => item.context_tokens)),
    personal_experience_queries: completed.filter((item) => item.personal_present).length,
    personal_queries: queries.filter((query) => query.focus === 'personal').length,
    personal_with_experience_percent: (() => {
      const personalCompleted = completed.filter((item) => item.focus === 'personal')
      return personalCompleted.length ? Math.round(personalCompleted.filter((item) => item.personal_present).length / personalCompleted.length * 1000) / 10 : 0
    })(),
    low_evidence_overlap_count: completed.filter((item) => item.evidence_overlap < 0.15).length,
    forbidden_marker_count: completed.filter((item) => item.forbidden_markers).length,
  },
}

mkdirSync(join(root, 'out'), { recursive: true })
writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
writeFileSync(outputMarkdown, markdownReport(report), 'utf8')
console.log(`\nSummary: ${JSON.stringify(report.summary)}`)
console.log(`JSON report: ${outputJson}`)
console.log(`Markdown report: ${outputMarkdown}`)
