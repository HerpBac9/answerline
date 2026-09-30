/**
 * Return only the part of a streamed answer whose layout is stable enough to
 * show. The unfinished sentence stays buffered until punctuation arrives;
 * fenced code may advance line by line so a code response is not blank during
 * a long generation.
 */
export function stableAnswerPrefix(text: string): string {
  let inCodeFence = false
  let stableEnd = 0

  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith('```', index) && (index === 0 || text[index - 1] === '\n')) {
      inCodeFence = !inCodeFence
      index += 2
      continue
    }

    const character = text[index]
    if (inCodeFence) {
      if (character === '\n') stableEnd = index + 1
      continue
    }

    if (character === '\n') {
      stableEnd = index + 1
      continue
    }

    if (!/[.!?…]/u.test(character)) continue
    const next = text[index + 1]
    if (next === undefined || /\s/u.test(next)) stableEnd = index + 1
  }

  return text.slice(0, stableEnd)
}
