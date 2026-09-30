import { afterEach, describe, expect, it, vi } from 'vitest'

const userData = vi.hoisted(() => `${process.env.TEMP ?? process.env.TMP ?? '.'}/answerline-llm-settings-test`)

vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

import { llmSettings } from './config'

const KEYS = [
  'LLM_BASE_URL',
  'LLM_MODEL',
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
})
