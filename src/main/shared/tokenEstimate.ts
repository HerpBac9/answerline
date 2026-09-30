/**
 * Character-based token estimate.
 *
 * Deliberately NOT word-based. Cyrillic tokenizes at roughly 2.5–3.5 characters
 * per token, so counting words under-estimates Russian by about 2.5x — which is
 * exactly the wrong direction when the whole design is squeezed into a 16K local
 * context window. Dividing characters by three over-estimates Latin text
 * slightly, and over-estimating is the safe side of a context budget.
 *
 * There is no tokenizer available in the main process, and loading one to count
 * a prompt would cost more than the budget it protects.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}
