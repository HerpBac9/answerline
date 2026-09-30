import { loadConfig } from '../core/config'
import { createLogger } from '../core/log'
import { estimateTokens } from '../shared/tokenEstimate'
import { formatEmbeddingInput } from './embeddingInput'

const log = createLogger('RAG')
const ENVELOPE_TAGS = /<\/?(?:transcript|question|retrieved_context|evidence|personal_experience|knowledge_context|role|security)\b[^>]*>/giu
const MODEL_MARKERS = /<\|[^|]*\|>/gu
const CANDIDATE_MULTIPLIER = 4
const LEXICAL_WEIGHT = 0.15
const RETRIEVAL_STOPWORDS = new Set([
  'а', 'без', 'бы', 'в', 'во', 'вот', 'вы', 'где', 'для', 'до', 'же', 'за', 'и', 'из', 'или',
  'как', 'какая', 'какие', 'каким', 'какой', 'когда', 'кто', 'на', 'над', 'не', 'но', 'о', 'об',
  'от', 'по', 'под', 'при', 'про', 'с', 'со', 'так', 'то', 'у', 'что', 'чем', 'это', 'я',
  'the', 'and', 'are', 'for', 'how', 'what', 'why', 'with', 'from', 'when', 'which',
])

/**
 * Personal-pool routing is driven by the `authority` a corpus file declares in
 * its own front matter, never by its file name — so a new data/*.md joins the
 * personal pool by setting `authority: internal_project` and needs no code
 * change. Anything without such a key lands in the general pool.
 */
const PERSONAL_AUTHORITIES = ['internal_project', 'personal_experience'] as const

export interface RagHit {
  score: number
  /** Raw Qdrant cosine score before lexical reranking. */
  semanticScore?: number
  /** Content-word overlap with the user's question. */
  lexicalScore?: number
  module: string | null
  question: string
  answer: string
  aliases?: string[]
  /** The canonical question is shared by all vectors; this is the text that matched the query vector. */
  matchedQuestion?: string
  variantIndex?: number
  /** Stable manifest/Qdrant key, useful when tracing a generated answer back to source. */
  recordKey?: string
  sourceFile: string | null
  sectionIndex: number | null
}

export interface RagContext {
  text: string
  tokens: number
  hits: RagHit[]
  personalHit?: RagHit | null
  generalHits?: RagHit[]
  latencyMs: number
}

export interface RagRetriever {
  retrieve(query: string): Promise<RagContext>
}

export interface RagSettings {
  qdrantUrl: string
  collection: string
  embeddingBaseUrl: string
  embeddingModel: string
  /** Legacy global top-K; used when generalTopK is absent in an older caller. */
  topK: number
  generalTopK?: number
  personalTopK?: number
  /** Minimum raw semantic score for the optional personal slot. */
  personalMinScore?: number
  maxContextTokens: number
  /** Minimum raw semantic score for general evidence. */
  minScore: number
}

/** Local-only retrieval client: LM Studio embeddings plus Qdrant REST. */
export class LocalRag implements RagRetriever {
  private readonly settings: RagSettings

  constructor(settings: RagSettings = settingsFromConfig()) {
    this.settings = {
      ...settings,
      qdrantUrl: settings.qdrantUrl.replace(/\/$/, ''),
      embeddingBaseUrl: settings.embeddingBaseUrl.replace(/\/$/, ''),
    }
  }

  async retrieve(query: string): Promise<RagContext> {
    const cleanQuery = stripUntrusted(query).trim()
    if (!cleanQuery) return { text: '', tokens: 0, hits: [], latencyMs: 0 }

    const startedAt = performance.now()
    try {
      const vector = await this.embed(cleanQuery)
      const generalTopK = this.settings.generalTopK ?? this.settings.topK
      const personalTopK = this.settings.personalTopK ?? 1
      // Keep one personal answer in the prompt, but rank it from a wider
      // personal-only candidate pool. A single semantic hit is often a nearby
      // project question; lexical reranking needs more candidates to rescue
      // exact terms such as MCP, labels, commit or InventTable.
      const personalCandidateTopK = Math.max(personalTopK, 5)
      const [personalCandidates, generalCandidates] = await Promise.all([
        personalTopK === 0 ? Promise.resolve([]) : this.search(vector, personalCandidateTopK, personalFilter()),
        this.search(vector, generalTopK, generalFilter()),
      ])
      const personalCandidate = rerankRagHits(cleanQuery, personalCandidates, personalTopK)
        .at(0) ?? null
      const personalHit = personalCandidate && (personalCandidate.semanticScore ?? personalCandidate.score) >= (this.settings.personalMinScore ?? 0)
        ? personalCandidate
        : null
      const generalHits = rerankRagHits(cleanQuery, generalCandidates, generalTopK)
      const acceptedGeneral = generalHits.filter((hit) => (hit.semanticScore ?? hit.score) >= this.settings.minScore)
      const context = buildContext(personalHit ? [personalHit] : [], acceptedGeneral, this.settings.maxContextTokens)
      const accepted = personalHit ? [personalHit, ...acceptedGeneral] : acceptedGeneral
      const latencyMs = Math.round(performance.now() - startedAt)
      log.info(`Retrieved personal=${personalHit ? '1' : '0'}, general=${acceptedGeneral.length}/${generalHits.length} chunk(s) in ${latencyMs}ms`)
      return { text: context, tokens: estimateTokens(context), hits: accepted, personalHit, generalHits: acceptedGeneral, latencyMs }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`Retrieval failed after ${Math.round(performance.now() - startedAt)}ms:`, message)
      throw new Error(`RAG недоступен: ${message}`)
    }
  }

  private async embed(query: string): Promise<number[]> {
    const response = await fetch(`${this.settings.embeddingBaseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.settings.embeddingModel,
        input: [formatEmbeddingInput(this.settings.embeddingModel, query, 'query')],
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = await readJson(response) as { data?: Array<{ embedding?: unknown }> } | string | null
    if (!response.ok) throw new Error(`embedding HTTP ${response.status}: ${JSON.stringify(body)}`)
    const vector = typeof body === 'object' && body !== null && 'data' in body ? body.data?.[0]?.embedding : undefined
    if (!Array.isArray(vector) || vector.length === 0 || vector.some((value: unknown) => typeof value !== 'number')) {
      throw new Error('embedding endpoint returned an invalid vector')
    }
    return vector
  }

  private async search(vector: number[], limit: number, filter: Record<string, unknown>): Promise<RagHit[]> {
    const response = await fetch(`${this.settings.qdrantUrl}/collections/${encodeURIComponent(this.settings.collection)}/points/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vector,
        // Retrieve a wider candidate set before the cheap lexical rerank. This
        // lets exact technical terms rescue a semantically under-ranked hit.
        limit: Math.max(limit * CANDIDATE_MULTIPLIER, limit),
        filter,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    const body = await readJson(response) as { result?: unknown[] } | string | null
    if (!response.ok) throw new Error(`Qdrant HTTP ${response.status}: ${JSON.stringify(body)}`)

    const result = typeof body === 'object' && body !== null && 'result' in body ? body.result : []
    return (Array.isArray(result) ? result : []).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return []
      const hit = item as { score?: unknown; payload?: Record<string, unknown> }
      const payload = hit.payload ?? {}
      if (typeof hit.score !== 'number' || typeof payload.question !== 'string' || typeof payload.answer !== 'string') return []
      return [{
        score: hit.score,
        semanticScore: hit.score,
        module: typeof payload.module === 'string' ? payload.module : null,
        question: stripUntrusted(payload.question),
        answer: stripUntrusted(payload.answer),
        aliases: Array.isArray(payload.aliases)
          ? payload.aliases
            .filter((value): value is string => typeof value === 'string')
            .map(stripUntrusted)
          : [],
        matchedQuestion: typeof payload.matched_question === 'string'
          ? stripUntrusted(payload.matched_question)
          : undefined,
        variantIndex: typeof payload.variant_index === 'number' ? payload.variant_index : undefined,
        recordKey: typeof payload.record_key === 'string' ? payload.record_key : undefined,
        sourceFile: typeof payload.source_file === 'string' ? payload.source_file : null,
        sectionIndex: typeof payload.section_index === 'number' ? payload.section_index : null,
      }]
    })
  }
}

/**
 * Reorders semantic candidates with a small lexical signal. Embeddings handle
 * paraphrases; lexical overlap protects identifiers, acronyms and exact terms.
 */
export function rerankRagHits(query: string, hits: RagHit[], limit: number): RagHit[] {
  const queryTokens = retrievalTokens(query)
  if (queryTokens.size === 0) return deduplicateQuestions(hits).slice(0, limit)

  return deduplicateQuestions(hits
    .map((hit) => {
      const lexicalScore = lexicalOverlap(
        queryTokens,
        retrievalTokens([hit.question, ...(hit.aliases ?? [])].join(' ')),
      )
      const semanticScore = hit.semanticScore ?? hit.score
      return {
        ...hit,
        score: semanticScore + lexicalScore * LEXICAL_WEIGHT,
        semanticScore,
        lexicalScore,
      }
    })
    .sort((left, right) => right.score - left.score)
  ).slice(0, limit)
}

/** Avoid spending prompt budget on repeated catalog questions from modules. */
function deduplicateQuestions(hits: RagHit[]): RagHit[] {
  const seen = new Set<string>()
  return hits.filter((hit) => {
    const key = hit.recordKey
      ?? hit.question.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru-RU')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function retrievalTokens(text: string): Set<string> {
  return new Set(
    (text.toLocaleLowerCase('ru-RU').match(/[a-zа-яё][a-zа-яё0-9+#.-]{2,}/giu) ?? [])
      .filter((token) => !RETRIEVAL_STOPWORDS.has(token)),
  )
}

function lexicalOverlap(queryTokens: Set<string>, candidateTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0
  let matches = 0
  for (const token of queryTokens) if (candidateTokens.has(token)) matches += 1
  return matches / queryTokens.size
}

function settingsFromConfig(): RagSettings {
  const config = loadConfig()
  const generalTopK = positiveInteger(process.env.RAG_GENERAL_TOP_K, config.ragGeneralTopK ?? config.ragTopK)
  return {
    qdrantUrl: process.env.QDRANT_URL ?? config.ragQdrantUrl,
    collection: process.env.QDRANT_COLLECTION ?? config.ragCollection,
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? config.ragEmbeddingBaseUrl,
    embeddingModel: process.env.EMBEDDING_MODEL ?? config.ragEmbeddingModel,
    topK: generalTopK,
    generalTopK,
    personalTopK: nonNegativeInteger(process.env.RAG_PERSONAL_TOP_K, config.ragPersonalTopK ?? 1),
    personalMinScore: numberOr(process.env.RAG_PERSONAL_MIN_SCORE, config.ragPersonalMinScore ?? 0.60),
    maxContextTokens: positiveInteger(process.env.RAG_MAX_CONTEXT_TOKENS, config.ragMaxContextTokens),
    minScore: numberOr(process.env.RAG_MIN_SCORE, config.ragMinScore),
  }
}

function personalFilter(): Record<string, unknown> {
  return {
    should: PERSONAL_AUTHORITIES.map((authority) => ({ key: 'authority', match: { value: authority } })),
  }
}

function generalFilter(): Record<string, unknown> {
  return {
    must_not: PERSONAL_AUTHORITIES.map((authority) => ({ key: 'authority', match: { value: authority } })),
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : fallback
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  try { return text ? JSON.parse(text) : null } catch { return text }
}

function buildContext(personalHits: RagHit[], generalHits: RagHit[], maxTokens: number): string {
  return buildContextSections(personalHits, generalHits, maxTokens)
}

function buildContextSections(personalHits: RagHit[], knowledgeHits: RagHit[], maxTokens: number): string {
  if (personalHits.length === 0 && knowledgeHits.length === 0) return ''
  const sections: string[] = []
  appendContextSection(sections, 'personal_experience', personalHits, maxTokens)
  appendContextSection(sections, 'knowledge_context', knowledgeHits, maxTokens)
  return sections.length > 0 ? `<retrieved_context>\n${sections.join('\n\n')}\n</retrieved_context>` : ''
}

function appendContextSection(sections: string[], sectionName: string, hits: RagHit[], maxTokens: number): void {
  if (hits.length === 0) return
  const blocks: string[] = []
  for (const hit of hits) {
    const source = hit.sourceFile ? `${hit.sourceFile}${hit.sectionIndex === null ? '' : `#${hit.sectionIndex}`}` : 'qdrant'
    const block = `<evidence source="${escapeAttribute(source)}" module="${escapeAttribute(hit.module ?? 'unknown')}" score="${hit.score.toFixed(3)}">\nQuestion: ${hit.question}\nAnswer: ${hit.answer}\n</evidence>`
    const candidate = [...sections, `<${sectionName}>\n${[...blocks, block].join('\n\n')}\n</${sectionName}>`].join('\n\n')
    const wrappedCandidate = `<retrieved_context>\n${candidate}\n</retrieved_context>`
    if (estimateTokens(wrappedCandidate) > maxTokens) break
    blocks.push(block)
  }
  if (blocks.length > 0) sections.push(`<${sectionName}>\n${blocks.join('\n\n')}\n</${sectionName}>`)
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/[<>]/g, '')
}

export function stripUntrusted(text: string): string {
  return text.replace(ENVELOPE_TAGS, '').replace(MODEL_MARKERS, '')
}
