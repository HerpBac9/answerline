/**
 * Removes corpus markup that is metadata rather than answer content: the
 * `**Уровень:**` classification line and a leading standalone `**Ответ:**`
 * marker. Both would otherwise be stored in payload answers and later shown
 * to the model inside the retrieved context.
 *
 * Ordinary prose that merely mentions the words stays untouched: the level
 * line must be a bold standalone marker, and the answer marker is removed
 * only when it is the first non-empty line of the section.
 */
const LEVEL_LINE = /^[ \t]*\*\*Уровень:\*\*.*$/gmu
const ANSWER_MARKER = /^\*\*Ответ:?\*\*$/u

export function cleanSectionAnswer(answer) {
  const lines = answer.replace(LEVEL_LINE, '').split(/\r?\n/u)
  const firstContent = lines.findIndex((line) => line.trim().length > 0)
  if (firstContent >= 0 && ANSWER_MARKER.test(lines[firstContent].trim())) {
    lines.splice(firstContent, 1)
  }
  return lines.join('\n').trim()
}
