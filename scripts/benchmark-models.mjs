/**
 * Compare local embedding and answer models through LM Studio.
 *
 * Embeddings are compared against the same in-memory copy of data/. LLMs are
 * loaded one at a time while the selected embedding model stays loaded. The
 * report contains timings and answers side by side; correctness is deliberately
 * not delegated to another LLM.
 *
 * Examples:
 *   npm run benchmark:models -- --list
 *   BENCHMARK_EMBEDDING_MODEL=text-embedding-embeddinggemma-300m \
 *   BENCHMARK_LLM_MODELS='qwen3.5-9b-uncensored-hauhaucs-aggressive,gemma-4-e4b-uncensored-hauhaucs-aggressive,prism-ml/bonsai-27b' \
 *   npm run benchmark:models
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { formatEmbeddingInput } from './embedding-input.mjs'
import { BENCHMARK_QUESTIONS } from './benchmark-questions.mjs'
import { loadSystemPrompt } from './load-system-prompt.mjs'
import { llmRequestOptions, readLlmSettings } from './llm-settings.mjs'
import { SERVICE_DEFAULTS, readUserConfig } from './runtime-config.mjs'

const root = resolve(process.cwd())
loadDotEnv()
const fileConfig = readUserConfig().config
const apiBase = (process.env.LM_STUDIO_BASE_URL ?? process.env.LLM_BASE_URL ?? fileConfig.llmBaseUrl ?? SERVICE_DEFAULTS.llmBaseUrl).replace(/\/$/u, '')
const qdrantUrl = (process.env.QDRANT_URL ?? fileConfig.ragQdrantUrl ?? SERVICE_DEFAULTS.ragQdrantUrl).replace(/\/$/u, '')
const collection = process.env.QDRANT_COLLECTION ?? fileConfig.ragCollection ?? SERVICE_DEFAULTS.ragCollection
const dataDir = resolve(process.env.RAG_DATA_DIR ?? join(root, 'data'))
const outputPath = resolve(process.env.BENCHMARK_OUTPUT ?? join(root, 'out', 'model-benchmark.json'))
const embeddingModel = process.env.BENCHMARK_EMBEDDING_MODEL ?? process.env.EMBEDDING_MODEL ?? fileConfig.ragEmbeddingModel ?? SERVICE_DEFAULTS.ragEmbeddingModel
const embeddingCandidates = splitList(process.env.BENCHMARK_EMBEDDING_MODELS ?? 'text-embedding-embeddinggemma-300m,text-embedding-qwen3-0.6b-text-embedding')
const llmCandidates = splitList(process.env.BENCHMARK_LLM_MODELS ?? 'qwen3.5-9b-uncensored-hauhaucs-aggressive,gemma-4-e4b-uncensored-hauhaucs-aggressive,prism-ml/bonsai-27b')
const benchmarkQuestionIds = new Set(splitList(process.env.BENCHMARK_QUESTION_IDS ?? ''))
const benchmarkQuestions = benchmarkQuestionIds.size ? BENCHMARK_QUESTIONS.filter((item) => benchmarkQuestionIds.has(item.id)) : BENCHMARK_QUESTIONS
const topK = positiveInteger(process.env.RAG_TOP_K, 5)
const minScore = numberOr(process.env.RAG_MIN_SCORE, 0.45)
const maxContextTokens = positiveInteger(process.env.RAG_MAX_CONTEXT_TOKENS, 4_000)
const batchSize = positiveInteger(process.env.BENCHMARK_EMBEDDING_BATCH_SIZE, 16)
const llmSettings = readLlmSettings({
  baseUrl: apiBase,
  model: 'auto',
  maxTokens: positiveInteger(process.env.BENCHMARK_MAX_TOKENS, 768),
})
const benchmarkReasoning = ['off', 'on', 'low', 'medium', 'high'].includes(process.env.BENCHMARK_REASONING ?? '')
  ? process.env.BENCHMARK_REASONING
  : null
const systemPrompt = loadSystemPrompt(root, process.env.BENCHMARK_SYSTEM_PROMPT_FILE?.trim() || null)
const runEmbedding = !process.argv.includes('--llm-only')
const runLlm = !process.argv.includes('--embedding-only')
const restoreInitialLlm = process.env.BENCHMARK_RESTORE !== '0'
const authHeaders = process.env.LM_API_TOKEN ? { authorization: `Bearer ${process.env.LM_API_TOKEN}` } : {}

function splitList(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean)
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function numberOr(value, fallback) {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : fallback
}

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

async function readJsonResponse(response) {
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

async function lmStudio(path, options = {}) {
  const url = `${apiBase}/api/v1${path}`
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...authHeaders, 'content-type': 'application/json', ...(options.headers ?? {}) },
      signal: options.signal ?? AbortSignal.timeout(30_000),
    })
    return readJsonResponse(response)
  } catch (error) {
    throw new Error(`LM Studio недоступен по ${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function listModels() {
  const body = await lmStudio('/models', { method: 'GET' })
  return Array.isArray(body?.models) ? body.models : []
}

function loadedInstances(model) {
  return Array.isArray(model?.loaded_instances) ? model.loaded_instances.filter((instance) => typeof instance?.id === 'string') : []
}

function resolveModel(requested, models, type) {
  const candidates = models.filter((model) => model.type === type)
  const exact = candidates.find((model) => model.key === requested)
  if (exact) return exact
  const lowered = requested.toLocaleLowerCase('en-US')
  const fuzzy = candidates.filter((model) => model.key.toLocaleLowerCase('en-US').includes(lowered) || lowered.includes(model.key.toLocaleLowerCase('en-US')))
  if (fuzzy.length === 1) return fuzzy[0]
  const available = candidates.map((model) => model.key).join(', ') || '(нет моделей этого типа)'
  throw new Error(`Модель ${requested} не найдена в LM Studio. Доступны: ${available}`)
}

async function unloadType(type) {
  const models = await listModels()
  for (const model of models.filter((item) => item.type === type)) {
    for (const instance of loadedInstances(model)) {
      await lmStudio('/models/unload', { method: 'POST', body: JSON.stringify({ instance_id: instance.id }) })
      console.log(`  unloaded ${type}: ${model.key} (${instance.id})`)
    }
  }
}

async function loadModel(modelKey, type, options = {}) {
  const started = performance.now()
  if (options.unload !== false) await unloadType(type)
  const body = await lmStudio('/models/load', {
    method: 'POST',
    body: JSON.stringify({
      model: modelKey,
      ...(type === 'llm' ? {
        context_length: positiveInteger(options.config?.context_length, positiveInteger(process.env.BENCHMARK_CONTEXT_LENGTH, 8192)),
        flash_attention: options.config?.flash_attention ?? true,
      } : {}),
      echo_load_config: true,
    }),
  })
  const loadMs = Math.round(performance.now() - started)
  console.log(`  loaded ${type}: ${modelKey} in ${loadMs}ms`)
  return { ...body, load_ms: loadMs }
}

function readRecords() {
  if (!existsSync(dataDir)) throw new Error(`RAG data directory does not exist: ${dataDir}`)
  const records = []
  for (const fileName of readdirSync(dataDir).filter((name) => name.toLowerCase().endsWith('.md')).sort()) {
    const module = basename(fileName, extname(fileName)).replace(/^interview-/u, '').replace(/-qa$/u, '').replace(/^rag-experience$/u, 'rag').toLocaleLowerCase('en-US')
    const markdown = readFileSync(join(dataDir, fileName), 'utf8')
    const headings = [...markdown.matchAll(/^##\s+(.+?)\s*$/gmu)]
    for (let index = 0; index < headings.length; index += 1) {
      const start = (headings[index].index ?? 0) + headings[index][0].length
      const end = index + 1 < headings.length ? headings[index + 1].index ?? markdown.length : markdown.length
      const question = headings[index][1].trim()
      if (!question) continue
      records.push({ module, question, embeddingText: `module: ${module}\nquestion: ${question}` })
    }
  }
  if (records.length === 0) throw new Error(`No Q&A sections found in ${dataDir}`)
  return records
}

async function embedBatch(model, inputs, kind) {
  const response = await fetch(`${apiBase}/v1/embeddings`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: inputs.map((input) => formatEmbeddingInput(model, input, kind)) }),
    signal: AbortSignal.timeout(120_000),
  })
  const body = await readJsonResponse(response)
  const vectors = (Array.isArray(body?.data) ? body.data : [])
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => item.embedding)
  if (vectors.length !== inputs.length || vectors.some((vector) => !Array.isArray(vector))) {
    throw new Error(`Embedding endpoint returned ${vectors.length} vectors for ${inputs.length} inputs`)
  }
  return vectors
}

async function embedAll(model, texts, kind) {
  const started = performance.now()
  const vectors = []
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    vectors.push(...await embedBatch(model, texts.slice(offset, offset + batchSize), kind))
  }
  return { vectors, elapsedMs: Math.round(performance.now() - started) }
}

function cosine(left, right) {
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] ** 2
    rightNorm += right[index] ** 2
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0
}

const stopwords = new Set('а без бы в во вы где для до же за и из или как какая какие каким какой когда кто на над не но о об от по под при про с со так то у что чем это я the and are for how what why with from when which'.split(' '))

function tokens(text) {
  return new Set((text.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? []).filter((token) => !stopwords.has(token)))
}

function lexicalOverlap(query, candidate) {
  const left = tokens(query)
  const right = tokens(candidate)
  return left.size ? [...left].filter((token) => right.has(token)).length / left.size : 0
}

function rankedDocuments(query, queryVector, records, documentVectors) {
  return records.map((record, index) => {
    const semanticScore = cosine(queryVector, documentVectors[index])
    const lexicalScore = lexicalOverlap(query, record.question)
    return { record, score: semanticScore + lexicalScore * 0.15, semanticScore, lexicalScore }
  }).sort((left, right) => right.score - left.score)
}

async function benchmarkEmbeddings(models) {
  const records = readRecords()
  const results = []
  for (const model of models) {
    console.log(`\nEmbedding benchmark: ${model.key}`)
    await loadModel(model.key, 'embedding')
    const documents = await embedAll(model.key, records.map((record) => record.embeddingText), 'document')
    const queries = await embedAll(model.key, benchmarkQuestions.map((item) => item.question), 'query')
    const rows = benchmarkQuestions.map((item, index) => {
      const ranked = rankedDocuments(item.question, queries.vectors[index], records, documents.vectors)
      const rank = ranked.findIndex((hit) => hit.record.module === item.module)
      return { id: item.id, expected_module: item.module, rank: rank < 0 ? null : rank + 1, top: ranked.slice(0, topK).map((hit) => ({ module: hit.record.module, question: hit.record.question, score: Number(hit.score.toFixed(4)) })) }
    })
    const validRanks = rows.map((row) => row.rank).filter((rank) => rank !== null)
    const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
    results.push({
      model: model.key,
      dimensions: documents.vectors[0]?.length ?? null,
      documents: records.length,
      index_ms: documents.elapsedMs,
      query_batch_ms: queries.elapsedMs,
      module_at_1_percent: Math.round(rows.filter((row) => row.rank === 1).length / rows.length * 1000) / 10,
      module_at_5_percent: Math.round(rows.filter((row) => row.rank !== null && row.rank <= 5).length / rows.length * 1000) / 10,
      mrr: Math.round(rows.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / rows.length * 1000) / 1000,
      mean_rank: average(validRanks),
      rows,
    })
  }
  return results
}

async function embedQuery(model, query) {
  const started = performance.now()
  const [vector] = await embedBatch(model, [query], 'query')
  return { vector, latencyMs: Math.round(performance.now() - started) }
}

async function retrieve(model, query) {
  const embedding = await embedQuery(model, query)
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/search`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ vector: embedding.vector, limit: Math.max(topK * 4, topK), with_payload: true, with_vector: false }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await readJsonResponse(response)
  const hits = (Array.isArray(body?.result) ? body.result : []).filter((hit) => typeof hit.payload?.question === 'string' && typeof hit.payload?.answer === 'string')
    .map((hit) => ({ ...hit, semanticScore: Number(hit.score), lexicalScore: lexicalOverlap(query, hit.payload.question), score: Number(hit.score) + lexicalOverlap(query, hit.payload.question) * 0.15 }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .filter((hit) => hit.semanticScore >= minScore || hit.lexicalScore >= 0.5)
  const blocks = []
  for (const hit of hits) {
    const source = String(hit.payload.source_file ?? 'qdrant').replace(/[<>"\n]/gu, '')
    const module = String(hit.payload.module ?? 'unknown').replace(/[<>"\n]/gu, '')
    const block = `<evidence source="${source}" module="${module}" score="${hit.score.toFixed(3)}">\nQuestion: ${stripUntrusted(hit.payload.question)}\nAnswer: ${stripUntrusted(hit.payload.answer)}\n</evidence>`
    if (estimateTokens([...blocks, block].join('\n\n')) > maxContextTokens) break
    blocks.push(block)
  }
  return { text: blocks.length ? `<retrieved_context>\n${blocks.join('\n\n')}\n</retrieved_context>` : '', hits, latencyMs: embedding.latencyMs }
}

async function generate(model, question, context) {
  const started = performance.now()
  const parts = [`<transcript>\n(нет предыдущей реплики)\n</transcript>`]
  if (context.text) parts.push(context.text)
  parts.push(`<question>\n${stripUntrusted(question)}\n</question>`)
  const response = await fetch(`${apiBase}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: parts.join('\n\n') }],
      ...llmRequestOptions({ ...llmSettings, model }),
      ...(benchmarkReasoning ? { reasoning: benchmarkReasoning } : {}),
      stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok || !response.body) throw new Error(`LLM HTTP ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  let answer = ''
  let usage = null
  let ttftMs = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffered += decoder.decode(value, { stream: true })
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      const parsed = parseSse(line)
      if (!parsed) continue
      if (parsed.content) {
        if (ttftMs === null) ttftMs = performance.now() - started
        answer += parsed.content
      }
      if (parsed.usage) usage = parsed.usage
    }
  }
  const tail = parseSse(buffered)
  if (tail?.content) answer += tail.content
  if (tail?.usage) usage = tail.usage
  const totalMs = Math.round(performance.now() - started)
  const outputTokens = Number(usage?.completion_tokens) || estimateTokens(answer)
  const generationMs = Math.max(1, totalMs - (ttftMs ?? 0))
  return { answer: normalizeAnswerFormatting(answer), ttftMs: ttftMs === null ? null : Math.round(ttftMs), totalMs, outputTokens, tokensPerSecond: Number((outputTokens / generationMs * 1000).toFixed(2)), usage }
}

async function warmup(model) {
  await generate(model, 'Ответь одним словом: готово.', { text: '', hits: [], latencyMs: 0 })
}

function parseSse(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return null
  try {
    const payload = JSON.parse(data)
    return { content: typeof payload.choices?.[0]?.delta?.content === 'string' ? payload.choices[0].delta.content : '', usage: payload.usage ?? null }
  } catch {
    return null
  }
}

function stripUntrusted(text) {
  return String(text).replace(/<\/?(?:transcript|question|retrieved_context|evidence|role|security)\b[^>]*>/giu, '').replace(/<\|[^|]*\|>/gu, '')
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text).length / 4))
}

function normalizeAnswerFormatting(text) {
  return String(text).replace(/\$\\leftrightarrow\$/giu, '↔').replace(/\\leftrightarrow/giu, '↔').replace(/\$\\(?:rightarrow|longrightarrow|to)\$/giu, '→').replace(/\\(?:rightarrow|longrightarrow|to)/giu, '→').replace(/\$([^$\r\n]+)\$/gu, '$1').trim()
}

function evidenceOverlap(answer, hits) {
  const answerWords = tokens(answer)
  const evidenceWords = tokens(hits.flatMap((hit) => [hit.payload.question, hit.payload.answer]).join(' '))
  return answerWords.size ? [...answerWords].filter((word) => evidenceWords.has(word)).length / answerWords.size : 0
}

function moduleRank(hits, expectedModule) {
  const index = hits.findIndex((hit) => hit.payload.module === expectedModule)
  return index < 0 ? null : index + 1
}

function markdownReport(report) {
  const lines = ['# Model benchmark', '', `Generated: ${report.generated_at}`, `Embedding kept loaded: ${report.embedding_model_kept ?? 'no'}`, '']
  if (report.embedding_results?.length) {
    lines.push('## Embedding', '', '| Model | Dimensions | Module@1 | Module@5 | MRR | Index ms | Query batch ms |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const item of report.embedding_results) lines.push(`| ${item.model} | ${item.dimensions} | ${item.module_at_1_percent}% | ${item.module_at_5_percent}% | ${item.mrr} | ${item.index_ms} | ${item.query_batch_ms} |`)
    lines.push('')
  }
  for (const model of report.llm_results ?? []) {
    lines.push(`## ${model.model}`, '', `Load: ${model.load_ms} ms`, `Average TTFT: ${model.summary.average_ttft_ms ?? 'n/a'} ms`, `Average tokens/sec: ${model.summary.average_tokens_per_second} (estimated if LM Studio did not return usage)`, `Average total: ${model.summary.average_total_ms} ms`, '', '| Question | TTFT | tok/s | total | retrieval rank | evidence overlap |', '| --- | ---: | ---: | ---: | ---: | ---: |')
    for (const item of model.results) lines.push(`| ${item.id} | ${item.ttft_ms ?? 'n/a'} | ${item.tokens_per_second} | ${item.total_ms} | ${item.expected_module_rank ?? '-'} | ${Math.round(item.evidence_overlap * 100)}% |`)
    lines.push('', '### Answers', '')
    for (const item of model.results) lines.push(`#### ${item.id} — ${item.question}`, '', item.answer || '_empty_', '')
  }
  return `${lines.join('\n')}\n`
}

async function benchmarkLlm(models, embeddingKey) {
  await loadModel(embeddingKey, 'embedding')
  const results = []
  for (const model of models) {
    console.log(`\nLLM benchmark: ${model.key}`)
    const loaded = await loadModel(model.key, 'llm')
    await warmup(model.key)
    const rows = []
    for (const item of benchmarkQuestions) {
      const started = performance.now()
      try {
        const context = await retrieve(embeddingKey, item.question)
        const generated = await generate(model.key, item.question, context)
        rows.push({ id: item.id, question: item.question, expected_module: item.module, expected_module_rank: moduleRank(context.hits, item.module), retrieval_ms: context.latencyMs, ttft_ms: generated.ttftMs, total_ms: generated.totalMs, output_tokens: generated.outputTokens, tokens_per_second: generated.tokensPerSecond, evidence_overlap: Number(evidenceOverlap(generated.answer, context.hits).toFixed(3)), forbidden_markers: /<\/?(?:system|user|assistant|instructions)\b/iu.test(generated.answer), answer: generated.answer })
        console.log(`  ${item.id}: ttft=${generated.ttftMs ?? '-'}ms total=${generated.totalMs}ms tok/s=${generated.tokensPerSecond}`)
      } catch (error) {
        rows.push({ id: item.id, question: item.question, expected_module: item.module, error: error instanceof Error ? error.message : String(error), total_ms: Math.round(performance.now() - started) })
        console.log(`  ${item.id}: ERROR ${rows.at(-1).error}`)
      }
    }
    const completed = rows.filter((item) => !item.error)
    const average = (key) => {
      const values = completed.map((item) => Number(item[key])).filter((value) => Number.isFinite(value))
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : null
    }
    results.push({ model: model.key, load_ms: loaded.load_ms, metadata: model, summary: { count: rows.length, completed: completed.length, module_at_1_percent: completed.length ? Math.round(completed.filter((item) => item.expected_module_rank === 1).length / completed.length * 1000) / 10 : 0, average_ttft_ms: average('ttft_ms'), average_total_ms: average('total_ms'), average_tokens_per_second: average('tokens_per_second'), average_evidence_overlap: average('evidence_overlap') }, results: rows })
  }
  return results
}

async function main() {
  const initialModels = await listModels()
  console.log('LM Studio models:')
  for (const model of initialModels) console.log(`  ${model.type.padEnd(9)} ${model.key} | ${model.quantization?.name ?? '-'} | loaded=${loadedInstances(model).length}`)
  if (process.argv.includes('--list')) return

  const resolvedEmbedding = runEmbedding ? embeddingCandidates.map((item) => resolveModel(item, initialModels, 'embedding')) : []
  const resolvedLlm = runLlm ? llmCandidates.map((item) => resolveModel(item, initialModels, 'llm')) : []
  const keepEmbedding = resolveModel(embeddingModel, initialModels, 'embedding')
  const initialLlmKeys = initialModels.filter((model) => model.type === 'llm' && loadedInstances(model).length > 0).map((model) => ({ key: model.key, config: loadedInstances(model)[0].config ?? {} }))
  const report = { generated_at: new Date().toISOString(), api_base: apiBase, collection, embedding_model_kept: keepEmbedding.key, questions: benchmarkQuestions, embedding_results: [], llm_results: [] }
  try {
    if (runEmbedding) report.embedding_results = await benchmarkEmbeddings(resolvedEmbedding)
    if (runLlm) report.llm_results = await benchmarkLlm(resolvedLlm, keepEmbedding.key)
  } finally {
    await unloadType('llm')
    if (restoreInitialLlm) {
      for (const item of initialLlmKeys) await loadModel(item.key, 'llm', { unload: false, config: item.config })
    }
    await loadModel(keepEmbedding.key, 'embedding')
  }
  mkdirSync(join(root, 'out'), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(outputPath.replace(/\.json$/iu, '.md'), markdownReport(report), 'utf8')
  console.log(`\nJSON report: ${outputPath}`)
  console.log(`Markdown report: ${outputPath.replace(/\.json$/iu, '.md')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
