import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { formatEmbeddingInput } from './embedding-input.mjs'
import { loadQuestionSet } from './question-set.mjs'

/**
 * Evaluate retrieval against paraphrased interview questions.
 *
 * This is intentionally a small, reviewable set of questions rather than a
 * score produced by an LLM. There is no module routing or module-based score:
 * every question is sent to the same global index as a real interview query.
 * The report and console output contain complete answers for every hit.
 */

const root = resolve(process.cwd())

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

const qdrantUrl = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '')
const collection = process.env.QDRANT_COLLECTION ?? 'answerline_qa'
const embeddingBaseUrl = (process.env.EMBEDDING_BASE_URL ?? 'http://127.0.0.1:1234').replace(/\/$/, '')
const embeddingModel = process.env.EMBEDDING_MODEL ?? 'text-embedding-qwen3-0.6b-text-embedding'
const topK = positiveInteger(process.env.RAG_EVAL_TOP_K ?? process.env.RAG_TOP_K, 5)
const minScore = Number.parseFloat(process.env.RAG_MIN_SCORE ?? '0.45')
const outputPath = resolve(process.env.RAG_EVAL_OUTPUT ?? join(root, 'out', 'rag-evaluation.json'))
const dataDir = resolve(process.env.RAG_DATA_DIR ?? join(root, 'data'))
const moduleFilter = process.env.RAG_EVAL_MODULE?.trim() || null
const normalizeTerms = process.env.RAG_NORMALIZE_TERMS === '1'
const terminologyPath = resolve(process.env.RAG_TERMINOLOGY_FILE ?? join(root, 'resources', 'it-ru-terms.md'))
const CANDIDATE_MULTIPLIER = 4
const LEXICAL_WEIGHT = 0.15
const LEXICAL_ACCEPTANCE_THRESHOLD = 0.5
const RETRIEVAL_STOPWORDS = new Set([
  'а', 'без', 'бы', 'в', 'во', 'вот', 'вы', 'где', 'для', 'до', 'же', 'за', 'и', 'из', 'или',
  'как', 'какая', 'какие', 'каким', 'какой', 'когда', 'кто', 'на', 'над', 'не', 'но', 'о', 'об',
  'от', 'по', 'под', 'при', 'про', 'с', 'со', 'так', 'то', 'у', 'что', 'чем', 'это', 'я',
  'the', 'and', 'are', 'for', 'how', 'what', 'why', 'with', 'from', 'when', 'which',
])

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createTerminologyResolver() {
  if (!normalizeTerms) return { resolve: (text) => ({ resolvedText: text, replacements: [] }) }
  if (!existsSync(terminologyPath)) throw new Error(`Terminology file does not exist: ${terminologyPath}`)

  const rules = []
  for (const line of readFileSync(terminologyPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\|\s*`?([^|`]+?)`?\s*\|\s*([^|]+?)\s*\|\s*$/)
    if (!match) continue
    const canonical = match[1].trim()
    if (!canonical || canonical.toLowerCase() === 'canonical' || /^-+$/.test(canonical)) continue
    for (const alias of match[2].split(';').map((value) => value.trim()).filter(Boolean)) {
      rules.push({
        canonical,
        alias,
        expression: new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(alias)})(?=$|[^\\p{L}\\p{N}])`, 'giu'),
      })
    }
  }
  rules.sort((left, right) => right.alias.length - left.alias.length || left.alias.localeCompare(right.alias))

  return {
    resolve(text) {
      let resolvedText = text
      const replacements = []
      for (const rule of rules) {
        rule.expression.lastIndex = 0
        resolvedText = resolvedText.replace(rule.expression, (_whole, prefix, matched) => {
          if (matched === rule.canonical) return `${prefix}${matched}`
          replacements.push({ source: matched, canonical: rule.canonical, provenance: terminologyPath })
          return `${prefix}${rule.canonical}`
        })
      }
      return { resolvedText, replacements }
    },
  }
}

const terminology = createTerminologyResolver()

function sourceEncodingWarnings() {
  if (!existsSync(dataDir)) return []
  return readdirSync(dataDir)
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .map((name) => {
      const bytes = readFileSync(join(dataDir, name))
      const questionMarks = bytes.reduce((count, byte) => count + (byte === 0x3f ? 1 : 0), 0)
      return { file: name, question_mark_bytes: questionMarks }
    })
    .filter((entry) => entry.question_mark_bytes >= 1000)
}

/** Deliberately paraphrased; none of these is copied from a source heading. */
const defaultQueries = [
  { id: 'rag-01', question: 'Как организовать поиск знаний для AI-системы так, чтобы найденный фрагмент не считался доказательством сам по себе?' },
  { id: 'rag-02', question: 'Какими способами сравнивать качество разных стратегий разбиения документов и retrieval?' },
  { id: 'rag-03', question: 'Зачем совмещать обычный текстовый поиск с векторным при работе с техническими терминами?' },
  { id: 'rag-04', question: 'Как отличить плохой chunking от ошибки embedding-модели или генерации ответа?' },
  { id: 'rag-05', question: 'Как использовать RAG внутри помощника для разработки D365, а не превращать его в самостоятельный исполнитель?' },

  { id: 'agent-01', question: 'В чём практическая разница между агентом с инструментами и обычным чат-ботом, который один раз отвечает через RAG?' },
  { id: 'agent-02', question: 'Какие данные нужно сохранять в состоянии многошагового агентского процесса между вызовами инструментов?' },
  { id: 'agent-03', question: 'Как сделать повтор операции безопасным, если внешний tool завершился ошибкой или сеть оборвалась?' },
  { id: 'agent-04', question: 'Как разделить долговременные знания, историю эпизодов и процедурные инструкции агента?' },

  { id: 'lifecycle-01', question: 'Какие контрольные этапы должна пройти AI-инициатива от исходной проблемы до масштабирования или остановки?' },
  { id: 'lifecycle-02', question: 'Как проверить, что выбранный AI use case действительно имеет измеримую пользу, а не просто выглядит интересным?' },
  { id: 'lifecycle-03', question: 'Чем PoC отличается от MVP и почему успешная демонстрация ещё не означает готовность к эксплуатации?' },
  { id: 'lifecycle-04', question: 'Что должно входить в исходный baseline до начала внедрения AI-решения?' },

  { id: 'security-01', question: 'Как построить threat model для агента, который читает данные и вызывает внешние инструменты?' },
  { id: 'security-02', question: 'Какие уровни защиты нужны от prompt injection в документах, вопросах и результатах retrieval?' },
  { id: 'security-03', question: 'Когда действие агента обязательно должно останавливаться до подтверждения человеком?' },
  { id: 'security-04', question: 'Как ограничить права инструментов и не передавать секреты в prompt или trace?' },

  { id: 'design-01', question: 'Какие вопросы нужно задать в начале system design, чтобы определить масштаб, задержку и требования к доступности?' },
  { id: 'design-02', question: 'Как спроектировать границы между клиентом, оркестратором, моделью, tools и хранилищем состояния?' },
  { id: 'design-03', question: 'Что предусмотреть в архитектуре, если модель или downstream-сервис временно недоступны?' },
  { id: 'design-04', question: 'Как выбирать между синхронным запросом, очередью заданий и сохранением checkpoint процесса?' },

  { id: 'eval-01', question: 'Как составить набор проверочных примеров для оценки ответов AI до запуска в production?' },
  { id: 'eval-02', question: 'Какие сигналы и trace-поля помогут понять, на каком этапе pipeline появился неправильный результат?' },
  { id: 'eval-03', question: 'Как обнаруживать деградацию качества после изменения prompt, индекса или версии модели?' },
  { id: 'eval-04', question: 'Какие offline и online метрики нужны для контроля качества и полезности AI-системы?' },
  { id: 'eval-05', question: 'Как отличить уверенный ответ модели от ответа, который нужно отправить на ручную проверку?' },

  { id: 'production-01', question: 'Что должно быть доказано перед переводом AI-сервиса из пилота в промышленную эксплуатацию?' },
  { id: 'production-02', question: 'Как связать SLI, SLO и SLA для сервиса, где задержка модели непостоянна?' },
  { id: 'production-03', question: 'Как распределить latency budget между API, retrieval, инструментами и генерацией?' },
  { id: 'production-04', question: 'Какие operational-практики нужны после rollout: наблюдение, runbook, откат и поддержка пользователей?' },
]
const queries = loadQuestionSet(root, defaultQueries)

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  if (!response.ok) throw new Error(`${url} failed HTTP ${response.status}: ${JSON.stringify(parsed)}`)
  return parsed
}

async function embed(items) {
  const payload = await postJson(`${embeddingBaseUrl}/v1/embeddings`, {
    model: embeddingModel,
    input: items.map((item) => formatEmbeddingInput(embeddingModel, item, 'query')),
  })
  const data = Array.isArray(payload?.data) ? payload.data : []
  const vectors = data
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => item.embedding)
  if (vectors.length !== items.length || vectors.some((vector) => !Array.isArray(vector))) {
    throw new Error(`Embedding endpoint returned ${vectors.length} vectors for ${items.length} questions`)
  }
  return vectors
}

function compactHit(hit) {
  return {
    score: hit.score,
    semantic_score: hit.semanticScore,
    lexical_score: hit.lexicalScore,
    record_key: hit.payload?.record_key ?? null,
    question: hit.payload?.question ?? null,
    matched_question: hit.payload?.matched_question ?? null,
    variant_index: hit.payload?.variant_index ?? null,
    answer: hit.payload?.answer ?? null,
    source_file: hit.payload?.source_file ?? null,
    section_index: hit.payload?.section_index ?? null,
  }
}

async function search(vector) {
  return postJson(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/search`, {
    vector,
    limit: Math.max(topK * CANDIDATE_MULTIPLIER, topK),
    with_payload: true,
    with_vector: false,
    ...(moduleFilter ? { filter: { must: [{ key: 'module', match: { value: moduleFilter } }] } } : {}),
  })
}

function retrievalLexicalScore(query, candidateQuestion, aliases = []) {
  const queryTokens = new Set((query.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? []).filter((token) => !RETRIEVAL_STOPWORDS.has(token)))
  const candidateText = [candidateQuestion, ...(Array.isArray(aliases) ? aliases : [])].join(' ')
  const candidateTokens = new Set((candidateText.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? []).filter((token) => !RETRIEVAL_STOPWORDS.has(token)))
  if (queryTokens.size === 0) return 0
  return [...queryTokens].filter((token) => candidateTokens.has(token)).length / queryTokens.size
}

function rerank(query, rawHits) {
  return deduplicateQuestions(rawHits
    .filter((hit) => typeof hit.payload?.question === 'string' && typeof hit.payload?.answer === 'string')
    .map((hit) => {
      const semanticScore = Number(hit.score)
      const lexicalScore = retrievalLexicalScore(query, hit.payload.question, hit.payload.aliases)
      return { ...hit, score: semanticScore + lexicalScore * LEXICAL_WEIGHT, semanticScore, lexicalScore }
    })
    .sort((left, right) => right.score - left.score)
  ).slice(0, topK)
    .filter((hit) => hit.semanticScore >= minScore || hit.lexicalScore >= LEXICAL_ACCEPTANCE_THRESHOLD)
}

function deduplicateQuestions(hits) {
  const seen = new Set()
  return hits.filter((hit) => {
    const key = hit.payload.record_key
      ?? hit.payload.question.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru-RU')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function quality(results) {
  const hitCounts = results.map((result) => result.hits.length)
  const allHits = results.flatMap((result) => result.hits)
  const average = (values) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0
  return {
    count: results.length,
    top_k: topK,
    queries_with_full_top_k: hitCounts.filter((count) => count === topK).length,
    minimum_hits_per_query: Math.min(...hitCounts),
    average_hits_per_query: average(hitCounts),
    average_semantic_score: average(allHits.map((hit) => hit.semantic_score)),
    average_reranked_score: average(allHits.map((hit) => hit.score)),
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  const preparedQueries = queries.map((query) => {
    const resolved = terminology.resolve(query.question)
    return { ...query, normalized_question: resolved.resolvedText, replacements: resolved.replacements }
  })
  if (normalizeTerms) {
    for (const query of preparedQueries) {
      console.log(`[terminology] ${query.question} -> ${query.normalized_question}`)
    }
  }
  const vectors = await embed(preparedQueries.map((query) => query.normalized_question))
  const results = []
  for (let index = 0; index < preparedQueries.length; index += 1) {
    const query = preparedQueries[index]
    const response = await search(vectors[index])
    results.push({
      ...query,
      hits: rerank(query.question, response.result ?? []).map(compactHit),
    })
  }

  const summary = quality(results)
  const encodingWarnings = sourceEncodingWarnings()

  mkdirSync(join(root, 'out'), { recursive: true })
  const report = {
    generated_at: startedAt,
    collection,
    embedding_model: embeddingModel,
    top_k: topK,
    summary,
    source_encoding_warnings: encodingWarnings,
    results,
  }
  await import('node:fs/promises').then(({ writeFile }) => writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'))

  for (const result of results) {
    console.log(`\n=== ${result.id} ===`)
    console.log(`Question: ${result.question}`)
    if (result.normalized_question !== result.question) {
      console.log(`Normalized query: ${result.normalized_question}`)
      console.log(`Replacements: ${result.replacements.map((item) => `${item.source} -> ${item.canonical}`).join(', ')}`)
    }
    if (!result.hits.length) {
      console.log('No context passed the retrieval threshold.')
      continue
    }
    result.hits.forEach((hit, index) => {
      console.log(`\n--- context ${index + 1}/${result.hits.length} | score=${Number(hit.score).toFixed(4)} | semantic=${Number(hit.semantic_score).toFixed(4)} | lexical=${Number(hit.lexical_score).toFixed(3)} | ${hit.source_file}:${hit.section_index} ---`)
      console.log(`Found question: ${hit.question}`)
      if (hit.matched_question && hit.matched_question !== hit.question) console.log(`Matched variant: ${hit.matched_question}`)
      console.log('Found answer:')
      console.log(hit.answer ?? '(empty)')
    })
  }
  console.log(`\nEvaluated ${summary.count} paraphrased queries`)
  console.log(`Collection: ${collection}`)
  console.log(`Module filter: ${moduleFilter ?? 'none'}`)
  console.log(`Embedding model: ${embeddingModel}`)
  console.log(`Terminology normalization: ${normalizeTerms ? `enabled (${terminologyPath})` : 'disabled'}`)
  console.log(`Top-K: ${topK}`)
  console.log(`Queries with ${topK} contexts: ${summary.queries_with_full_top_k}/${summary.count}`)
  console.log(`Average contexts per query: ${summary.average_hits_per_query.toFixed(2)}`)
  console.log(`Average semantic score: ${summary.average_semantic_score.toFixed(3)}`)
  console.log(`Report: ${outputPath}`)
  if (encodingWarnings.length) {
    console.log('WARNING: source files contain many literal question-mark bytes; repair source text and reindex:')
    for (const warning of encodingWarnings) console.log(`  ${warning.file}: ${warning.question_mark_bytes}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
