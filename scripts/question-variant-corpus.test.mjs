import { describe, expect, it } from 'vitest'
import {
  isQuestionVariantCorpus,
  parseQuestionVariantMarkdown,
  questionVariantCatalogFile,
} from './question-variant-corpus.mjs'

describe('question variant corpus pairing', () => {
  it('pairs any knowledge-base markdown with its sidecar JSON by prefix', () => {
    expect(questionVariantCatalogFile('rag_500_interview_knowledge_base_ru.md')).toBe('rag_500_question_variants.json')
    expect(questionVariantCatalogFile('llm_inference_optimization_500_interview_knowledge_base_ru.md'))
      .toBe('llm_inference_optimization_500_question_variants.json')
    expect(isQuestionVariantCorpus('llm_serving_production_infrastructure_500_interview_knowledge_base_ru.md')).toBe(true)
  })

  it('does not treat ordinary sources as variant corpora', () => {
    expect(questionVariantCatalogFile('interview-ai-system-design-qa.md')).toBeNull()
    expect(questionVariantCatalogFile('rag_500_question_variants.json')).toBeNull()
    expect(isQuestionVariantCorpus('AGENTS.md')).toBe(false)
  })
})

describe('question variant corpus parser', () => {
  it('keeps canonical question and variants attached to one answer record', () => {
    const catalog = new Map([
      [1, {
        id: 1,
        question: 'В каких случаях RAG вообще является неправильным решением?',
        variants: ['Когда не стоит строить RAG?', 'Какие задачи лучше решить без retrieval-augmented generation?'],
      }],
    ])
    const markdown = `# Knowledge base\n\n## Вопрос 1. В каких случаях RAG вообще является неправильным решением?\n\n## Вопрос 1.1. Когда не стоит строить RAG?\n\n## Вопрос 1.2. Какие задачи лучше решить без retrieval-augmented generation?\n\n**Ответ**\n\nRAG не нужен, если внешние знания не требуются.`

    expect(parseQuestionVariantMarkdown(markdown, catalog)).toEqual([{
      id: 1,
      question: 'В каких случаях RAG вообще является неправильным решением?',
      variants: ['Когда не стоит строить RAG?', 'Какие задачи лучше решить без retrieval-augmented generation?'],
      answer: 'RAG не нужен, если внешние знания не требуются.',
      sectionIndex: 0,
    }])
  })

  it('accepts a canonical question without variants as its own record', () => {
    const catalog = new Map([[2, { id: 2, question: 'Что такое MoE?', variants: [] }]])
    const markdown = `## Вопрос 2. Что такое MoE?\n\n**Ответ**\n\nMixture-of-Experts.`

    expect(parseQuestionVariantMarkdown(markdown, catalog)).toEqual([{
      id: 2,
      question: 'Что такое MoE?',
      variants: [],
      answer: 'Mixture-of-Experts.',
      sectionIndex: 0,
    }])
  })

  it('rejects Markdown and JSON variant drift', () => {
    const catalog = new Map([[1, {
      id: 1,
      question: 'Что такое RAG?',
      variants: ['Как работает RAG?', 'Зачем нужен retrieval?'],
    }]])
    const markdown = `## Вопрос 1. Что такое RAG?\n\n## Вопрос 1.1. Другая формулировка\n\n## Вопрос 1.2. Зачем нужен retrieval?\n\n**Ответ**\n\nОтвет.`

    expect(() => parseQuestionVariantMarkdown(markdown, catalog)).toThrow('variants differ')
  })
})
