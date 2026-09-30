/** Keep standalone indexing/probe scripts on the same embedding input contract as the app. */
export function formatEmbeddingInput(model, text, kind) {
  const clean = String(text).trim()
  const normalizedModel = String(model).toLocaleLowerCase('en-US')

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
