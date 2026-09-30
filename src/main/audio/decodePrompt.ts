import { getTerminologyResolver } from './terminology'
import { createLogger } from '../core/log'

const log = createLogger('DecodePrompt')

/**
 * Hard cap on the initial prompt.
 *
 * Whisper's limit is n_text_ctx/2 = 224 tokens, but measurement on this build
 * showed the edge is not safe: at exactly 224 tokens the first word of the
 * transcript was dropped, and past ~300 the output degenerated entirely. So the
 * budget is set below the documented limit, and the estimate deliberately
 * over-counts.
 */
const MAX_PROMPT_TOKENS = 180

/** Measured on this build: ~3 tokens per Latin term, ~1 per Cyrillic character. */
function estimatePromptTokens(text: string): number {
  let latin = 0
  let cyrillic = 0
  for (const char of text) {
    if (/[Ѐ-ӿ]/.test(char)) cyrillic++
    else latin++
  }
  return Math.ceil(0.45 * latin + 1.15 * cyrillic) + 4
}

/**
 * Terms that are ordinary English words or belong to other technologies. Biasing
 * towards them drags the decoder into English on Russian speech, which was
 * measured on silence: a Latin-heavy prompt turned "Продолжение следует" into
 * "Thank you". They stay in the glossary for post-hoc resolution, just not here.
 */
const NOT_FOR_PROMPT = new Set([
  'AI', 'token', 'prompt', 'agent', 'attention', 'inference', 'latency',
  'transformer', 'context window', 'vector database',
])

let cached: string | null = null

/**
 * Bias Whisper towards IT terminology at decode time.
 *
 * This is the fix for hearing "RAG" as "RAC": the glossary can only repair a
 * mistake after the fact, and only for spellings someone thought to list. An
 * initial prompt makes the decoder less likely to produce the wrong token in the
 * first place.
 *
 * Costs ~18ms per request against a ~120ms baseline - measured, not assumed.
 *
 * Honest limitation: whether this actually improves recognition of these terms in
 * Russian speech is UNVERIFIED. It was only possible to confirm that the prompt
 * reaches the decoder and changes its output. Proving it helps needs recorded
 * Russian speech containing the terms.
 */
export function buildDecodePrompt(): string {
  if (cached !== null) return cached

  let terms: string[]
  try {
    terms = getTerminologyResolver().canonicalTerms()
  } catch (error) {
    log.warn('Glossary unavailable, decode biasing disabled:', error)
    cached = ''
    return cached
  }

  // A short Russian lead-in with a Latin term list is the shape measured as
  // safe. Russian prose costs ~1 token per character and blows the budget fast.
  const prefix = 'Термины: '
  const selected: string[] = []

  for (const term of terms) {
    if (NOT_FOR_PROMPT.has(term)) continue
    const candidate = [...selected, term].join(', ')
    if (estimatePromptTokens(prefix + candidate) > MAX_PROMPT_TOKENS) break
    selected.push(term)
  }

  cached = selected.length > 0 ? `${prefix}${selected.join(', ')}.` : ''
  log.info(`Decode prompt: ${selected.length} terms, ~${estimatePromptTokens(cached)} tokens`)
  return cached
}

/** Test seam. */
export function resetDecodePrompt(): void {
  cached = null
}
