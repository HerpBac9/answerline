/**
 * Corpus front matter is the single source of truth for module metadata: a
 * data/<topic>.md declares its own `module`, `authority` and tags, and every
 * script reads them from there. Nothing keys off file names, so adding a topic
 * never requires a code change.
 *
 * The format stays flat by design — `key: value` and `key:` blocks of `- item`.
 * A full YAML parser would be a dependency this project does not otherwise need.
 */
const DEFAULT_MODULE = {
  label: 'Interview knowledge',
  tags: ['interview'],
  rewrite: (topic) => `Как вы применяете ${topic} в AI-системе?`,
}

// renderFrontMatter writes these itself, so they are never passed through.
const GENERATED_KEYS = new Set([
  'document_type',
  'target_role',
  'module',
  'language',
  'chunking_rule',
  'term_rule',
  'prepared_at',
  'topics',
])

function unquote(value) {
  return value.replace(/\\"/gu, '"').replace(/^["']|["']$/gu, '')
}

function needsQuotes(value) {
  return value === '' || /^[\s>|&*!?%@`{}[\]#-]|:\s|\s#|^(?:true|false|null|\d+(?:\.\d+)?)$/iu.test(value)
}

/**
 * Read the leading `---` block. Returns null when the document has none, so
 * callers can fall back to defaults instead of failing.
 */
export function parseFrontMatter(raw) {
  const clean = raw.replace(/^\uFEFF/u, '')
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u)
  if (!match) return null

  const scalars = new Map()
  const lists = new Map()
  let currentList = null

  for (const line of match[1].split(/\r?\n/u)) {
    const item = line.match(/^[ \t]*-[ \t]+(.*?)[ \t]*$/u)
    if (item && currentList) {
      currentList.push(unquote(item[1]))
      continue
    }
    const pair = line.match(/^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*?)[ \t]*$/u)
    if (!pair) continue
    const [, key, value] = pair
    if (value === '') {
      currentList = []
      lists.set(key, currentList)
      continue
    }
    currentList = null
    scalars.set(key, unquote(value))
  }

  return { scalars, lists }
}

export function stripFrontMatter(markdown) {
  const clean = markdown.replace(/^\uFEFF/u, '')
  const match = clean.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/u)
  return match ? match[1] : clean
}

export function renderValue(value) {
  return needsQuotes(value) ? `"${value.replace(/"/gu, '\\"')}"` : value
}

/**
 * Fold a corpus file's front matter into the module descriptor the manifest
 * writer consumes. Keys the generator does not emit itself (authority,
 * provenance, source_documents, snapshot_date, …) are carried through verbatim
 * so a curated file keeps its provenance across re-runs.
 */
export function moduleFromFrontMatter(raw) {
  const parsed = parseFrontMatter(raw)
  const scalars = parsed?.scalars ?? new Map()
  const lists = parsed?.lists ?? new Map()
  const topics = lists.get('topics') ?? []

  const extra = []
  for (const [key, value] of scalars) {
    if (GENERATED_KEYS.has(key)) continue
    extra.push(`${key}: ${renderValue(value)}`)
  }
  for (const [key, items] of lists) {
    if (GENERATED_KEYS.has(key)) continue
    extra.push(`${key}:`)
    for (const item of items) extra.push(`  - ${renderValue(item)}`)
  }

  return {
    ...DEFAULT_MODULE,
    label: scalars.get('module') ?? DEFAULT_MODULE.label,
    documentType: scalars.get('document_type') ?? 'interview_rag_knowledge',
    targetRole: scalars.get('target_role'),
    authority: scalars.get('authority') ?? 'general_knowledge',
    provenance: scalars.get('provenance') ?? 'generated_synthesis',
    metadataStatus: scalars.get('metadata_status') ?? 'generated_candidate',
    tags: topics.length > 0 ? topics : DEFAULT_MODULE.tags,
    extra,
  }
}

export { DEFAULT_MODULE }