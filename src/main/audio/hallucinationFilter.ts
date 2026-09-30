import { readFileSync } from 'node:fs'
import { resourcePath } from '../core/paths'
import { createLogger } from '../core/log'

const log = createLogger('HallucinationFilter')

type Rule =
  | { kind: 'exact'; value: string; source: string }
  | { kind: 'regex'; value: RegExp; source: string }

/**
 * Drops transcripts that Whisper invented rather than heard.
 *
 * Data-driven on purpose. AGENTS.md В§13 forbids one-off word substitutions in the
 * transcription pipeline; this is the same principle applied to deletions - the
 * patterns live in a user-editable file with their provenance, and every drop is
 * logged instead of silently vanishing.
 */
export class HallucinationFilter {
  private constructor(private readonly rules: Rule[]) {}

  static fromText(text: string, source: string): HallucinationFilter {
    const rules: Rule[] = []

    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue

      const regex = line.match(/^\/(.+)\/([gimsuy]*)$/u)
      if (regex) {
        try {
          rules.push({ kind: 'regex', value: new RegExp(regex[1], regex[2]), source })
        } catch (error) {
          // One bad user-authored pattern must not disable the whole filter.
          log.warn(`Ignoring invalid hallucination pattern ${line}:`, error)
        }
        continue
      }
      rules.push({ kind: 'exact', value: line.toLocaleLowerCase('ru-RU'), source })
    }

    return new HallucinationFilter(rules)
  }

  /** The matched pattern, or null when the text looks like real speech. */
  match(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed) return null
    const lowered = trimmed.toLocaleLowerCase('ru-RU')

    for (const rule of this.rules) {
      if (rule.kind === 'regex') rule.value.lastIndex = 0
      if (rule.kind === 'exact' ? lowered === rule.value : rule.value.test(trimmed)) {
        return rule.kind === 'exact' ? rule.value : rule.value.source
      }
    }
    return null
  }

  get size(): number {
    return this.rules.length
  }
}

let cached: HallucinationFilter | null = null

export function getHallucinationFilter(): HallucinationFilter {
  if (cached) return cached

  const filePath = resourcePath('hallucinations.txt')
  if (!filePath) {
    // Transcription must keep working; the cost is noisier output.
    log.warn('Hallucination pattern file not found; no filtering will be applied')
    cached = HallucinationFilter.fromText('', 'missing')
    return cached
  }

  cached = HallucinationFilter.fromText(readFileSync(filePath, 'utf8'), filePath)
  log.info(`Loaded ${cached.size} hallucination patterns from ${filePath}`)
  return cached
}

/** Test seam: the file is read once per process. */
export function resetHallucinationFilter(): void {
  cached = null
}
