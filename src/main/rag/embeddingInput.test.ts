import { describe, expect, it } from 'vitest'
import { formatEmbeddingInput } from './embeddingInput'

describe('formatEmbeddingInput', () => {
  it('uses EmbeddingGemma query and document prompts', () => {
    expect(formatEmbeddingInput('text-embedding-embeddinggemma-300m', 'что такое RAG?', 'query'))
      .toBe('task: search result | query: что такое RAG?')
    expect(formatEmbeddingInput('text-embedding-embeddinggemma-300m', 'module: rag\nquestion: что такое RAG?', 'document'))
      .toBe('title: none | text: module: rag\nquestion: что такое RAG?')
  })

  it('adds the documented English instruction for Qwen queries only', () => {
    expect(formatEmbeddingInput('text-embedding-qwen3-0.6b-text-embedding', 'что такое RAG?', 'query'))
      .toContain('Instruct: Given a technical interview question')
    expect(formatEmbeddingInput('text-embedding-qwen3-0.6b-text-embedding', 'question', 'document'))
      .toBe('question')
  })

  it('leaves unknown model contracts unchanged', () => {
    expect(formatEmbeddingInput('local-embedding', '  text  ', 'query')).toBe('text')
  })
})
