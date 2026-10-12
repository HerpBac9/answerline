import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLlmSettings, llmRequestOptions } from './llm-settings.mjs'

const KEYS = [
  'LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_MAX_TOKENS',
  'LLM_TEMPERATURE', 'LLM_TOP_P',
]

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('CLI LLM configuration', () => {
  it('uses LM Studio by default and preserves sampling settings', () => {
    vi.stubEnv('LLM_PROVIDER', 'lmstudio')
    vi.stubEnv('LLM_BASE_URL', 'http://127.0.0.1:1234/')
    vi.stubEnv('LLM_MODEL', 'local-qwen')
    vi.stubEnv('LLM_TEMPERATURE', '0.35')
    const settings = readLlmSettings()
    expect(settings).toMatchObject({
      provider: 'lmstudio',
      baseUrl: 'http://127.0.0.1:1234',
      model: 'local-qwen',
      temperature: 0.35,
    })
    expect(llmRequestOptions(settings)).toMatchObject({ temperature: 0.35, stream: true })
  })

  it('routes Bridge to the Responses origin, not the LM Studio fallback', () => {
    vi.stubEnv('LLM_PROVIDER', 'bridge')
    vi.stubEnv('LLM_BASE_URL', '')
    vi.stubEnv('LLM_MODEL', '')
    const settings = readLlmSettings({ baseUrl: 'http://127.0.0.1:1234', model: 'auto' })
    expect(settings).toMatchObject({
      provider: 'bridge',
      baseUrl: 'http://127.0.0.1:17841',
      model: 'chatgpt-web/gpt-6-sol',
      reasoningEffort: 'low',
    })
    vi.stubEnv('LLM_BASE_URL', 'http://127.0.0.1:17841/v1/')
    expect(readLlmSettings().baseUrl).toBe('http://127.0.0.1:17841')
    vi.stubEnv('LLM_REASONING_EFFORT', 'high')
    expect(readLlmSettings().reasoningEffort).toBe('high')
    vi.stubEnv('LLM_REASONING_EFFORT', 'none')
    expect(() => readLlmSettings()).toThrow(/LLM_REASONING_EFFORT/)
  })

  it('accepts the project link from a ChatGPT chat but never treats it as the session chat', () => {
    vi.stubEnv('LLM_PROVIDER', 'bridge')
    vi.stubEnv('LLM_PROJECT_URL', 'https://chatgpt.com/g/g-p-6acbc986ba2c8191bdbb04545b30a1ae-answerline/c/6acbd45c-337c-83eb-bb17-d2fc187e89fc')
    expect(readLlmSettings()).toMatchObject({
      projectPromptMode: 'project',
      projectUrl: process.env.LLM_PROJECT_URL,
    })
    vi.stubEnv('LLM_PROJECT_PROMPT_MODE', 'inline')
    expect(readLlmSettings().projectPromptMode).toBe('inline')
    vi.stubEnv('LLM_PROJECT_URL', 'https://chatgpt.com/c/6acbd45c-337c-83eb-bb17-d2fc187e89fc')
    expect(() => readLlmSettings()).toThrow(/LLM_PROJECT_URL/)
  })
})
