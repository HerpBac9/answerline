import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseQuestions } from './questionBank'

/**
 * `data/*.md` is read by two indexers that agree on one rule and nothing else:
 * every `##` heading is one question, and it becomes one RAG chunk
 * (`scripts/prepare-rag-corpus.mjs`, `scripts/index-rag.mjs`) and one practice
 * question (`src/main/training/questionBank.ts`).
 *
 * Both are silent about headings that break the rule, so a nested
 * `## 1. Module` / `### 1.1 Question` layout does not fail loudly - it just
 * stops being retrievable. The drill-downs become body text of a chunk whose
 * heading is a section label. That is the exact failure this file exists to
 * prevent.
 *
 * `data/` is per-user and ignored by git, so a fresh clone has none. The first
 * describe pins the contract on an inline sample and runs everywhere; the rest
 * apply the same assertions to whatever corpus the user has actually filled.
 */

const CORPUS = 'data'

const H2 = /^##[ \t]+(.+?)[ \t]*$/gmu
const H3_OR_DEEPER = /^#{3,}[ \t]+\S/gmu

const corpusFiles = existsSync(CORPUS)
  ? readdirSync(CORPUS)
    .filter((name) => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'agents.md')
    .sort()
  : []

function read(fileName: string): string {
  return readFileSync(join(CORPUS, fileName), 'utf8')
}

function headings(markdown: string): string[] {
  return [...markdown.matchAll(H2)].map((match) => match[1].trim())
}

/** One question per H2, no H3 anywhere, and no two questions alike. */
function expectWellFormed(markdown: string, fileName: string): void {
  const sectionHeadings = headings(markdown)
  const questions = parseQuestions(markdown, fileName)

  // Count equality is the assertion that matters: parseQuestions drops any
  // heading that does not read as a question, so a section label silently
  // costing a question shows up here. Heading text itself is normalized by
  // questionBank, and re-deriving that normalization here would only test a
  // copy of it.
  expect(questions).toHaveLength(sectionHeadings.length)
  expect(sectionHeadings.length).toBeGreaterThan(0)

  // An H3 is invisible to both indexers: it never becomes a chunk and never
  // becomes a question, it just travels as body text of the chunk above it.
  expect(markdown.match(H3_OR_DEEPER)).toBeNull()

  // Two headings that collide on question text leave retrieval keeping only
  // one of the two vectors under the same text.
  expect(new Set(questions.map((question) => question.text)).size).toBe(questions.length)
}

describe('corpus layout contract', () => {
  const sample = [
    '---',
    'module: "Sample"',
    '---',
    '# Sample',
    '',
    '## Что такое RAG?',
    '',
    'Ответ про поиск по векторам.',
    '',
    '## Зачем нужен индекс?',
    '',
    'Ответ про индекс.',
    '',
  ].join('\n')

  it('accepts a well-formed document: one question per H2, no H3, no duplicates', () => {
    expectWellFormed(sample, 'sample.md')
    expect(parseQuestions(sample, 'sample.md').map((question) => question.text)).toEqual([
      'Что такое RAG?',
      'Зачем нужен индекс?',
    ])
  })

  it('drops a nested H3 question from the bank, so the layout rule is load-bearing', () => {
    const nested = [
      '## 1. Модуль',
      '',
      '### 1.1 Что такое RAG?',
      '',
      'Ответ.',
      '',
    ].join('\n')
    // The H2 reads as a section label and the H3 never reaches either indexer,
    // which is why the structural assertions above exist.
    expect(headings(nested)).toEqual(['1. Модуль'])
    expect(parseQuestions(nested, 'nested.md')).toHaveLength(0)
  })
})

// Empty on a fresh clone by design; skip rather than fail so `npm test` is
// green before the user has written their first question.
describe.skipIf(corpusFiles.length === 0)('user corpus layout', () => {
  it.each(corpusFiles)('%s keeps every section reachable as a question', (fileName) => {
    expectWellFormed(read(fileName), fileName)
  })
})