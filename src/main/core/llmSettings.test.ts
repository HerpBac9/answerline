import { afterEach, describe, expect, it, vi } from 'vitest'

const userData = vi.hoisted(() => `${process.env.TEMP ?? process.env.TMP ?? '.'}/answerline-llm-settings-test`)

vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

import { llmSettings } from './config'

const KEYS = [
  'LLM_PROVIDER',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_REASONING_EFFORT',
  'LLM_PROJECT_URL',
  'LLM_PROJECT_PROMPT_MODE',
  'LLM_MAX_TOKENS',
  'LLM_TEMPERATURE',
  'LLM_TOP_P',
  'LLM_TOP_K',
  'LLM_MIN_P',
  'LLM_REPEAT_PENALTY',
  'LLM_PRESENCE_PENALTY',
  'LLM_FREQUENCY_PENALTY',
  'LLM_SEED',
]

describe('llmSettings', () => {
  afterEach(() => {
    for (const key of KEYS) delete process.env[key]
  })

  it('reads generation settings from environment variables', () => {
    process.env.LLM_BASE_URL = 'http://127.0.0.1:4321/'
    process.env.LLM_MODEL = 'gemma-test'
    process.env.LLM_MAX_TOKENS = '1234'
    process.env.LLM_TEMPERATURE = '0.4'
    process.env.LLM_TOP_P = '0.8'
    process.env.LLM_TOP_K = '17'
    process.env.LLM_MIN_P = '0.1'
    process.env.LLM_REPEAT_PENALTY = '1.2'
    process.env.LLM_PRESENCE_PENALTY = '0.3'
    process.env.LLM_FREQUENCY_PENALTY = '-0.2'
    process.env.LLM_SEED = '42'

    expect(llmSettings()).toEqual({
      provider: 'lmstudio',
      baseUrl: 'http://127.0.0.1:4321',
      model: 'gemma-test',
      maxTokens: 1234,
      temperature: 0.4,
      topP: 0.8,
      topK: 17,
      minP: 0.1,
      repeatPenalty: 1.2,
      presencePenalty: 0.3,
      frequencyPenalty: -0.2,
      seed: 42,
    })
  })

  it('selects ChatGPT Bridge Responses with its own endpoint and model defaults', () => {
    process.env.LLM_PROVIDER = 'bridge'
    expect(llmSettings()).toMatchObject({
      provider: 'bridge',
      baseUrl: 'http://127.0.0.1:17841',
      model: 'chatgpt-web/gpt-6-sol',
      reasoningEffort: 'low',
    })
    process.env.LLM_REASONING_EFFORT = 'medium'
    expect(llmSettings().reasoningEffort).toBe('medium')
    process.env.LLM_REASONING_EFFORT = 'none'
    expect(() => llmSettings()).toThrow(/LLM_REASONING_EFFORT/)
    process.env.LLM_REASONING_EFFORT = 'low'
    process.env.LLM_BASE_URL = 'http://127.0.0.1:20000/v1/'
    process.env.LLM_MODEL = 'custom-model'
    expect(llmSettings()).toMatchObject({
      provider: 'bridge',
      baseUrl: 'http://127.0.0.1:20000',
      model: 'custom-model',
    })
  })

  it('binds each Bridge session to an existing project and can omit repeated system instructions', () => {
    process.env.LLM_PROVIDER = 'bridge'
    process.env.LLM_PROJECT_URL = 'https://chatgpt.com/g/g-p-6acbc986ba2c8191bdbb04545b30a1ae-answerline/c/6acbd45c-337c-83eb-bb17-d2fc187e89fc'
    expect(llmSettings()).toMatchObject({
      projectUrl: process.env.LLM_PROJECT_URL,
      projectPromptMode: 'project',
      reasoningEffort: 'low',
    })
    process.env.LLM_PROJECT_PROMPT_MODE = 'inline'
    expect(llmSettings().projectPromptMode).toBe('inline')
    process.env.LLM_PROJECT_PROMPT_MODE = 'invalid'
    expect(() => llmSettings()).toThrow(/LLM_PROJECT_PROMPT_MODE/)
    process.env.LLM_PROJECT_PROMPT_MODE = 'project'
    process.env.LLM_PROJECT_URL = 'https://evil.com/g/g-p-6acbc986ba2c8191bdbb04545b30a1ae-answerline/project'
    expect(() => llmSettings()).toThrow(/LLM_PROJECT_URL/)
    delete process.env.LLM_PROJECT_URL
    expect(() => llmSettings()).toThrow(/requires LLM_PROJECT_URL/)
  })
})
