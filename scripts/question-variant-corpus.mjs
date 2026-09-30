import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A variant corpus is a paired `<prefix>_interview_knowledge_base_ru.md` +
 * `<prefix>_question_variants.json` couple. The Markdown headings are
 * human-readable, but are not independent answer records: `Вопрос N`,
 * `Вопрос N.1` and `Вопрос N.2` belong to one canonical record followed by
 * `**Ответ**`.
 */
const QUESTION_VARIANT_MARKDOWN_PATTERN = /^(.+)_interview_knowledge_base_ru\.md$/iu

/** Sidecar JSON file name for a variant-corpus Markdown file, or null. */
export function questionVariantCatalogFile(fileName) {
  if (typeof fileName !== 'string') return null
  const match = fileName.match(QUESTION_VARIANT_MARKDOWN_PATTERN)
  return match ? `${match[1]}_question_variants.json` : null
}

export function isQuestionVariantCorpus(fileName) {
  return questionVariantCatalogFile(fileName) !== null
}

export function normalizeQuestion(value) {
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('ru-RU')
}

export function stripFrontMatter(markdown) {
  const clean = markdown.replace(/^\uFEFF/u, '')
  const match = clean.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/u)
  return match ? match[1] : clean
}

export function loadQuestionVariantCatalog(dataDir, fileName) {
  const catalogFile = questionVariantCatalogFile(fileName)
  if (!catalogFile) throw new Error(`Not a question variant corpus markdown file: ${fileName}`)
  const path = join(dataDir, catalogFile)
  if (!existsSync(path)) throw new Error(`Question variant catalog does not exist: ${path}`)

  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Invalid question variant catalog ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(parsed)) throw new Error(`Question variant catalog must be a JSON array: ${path}`)

  const byId = new Map()
  for (const [index, item] of parsed.entries()) {
    const id = Number(item?.id)
    const question = typeof item?.question === 'string' ? item.question.trim() : ''
    // A record may legitimately have no variants (the corpus tail): the
    // canonical question still gets its own vector. Markdown/JSON drift is
    // caught later by the variant comparison in parseQuestionVariantMarkdown.
    const variants = Array.isArray(item?.variants)
      ? item.variants.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())
      : []
    if (!Number.isInteger(id) || id < 1 || !question) {
      throw new Error(`Invalid question variant record ${index + 1} in ${path}`)
    }
    const uniqueVariants = [...new Set(variants.filter((variant) => normalizeQuestion(variant) !== normalizeQuestion(question)))]
    if (uniqueVariants.length !== variants.length) {
      throw new Error(`Question ${id} has an empty or duplicate variant in ${path}`)
    }
    if (byId.has(id)) throw new Error(`Duplicate question variant id ${id} in ${path}`)
    byId.set(id, { id, question, variants: uniqueVariants })
  }
  return byId
}

/**
 * Parse the paired Markdown/JSON corpus into one answer record per canonical
 * question. The returned `variants` are retrieval texts, not extra answers.
 */
export function parseQuestionVariantMarkdown(markdown, catalog) {
  const lines = stripFrontMatter(markdown).split(/\r?\n/u)
  const records = []
  let current = null
  let inAnswer = false

  const finish = () => {
    if (!current) return
    const catalogEntry = catalog.get(current.id)
    if (!catalogEntry) throw new Error(`Markdown question ${current.id} has no JSON variant record`)
    if (normalizeQuestion(current.question) !== normalizeQuestion(catalogEntry.question)) {
      throw new Error(`Question ${current.id} differs between Markdown and JSON variant catalog`)
    }
    const markdownVariants = current.variants.map((item) => item.question)
    if (markdownVariants.length !== catalogEntry.variants.length
      || markdownVariants.some((value, index) => normalizeQuestion(value) !== normalizeQuestion(catalogEntry.variants[index]))) {
      throw new Error(`Question ${current.id} variants differ between Markdown and JSON variant catalog`)
    }
    const answer = current.answerLines.join('\n').trim()
    if (!answer) throw new Error(`Question ${current.id} has an empty answer`)
    records.push({
      id: current.id,
      question: current.question,
      variants: catalogEntry.variants,
      answer,
      sectionIndex: records.length,
    })
    current = null
    inAnswer = false
  }

  for (const line of lines) {
    const canonical = line.match(/^##[ \t]+Вопрос (\d+)\.\s+(.+?)\s*$/u)
    const variant = line.match(/^##[ \t]+Вопрос (\d+)\.(\d+)\.\s+(.+?)\s*$/u)
    const answerHeading = /^(?:##[ \t]+)?(?:\*\*Ответ\*\*|Ответ)\s*$/u.test(line)

    if (canonical) {
      finish()
      current = { id: Number(canonical[1]), question: canonical[2].trim(), variants: [], answerLines: [] }
      inAnswer = false
      continue
    }
    if (variant) {
      if (!current) throw new Error(`Variant ${variant[1]}.${variant[2]} appears before a canonical question`)
      if (Number(variant[1]) !== current.id || inAnswer) throw new Error(`Variant ${variant[1]}.${variant[2]} is out of place`)
      current.variants.push({ id: Number(variant[2]), question: variant[3].trim() })
      continue
    }
    if (answerHeading) {
      if (!current) throw new Error('Answer heading appears before a canonical question')
      inAnswer = true
      continue
    }
    if (current && inAnswer) current.answerLines.push(line)
  }
  finish()

  if (records.length !== catalog.size) {
    throw new Error(`Question variant corpus has ${records.length} Markdown records but ${catalog.size} JSON records`)
  }
  return records
}
