import { readFileSync } from 'node:fs'
import { resourcePath } from '../core/paths'

export interface TerminologyTerm {
  canonical: string
  aliases: string[]
}

export interface TerminologyReplacement {
  source: string
  canonical: string
  confidence: number
  provenance: string
}

export interface TerminologyResolution {
  rawText: string
  resolvedText: string
  replacements: TerminologyReplacement[]
}

const TABLE_ROW = /^\|\s*`?([^|`]+?)`?\s*\|\s*([^|]+?)\s*\|\s*$/

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wholeTermExpression(alias: string): RegExp {
  // Unicode boundaries are required for Cyrillic aliases. The alias may itself
  // contain punctuation (C#, .NET, Node.js), hence the boundary is outside it.
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(alias)})(?=$|[^\\p{L}\\p{N}])`, 'giu')
}

/** Generic, data-driven resolver. It never edits the stored/displayed transcript. */
export class TerminologyResolver {
  private readonly rules: Array<{ canonical: string; alias: string; expression: RegExp }>
  private readonly canonicals: string[]

  /**
   * Canonical forms in file order, which the glossary header documents as
   * most-likely-first. Used to bias Whisper at decode time.
   */
  canonicalTerms(): string[] {
    return this.canonicals
  }

  constructor(terms: TerminologyTerm[]) {
    this.canonicals = [...new Set(terms.map((term) => term.canonical))]
    this.rules = terms
      .flatMap((term) => term.aliases.map((alias) => ({ canonical: term.canonical, alias: alias.trim() })))
      .filter((term) => term.alias.length > 0)
      // Prefer multi-word and longer aliases before shorter overlapping ones.
      .sort((left, right) => right.alias.length - left.alias.length || left.alias.localeCompare(right.alias))
      .map((term) => ({ ...term, expression: wholeTermExpression(term.alias) }))
  }

  static fromMarkdown(markdown: string): TerminologyResolver {
    const terms: TerminologyTerm[] = []
    for (const line of markdown.split(/\r?\n/)) {
      const match = line.match(TABLE_ROW)
      if (!match) continue
      const canonical = match[1].trim()
      const aliases = match[2].split(';').map((alias) => alias.trim()).filter(Boolean)
      // Skip the Markdown table separator row.
      if (!canonical || canonical.toLowerCase() === 'canonical' || /^-+$/.test(canonical) || aliases.length === 0) continue
      terms.push({ canonical, aliases })
    }
    return new TerminologyResolver(terms)
  }

  resolve(rawText: string): TerminologyResolution {
    let resolvedText = rawText
    const replacements: TerminologyReplacement[] = []
    for (const rule of this.rules) {
      rule.expression.lastIndex = 0
      resolvedText = resolvedText.replace(rule.expression, (_whole, prefix: string, matched: string) => {
        if (matched === rule.canonical) return `${prefix}${matched}`
        replacements.push({
          source: matched,
          canonical: rule.canonical,
          confidence: 1,
          provenance: 'resources/it-ru-terms.md',
        })
        return `${prefix}${rule.canonical}`
      })
    }
    return { rawText, resolvedText, replacements }
  }
}

let defaultResolver: TerminologyResolver | null = null

export function getTerminologyResolver(): TerminologyResolver {
  if (defaultResolver) return defaultResolver
  const filePath = resourcePath('it-ru-terms.md')
  if (!filePath) throw new Error('resources/it-ru-terms.md was not found')
  defaultResolver = TerminologyResolver.fromMarkdown(readFileSync(filePath, 'utf8'))
  return defaultResolver
}
