import { describe, expect, it } from 'vitest'
import { parseQuestions, QuestionBank } from './questionBank'

const FRONT_MATTER = '---\ndocument_type: interview_rag_knowledge\ntopics:\n  - interview\n---\n\n'

describe('parseQuestions', () => {
  it('reads H2 headings and strips corpus numbering', () => {
    const markdown = `${FRONT_MATTER}# Title\n\n## Вопрос 12. Как работает RAG?\n\nОтвет.\n\n## 13. Почему нужен reranking?\n\nОтвет.\n`
    expect(parseQuestions(markdown, 'corpus.md').map((q) => q.text)).toEqual([
      'Как работает RAG?',
      'Почему нужен reranking?',
    ])
  })

  it('keeps imperative system-design questions that do not end in a question mark', () => {
    const markdown = '## Спроектируйте RAG-систему на 100 млн chunks\n\nОтвет.\n\n## Покажите реализацию attention\n\nОтвет.\n'
    expect(parseQuestions(markdown, 'corpus.md').map((q) => q.text)).toEqual([
      'Спроектируйте RAG-систему на 100 млн chunks',
      'Покажите реализацию attention',
    ])
  })

  it('drops section labels and H3+ headings that are not questions', () => {
    const markdown = '## Итоги\n\n## Часть 2\n\n### Как это работает?\n\n## Что такое chunking и зачем он нужен?\n'
    expect(parseQuestions(markdown, 'corpus.md').map((q) => q.text)).toEqual(['Что такое chunking и зачем он нужен?'])
  })

  it('records the source file so the UI can name the domain', () => {
    expect(parseQuestions('## Что такое RAG?\n', 'rag_500.md')).toEqual([
      { text: 'Что такое RAG?', sourceFile: 'rag_500.md' },
    ])
  })
})

describe('QuestionBank', () => {
  const questions = ['Первый вопрос про RAG?', 'Второй вопрос про RAG?', 'Третий вопрос про RAG?'].map((text) => ({
    text,
    sourceFile: 'corpus.md',
  }))

  it('returns every question once before repeating', () => {
    const bank = new QuestionBank(questions)
    expect([bank.pick()?.text, bank.pick()?.text, bank.pick()?.text].sort()).toEqual(
      questions.map((q) => q.text).sort(),
    )
  })

  it('cycles back to a fresh pass rather than dead-ending on an exhausted corpus', () => {
    const bank = new QuestionBank(questions)
    for (let i = 0; i < questions.length; i += 1) bank.pick()
    expect(bank.pick()?.text).toBeDefined()
  })

  it('reports null for an empty corpus so the caller can fall back', () => {
    expect(new QuestionBank([]).pick()).toBeNull()
    expect(new QuestionBank([]).size).toBe(0)
  })

  it('reset allows a question to be asked again', () => {
    const bank = new QuestionBank(questions)
    const first = bank.pick()?.text
    bank.reset()
    const afterReset = [bank.pick()?.text, bank.pick()?.text, bank.pick()?.text]
    expect(afterReset).toContain(first)
  })
})
