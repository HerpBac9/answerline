import { describe, expect, it } from 'vitest'
import { parseQaSections, parseTranslation, protectForTranslation, restoreProtectedText, validateTranslationShape } from './translate-qa.mjs'

describe('Q&A translation input parsing', () => {
  it('uses ## headings as records, removes leading metadata comments, and ignores fenced headings', () => {
    const markdown = [
      '# Corpus',
      '',
      '## First question?',
      '',
      '<!-- source_file=one.md -->',
      '',
      'First answer with `RAG` and 95%.',
      '',
      '```md',
      '## This is code, not a question',
      '```',
      '',
      '## Second question?',
      '',
      'Second answer.',
    ].join('\n')

    expect(parseQaSections(markdown)).toEqual([
      expect.objectContaining({
        index: 0,
        question: 'First question?',
        answer: 'First answer with `RAG` and 95%.\n\n```md\n## This is code, not a question\n```',
      }),
      expect.objectContaining({ index: 1, question: 'Second question?', answer: 'Second answer.' }),
    ])
  })
})

describe('translated record validation', () => {
  it('protects and restores code, URLs, formulas and numbers without changing them', () => {
    const source = {
      question: 'How does version 2 of the API work?',
      answer: 'Use `GET /v1/items` at https://example.com/v1. The threshold is 95%.\n\n```python\nreturn 42\n```',
    }
    const protectedSource = protectForTranslation(source)
    expect(protectedSource.question).not.toContain('version 2')
    expect(protectedSource.answer).not.toContain('GET /v1/items')
    expect(protectedSource.state.tokens).toHaveLength(5)
    const translated = protectedSource.question + '\n' + protectedSource.answer
    for (const item of protectedSource.state.tokens) expect(translated).toContain(item.token)
    const restored = restoreProtectedText(protectedSource.question, protectedSource.answer, protectedSource.state)
    expect(restored.issues).toEqual([])
    expect(restored.question).toBe(source.question)
    expect(restored.answer).toBe(source.answer)
  })

  it('parses Hy-MT2 delimiter output before looking for JSON', () => {
    const parsed = parseTranslation([
      '<<<QUESTION_RU>>>',
      'Как работает RAG?',
      '<<<END_QUESTION_RU>>>',
      '<<<ANSWER_RU>>>',
      'RAG извлекает контекст. В ответе может встретиться {"sufficient": true}.',
      '<<<END_ANSWER_RU>>>',
    ].join('\n'))
    expect(parsed).toEqual({
      question: 'Как работает RAG?',
      answer: 'RAG извлекает контекст. В ответе может встретиться {"sufficient": true}.',
    })
  })

  it('removes a stray delimiter character left at the end of a field', () => {
    expect(parseTranslation('<<<QUESTION_RU>>>\nКак работает RAG? <\n<<<END_QUESTION_RU>>>\n<<<ANSWER_RU>>>\nОтвет. <\n<<<END_ANSWER_RU>>>')).toEqual({
      question: 'Как работает RAG?',
      answer: 'Ответ.',
    })
  })

  it('does not treat an unrelated JSON fragment in a plain translation as the answer object', () => {
    expect(parseTranslation('В ответе встречается {"sufficient": true}.')).toBeNull()
  })

  it('rejects changes to code, URLs, and numbers', () => {
    const source = {
      question: 'How does the API work in version 2?',
      answer: 'Call `GET /v1/items` at https://example.com/v1 and use 95% confidence.',
    }
    const checked = validateTranslationShape(source, {
      question: 'Как работает API в версии 3?',
      answer: 'Вызовите `POST /v1/items` по адресу https://example.org/v1 и используйте 90% уверенности.',
    })
    expect(checked.issues).toEqual(expect.arrayContaining([
      'inline code was changed or lost',
      'a URL was changed or lost',
      'a number, version, date or percentage was changed or lost',
    ]))
  })

  it('accepts a faithful Russian translation with Markdown preserved', () => {
    const checked = validateTranslationShape({
      question: 'How does the API work in version 2?',
      answer: 'Call `GET /v1/items` at https://example.com/v1 and use 95% confidence.',
    }, {
      question: 'Как работает API в версии 2?',
      answer: 'Вызовите `GET /v1/items` по адресу https://example.com/v1 и используйте уверенность 95%.',
    })
    expect(checked.issues).toEqual([])
  })
})
