import { appendFileSync, existsSync, mkdirSync, readFileSync, truncateSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { extractDocument } from './extract-document.mjs'
import { llmRequestOptions, readLlmSettings } from './llm-settings.mjs'

/*
 * Local document ingestion:
 * PDF/DOCX/HTML -> structured blocks -> Gemma Q&A -> independent validation
 * -> checkpointed JSONL and reviewable Markdown.
 *
 * The extractor is intentionally separate from the LLM. It never repairs
 * corrupted text from memory; unreadable source blocks are marked for review.
 */

const root = resolve(process.cwd())
const defaultOutputDir = join(root, 'out', 'document-ingest')
const supportedExtensions = new Set(['.pdf', '.docx', '.html', '.htm'])

const generatorPrompt = [
  'Ты формируешь проверяемый учебный корпус из одного фрагмента документа.',
  '',
  'Правила:',
  '1. Источник внутри <source_block> — единственный источник фактов. Можно объяснять источник своими словами, но нельзя добавлять новые факты из памяти или других документов.',
  '2. Сформулируй от 1 до 4 самостоятельных вопросов, покрывающих существенные технические идеи фрагмента. Не создавай вопросы по благодарностям, библиографии, служебным ссылкам, интерфейсу аннотаторов или повторяющимся деталям, если они не являются предметом метода. Если блок целиком состоит из такого служебного материала и не содержит полезной технической идеи, верни items: [] и не выдумывай вопрос.',
  '3. Каждый ответ должен быть самодостаточным: читатель должен понять его без исходного фрагмента. Не начинай ответ словами «в тексте», «в данном фрагменте», «авторы говорят» и не используй неясные местоимения без существительного.',
  '4. Для простого факта допустимо 1 предложение. Для определения, механизма, алгоритма, сравнения, причины, преимущества, ограничения или результата эксперимента напиши 2–5 полных предложений (обычно 40–120 слов): сначала тезис, затем механизм/шаги, затем важные параметры, числа, последствия или ограничения из источника.',
  '5. Для алгоритма опиши последовательность «вход → основные шаги → результат/цель». Для сравнения явно назови обе стороны и различие. Для таблицы укажи модель/датасет/метрику или другую принадлежность чисел; не выдавай голый список чисел и не копируй Markdown-таблицу в ответ.',
  '6. Для формулы сохрани математическую запись ровно в том виде, в каком она дана в источнике, и поясни обозначения и роль формулы. Если формула в source_block выглядит повреждённой или потеряла LaTeX, не восстанавливай её по памяти: установи status="needs_source_review".',
  '7. Не включай в ответ служебные поля, block_id, хеши, XML-теги, URL, сырые разделители таблицы (`|...|`) или комментарии об источнике. source_block_ids передавай только в JSON-поле.',
  '8. Для каждого утверждения укажи source_block_ids. Неподтверждённые утверждения не включай.',
  '9. Числа, имена, термины, названия датасетов, метрики и формулы переписывай особенно внимательно.',
  '10. Верни только валидный JSON без Markdown-ограждения:',
  '{ "items": [{ "question": "...", "answer": "...", "source_block_ids": ["..."], "claims": [], "formulas": [] }], "status": "candidate|needs_source_review", "issues": [] }',
].join('\n')

const validatorPrompt = [
  'Ты независимый валидатор записи учебного корпуса.',
  '',
  'Сверь candidate с source_block настолько точно, насколько возможно.',
  'Проверь поддержку каждого утверждения, покрытие основных идей, полноту ответа, числа, термины и формулы.',
  'Ответ на простой факт может состоять из одного предложения. Ответ на механизм, алгоритм, сравнение, причину, результат, преимущество или ограничение должен содержать 2–5 полных предложений и быть самодостаточным.',
  'Проверь, что ответ содержит не только общий тезис, но и существенные детали source_block: шаги, параметры, числа, датасеты, метрики, последствия или ограничения — если они относятся к вопросу.',
  'Пустой массив items допустим и должен быть approved, если source_block действительно не содержит самостоятельной технической идеи (например, только acknowledgements или bibliography).',
  'Проверь, что разные режимы или алгоритмы не были случайно отождествлены.',
  'Отклони ответ с сырым block_id, XML-тегом, внутренним служебным маркером, необъяснённым URL, копией Markdown-таблицы или списком чисел без контекста.',
  'Если вопрос требует формулу, проверь её символы и обозначения посимвольно. Повреждённый PDF-текст нельзя исправлять по памяти: верни needs_source_review.',
  'Проверь ссылки source_block_ids.',
  '',
  'Собственные знания используй только как сигнал подозрительного места. Источник важнее памяти модели.',
  'Если извлечение повреждено, верни needs_source_review, а не исправляй источник по памяти.',
  '',
  'Верни только JSON:',
  '{ "status": "approved|needs_review|rejected|needs_source_review", "supported_score": 0.0, "coverage_score": 0.0, "issues": [], "missing_facts": [], "formula_check": "ok|mismatch|not_present|needs_source_review" }',
].join('\n')

function loadDotEnv() {
  const path = join(root, '.env')
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!key || key in process.env) continue
    process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/su, '$2')
  }
}

function help() {
  console.log([
    'Usage:',
    '  npm run document:ingest -- path/to/document.pdf [options]',
    '',
    'Options:',
    '  --output-dir DIR       Output directory (default: out/document-ingest)',
    '  --block-mode MODE      heading (default), page, or paragraph',
    '  --max-chars N          Maximum source characters per block (default: 14000)',
    '  --model NAME           LM Studio model; otherwise the single loaded LLM is used',
    '  --extract-only         Write structured extraction without calling LM Studio',
    '  --from N               Start at block index N',
    '  --limit N              Process at most N blocks',
    '  --repair               Repair a failed candidate once, then validate again',
    '  --include-unverified   Include rejected records in review Markdown',
    '  --force                Reprocess existing checkpoints',
    '',
    'Environment:',
    '  PDF extraction         @firecrawl/pdf-inspector (local native parser)',
    '  DOCX extraction        mammoth (local parser)',
    '  HTML extraction        cheerio (local parser)',
    '  DOCUMENT_MAX_TOKENS   Maximum tokens per LLM call (default: 1600)',
    '  DOCUMENT_MIN_SUPPORT  Validator support threshold (default: 0.90)',
    '  DOCUMENT_MIN_COVERAGE Validator coverage threshold (default: 0.80)',
  ].join('\n'))
}

function integer(value, name, minimum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(name + ' must be an integer >= ' + minimum)
  return parsed
}

function parseArgs(argv) {
  const options = {
    input: null,
    outputDir: defaultOutputDir,
    blockMode: 'heading',
    maxChars: 14000,
    model: null,
    extractOnly: false,
    from: 0,
    limit: null,
    repair: false,
    includeUnverified: false,
    force: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      help()
      process.exit(0)
    }
    if (!arg.startsWith('-') && options.input === null) {
      options.input = arg
      continue
    }
    const next = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) throw new Error('Missing value for ' + arg)
      index += 1
      return value
    }
    if (arg === '--output-dir') options.outputDir = resolve(next())
    else if (arg === '--block-mode') options.blockMode = next()
    else if (arg === '--max-chars') options.maxChars = integer(next(), '--max-chars', 500)
    else if (arg === '--model') options.model = next()
    else if (arg === '--from') options.from = integer(next(), '--from', 0)
    else if (arg === '--limit') options.limit = integer(next(), '--limit', 1)
    else if (arg === '--extract-only') options.extractOnly = true
    else if (arg === '--repair') options.repair = true
    else if (arg === '--include-unverified') options.includeUnverified = true
    else if (arg === '--force') options.force = true
    else throw new Error('Unknown argument: ' + arg)
  }
  if (!options.input) throw new Error('Input document path is required. Use --help for usage.')
  if (!supportedExtensions.has(extname(options.input).toLowerCase())) {
    throw new Error('Unsupported document type. Supported: .pdf, .docx, .html, .htm')
  }
  if (!['heading', 'page', 'paragraph'].includes(options.blockMode)) {
    throw new Error('--block-mode must be heading, page or paragraph')
  }
  return options
}

function readJsonl(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) }
    catch (error) { throw new Error('Invalid JSONL ' + path + ':' + (index + 1) + ': ' + (error instanceof Error ? error.message : String(error))) }
  })
}

function writeJsonl(path, records) {
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), 'utf8')
}

function writeRawMarkdown(metadata, blocks, path) {
  const lines = [
    '# Extracted document: ' + basename(metadata.source_path),
    '',
    '- Source type: ' + metadata.source_type,
    '- SHA-256: ' + metadata.source_sha256,
    '- Blocks: ' + blocks.length,
    '- Extraction status: ' + metadata.extraction_status,
    '',
  ]
  for (const block of blocks) {
    let page = ''
    if (block.page_start) page = ' page=' + block.page_start + (block.page_end && block.page_end !== block.page_start ? '-' + block.page_end : '')
    lines.push('## ' + block.title, '', '<!-- block_id=' + block.block_id + page + ' status=' + block.extraction_status + ' -->', '', block.text, '')
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf8')
}

function sanitizeSource(value) {
  return String(value)
    .replace(/<\/?(?:source_block|candidate|validation|instructions)\b[^>]*>/giu, '')
    .replace(/<\|[^|]*\|>/gu, '')
}

function sourcePayload(block) {
  return {
    block_id: block.block_id,
    title: block.title,
    page_start: block.page_start,
    page_end: block.page_end,
    extraction_status: block.extraction_status,
    text: sanitizeSource(block.text),
  }
}

async function responseBody(response) {
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) throw new Error('LM Studio HTTP ' + response.status + ': ' + JSON.stringify(body))
  return body
}

async function resolveModel(baseUrl, configured) {
  if (configured && configured !== 'auto') return configured
  const response = await fetch(baseUrl + '/api/v1/models', { signal: AbortSignal.timeout(5000) })
  const body = await responseBody(response)
  const loaded = (body.models ?? []).filter((model) => model.type === 'llm' && model.loaded_instances?.length > 0)
  if (loaded.length !== 1) throw new Error('Expected exactly one loaded LLM in LM Studio, found ' + loaded.length + '. Pass --model explicitly.')
  return loaded[0].key
}

async function chat(settings, model, system, user) {
  const response = await fetch(settings.baseUrl + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...llmRequestOptions(settings),
      stream: false,
    }),
    signal: AbortSignal.timeout(180000),
  })
  const body = await responseBody(response)
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('LM Studio returned an empty message')
  return content.trim()
}

function parseJsonObject(text) {
  const clean = text.trim()
  try { return JSON.parse(clean) }
  catch { /* Try to recover an object wrapped in a short explanation. */ }
  let start = -1
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === '{') {
      if (start < 0) start = index
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (start >= 0 && depth === 0) {
        try { return JSON.parse(clean.slice(start, index + 1)) } catch { return null }
      }
    }
  }
  return null
}

function normalizeItems(value) {
  const items = Array.isArray(value?.items) ? value.items : Array.isArray(value) ? value : []
  return items.map((item) => ({
    question: typeof item?.question === 'string' ? item.question.trim() : '',
    answer: typeof item?.answer === 'string' ? item.answer.trim() : '',
    source_block_ids: Array.isArray(item?.source_block_ids) ? item.source_block_ids.filter((id) => typeof id === 'string') : [],
    claims: Array.isArray(item?.claims) ? item.claims : [],
    formulas: Array.isArray(item?.formulas) ? item.formulas : [],
  }))
}

function sentenceCount(text) {
  return String(text)
    .split(/[.!?](?:[»”"')\]]+)?(?=\s|$)/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .length
}

function wordCount(text) {
  return String(text).trim().split(/\s+/u).filter(Boolean).length
}

function needsExpandedAnswer(question) {
  return /(?:как\s+(?:работ|устро|обуч|использ|примен|формир|вычисл|получ|происход)|чем\s+отлич|почему|опиш|объясн|каков\w*\s+[^?]{0,50}\b(?:роль|цель|механизм|преимуществ|ограничен|результат)|какие\s+(?:этап|шаг|преимуществ|ограничен|причин|компонент|операц|различ|тип|задач|метод|источник|данн))/iu.test(question)
}

function answerQualityIssues(item, index) {
  const issues = []
  const answer = item.answer
  const prefix = 'item ' + (index + 1)
  if (/<\/?(?:source_block|candidate|validation|instructions)\b/iu.test(answer)) {
    issues.push(prefix + ' answer contains an internal XML tag')
  }
  if (/\[[^\]\n]{1,200}-[a-f0-9]{8,}\]/iu.test(answer)) {
    issues.push(prefix + ' answer leaks an internal block id')
  }
  if (/(?:\|[^|\n]+){2,}\|/u.test(answer)) {
    issues.push(prefix + ' answer contains a raw Markdown table')
  }
  if (/(?:\$\s*ext\{|\*p\*\s*\([^\n]{0,80}\)\s*\*\/\*|\\?text\s*\{)/iu.test(answer)) {
    issues.push(prefix + ' answer contains a suspiciously corrupted formula')
  }
  if (needsExpandedAnswer(item.question)) {
    if (sentenceCount(answer) < 2) issues.push(prefix + ' conceptual answer must contain at least two sentences')
    if (wordCount(answer) < 25) issues.push(prefix + ' conceptual answer is too short')
  }
  return issues
}

function candidateShape(candidate, blockId) {
  const items = normalizeItems(candidate)
  const issues = []
  if (items.length > 4) issues.push('generator must return at most 4 items')
  for (const [index, item] of items.entries()) {
    if (!item.question) issues.push('item ' + (index + 1) + ' has no question')
    if (!item.answer) issues.push('item ' + (index + 1) + ' has no answer')
    if (item.source_block_ids.length === 0) issues.push('item ' + (index + 1) + ' has no source_block_ids')
    if (item.source_block_ids.some((id) => id !== blockId)) issues.push('item ' + (index + 1) + ' references an unknown source block')
    issues.push(...answerQualityIssues(item, index))
  }
  return { items, issues }
}

function numeric(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeValidation(value) {
  const rawStatus = String(value?.status ?? '').toLowerCase()
  const status = rawStatus === 'pass' ? 'approved' : rawStatus
  return {
    status: ['approved', 'needs_review', 'rejected', 'needs_source_review'].includes(status) ? status : 'needs_review',
    supported_score: numeric(value?.supported_score),
    coverage_score: numeric(value?.coverage_score),
    issues: Array.isArray(value?.issues) ? value.issues : [],
    missing_facts: Array.isArray(value?.missing_facts) ? value.missing_facts : [],
    formula_check: String(value?.formula_check ?? 'not_present'),
  }
}

function isApproved(validation, shapeIssues, thresholds, block) {
  if (shapeIssues.length > 0 || validation.status !== 'approved') return false
  if (block.extraction_status !== 'ok') return false
  if (validation.formula_check === 'mismatch' || validation.formula_check === 'needs_source_review') return false
  if ((validation.supported_score ?? -1) < thresholds.support) return false
  if ((validation.coverage_score ?? -1) < thresholds.coverage) return false
  return !validation.issues.some((issue) => String(issue?.severity).toLowerCase() === 'error')
}

async function generate(settings, model, block) {
  const raw = await chat(settings, model, generatorPrompt, '<source_block>\n' + JSON.stringify(sourcePayload(block), null, 2) + '\n</source_block>')
  const parsed = parseJsonObject(raw)
  if (!parsed) return { raw, parsed: null, items: [], issues: ['generator did not return valid JSON'] }
  const shape = candidateShape(parsed, block.block_id)
  return { raw, parsed, items: shape.items, issues: shape.issues }
}

async function validate(settings, model, block, candidate) {
  const user = '<source_block>\n' + JSON.stringify(sourcePayload(block), null, 2) + '\n</source_block>\n\n<candidate>\n' + JSON.stringify(candidate, null, 2) + '\n</candidate>'
  const raw = await chat(settings, model, validatorPrompt, user)
  const parsed = parseJsonObject(raw)
  if (!parsed) return { raw, parsed: null, ...normalizeValidation({ status: 'needs_review', issues: [{ severity: 'error', text: 'validator did not return valid JSON' }] }) }
  return { raw, parsed, ...normalizeValidation(parsed) }
}

async function repair(settings, model, block, candidate, validation) {
  const system = generatorPrompt + '\n\nИсправь только проблемы валидатора и верни новый JSON.'
  const user = '<source_block>\n' + JSON.stringify(sourcePayload(block), null, 2) + '\n</source_block>\n\n<candidate>\n' + JSON.stringify(candidate, null, 2) + '\n</candidate>\n\n<validation>\n' + JSON.stringify(validation, null, 2) + '\n</validation>'
  const raw = await chat(settings, model, system, user)
  const parsed = parseJsonObject(raw)
  if (!parsed) return { raw, parsed: null, items: [], issues: ['repair did not return valid JSON'] }
  const shape = candidateShape(parsed, block.block_id)
  return { raw, parsed, items: shape.items, issues: shape.issues }
}

function pathsFor(inputPath, outputDir) {
  const base = basename(inputPath, extname(inputPath)).toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '') || 'document'
  return {
    rawJsonl: join(outputDir, base + '.blocks.jsonl'),
    rawMarkdown: join(outputDir, base + '.blocks.md'),
    qaJsonl: join(outputDir, base + '.qa.jsonl'),
    qaMarkdown: join(outputDir, base + '.qa.md'),
  }
}

function qaMarkdown(metadata, records, includeUnverified) {
  const lines = [
    '# ' + basename(metadata.source_path) + ' — generated Q&A',
    '',
    '> Source SHA-256: ' + metadata.source_sha256,
    '> Записи попадают в индекс только после независимой проверки.',
    '',
  ]
  const seen = new Set()
  for (const record of records) {
    if (record.status !== 'approved' && !includeUnverified) continue
    for (const item of record.items ?? []) {
      const question = String(item.question ?? '').trim()
      const answer = String(item.answer ?? '').trim()
      if (!question || !answer) continue
      const key = question.toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ')
      if (seen.has(key)) continue
      seen.add(key)
      lines.push('## ' + question, '', '<!-- status=' + record.status + '; block_id=' + record.block_id + ' -->', '', answer, '')
    }
  }
  if (seen.size === 0) lines.push('_Пока нет утверждённых записей._', '')
  return lines.join('\n') + '\n'
}

async function main() {
  loadDotEnv()
  const options = parseArgs(process.argv.slice(2))
  const inputPath = resolve(options.input)
  const paths = pathsFor(inputPath, options.outputDir)
  mkdirSync(options.outputDir, { recursive: true })

  console.log('Extracting ' + inputPath)
  const extracted = await extractDocument(inputPath, options)
  writeJsonl(paths.rawJsonl, [extracted.metadata, ...extracted.blocks])
  writeRawMarkdown(extracted.metadata, extracted.blocks, paths.rawMarkdown)
  console.log('Extracted ' + extracted.blocks.length + ' blocks (' + extracted.metadata.extraction_status + ')')
  console.log('Raw JSONL: ' + paths.rawJsonl)
  console.log('Raw Markdown: ' + paths.rawMarkdown)
  if (options.extractOnly) return

  const maxTokens = integer(process.env.DOCUMENT_MAX_TOKENS ?? '1600', 'DOCUMENT_MAX_TOKENS', 1)
  const settings = readLlmSettings({ maxTokens, temperature: 0.1 })
  const configuredModel = options.model ?? process.env.DOCUMENT_LLM_MODEL ?? settings.model
  const model = await resolveModel(settings.baseUrl, configuredModel)
  const thresholds = {
    support: Number.parseFloat(process.env.DOCUMENT_MIN_SUPPORT ?? '0.90'),
    coverage: Number.parseFloat(process.env.DOCUMENT_MIN_COVERAGE ?? '0.80'),
  }
  if (!Number.isFinite(thresholds.support) || !Number.isFinite(thresholds.coverage)) throw new Error('Document validation thresholds must be numbers')
  console.log('LM Studio: ' + settings.baseUrl)
  console.log('Model: ' + model)

  if (options.force) truncateSync(paths.qaJsonl, 0)
  const previous = new Map(readJsonl(paths.qaJsonl).filter((record) => record.record_type === 'qa_block').map((record) => [record.block_id, record]))
  const selected = extracted.blocks.slice(options.from, options.limit === null ? undefined : options.from + options.limit)
  let processed = 0
  for (const block of selected) {
    if (!options.force && previous.has(block.block_id)) {
      console.log('Skipping ' + block.block_id + ' (checkpoint exists)')
      continue
    }
    let result
    if (block.extraction_status === 'needs_ocr') {
      result = {
        record_type: 'qa_block', schema_version: 1, block_id: block.block_id,
        source_path: block.source_path, source_sha256: block.source_sha256,
        status: 'blocked_extraction', items: [],
        generation: { issues: ['extraction_status=' + block.extraction_status] },
        validation: null, generated_at: new Date().toISOString(), model,
      }
    } else {
      try {
        let candidate = await generate(settings, model, block)
        let validation = candidate.parsed ? await validate(settings, model, block, candidate.parsed) : null
        if (options.repair && validation && !isApproved(validation, candidate.issues, thresholds, block)) {
          candidate = await repair(settings, model, block, candidate.parsed ?? {}, validation)
          validation = candidate.parsed ? await validate(settings, model, block, candidate.parsed) : null
        }
        const status = validation && isApproved(validation, candidate.issues, thresholds, block)
          ? 'approved'
          : block.extraction_status !== 'ok' ? 'needs_source_review' : validation?.status ?? 'generation_failed'
        result = {
          record_type: 'qa_block', schema_version: 1, block_id: block.block_id,
          source_path: block.source_path, source_sha256: block.source_sha256,
          title: block.title, page_start: block.page_start, page_end: block.page_end,
          status, items: candidate.items,
          generation: { raw: candidate.raw, issues: candidate.issues },
          validation: validation ? { ...validation, raw: validation.raw } : null,
          generated_at: new Date().toISOString(), model,
        }
      } catch (error) {
        result = {
          record_type: 'qa_block', schema_version: 1, block_id: block.block_id,
          source_path: block.source_path, source_sha256: block.source_sha256,
          title: block.title, page_start: block.page_start, page_end: block.page_end,
          status: 'llm_error', items: [],
          generation: { issues: [error instanceof Error ? error.message : String(error)] },
          validation: null, generated_at: new Date().toISOString(), model,
        }
      }
    }
    appendFileSync(paths.qaJsonl, JSON.stringify(result) + '\n', 'utf8')
    previous.set(block.block_id, result)
    processed += 1
    console.log(processed + '/' + selected.length + ' ' + block.block_id + ': ' + result.status)
  }

  const allRecords = [...previous.values()].sort((left, right) => String(left.block_id).localeCompare(String(right.block_id)))
  writeJsonl(paths.qaJsonl, allRecords)
  writeFileSync(paths.qaMarkdown, qaMarkdown(extracted.metadata, allRecords, options.includeUnverified), 'utf8')
  const approved = allRecords.filter((record) => record.status === 'approved').length
  console.log('Done. Approved blocks: ' + approved + '/' + allRecords.length)
  console.log('QA JSONL: ' + paths.qaJsonl)
  console.log('QA Markdown: ' + paths.qaMarkdown)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
