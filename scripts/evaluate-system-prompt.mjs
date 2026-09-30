/**
 * Prompt-only grounded answer evaluation.
 *
 * The script deliberately does not call embeddings or Qdrant. Each case uses
 * one deterministic question and its one complete answer from data/*.md as
 * fixed evidence. This isolates answer synthesis from retrieval quality.
 *
 *   npm run prompt:evaluate
 *
 * Optional environment variables:
 *   PROMPT_EVAL_LIMIT=30
 *   PROMPT_EVAL_PROMPT_FILE=prompts/systemPrompt.md
 *   PROMPT_EVAL_RECORD='file.md::section-index'
 *   PROMPT_EVAL_QUESTION='exact or partial question text'
 *   PROMPT_EVAL_OUTPUT=out/system-prompt-evaluation.json
 *   PROMPT_EVAL_JUDGE=0  # skip the second local judge call
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { loadSystemPrompt } from './load-system-prompt.mjs'
import { llmRequestOptions, readLlmSettings } from './llm-settings.mjs'

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

const dataDir = resolve(process.env.RAG_DATA_DIR ?? join(root, 'data'))
const outputJson = resolve(process.env.PROMPT_EVAL_OUTPUT ?? join(root, 'out', 'system-prompt-evaluation.json'))
const outputMarkdown = outputJson.replace(/\.json$/iu, '.md')
const promptPath = process.env.PROMPT_EVAL_PROMPT_FILE?.trim() || join(root, 'prompts', 'systemPrompt.md')
const prompt = loadSystemPrompt(root, promptPath)
const llm = readLlmSettings()
const limit = positiveInteger(process.env.PROMPT_EVAL_LIMIT, 30)
const passThreshold = boundedNumber(process.env.PROMPT_EVAL_PASS_THRESHOLD, 0.9, 0, 1)
const useJudge = process.env.PROMPT_EVAL_JUDGE !== '0'

const STOPWORDS = new Set([
  'а', 'без', 'бы', 'в', 'во', 'вот', 'вы', 'где', 'для', 'до', 'же', 'за', 'и', 'из', 'или',
  'как', 'какая', 'какие', 'каким', 'какой', 'когда', 'кто', 'на', 'над', 'не', 'но', 'о', 'об',
  'от', 'по', 'под', 'при', 'про', 'с', 'со', 'так', 'то', 'у', 'что', 'чем', 'это', 'я', 'он',
  'она', 'они', 'мы', 'ты', 'the', 'and', 'are', 'for', 'how', 'what', 'why', 'with', 'from',
  'when', 'which', 'this', 'that', 'into', 'than', 'можно', 'нужно', 'также', 'чтобы', 'если',
])

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function parseFrontMatter(markdown) {
  const clean = markdown.replace(/^\uFEFF/u, '')
  if (!clean.startsWith('---')) return { body: clean, metadata: {} }
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { body: clean, metadata: {} }
  const metadata = {}
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/)
    if (item) metadata[item[1]] = item[2].replace(/^(['"])([\s\S]*)\1$/, '$2')
  }
  return { body: match[2], metadata }
}

function readManifest() {
  const path = join(dataDir, 'manifest.jsonl')
  const bySection = new Map()
  if (!existsSync(path)) return bySection
  for (const [index, raw] of readFileSync(path, 'utf8').split(/\r?\n/).entries()) {
    if (!raw.trim()) continue
    let item
    try {
      item = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Invalid manifest JSON at ${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (typeof item.source_file !== 'string') continue
    const sectionIndex = Number(item.section_index)
    if (Number.isInteger(sectionIndex)) bySection.set(`${item.source_file}::${sectionIndex}`, item)
  }
  return bySection
}

function readRecords() {
  if (!existsSync(dataDir)) throw new Error(`RAG data directory does not exist: ${dataDir}`)
  const manifest = readManifest()
  const records = []
  const files = readdirSync(dataDir)
    .filter((name) => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'agents.md')
    .sort()

  for (const fileName of files) {
    const filePath = join(dataDir, fileName)
    const { body, metadata } = parseFrontMatter(readFileSync(filePath, 'utf8'))
    const headings = [...body.matchAll(/^##[ \t]+(.+?)[ \t]*$/gmu)]
    for (let index = 0; index < headings.length; index += 1) {
      const heading = headings[index]
      const start = (heading.index ?? 0) + heading[0].length
      const end = index + 1 < headings.length ? (headings[index + 1].index ?? body.length) : body.length
      const question = heading[1].trim()
      const answer = body.slice(start, end).trim()
      if (!question || !answer) continue
      const manifestItem = manifest.get(`${fileName}::${index}`) ?? {}
      records.push({
        id: typeof manifestItem.id === 'string' ? manifestItem.id : `${fileName}::${index}`,
        source_file: fileName,
        section_index: index,
        module: basename(fileName, extname(fileName)),
        question,
        answer,
        expected_facts: Array.isArray(manifestItem.expected_facts)
          ? manifestItem.expected_facts.filter((value) => typeof value === 'string' && value.trim())
          : [],
        answer_type: typeof manifestItem.type === 'string' ? manifestItem.type : null,
        language: metadata.language ?? 'ru',
      })
    }
  }
  if (records.length === 0) throw new Error(`No Q&A sections found in ${dataDir}`)
  return records
}

function chooseCases(records) {
  const recordSelector = process.env.PROMPT_EVAL_RECORD?.trim()
  if (recordSelector) {
    const selected = records.filter((record) => `${record.source_file}::${record.section_index}` === recordSelector || record.id === recordSelector)
    if (selected.length !== 1) throw new Error(`PROMPT_EVAL_RECORD did not select exactly one record: ${recordSelector}`)
    return selected
  }

  const questionSelector = process.env.PROMPT_EVAL_QUESTION?.trim().toLocaleLowerCase('ru-RU')
  if (questionSelector) {
    const selected = records.filter((record) => record.question.toLocaleLowerCase('ru-RU').includes(questionSelector))
    if (selected.length !== 1) throw new Error(`PROMPT_EVAL_QUESTION selected ${selected.length} records; use a more specific value`)
    return selected
  }

  const count = Math.min(limit, records.length)
  const selected = []
  for (let index = 0; index < count; index += 1) {
    const position = count === 1 ? 0 : Math.floor(index * (records.length - 1) / (count - 1))
    selected.push(records[position])
  }
  return selected
}

function stripUntrusted(text) {
  return String(text)
    .replace(/<\/?(?:transcript|question|retrieved_context|evidence|role|security)\b[^>]*>/giu, '')
    .replace(/<\|[^|]*\|>/gu, '')
}

function buildUserTurn(record) {
  const source = record.source_file.replace(/[<>]/gu, '').replaceAll('"', '')
  return `<transcript>\n(нет предыдущей реплики)\n</transcript>\n\n<retrieved_context>\n<evidence source="${source}" score="1.000">\nQuestion: ${stripUntrusted(record.question)}\nAnswer: ${stripUntrusted(record.answer)}\n</evidence>\n</retrieved_context>\n\n<question>\n${stripUntrusted(record.question)}\n</question>`
}

async function readResponse(response) {
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

async function resolveModel() {
  if (llm.model && llm.model !== 'auto') return llm.model
  const response = await fetch(`${llm.baseUrl}/api/v1/models`, { signal: AbortSignal.timeout(5_000) })
  const body = await readResponse(response)
  const loaded = (body.models ?? []).filter((model) => model.type === 'llm' && model.loaded_instances?.length > 0)
  if (loaded.length !== 1) throw new Error(`expected exactly one loaded LLM, found ${loaded.length}`)
  return loaded[0].key
}

async function generate(model, record) {
  const started = performance.now()
  const response = await fetch(`${llm.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: buildUserTurn(record) }],
      ...llmRequestOptions(llm),
    }),
    signal: AbortSignal.timeout(120_000),
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
  return { answer: answer.trim(), ttft_ms: ttftMs === null ? null : Math.round(ttftMs), total_ms: Math.round(performance.now() - started) }
}

const JUDGE_SYSTEM = `Ты — строгий reviewer ответа на техническом собеседовании.
Сравни вопрос, исходный evidence и ответ кандидата. Ответ может быть короче и
перефразирован: дословное совпадение не требуется. Проверь четыре вещи:
релевантность вопросу, полноту ключевых фактов, отсутствие неподтверждённых
утверждений и сохранение кода/чисел/ограничений. Не штрафуй за удаление
вводных, повторов и служебной строки уровня. Если вопрос просит реализацию,
отсутствующий или сокращённый код — существенный дефект.

Верни только JSON без markdown. В поле reason не используй кавычки,
обратные слеши и переводы строк:
{"score":0-100,"relevance":0-100,"fact_coverage":0-100,"groundedness":0-100,"technical_preservation":0-100,"reason":"краткая причина по-русски"}`

async function judge(model, record, answer) {
  const response = await fetch(`${llm.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        {
          role: 'user',
          content: `<question>\n${stripUntrusted(record.question)}\n</question>\n\n<reference_answer>\n${stripUntrusted(record.answer)}\n</reference_answer>\n\n<candidate_answer>\n${stripUntrusted(answer)}\n</candidate_answer>`,
        },
      ],
      ...llmRequestOptions(llm),
      max_tokens: Math.min(llm.maxTokens, 512),
      temperature: 0,
      top_p: 1,
      min_p: 0,
      repeat_penalty: 1,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const body = await readResponse(response)
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('judge returned no message content')
  const match = content.match(/\{[\s\S]*\}/u)
  if (!match) throw new Error(`judge returned non-JSON: ${content.slice(0, 180)}`)
  let parsed
  try {
    parsed = JSON.parse(match[0])
  } catch {
    // Gemma occasionally leaves a LaTeX backslash unescaped in `reason`.
    // The numeric rubric fields remain machine-readable, so recover them
    // instead of discarding an otherwise valid generation.
    const readNumber = (name) => {
      const value = match[0].match(new RegExp(`"${name}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'u'))
      return value ? Number(value[1]) : NaN
    }
    parsed = {
      score: readNumber('score'),
      relevance: readNumber('relevance'),
      fact_coverage: readNumber('fact_coverage'),
      groundedness: readNumber('groundedness'),
      technical_preservation: readNumber('technical_preservation'),
      reason: 'Reviewer вернул JSON с неэкранированным символом; числовые оценки восстановлены.',
    }
  }
  const score = Number(parsed.score)
  if (!Number.isFinite(score)) throw new Error(`judge returned invalid score: ${content.slice(0, 180)}`)
  return {
    score: Math.max(0, Math.min(100, score)),
    relevance: Number(parsed.relevance),
    fact_coverage: Number(parsed.fact_coverage),
    groundedness: Number(parsed.groundedness),
    technical_preservation: Number(parsed.technical_preservation),
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  }
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

function tokens(text) {
  return (String(text).toLocaleLowerCase('ru-RU').normalize('NFKC').match(/[a-zа-яё][a-zа-яё0-9+#._-]{2,}/giu) ?? [])
    .filter((token) => !STOPWORDS.has(token))
    .map(canonicalToken)
}

function canonicalToken(token) {
  const value = token.toLocaleLowerCase('ru-RU')
  if (/^(embedding|эмбеддинг|эмбеддингов|эмбеддинги|эмбеддинговый)/iu.test(value)) return 'embedding'
  if (/^(model|модел|модель)/iu.test(value)) return 'model'
  if (/^(index|индекс)/iu.test(value)) return 'index'
  if (/^(retrieval|ретрив|поиск)/iu.test(value)) return 'retrieval'
  if (/^(query|queries|квер|запрос)/iu.test(value)) return 'query'
  if (/^(corpus|корпус)/iu.test(value)) return 'corpus'
  if (/^(chunk|чанк|чанкинг)/iu.test(value)) return 'chunk'
  if (/^(metric|метрик)/iu.test(value)) return 'metric'
  if (/^(latency|латенси|задерж)/iu.test(value)) return 'latency'
  if (/^(quality|качест)/iu.test(value)) return 'quality'
  if (/^(benchmark|бенчмарк)/iu.test(value)) return 'benchmark'
  if (/^(parameter|параметр)/iu.test(value)) return 'parameter'
  if (/^(document|документ)/iu.test(value)) return 'document'
  if (/^[а-яё]{6,}$/iu.test(value)) return value.replace(/(?:ами|ями|ого|ему|ому|ыми|ими|ать|ять|ить|еть|ить|ться|ется|ится|ость|ения|ание|ение|ован|еван|ый|ий|ая|ое|ые|ов|ев|ам|ям|ом|ем|ах|ях|ы|и|а|я|у|ю|е|ь)$/iu, '')
  return value
}

function tokenRecall(reference, actual) {
  const expected = new Set(tokens(reference))
  if (expected.size === 0) return 1
  const found = new Set(tokens(actual))
  return [...expected].filter((token) => found.has(token)).length / expected.size
}

function tokenPrecision(reference, actual) {
  const actualTokens = new Set(tokens(actual))
  if (actualTokens.size === 0) return 0
  const referenceTokens = new Set(tokens(reference))
  return [...actualTokens].filter((token) => referenceTokens.has(token)).length / actualTokens.size
}

function extractNumbers(text) {
  return [...String(text).matchAll(/(?<![A-Za-zА-Яа-яЁё])(?:v\.?\s*)?\d+(?:[.,]\d+)?%?/giu)].map((match) => match[0].replace(/\s+/gu, '').toLocaleLowerCase('ru-RU'))
}

function numbersPreserved(reference, actual) {
  const expected = [...new Set(extractNumbers(reference))]
  if (expected.length === 0) return 1
  const output = new Set(extractNumbers(actual))
  return expected.filter((value) => output.has(value)).length / expected.length
}

function codePreserved(reference, actual) {
  const blocks = [...String(reference).matchAll(/```[\s\S]*?```/gu)].map((match) => match[0])
  if (blocks.length === 0) return 1
  const output = String(actual)
  const codeTokens = new Set(blocks.flatMap((block) => tokens(block)).filter((token) => token.length >= 4))
  const outputTokens = new Set(tokens(output))
  const tokenCoverage = codeTokens.size === 0 ? 1 : [...codeTokens].filter((token) => outputTokens.has(token)).length / codeTokens.size
  const hasCodeBlock = /```[\s\S]*?```/u.test(output)
  return (tokenCoverage + (hasCodeBlock ? 1 : 0)) / 2
}

function derivedFacts(reference) {
  const withoutCode = String(reference).replace(/```[\s\S]*?```/gu, '')
  const paragraphs = withoutCode
    .split(/\n\s*\n/u)
    .map((part) => part.trim())
    .filter((part) => part && !/^\*\*(?:уровень|сложность)[^\n]*\*\*$/iu.test(part))
  const sentences = paragraphs
    .flatMap((part) => part.split(/(?<=[.!?])\s+/u))
    .map((part) => part.trim())
    .filter((part) => tokens(part).length >= 4)
  return sentences.slice(0, 4)
}

function formatPreserved(reference, actual) {
  return (numbersPreserved(reference, actual) + codePreserved(reference, actual)) / 2
}

function scoreAnswer(record, answer) {
  const expectedFacts = record.expected_facts.length > 0 ? record.expected_facts : derivedFacts(record.answer)
  const factCoverage = expectedFacts.reduce((sum, fact) => sum + tokenRecall(fact, answer), 0) / expectedFacts.length
  const groundedness = tokenPrecision(record.answer, answer)
  const questionRelevance = tokenRecall(record.question, answer)
  const preservation = formatPreserved(record.answer, answer)
  const forbiddenMarkers = /<\/?(?:system|user|assistant|instructions|retrieved_context|evidence)\b[^>]*>/iu.test(answer)
  const score = forbiddenMarkers
    ? 0
    : 0.55 * factCoverage + 0.2 * groundedness + 0.15 * questionRelevance + 0.1 * preservation
  return {
    score,
    passed: score >= passThreshold && factCoverage >= 0.8 && groundedness >= 0.65 && !forbiddenMarkers,
    fact_coverage: factCoverage,
    groundedness,
    question_relevance: questionRelevance,
    preservation,
    numbers_preserved: numbersPreserved(record.answer, answer),
    code_preserved: codePreserved(record.answer, answer),
    forbidden_markers: forbiddenMarkers,
  }
}

function markdownReport(report) {
  const lines = [
    '# System prompt grounded-answer evaluation',
    '',
    `Generated: ${report.generated_at}`,
    `Model: ${report.llm_model}`,
    `Prompt: ${report.prompt_file}`,
    `Prompt SHA-256: ${report.prompt_sha256}`,
    '',
    `- Cases: ${report.summary.count}`,
    `- Cases above ${Math.round(report.pass_threshold * 100)}%: ${report.summary.passed}/${report.summary.count} (${report.summary.accuracy_percent}%)`,
    `- Average reviewer score: ${report.summary.average_judge_score ?? 'n/a'}/100`,
    `- Average deterministic heuristic: ${report.summary.average_heuristic_score_percent}%`,
    `- Average heuristic fact coverage: ${Math.round(report.summary.average_fact_coverage * 100)}%`,
    `- Average heuristic groundedness: ${Math.round(report.summary.average_groundedness * 100)}%`,
    '',
  ]
  for (const item of report.results) {
    lines.push(`## ${item.id}`, `**Question:** ${item.question}`)
    if (item.error) {
      lines.push(`**Error:** ${item.error}`, '')
      continue
    }
    lines.push(`**Score:** ${Math.round(item.metrics.score * 100)}% (${item.passed ? 'PASS' : 'FAIL'})`)
    lines.push(`**Metrics:** facts=${Math.round(item.metrics.fact_coverage * 100)}%, grounded=${Math.round(item.metrics.groundedness * 100)}%, relevance=${Math.round(item.metrics.question_relevance * 100)}%, preservation=${Math.round(item.metrics.preservation * 100)}%`)
    if (item.judge) lines.push(`**Judge:** ${item.judge.score}% (${item.passed ? 'PASS' : 'FAIL'}): ${item.judge.reason}`)
    lines.push('', '**Expected evidence answer:**', item.reference_answer, '', '**LLM answer:**', item.answer || '_empty_', '')
  }
  return `${lines.join('\n')}\n`
}

const records = chooseCases(readRecords())
const model = await resolveModel()
console.log(`Model: ${model}`)
console.log(`Prompt: ${promptPath}`)
console.log(`Prompt SHA-256: ${createHash('sha256').update(prompt, 'utf8').digest('hex')}`)
console.log(`Fixed evidence cases: ${records.length}`)
console.log('No embeddings or Qdrant calls: retrieval is fixed to one source answer per case.\n')

const results = []
for (let index = 0; index < records.length; index += 1) {
  const record = records[index]
  try {
    const generated = await generate(model, record)
    const metrics = scoreAnswer(record, generated.answer)
    const judgeMetrics = useJudge ? await judge(model, record, generated.answer) : null
    const item = {
      id: record.id,
      source_file: record.source_file,
      section_index: record.section_index,
      question: record.question,
      answer_type: record.answer_type,
      reference_answer: record.answer,
      expected_facts: record.expected_facts,
      answer: generated.answer,
      ttft_ms: generated.ttft_ms,
      llm_total_ms: generated.total_ms,
      metrics,
      judge: judgeMetrics,
      passed: judgeMetrics ? judgeMetrics.score >= passThreshold * 100 : metrics.passed,
    }
    results.push(item)
    console.log(`\n=== ${String(index + 1).padStart(2, '0')}/${records.length} ${item.id} ===`)
    console.log(`Question: ${item.question}`)
    console.log(`Heuristic: ${Math.round(metrics.score * 100)}%, facts=${Math.round(metrics.fact_coverage * 100)}%, grounded=${Math.round(metrics.groundedness * 100)}%, relevance=${Math.round(metrics.question_relevance * 100)}%`)
    if (judgeMetrics) console.log(`Judge: ${judgeMetrics.score}% (${item.passed ? 'PASS' : 'FAIL'}) — ${judgeMetrics.reason}`)
    console.log('LLM answer:')
    console.log(item.answer || '(empty)')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({ id: record.id, source_file: record.source_file, section_index: record.section_index, question: record.question, reference_answer: record.answer, answer: '', error: message, passed: false })
    console.log(`\n${String(index + 1).padStart(2, '0')}/${records.length} ERROR ${message}`)
  }
}

const completed = results.filter((item) => !item.error)
const passed = completed.filter((item) => item.passed).length
const average = (field) => completed.length ? completed.reduce((sum, item) => sum + item.metrics[field], 0) / completed.length : 0
const judged = completed.filter((item) => item.judge)
const report = {
  generated_at: new Date().toISOString(),
  prompt_file: promptPath,
  prompt_sha256: createHash('sha256').update(prompt, 'utf8').digest('hex'),
  llm_model: model,
  llm_settings: llm,
  pass_threshold: passThreshold,
  evaluation: 'fixed single-answer evidence; synthesis quality, not verbatim equality',
  judge_enabled: useJudge,
  results,
  summary: {
    count: results.length,
    completed: completed.length,
    errors: results.length - completed.length,
    passed,
    accuracy_percent: results.length ? Math.round(passed / results.length * 1000) / 10 : 0,
    average_heuristic_score_percent: Math.round(average('score') * 1000) / 10,
    average_fact_coverage: average('fact_coverage'),
    average_groundedness: average('groundedness'),
    average_question_relevance: average('question_relevance'),
    average_preservation: average('preservation'),
    judge_count: judged.length,
    judge_accuracy_percent: judged.length ? Math.round(passed / judged.length * 1000) / 10 : null,
    average_judge_score: judged.length ? Math.round(judged.reduce((sum, item) => sum + item.judge.score, 0) / judged.length * 10) / 10 : null,
  },
}

mkdirSync(join(root, 'out'), { recursive: true })
writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
writeFileSync(outputMarkdown, markdownReport(report), 'utf8')
console.log(`\nSummary: ${JSON.stringify(report.summary)}`)
console.log(`JSON report: ${outputJson}`)
console.log(`Markdown report: ${outputMarkdown}`)

if (report.summary.accuracy_percent < passThreshold * 100) process.exitCode = 2
