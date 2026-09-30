import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/** Return the prompt selected by the personal retrieval policy. */
export function systemPromptPath(root = process.cwd(), personalTopK = 1) {
  const fileName = personalTopK === 0 ? 'systemPrompt.noPersonalExperience.md' : 'systemPrompt.md'
  return join(root, 'prompts', fileName)
}

/** Load a prompt shared by the Electron server and test probes. */
export function loadSystemPrompt(root = process.cwd(), overridePath = null) {
  const path = overridePath ? (isAbsolute(overridePath) ? overridePath : join(root, overridePath)) : join(root, 'prompts', 'systemPrompt.md')
  if (!existsSync(path)) throw new Error(`System prompt file does not exist: ${path}`)

  const prompt = readFileSync(path, 'utf8').trim()
  if (!prompt) throw new Error(`System prompt file is empty: ${path}`)
  return prompt
}
