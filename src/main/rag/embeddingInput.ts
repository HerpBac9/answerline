/**
 * Formats inputs according to the prompt contract of the selected local
 * embedding model. Query and document prefixes must be identical at index and
 * runtime, otherwise the vectors live in different spaces.
 */
export function formatEmbeddingInput(model: string, text: string, kind: 'query' | 'document'): string {
  const clean = text.trim()
  const normalizedModel = model.toLocaleLowerCase('en-US')

  if (normalizedModel.includes('embeddinggemma')) {
    return kind === 'query'
      ? `task: search result | query: ${clean}`
      : `title: none | text: ${clean}`
  }

  if (/(?:qwen3|qwen).*embedding|embedding.*(?:qwen3|qwen)/u.test(normalizedModel)) {
    return kind === 'query'
      ? `Instruct: Given a technical interview question, retrieve relevant passages that answer the question\nQuery: ${clean}`
      : clean
  }

  return clean
}
