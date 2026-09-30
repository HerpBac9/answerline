/**
 * End-to-end check of the answering path against the real local RAG stack.
 *
 * This intentionally duplicates only the HTTP boundary of src/main/rag.ts and
 * src/main/llm.ts: the probe is a standalone diagnostic that can run without
 * Electron. It verifies embedding, Qdrant retrieval, prompt assembly and the
 * streaming LLM response in one command.
 *
 *   node scripts/answer-probe.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadSystemPrompt } from './load-system-prompt.mjs'
import { llmRequestOptions, readLlmSettings } from './llm-settings.mjs'
import { SERVICE_DEFAULTS, readUserConfig } from './runtime-config.mjs'
import { formatEmbeddingInput } from './embedding-input.mjs'

const root = process.cwd()

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

const fileConfig = readUserConfig().config
const defaults = SERVICE_DEFAULTS
const CONFIG = {
  ...defaults,
  ...fileConfig,
  llmBaseUrl: fileConfig.llmBaseUrl ?? defaults.llmBaseUrl,
  llmModel: fileConfig.llmModel ?? defaults.llmModel,
  qdrantUrl: process.env.QDRANT_URL ?? fileConfig.ragQdrantUrl ?? defaults.qdrantUrl,
  collection: process.env.QDRANT_COLLECTION ?? fileConfig.ragCollection ?? defaults.collection,
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? fileConfig.ragEmbeddingBaseUrl ?? defaults.embeddingBaseUrl,
  embeddingModel: process.env.EMBEDDING_MODEL ?? fileConfig.ragEmbeddingModel ?? defaults.embeddingModel,
  topK: Number.parseInt(process.env.RAG_TOP_K ?? fileConfig.ragTopK ?? defaults.topK, 10),
  maxContextTokens: Number.parseInt(process.env.RAG_MAX_CONTEXT_TOKENS ?? fileConfig.ragMaxContextTokens ?? defaults.maxContextTokens, 10),
  minScore: Number.parseFloat(process.env.RAG_MIN_SCORE ?? fileConfig.ragMinScore ?? defaults.minScore),
}
for (const key of ['llmBaseUrl', 'qdrantUrl', 'embeddingBaseUrl']) CONFIG[key] = CONFIG[key].replace(/\/$/, '')
const LLM = readLlmSettings({
  baseUrl: CONFIG.llmBaseUrl,
  model: CONFIG.llmModel,
  maxTokens: CONFIG.answerMaxTokens,
})

const CANDIDATE_MULTIPLIER = 4
const LEXICAL_WEIGHT = 0.15
const LEXICAL_ACCEPTANCE_THRESHOLD = 0.5
const RETRIEVAL_STOPWORDS = new Set([
  'а', 'без', 'бы', 'в', 'во', 'вот', 'вы', 'где', 'для', 'до', 'же', 'за', 'и', 'из', 'или',
  'как', 'какая', 'какие', 'каким', 'какой', 'когда', 'кто', 'на', 'над', 'не', 'но', 'о', 'об',
  'от', 'по', 'под', 'при', 'про', 'с', 'со', 'так', 'то', 'у', 'что', 'чем', 'это', 'я',
  'the', 'and', 'are', 'for', 'how', 'what', 'why', 'with', 'from', 'when', 'which',
])

const SYSTEM = loadSystemPrompt(root)


function stripUntrusted(text) {
  return text.replace(/<\/?(?:transcript|question|retrieved_context|evidence|role|security)\b[^>]*>/giu, '').replace(/<\|[^|]*\|>/gu, '')
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

async function json(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) throw new Error(`${url} failed HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

async function retrieve(question) {
  const started = performance.now()
  const embedding = await json(`${CONFIG.embeddingBaseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.embeddingModel,
      input: [formatEmbeddingInput(CONFIG.embeddingModel, stripUntrusted(question), 'query')],
    }),
  })
  const vector = embedding?.data?.[0]?.embedding
  if (!Array.isArray(vector)) throw new Error('embedding endpoint returned no vector')

  const search = await json(`${CONFIG.qdrantUrl}/collections/${encodeURIComponent(CONFIG.collection)}/points/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vector, limit: Math.max(CONFIG.topK * CANDIDATE_MULTIPLIER, CONFIG.topK), with_payload: true, with_vector: false }),
  })
  const hits = deduplicateQuestions((search.result ?? [])
    .filter((hit) => typeof hit.payload?.question === 'string' && typeof hit.payload?.answer === 'string')
    .map((hit) => {
      const semanticScore = Number(hit.score)
      const lexicalScore = retrievalLexicalScore(question, hit.payload.question)
      return { ...hit, score: semanticScore + lexicalScore * LEXICAL_WEIGHT, semanticScore, lexicalScore }
    })
    .sort((left, right) => right.score - left.score)
  ).slice(0, CONFIG.topK)
    .filter((hit) => hit.semanticScore >= CONFIG.minScore || hit.lexicalScore >= LEXICAL_ACCEPTANCE_THRESHOLD)
  const blocks = []
  for (const hit of hits) {
    const payload = hit.payload
    const block = `<evidence source="${String(payload.source_file ?? 'qdrant').replace(/[<>\"]/g, '')}" module="${String(payload.module ?? 'unknown').replace(/[<>\"]/g, '')}" score="${Number(hit.score).toFixed(3)}">\nQuestion: ${stripUntrusted(payload.question)}\nAnswer: ${stripUntrusted(payload.answer)}\n</evidence>`
    const candidate = [...blocks, block].join('\n\n')
    if (estimateTokens(candidate) > CONFIG.maxContextTokens) break
    blocks.push(block)
  }
  return {
    text: blocks.length ? `<retrieved_context>\n${blocks.join('\n\n')}\n</retrieved_context>` : '',
    hits,
    latencyMs: Math.round(performance.now() - started),
  }
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

function retrievalLexicalScore(query, candidateQuestion) {
  const queryTokens = new Set((query.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? []).filter((token) => !RETRIEVAL_STOPWORDS.has(token)))
  const candidateTokens = new Set((candidateQuestion.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? []).filter((token) => !RETRIEVAL_STOPWORDS.has(token)))
  if (queryTokens.size === 0) return 0
  return [...queryTokens].filter((token) => candidateTokens.has(token)).length / queryTokens.size
}

async function resolveModel() {
  if (LLM.model && LLM.model !== 'auto') return LLM.model
  const payload = await json(`${LLM.baseUrl}/api/v1/models`)
  const loaded = (payload.models ?? []).filter((model) => model.type === 'llm' && model.loaded_instances?.length > 0)
  if (loaded.length !== 1) throw new Error(`expected exactly one loaded LLM, found ${loaded.length}`)
  return loaded[0].key
}

const model = await resolveModel()
console.log(`model: ${model}`)
console.log(`RAG: ${CONFIG.collection} @ ${CONFIG.qdrantUrl}`)
console.log(`embedding: ${CONFIG.embeddingModel}`)
console.log(`LLM settings: ${JSON.stringify(LLM)}`)

const history = []

async function ask(question) {
  const started = performance.now()
  const retrieval = await retrieve(question)
  console.log(`\n--- ${question}`)
  console.log(`    retrieval ${retrieval.latencyMs}ms, ${retrieval.hits.length} hit(s)`)
  for (const hit of retrieval.hits.slice(0, 3)) {
    const variant = hit.payload.matched_question && hit.payload.matched_question !== hit.payload.question
      ? ` [matched: ${hit.payload.matched_question}]`
      : ''
    console.log(`    ${Number(hit.score).toFixed(3)} ${hit.payload.module ?? '?'} — ${hit.payload.question}${variant}`)
  }

  const userTurn = `<transcript>\n(нет предыдущей реплики)\n</transcript>\n\n${retrieval.text}\n\n<question>\n${stripUntrusted(question)}\n</question>`
  const response = await fetch(`${LLM.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: userTurn }], ...llmRequestOptions(LLM) }),
  })
  if (!response.ok || !response.body) throw new Error(`LM Studio HTTP ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  let answer = ''
  let ttft = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffered += decoder.decode(value, { stream: true })
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      const delta = parseSseDelta(line)
      if (delta) {
        if (ttft === null) ttft = performance.now() - started
        answer += delta
      }
    }
  }
  const tail = parseSseDelta(buffered)
  if (tail) answer += tail

  // Keep history request-scoped like Session: evidence is not copied into the next turn.
  history.push({ role: 'user', content: `<question>\n${stripUntrusted(question)}\n</question>` })
  answer = normalizeAnswerFormatting(answer)
  history.push({ role: 'assistant', content: answer })
  console.log(`    TTFT ${Math.round(ttft ?? -1)}ms, total ${Math.round(performance.now() - started)}ms, ${answer.length} chars`)
  console.log(answer.trim())
  return answer
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

const first = await ask('Расскажите о вашем опыте построения RAG-системы для технических данных')
const second = await ask('Какие ограничения и компромиссы были в этом решении?')

console.log('\nChecks')
console.log(first.length > 80 ? '  ok    first answer is substantive' : '  warn  first answer is very short')
console.log(second.length > 80 ? '  ok    follow-up is substantive' : '  warn  follow-up is very short')
console.log('  info  Read the retrieved modules and answers above; this is the runtime path used by Session.')
