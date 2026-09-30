import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import {
  isQuestionVariantCorpus,
  loadQuestionVariantCatalog,
  parseQuestionVariantMarkdown,
} from './question-variant-corpus.mjs'

/**
 * Normalize the interview corpus once and create its stable metadata manifest.
 *
 * The Markdown files remain the human-editable source of truth. The manifest
 * gives the indexer durable IDs and retrieval metadata without putting YAML
 * parsing rules into the runtime path.
 */

const root = resolve(process.cwd())
const dataDir = resolve(process.env.RAG_DATA_DIR ?? join(root, 'data'))
const preparedAt = process.env.RAG_PREPARED_AT ?? new Date().toISOString().slice(0, 10)
const manifestOnly = process.env.RAG_MANIFEST_ONLY === '1'

import { DEFAULT_MODULE, moduleFromFrontMatter, renderValue, stripFrontMatter } from './front-matter.mjs'

function normalizeQuestion(value) {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru-RU')
}

function questionTopic(question) {
  return question
    .replace(/^Что вы можете рассказать про\s+/iu, '')
    .replace(/[?！!…]+$/u, '')
    .trim()
}

function conciseAlias(question) {
  const alias = question
    .replace(/[?！!…]+$/u, '')
    .replace(/^(что такое|что означает|как|почему|зачем|когда|какие? данные|какие?|каким образом|чем|расскажите о|расскажите про)\s+/iu, '')
    .trim()
  return alias && alias.length >= 3 && alias !== question ? alias : null
}

function slug(value) {
  const ascii = value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
  return ascii.slice(0, 48) || 'question'
}

function stableId(moduleSlug, originalQuestion) {
  const digest = createHash('sha256').update(`${moduleSlug}\n${normalizeQuestion(originalQuestion)}`, 'utf8').digest('hex')
  return `${moduleSlug}.${slug(questionTopic(originalQuestion))}-${digest.slice(0, 8)}`
}

function moduleSlug(fileName) {
  return basename(fileName, '.md').replace(/^interview-/u, '').replace(/-qa$/u, '').toLocaleLowerCase('en-US')
}

function parseSections(markdown) {
  const sections = []
  const heading = /^##[ \t]+(.+?)[ \t]*$/gmu
  const matches = [...markdown.matchAll(heading)]
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]
    const start = (current.index ?? 0) + current[0].length
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? markdown.length) : markdown.length
    const question = current[1].trim()
    const answer = markdown.slice(start, end).trim()
    if (question && answer) sections.push({ question, answer, sectionIndex: sections.length })
  }
  return sections
}

function renderFrontMatter(module) {
  const lines = [
    '---',
    `document_type: ${module.documentType ?? 'interview_rag_knowledge'}`,
    `target_role: "${module.targetRole ?? 'Руководитель разработки AI-агентов / AI Agentic Lead'}"`,
    `module: "${module.label}"`,
    'language: ru',
    'chunking_rule: "Каждая секция H2 является самостоятельным вопросом и отдельным RAG-чанком"',
    'term_rule: "Первое употребление англоязычного технического термина в каждой H2-секции содержит русскую транслитерацию и краткое объяснение"',
    `prepared_at: ${preparedAt}`,
    ...(module.extra ?? []),
    'topics:',
    ...module.tags.map((tag) => `  - ${tag}`),
    '---',
  ]
  return `${lines.join('\n')}\n`
}

function extractExpectedFacts(answer) {
  const check = answer.match(/\*\*(?:Что проверяю|Канонические claims):\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/u)?.[1]
  if (check) {
    const facts = check.split(';').map((item) => item.replace(/\s+/gu, ' ').trim().replace(/[.;]+$/u, '')).filter(Boolean)
    if (facts.length) return facts
  }
  const firstParagraph = (answer.split(/\n\s*\n/u).find((paragraph) => !/^\*\*(?:provenance|статус):/iu.test(paragraph.trim())) ?? answer)
  const firstSentence = firstParagraph.match(/^(.+?[.!?])(?:\s|$)/u)?.[1] ?? firstParagraph
  return firstSentence.trim() ? [firstSentence.trim()] : []
}

function extractTags(topic, module) {
  const source = conciseAlias(topic) ?? topic
  const tokens = source.match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? []
  const stopwords = new Set(['что', 'это', 'как', 'вы', 'можете', 'рассказать', 'про', 'для', 'при', 'между', 'через', 'в', 'такое', 'такие', 'каких', 'какой', 'какие', 'каким', 'состоит', 'нужно', 'нужны', 'можно', 'есть', 'где', 'проходит', 'его', 'её', 'их', 'граница'])
  return [...new Set([
    ...module.tags,
    ...tokens.map((token) => token.toLocaleLowerCase('ru-RU')).filter((token) => !stopwords.has(token)),
  ])].slice(0, 16)
}

function answerType(question) {
  if (/^Что такое|^Что означает/iu.test(question)) return 'definition'
  if (/^Чем /iu.test(question)) return 'comparison'
  if (/^Почему |^Зачем /iu.test(question)) return 'rationale'
  if (/^Когда /iu.test(question)) return 'decision'
  if (/^Как /iu.test(question)) return 'design'
  if (/^Что вы можете рассказать/iu.test(question)) return 'experience'
  return 'interview_answer'
}

function provenanceFor(document, answer) {
  if (typeof document.module.provenance === 'string') return document.module.provenance
  if (document.module.documentType === 'canonical_project_facts') {
    return /owner_reported_production/u.test(answer) ? 'owner_reported_production' : 'source_documents'
  }
  return 'interview_corpus'
}

function authorityFor(document) {
  if (typeof document.module.authority === 'string') return document.module.authority
  return 'general_knowledge'
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function loadPreviousManifest() {
  const bySection = new Map()
  const byQuestion = new Map()
  const byOriginalQuestion = new Map()
  const manifestPath = join(dataDir, 'manifest.jsonl')
  if (!existsSync(manifestPath)) return { bySection, byQuestion, byOriginalQuestion }
  for (const [lineIndex, line] of readFileSync(manifestPath, 'utf8').split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    let record
    try {
      record = JSON.parse(line)
    } catch (error) {
      throw new Error(`Invalid existing manifest at ${manifestPath}:${lineIndex + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (record && typeof record.source_file === 'string' && Number.isInteger(record.section_index)) {
      bySection.set(`${record.source_file}::${record.section_index}`, record)
    }
    if (record && typeof record.source_file === 'string' && typeof record.question === 'string') {
      byQuestion.set(`${record.source_file}::${normalizeQuestion(record.question)}`, record)
    }
    if (record && typeof record.source_file === 'string' && typeof record.original_question === 'string') {
      byOriginalQuestion.set(`${record.source_file}::${normalizeQuestion(record.original_question)}`, record)
    }
  }
  return { bySection, byQuestion, byOriginalQuestion }
}

if (!existsSync(dataDir)) throw new Error(`RAG data directory does not exist: ${dataDir}`)

const fileNames = readdirSync(dataDir)
  .filter((name) => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'agents.md')
  .sort()
const previousManifest = loadPreviousManifest()
const rebuildGeneratedMetadata = process.env.RAG_REBUILD_METADATA === '1'
const documents = fileNames.map((fileName) => {
  const raw = readFileSync(join(dataDir, fileName), 'utf8')
  const body = stripFrontMatter(raw)
  const variantCatalog = isQuestionVariantCorpus(fileName) ? loadQuestionVariantCatalog(dataDir, fileName) : null
  const sections = variantCatalog
    ? parseQuestionVariantMarkdown(body, variantCatalog)
    : parseSections(body)
  return {
    fileName,
    body,
    module: moduleFromFrontMatter(raw),
    moduleSlug: moduleSlug(fileName),
    sections,
    variantCatalog,
  }
})

const duplicateGroups = new Map()
for (const document of documents) {
  for (const section of document.sections) {
    const key = normalizeQuestion(section.question)
    const group = duplicateGroups.get(key) ?? []
    group.push({ document, section })
    duplicateGroups.set(key, group)
  }
}

const duplicateGroupCount = [...duplicateGroups.values()].filter((group) => group.length > 1).length
let renamedSections = 0
const records = []

for (const document of documents) {
  const rewrittenQuestions = document.sections.map((section) => {
    const group = duplicateGroups.get(normalizeQuestion(section.question)) ?? []
    if (group.length <= 1) return section.question
    renamedSections += 1
    return document.module.rewrite(questionTopic(section.question))
  })

  let sectionIndex = 0
  const rewrittenBody = document.variantCatalog
    ? document.body
    : document.body.replace(/^##[ \t]+(.+?)[ \t]*$/gmu, (heading, originalQuestion) => {
      const next = document.sections[sectionIndex]
      const rewritten = next ? rewrittenQuestions[sectionIndex] : originalQuestion.trim()
      sectionIndex += 1
      return `## ${rewritten}`
    })
  const outputBody = manifestOnly ? document.body : rewrittenBody
  const normalizedMarkdown = `${renderFrontMatter(document.module)}${outputBody.trimStart().trimEnd()}\n`
  if (!manifestOnly) {
    writeFileSync(join(dataDir, document.fileName), normalizedMarkdown, 'utf8')
  }

  const sourceSha = sha256(manifestOnly
    ? readFileSync(join(dataDir, document.fileName), 'utf8')
    : normalizedMarkdown)
  const updatedSections = document.variantCatalog
    ? parseQuestionVariantMarkdown(outputBody, document.variantCatalog)
    : parseSections(outputBody)
  for (let index = 0; index < updatedSections.length; index += 1) {
    const before = document.sections[index]
    const after = updatedSections[index]
    const previous = previousManifest.byQuestion.get(`${document.fileName}::${normalizeQuestion(before.question)}`)
      ?? previousManifest.byOriginalQuestion.get(`${document.fileName}::${normalizeQuestion(before.question)}`)
      ?? previousManifest.bySection.get(`${document.fileName}::${index}`)
    const originalQuestion = typeof previous?.original_question === 'string' ? previous.original_question : before.question
    const originalTopic = questionTopic(originalQuestion)
    const duplicate = (duplicateGroups.get(normalizeQuestion(before.question)) ?? []).length > 1
    const aliases = document.variantCatalog
      ? [...new Set(after.variants)]
      : Array.isArray(previous?.aliases)
      ? previous.aliases
      : [...new Set([
        before.question,
        conciseAlias(before.question),
        duplicate ? originalTopic : null,
      ].filter(Boolean))]
    const moduleId = document.moduleSlug
    records.push({
      id: typeof previous?.id === 'string' ? previous.id : stableId(moduleId, originalQuestion),
      module: moduleId,
      module_label: document.module.label,
      document_type: document.module.documentType ?? 'interview_rag_knowledge',
      fact_status: document.module.factStatus ?? null,
      concept_group: typeof previous?.concept_group === 'string' ? previous.concept_group : `${moduleId}.${slug(originalTopic)}`,
      question: after.question,
      original_question: originalQuestion,
      aliases,
      ...(document.variantCatalog
        ? { paraphrases: [...new Set(after.variants)] }
        : Array.isArray(previous?.paraphrases)
        ? { paraphrases: previous.paraphrases.filter((value) => typeof value === 'string' && value.trim()) }
        : {}),
      tags: !rebuildGeneratedMetadata && Array.isArray(previous?.tags) ? previous.tags : extractTags(originalQuestion, document.module),
      expected_facts: !rebuildGeneratedMetadata && Array.isArray(previous?.expected_facts) ? previous.expected_facts : extractExpectedFacts(after.answer),
      expected_facts_source: typeof previous?.expected_facts_source === 'string' && !rebuildGeneratedMetadata
        ? previous.expected_facts_source
        : /\*\*(?:Что проверяю|Канонические claims):\*\*/u.test(after.answer) ? 'answer_checklist' : 'first_sentence_candidate',
      provenance: provenanceFor(document, after.answer),
      type: typeof previous?.type === 'string' ? previous.type : answerType(originalQuestion),
      authority: authorityFor(document),
      status: document.module.status ?? (typeof previous?.status === 'string' ? previous.status : 'active'),
      metadata_status: document.module.metadataStatus ?? (typeof previous?.metadata_status === 'string' ? previous.metadata_status : 'generated_candidate'),
      source_file: document.fileName,
      source_sha256: sourceSha,
      section_index: index,
      prepared_at: preparedAt,
    })
  }
}

records.sort((left, right) => left.source_file.localeCompare(right.source_file) || left.section_index - right.section_index)
writeFileSync(join(dataDir, 'manifest.jsonl'), `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8')

console.log(`Normalized ${documents.length} Markdown files`)
console.log(`Sections: ${records.length}`)
console.log(`Exact duplicate groups disambiguated: ${duplicateGroupCount}`)
console.log(`Headings rewritten: ${renamedSections}`)
console.log(`Manifest: ${join(dataDir, 'manifest.jsonl')}`)
