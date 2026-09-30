/**
 * Generate natural interview paraphrases for existing RAG records.
 *
 * Aliases are metadata on one source question. They never create additional
 * Qdrant points or duplicate the answer. The script is intentionally scoped by
 * --file so generated variants can be reviewed module by module.
 *
 * Examples:
 *   node scripts/generate-rag-aliases.mjs --file my-topic.md --dry-run
 *   node scripts/generate-rag-aliases.mjs --file my-topic.md --write
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { moduleFromFrontMatter } from './front-matter.mjs'

const root = resolve(process.cwd())
const dataDir = resolve(process.env.RAG_DATA_DIR ?? join(root, 'data'))
const files = process.argv
  .filter((arg) => arg.startsWith('--file='))
  .flatMap((arg) => arg.slice('--file='.length).split(',').map((value) => value.trim()).filter(Boolean))
// Without --file, every corpus file is processed. Nothing here is keyed to a
// particular file name: module, label and authority come from front matter.
const targetFiles = files.length > 0
  ? files
  : readdirSync(dataDir)
      .filter((name) => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'agents.md')
      .sort()
const write = process.argv.includes('--write')
const refresh = process.argv.includes('--refresh') || process.env.RAG_ALIAS_REFRESH === '1'
const offline = process.env.RAG_ALIAS_OFFLINE === '1'
const requestedAliasCount = positiveInteger(
  process.argv.find((arg) => arg.startsWith('--count='))?.slice('--count='.length)
    ?? process.env.RAG_ALIAS_COUNT,
  5,
)

loadDotEnv()

const manifestPath = join(dataDir, 'manifest.jsonl')
const cachePath = join(root, 'out', 'rag-alias-cache.json')
const llmBaseUrl = (process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234').replace(/\/$/u, '')
const requestedModel = process.env.ALIAS_LLM_MODEL ?? process.env.LLM_MODEL ?? 'auto'
const batchSize = positiveInteger(process.env.RAG_ALIAS_BATCH_SIZE, 8)
const aliasMaxTokens = process.env.RAG_ALIAS_MAX_TOKENS
  ? positiveInteger(process.env.RAG_ALIAS_MAX_TOKENS, 1800)
  : null

// High-value formulations taken from the real interview flow. Keep these
// curated variants ahead of model-generated paraphrases so obvious questions
// get an exact lexical match even when the embedding model is weak.
const CURATED_ALIASES = new Map([
  [normalize('Расскажите о себе и о своём опыте.'), ['Расскажите про свой опыт']],
])

const model = offline ? 'deterministic-template' : await resolveModel()
const manifestLines = existsSync(manifestPath)
  ? readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => parseManifestLine(line, index))
  : []
const records = manifestLines.map((entry) => entry.record)
const byQuestion = new Map(records.map((record, index) => [`${record.source_file}::${normalize(record.question)}`, { record, index }]))
const cachedAliases = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}
const sourceRecords = targetFiles.flatMap((file) => readSourceQuestions(file).map((question) => ({ file, question })))
const pending = sourceRecords.filter(({ file, question }) => {
  const match = byQuestion.get(`${file}::${normalize(question.text)}`)
  const cacheKey = `${file}::${normalize(question.text)}`
  return refresh || (validAliasCount(question.text, match?.record.aliases) < requestedAliasCount
    && validAliasCount(question.text, cachedAliases[cacheKey]) < requestedAliasCount)
})

console.log(`Model: ${model}`)
console.log(`Files: ${targetFiles.join(', ')}`)
console.log(`Records needing aliases: ${pending.length}`)

const generated = sourceRecords.flatMap((item) => {
  if (refresh) return []
  const cacheKey = `${item.file}::${normalize(item.question.text)}`
  const existing = byQuestion.get(cacheKey)?.record.aliases
  const aliases = validAliasCount(item.question.text, cachedAliases[cacheKey]) >= requestedAliasCount
    ? cachedAliases[cacheKey]
    : existing
  const prepared = prepareAliases(item.question.text, aliases)
  return prepared.length >= requestedAliasCount ? [{ ...item, aliases: prepared }] : []
})
for (let offset = 0; offset < pending.length; offset += batchSize) {
  const batch = pending.slice(offset, offset + batchSize)
  const aliasesByQuestion = await generateBatch(batch)
  for (const item of batch) {
    const aliases = prepareAliases(item.question.text, [
      ...(aliasesByQuestion.get(normalize(item.question.text)) ?? []),
      ...fallbackAliases(item.question.text),
    ])
    if (aliases.length < requestedAliasCount) {
      throw new Error(`Model returned fewer than ${requestedAliasCount} aliases for: ${item.question.text}`)
    }
    cachedAliases[`${item.file}::${normalize(item.question.text)}`] = aliases
    writeFileSync(cachePath, `${JSON.stringify(cachedAliases, null, 2)}\n`, 'utf8')
    generated.push({ ...item, aliases })
  }
  console.log(`Generated ${Math.min(offset + batch.length, pending.length)}/${pending.length}`)
}

const updates = new Map()
for (const item of generated) {
  const key = `${item.file}::${normalize(item.question.text)}`
  const existing = byQuestion.get(key)
  if (existing) {
    const aliases = refresh
      ? prepareAliases(item.question.text, item.aliases)
      : mergeAliases(existing.record.aliases, item.aliases, item.question.text)
    existing.record.aliases = aliases
    if (requestedAliasCount === 3) existing.record.paraphrases = aliases.slice(0, 3)
    updates.set(existing.index, existing.record)
    continue
  }

  const meta = metadataForFile(item.file)
  const module = meta.moduleSlug
  // The stable record key must be unique per source record. Several files can
  // share one logical module, so the file stem — not the module — disambiguates
  // the section id.
  const fileStem = item.file.replace(/\.md$/iu, '')
  const record = {
    id: `${fileStem}.section-${String(item.question.sectionIndex + 1).padStart(3, '0')}`,
    module,
    module_label: meta.label,
    source_file: item.file,
    section_index: item.question.sectionIndex,
    question: item.question.text,
    aliases: item.aliases,
    ...(requestedAliasCount === 3 ? { paraphrases: item.aliases.slice(0, 3) } : {}),
    tags: [module, 'interview'],
    type: 'interview_answer',
    authority: meta.authority,
    status: 'active',
    provenance: item.file,
  }
  records.push(record)
}

if (write) {
  for (const [index, record] of updates) manifestLines[index].record = record
  const output = [...manifestLines.map(({ record }) => JSON.stringify(record)), ...records.slice(manifestLines.length).map((record) => JSON.stringify(record))]
  writeFileSync(manifestPath, `${output.join('\n')}\n`, 'utf8')
  console.log(`Updated ${generated.length} records in ${manifestPath}`)
} else {
  console.log('Dry run. Use --write after reviewing the generated aliases.')
  for (const item of generated.slice(0, 10)) {
    console.log(`\n${item.file} :: ${item.question.text}`)
    for (const alias of item.aliases) console.log(`- ${alias}`)
  }
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
    if (!(key in process.env)) process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/su, '$2')
  }
}

function parseManifestLine(line, index) {
  try {
    const record = JSON.parse(line)
    if (!record || typeof record !== 'object' || typeof record.source_file !== 'string' || typeof record.question !== 'string') {
      throw new Error('record must contain source_file and question')
    }
    return { record, index }
  } catch (error) {
    throw new Error(`Invalid manifest line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readSourceQuestions(file) {
  const path = join(dataDir, file)
  if (!existsSync(path)) throw new Error(`Source file does not exist: ${path}`)
  const markdown = readFileSync(path, 'utf8')
  const matches = [...markdown.matchAll(/^##[ \t]+(.+?)[ \t]*$/gmu)]
  return matches.map((match, sectionIndex) => ({ text: match[1].trim(), sectionIndex }))
}

async function resolveModel() {
  if (requestedModel !== 'auto') return requestedModel
  const response = await fetch(`${llmBaseUrl}/api/v1/models`, { signal: AbortSignal.timeout(5_000) })
  const body = await response.json()
  const loaded = (body.models ?? body.data ?? [])
    .filter((item) => !String(item.id ?? item.key ?? '').toLowerCase().includes('embedding'))
    .filter((item) => item.type === undefined || item.type === 'llm')
    .filter((item) => item.loaded_instances === undefined || item.loaded_instances.length > 0)
    .map((item) => item.id ?? item.key)
    .filter(Boolean)
  if (loaded.length !== 1) throw new Error(`Expected one loaded LLM, found: ${loaded.join(', ')}`)
  return loaded[0]
}

async function generateBatch(items) {
  if (offline) {
    return new Map(items.map((item) => [normalize(item.question.text), paraphraseAliases(item.question.text)]))
  }

  const prompt = [
    `Для каждого вопроса ниже сгенерируй ровно ${requestedAliasCount} естественных варианта, которыми интервьюер может спросить то же самое на русском техническом собеседовании.`,
    'Сохрани смысл исходного вопроса. Не добавляй новые факты, технологии, метрики или предположения о проекте.',
    'Варианты должны быть самостоятельными вопросами, а не просто копией исходной строки. Не меняй уровень сложности.',
    `Верни только JSON-объект формата {"items":[{"question":"исходный вопрос","aliases":[${Array.from({ length: requestedAliasCount }, (_, index) => `"вариант ${index + 1}"`).join(',')}]}]}.`,
    ...items.map((item, index) => `${index + 1}. ${item.question.text}`),
  ].join('\n')

  const response = await fetch(`${llmBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Ты аккуратный редактор вопросов для базы знаний технического интервью.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: aliasMaxTokens ?? Math.max(1800, items.length * 420),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'question_aliases',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    question: { type: 'string' },
                    aliases: { type: 'array', items: { type: 'string' }, minItems: requestedAliasCount, maxItems: requestedAliasCount },
                  },
                  required: ['question', 'aliases'],
                },
              },
            },
            required: ['items'],
          },
        },
      },
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${JSON.stringify(body)}`)
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('LLM returned no message content')
  const json = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1] ?? content
  const parsed = parseJsonWithSafeEscapeRepair(json)
  const rows = Array.isArray(parsed) ? parsed : parsed?.items
  if (!Array.isArray(rows)) throw new Error('LLM aliases response has no items array')
  return new Map(items.map((item, index) => {
    const aliases = Array.isArray(rows[index]?.aliases)
      ? rows[index].aliases.filter((alias) => typeof alias === 'string' && alias.trim())
      : []
    return [normalize(item.question.text), aliases]
  }))
}

function parseJsonWithSafeEscapeRepair(value) {
  try {
    return JSON.parse(value)
  } catch (error) {
    // Local models occasionally emit Markdown escapes such as `top\_k` inside
    // a JSON string. Remove only invalid JSON escapes and retry; valid escapes
    // remain untouched.
    const repaired = value.replace(/\\(?!["\\/bfnrtu])/gu, '')
    try {
      return JSON.parse(repaired)
    } catch {
      throw error
    }
  }
}

function mergeAliases(existing, generated, question) {
  return prepareAliases(question, [...(Array.isArray(existing) ? existing : []), ...generated])
}

function validAliasCount(question, aliases) {
  if (!Array.isArray(aliases)) return 0
  const questionKey = normalize(question)
  return uniqueAliases(aliases).filter((alias) => normalize(alias) !== questionKey).length
}

function prepareAliases(question, aliases) {
  const questionKey = normalize(question)
  return uniqueAliases([
    ...(CURATED_ALIASES.get(questionKey) ?? []),
    ...(Array.isArray(aliases) ? aliases : []),
    ...fallbackAliases(question),
  ]).filter((alias) => normalize(alias) !== questionKey).slice(0, requestedAliasCount)
}

function uniqueAliases(values) {
  return [...new Map(values.map((value) => [normalize(value), value.trim()])).values()]
}

function fallbackAliases(question) {
  const base = String(question)
    .replace(/^\d{1,3}[.)]\s*/u, '')
    .trim()
    .replace(/[?.!]+$/u, '')
  const lower = base.charAt(0).toLocaleLowerCase('ru-RU') + base.slice(1)
  return [
    `Можете подробнее рассказать: ${base}?`,
    `Расскажите, пожалуйста, ${lower}.`,
    `Как бы вы ответили на вопрос: ${lower}?`,
    `Что важно знать про этот аспект: ${lower}?`,
    `Что можете рассказать про этот аспект: ${lower}?`,
  ]
}

function paraphraseAliases(question) {
  const base = String(question)
    .replace(/^\d{1,3}[.)]\s*/u, '')
    .trim()
    .replace(/[?.!]+$/u, '')
  const withoutPrefix = (pattern) => base.replace(pattern, '').trim()
  const lowerFirst = (value) => /^[A-ZА-ЯЁ]{2,}/u.test(value)
    ? value
    : value.charAt(0).toLocaleLowerCase('ru-RU') + value.slice(1)

  const definitionWithPurpose = base.match(/^Что такое\s+(.+?)\s+и какую проблему он решает$/iu)
  if (definitionWithPurpose) {
    const subject = definitionWithPurpose[1].trim()
    return [
      `Как бы вы определили ${subject} и какую задачу он решает?`,
      `В чём заключается подход ${subject} и зачем он нужен?`,
      `Где применяется ${subject} и какую проблему он помогает решить?`,
    ]
  }

  if (/^Что такое\s+/iu.test(base)) {
    const subject = withoutPrefix(/^Что такое\s+/iu)
    return [
      `Как вы определите понятие «${subject}»?`,
      `В чём суть ${subject}?`,
      `Как объяснить, что означает ${subject}?`,
    ]
  }
  if (/^Почему\s+/iu.test(base)) {
    const subject = withoutPrefix(/^Почему\s+/iu)
    return [
      `По какой причине ${lowerFirst(subject)}?`,
      `Что объясняет ситуацию, в которой ${lowerFirst(subject)}?`,
      `Какие последствия возникают, если ${lowerFirst(subject)}?`,
    ]
  }
  if (/^Зачем\s+/iu.test(base)) {
    const subject = withoutPrefix(/^Зачем\s+/iu)
    return [
      `Для чего ${lowerFirst(subject)}?`,
      `Какую проблему решает подход, описанный в вопросе «${base}»?`,
      `В чём практическая польза подхода из вопроса «${base}»?`,
    ]
  }
  if (/^Чем\s+/iu.test(base)) {
    return [
      `В чём отличие между вариантами из вопроса «${base}»?`,
      `Как сопоставить варианты, о которых спрашивается в вопросе «${base}»?`,
      `По каким критериям выбрать вариант в ситуации «${base}»?`,
    ]
  }
  if (/^Когда\s+/iu.test(base)) {
    return [
      `В каких ситуациях задачу из вопроса «${base}» следует решать именно так?`,
      `При каких условиях применим подход из вопроса «${base}»?`,
      `Как выбрать подход в ситуации из вопроса «${base}»?`,
    ]
  }
  if (/^Спроектируйте\s+/iu.test(base)) {
    const subject = withoutPrefix(/^Спроектируйте\s+/iu)
    return [
      `Как спроектировать ${lowerFirst(subject)}?`,
      `Опишите архитектуру для задачи: ${lowerFirst(subject)}?`,
      `Какие компоненты нужны, чтобы спроектировать ${lowerFirst(subject)}?`,
    ]
  }
  if (/^Реализуйте\s+/iu.test(base)) {
    const subject = withoutPrefix(/^Реализуйте\s+/iu)
    return [
      `Как реализовать ${lowerFirst(subject)}?`,
      `Напишите решение для задачи: ${lowerFirst(subject)}?`,
      `Покажите на примере, как реализовать ${lowerFirst(subject)}?`,
    ]
  }
  if (/^Как\s+/iu.test(base)) {
    const subject = withoutPrefix(/^Как\s+/iu)
    return [
      `Каким образом ${lowerFirst(subject)}?`,
      `Как именно ${lowerFirst(subject)}?`,
      `Опишите, как ${lowerFirst(subject)}?`,
    ]
  }
  if (/^Какие?\s+/iu.test(base)) {
    return [
      `Какие ключевые аспекты нужно раскрыть в ответе на вопрос «${base}»?`,
      `Что следует перечислить, отвечая на вопрос «${base}»?`,
      `Как бы вы структурировали ответ на вопрос «${base}»?`,
    ]
  }
  return [
    `Как бы вы ответили на вопрос: ${base}?`,
    `Какие ключевые аспекты нужно раскрыть: ${lowerFirst(base)}?`,
    `Как этот вопрос решается на практике: ${lowerFirst(base)}?`,
  ]
}

function normalize(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/^\d{1,3}[.)]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[?.!]+$/u, '')
    .toLocaleLowerCase('ru-RU')
}

const metadataCache = new Map()

/**
 * Module identity for a corpus file, read from the front matter the corpus
 * preparer wrote. The slug falls back to the file stem, which is the same value
 * `moduleSlugFor` puts in the manifest.
 */
function metadataForFile(file) {
  if (metadataCache.has(file)) return metadataCache.get(file)
  const path = join(dataDir, file)
  if (!existsSync(path)) throw new Error(`Source file does not exist: ${path}`)
  const meta = moduleFromFrontMatter(readFileSync(path, 'utf8'))
  const moduleSlug = basename(file, '.md').replace(/^interview-/u, '').replace(/-qa$/u, '').toLowerCase()
  const resolved = {
    moduleSlug,
    label: meta.label && meta.label !== 'Interview knowledge' ? meta.label : moduleSlug,
    authority: meta.authority ?? 'general_knowledge',
  }
  metadataCache.set(file, resolved)
  return resolved
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
