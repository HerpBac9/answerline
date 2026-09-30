import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { formatEmbeddingInput } from './embedding-input.mjs'
import { cleanSectionAnswer } from './section-answer.mjs'
import {
  isQuestionVariantCorpus,
  loadQuestionVariantCatalog,
  parseQuestionVariantMarkdown,
} from './question-variant-corpus.mjs'

/**
 * Index interview question/answer Markdown files into a local Qdrant instance.
 *
 * The script deliberately uses the OpenAI-compatible embeddings endpoint and
 * Qdrant REST API instead of adding SDK dependencies. It works with LM Studio
 * on loopback and keeps the source files as the source of truth.
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

const dataDir = resolve(process.env.RAG_DATA_DIR ?? join(root, 'data'))
const manifestPath = join(dataDir, 'manifest.jsonl')
const qdrantUrl = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '')
const collection = process.env.QDRANT_COLLECTION ?? 'answerline_qa'
const embeddingBaseUrl = (process.env.EMBEDDING_BASE_URL ?? 'http://127.0.0.1:1234').replace(/\/$/, '')
const embeddingModel = process.env.EMBEDDING_MODEL ?? 'text-embedding-embeddinggemma-300m'
const batchSize = positiveInteger(process.env.EMBEDDING_BATCH_SIZE, 16)
const recreate = process.env.RAG_RECREATE === '1' || process.argv.includes('--recreate')
const dryRun = process.env.RAG_DRY_RUN === '1' || process.argv.includes('--dry-run')

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseFrontMatter(markdown) {
  const clean = markdown.replace(/^\uFEFF/u, '')
  if (!clean.startsWith('---')) return { body: clean, metadata: {} }
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { body: clean, metadata: {} }

  const metadata = {}
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/)
    if (!item) continue
    const value = item[2].replace(/^(['"])([\s\S]*)\1$/, '$2')
    metadata[item[1]] = value
  }
  return { body: match[2], metadata }
}

function moduleSlugFor(fileName, metadata) {
  const stem = basename(fileName, extname(fileName)).replace(/^interview-/, '').replace(/-qa$/, '')
  // The filename is the stable taxonomy key. Front matter's human-readable
  // `module` is retained in payload but must not silently change point IDs.
  return stem.toLowerCase()
}

function parseSections(markdown) {
  const sections = []
  const heading = /^##[ \t]+(.+?)[ \t]*$/gm
  const matches = [...markdown.matchAll(heading)]
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]
    const start = (current.index ?? 0) + current[0].length
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? markdown.length) : markdown.length
    const question = current[1].trim()
    const answer = cleanSectionAnswer(markdown.slice(start, end))
    if (!question || !answer) continue
    sections.push({ question, answer, sectionIndex: sections.length })
  }
  return sections
}

function parseSourceSections(sourceFile, body, dataDir) {
  if (!isQuestionVariantCorpus(sourceFile)) return parseSections(body)
  const catalog = loadQuestionVariantCatalog(dataDir, sourceFile)
  return parseQuestionVariantMarkdown(body, catalog)
}

function loadManifest() {
  const bySection = new Map()
  const byQuestion = new Map()
  if (!existsSync(manifestPath)) return { bySection, byQuestion }

  const lines = readFileSync(manifestPath, 'utf8').split(/\r?\n/)
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber].trim()
    if (!line) continue
    let record
    try {
      record = JSON.parse(line)
    } catch (error) {
      throw new Error(`Invalid RAG manifest JSON at ${manifestPath}:${lineNumber + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || typeof record.source_file !== 'string') {
      throw new Error(`Invalid RAG manifest record at ${manifestPath}:${lineNumber + 1}`)
    }
    const sectionIndex = Number(record.section_index)
    if (Number.isInteger(sectionIndex) && sectionIndex >= 0) {
      bySection.set(`${record.source_file}::${sectionIndex}`, record)
    }
    if (typeof record.question === 'string') {
      byQuestion.set(`${record.source_file}::${normalizeQuestion(record.question)}`, record)
    }
  }
  return { bySection, byQuestion }
}

function normalizeQuestion(value) {
  return value
    .normalize('NFKC')
    .replace(/^\d{1,3}[.)]\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ru-RU')
}

function pointId(moduleSlug, question) {
  const digest = createHash('sha256').update(`${moduleSlug}\n${normalizeQuestion(question)}`, 'utf8').digest('hex').slice(0, 32)
  // Qdrant point IDs accept UUIDs. The payload carries the human-readable key.
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20)}`
}

function sourceFiles() {
  if (!existsSync(dataDir)) throw new Error(`RAG data directory does not exist: ${dataDir}`)
  return readdirSync(dataDir)
    // Agent instructions and other control files can live beside the corpus,
    // but must never become searchable interview evidence.
    .filter((name) => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'agents.md')
    .sort()
    .map((name) => join(dataDir, name))
}

function readRecords() {
  const records = []
  const manifest = loadManifest()
  for (const filePath of sourceFiles()) {
    const raw = readFileSync(filePath, 'utf8')
    const { body, metadata } = parseFrontMatter(raw)
    const moduleSlug = moduleSlugFor(filePath, metadata)
    const sourceHash = createHash('sha256').update(raw, 'utf8').digest('hex')
    const sourceFile = basename(filePath)
    for (const section of parseSourceSections(sourceFile, body, dataDir)) {
      const questionManifestEntry = manifest.byQuestion.get(`${sourceFile}::${normalizeQuestion(section.question)}`)
      const sectionManifestEntry = manifest.bySection.get(`${sourceFile}::${section.sectionIndex}`)
      // Prefer the normalized question. A source file may be reordered or have
      // new interview questions inserted; using section_index first would attach
      // aliases and expected facts from an old question to the new one.
      const manifestEntry = questionManifestEntry
        ?? (sectionManifestEntry && normalizeQuestion(sectionManifestEntry.question ?? '') === normalizeQuestion(section.question)
          ? sectionManifestEntry
          : undefined)
      const sourceVariants = Array.isArray(section.variants)
        ? section.variants.filter((value) => typeof value === 'string' && value.trim())
        : []
      const manifestAliases = Array.isArray(manifestEntry?.aliases)
        ? manifestEntry.aliases.filter((value) => typeof value === 'string' && value.trim())
        : []
      const aliases = [...new Set([...sourceVariants, ...manifestAliases])]
        .filter((value) => normalizeQuestion(value) !== normalizeQuestion(section.question))
      const tags = Array.isArray(manifestEntry?.tags)
        ? manifestEntry.tags.filter((value) => typeof value === 'string')
        : []
      const recordKey = typeof manifestEntry?.id === 'string' ? manifestEntry.id : `${moduleSlug}::${section.question}`
      const retrievalQuestions = [section.question, ...sourceVariants]
      for (const [variantIndex, retrievalQuestion] of retrievalQuestions.entries()) {
        // Each canonical question and each variant gets its own vector. The
        // payload deliberately keeps the canonical question and one answer so
        // multiple vectors resolve to one deduplicated evidence record.
        const embeddingText = [
          `module: ${moduleSlug}`,
          `question: ${retrievalQuestion}`,
          tags.length > 0 ? `tags: ${tags.join(', ')}` : null,
        ].filter(Boolean).join('\n')
        const pointKey = retrievalQuestions.length === 1
          ? (typeof manifestEntry?.id === 'string' ? manifestEntry.id : section.question)
          : `${recordKey}\n${variantIndex}\n${retrievalQuestion}`
        records.push({
          id: pointId(moduleSlug, pointKey),
          embeddingText,
          payload: {
            record_key: recordKey,
            record_key_normalized: `${moduleSlug}::${normalizeQuestion(section.question)}`,
            record_id: typeof manifestEntry?.id === 'string' ? manifestEntry.id : null,
            module: moduleSlug,
            module_label: manifestEntry?.module_label ?? metadata.module ?? moduleSlug,
            document_type: manifestEntry?.document_type ?? metadata.document_type ?? 'interview_rag_knowledge',
            fact_status: manifestEntry?.fact_status ?? metadata.fact_status ?? null,
            question: section.question,
            matched_question: retrievalQuestion,
            variant_index: variantIndex,
            variant_count: retrievalQuestions.length,
            answer: section.answer,
            original_question: typeof manifestEntry?.original_question === 'string' ? manifestEntry.original_question : section.question,
            aliases,
            paraphrases: Array.isArray(manifestEntry?.paraphrases)
              ? manifestEntry.paraphrases.filter((value) => typeof value === 'string' && value.trim())
              : sourceVariants,
            tags,
            expected_facts: Array.isArray(manifestEntry?.expected_facts) ? manifestEntry.expected_facts : [],
            provenance: typeof manifestEntry?.provenance === 'string' ? manifestEntry.provenance : 'source_file',
            concept_group: typeof manifestEntry?.concept_group === 'string' ? manifestEntry.concept_group : null,
            answer_type: typeof manifestEntry?.type === 'string' ? manifestEntry.type : null,
            authority: typeof manifestEntry?.authority === 'string'
              ? manifestEntry.authority
              : typeof metadata.authority === 'string' && metadata.authority ? metadata.authority : null,
            status: typeof manifestEntry?.status === 'string' ? manifestEntry.status : 'active',
            source_file: sourceFile,
            source_sha256: sourceHash,
            section_index: section.sectionIndex,
            language: metadata.language ?? 'ru',
            target_role: metadata.target_role ?? null,
            indexed_at: new Date().toISOString(),
            embedding_model: embeddingModel,
          },
        })
      }
    }
  }
  if (records.length === 0) throw new Error(`No H2 question/answer sections found in ${dataDir}`)
  return records
}

async function request(path, options = {}) {
  const response = await fetch(`${qdrantUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  })
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) throw new Error(`Qdrant ${options.method ?? 'GET'} ${path} failed HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

async function embed(inputs) {
  const response = await fetch(`${embeddingBaseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: embeddingModel,
      input: inputs.map((input) => formatEmbeddingInput(embeddingModel, input, 'document')),
    }),
  })
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) throw new Error(`Embedding endpoint failed HTTP ${response.status}: ${JSON.stringify(body)}`)
  const data = Array.isArray(body?.data) ? body.data : []
  const vectors = data
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((item) => item.embedding)
  if (vectors.length !== inputs.length || vectors.some((vector) => !Array.isArray(vector))) {
    throw new Error(`Embedding endpoint returned ${vectors.length} vectors for ${inputs.length} inputs`)
  }
  return vectors
}

async function collectionInfo() {
  try { return await request(`/collections/${encodeURIComponent(collection)}`) } catch (error) {
    if (String(error).includes('HTTP 404')) return null
    throw error
  }
}

async function ensureCollection(size) {
  const existing = await collectionInfo()
  if (existing && recreate) {
    await request(`/collections/${encodeURIComponent(collection)}`, { method: 'DELETE' })
  }
  if (!existing || recreate) {
    await request(`/collections/${encodeURIComponent(collection)}`, {
      method: 'PUT',
      body: JSON.stringify({ vectors: { size, distance: 'Cosine' } }),
    })
    return
  }
  const configuredSize = existing.result?.config?.params?.vectors?.size
  if (configuredSize !== size) {
    throw new Error(`Collection ${collection} has vector size ${configuredSize}, but ${embeddingModel} returned ${size}. Use RAG_RECREATE=1 to rebuild it.`)
  }
}

async function upsert(records, vectors) {
  const points = records.map((record, index) => ({ id: record.id, vector: vectors[index], payload: record.payload }))
  await request(`/collections/${encodeURIComponent(collection)}/points?wait=true`, {
    method: 'PUT',
    body: JSON.stringify({ points }),
  })
}

async function main() {
  const records = readRecords()
  const byModule = Object.groupBy(records, (record) => record.payload.module)
  const answerRecords = new Set(records.map((record) => record.payload.record_key)).size
  console.log(`Parsed ${answerRecords} answer records as ${records.length} vectors from ${Object.keys(byModule).length} modules in ${dataDir}`)
  for (const [module, items] of Object.entries(byModule)) console.log(`  ${module}: ${items.length}`)
  console.log(`Embedding model: ${embeddingModel}`)
  console.log(`Qdrant collection: ${collection} (${qdrantUrl})`)

  if (dryRun) return

  let dimension = null
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize)
    const vectors = await embed(batch.map((record) => record.embeddingText))
    const batchDimension = vectors[0].length
    if (!vectors.every((vector) => vector.length === batchDimension)) throw new Error('Embedding vectors in a batch have different dimensions')
    if (dimension === null) {
      dimension = batchDimension
      await ensureCollection(dimension)
      if (recreate) console.log(`Recreated collection ${collection}`)
    } else if (dimension !== batchDimension) throw new Error('Embedding dimension changed during indexing')
    await upsert(batch, vectors)
    console.log(`Indexed ${Math.min(offset + batch.length, records.length)}/${records.length}`)
  }
  console.log(`Done. Stable IDs are hashes of module + normalized question; full key is in payload.record_key.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
