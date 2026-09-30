import { beforeEach, describe, expect, it } from 'vitest'
import { buildDecodePrompt, resetDecodePrompt } from './decodePrompt'
import { getTerminologyResolver } from './terminology'

// No mocks: this must hold for the glossary that actually ships.
describe('buildDecodePrompt', () => {
  beforeEach(() => resetDecodePrompt())

  it('starts with a short Russian lead-in and lists Latin terms', () => {
    // The measured-safe shape. Russian prose costs ~1 token per character and
    // blew the prompt budget, which degraded the transcript entirely.
    const prompt = buildDecodePrompt()
    expect(prompt.startsWith('Термины: ')).toBe(true)
    expect(prompt.endsWith('.')).toBe(true)
    expect(prompt).not.toContain('\n')
  })

  it('includes the terms this app exists to get right', () => {
    const prompt = buildDecodePrompt()
    expect(prompt).toContain('RAG')
    expect(prompt).toContain('LLM')
    expect(prompt).toContain('embedding')
  })

  it('stays well under the 224-token limit Whisper enforces', () => {
    // At exactly 224 the first word of the transcript was dropped, and past ~300
    // the output degenerated - so the budget is deliberately below the limit.
    const prompt = buildDecodePrompt()
    const latin = [...prompt].filter((char) => !/[Ѐ-ӿ]/.test(char)).length
    const cyrillic = prompt.length - latin
    const estimate = Math.ceil(0.45 * latin + 1.15 * cyrillic) + 4

    expect(estimate).toBeLessThanOrEqual(180)
  })

  it('truncates rather than emitting the whole glossary', () => {
    const total = getTerminologyResolver().canonicalTerms().length
    const listed = buildDecodePrompt().split(', ').length

    expect(total).toBeGreaterThan(50)
    expect(listed).toBeLessThan(total)
  })

  it('leaves out ordinary English words that drag the decoder into English', () => {
    // A Latin-heavy prompt was measured turning Russian output into English.
    const prompt = buildDecodePrompt()
    for (const word of ['prompt', 'token', 'agent', 'attention', 'latency']) {
      expect(prompt.split(', ')).not.toContain(word)
    }
  })

  it('is stable across calls, so the decoder sees the same prefix every segment', () => {
    expect(buildDecodePrompt()).toBe(buildDecodePrompt())
  })
})

describe('glossary repair for the observed failure', () => {
  it('maps the Latin misrecognition of RAG onto the canonical term', () => {
    // Real session: "Расскажите про опыт внедрения RAG" came back as
    // "RAC-системы", and the model answered about Oracle clustering.
    const resolved = getTerminologyResolver().resolve('Расскажите про опыт внедрения RAC-системы')
    expect(resolved.resolvedText).toContain('RAG')
    expect(resolved.replacements.some((item) => item.canonical === 'RAG')).toBe(true)
  })

  it('still maps the Cyrillic spellings', () => {
    for (const spoken of ['Что такое раг', 'Что такое рак', 'расскажи про РАГ']) {
      expect(getTerminologyResolver().resolve(spoken).resolvedText).toContain('RAG')
    }
  })

  it('leaves the raw text untouched for display', () => {
    const resolved = getTerminologyResolver().resolve('внедрение RAC-системы')
    expect(resolved.rawText).toBe('внедрение RAC-системы')
  })

  it('maps a Russian vector-dimension phrase to the knowledge-map anchor', () => {
    const resolved = getTerminologyResolver().resolve('Как размерность вектора влияет на поиск и эмбеддинг?')

    expect(resolved.resolvedText).toBe('Как embedding dimension влияет на поиск и embedding?')
    expect(resolved.replacements).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'размерность вектора', canonical: 'embedding dimension' }),
      expect.objectContaining({ source: 'эмбеддинг', canonical: 'embedding' }),
    ]))
    expect(resolved.rawText).toBe('Как размерность вектора влияет на поиск и эмбеддинг?')
  })
})
