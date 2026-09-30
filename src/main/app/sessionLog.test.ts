import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionRecorder } from './sessionLog'
import type { AnswerTrace } from '../session/session'

const tempDirectories: string[] = []

afterEach(() => {
  delete process.env.ANSWERLINE_SESSION_LOG
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function trace(): AnswerTrace {
  return {
    id: 'answer-1',
    question: 'Что такое RAG?',
    retrievalQuery: 'Что такое RAG?',
    status: 'done',
    history: [],
    userTurn: '<question>Что такое RAG?</question>',
    contextText: '<retrieved_context>facts</retrieved_context>',
    contextTokens: 4,
    hits: [],
    personalHit: null,
    generalHits: [],
    ragLatencyMs: 12,
    promptEstimateTokens: 20,
    systemEstimateTokens: 10,
    historyEstimateTokens: 0,
    userTurnEstimateTokens: 10,
    ttftMs: 30,
    totalMs: 100,
    outputCharacters: 12,
    answer: 'Ответ по делу.',
  }
}

describe('session recorder', () => {
  it('writes a readable session header, full turn and end marker', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wisper-session-log-'))
    tempDirectories.push(directory)
    const recorder = createSessionRecorder(directory, {
      systemPrompt: 'system prompt',
      llmModel: 'gemma',
      embeddingModel: 'qwen',
      collection: 'qa',
      personalTopK: 1,
      generalTopK: 3,
      maxContextTokens: 4000,
    })

    recorder.recordTurn(trace())
    recorder.recordReset()
    recorder.close()

    expect(recorder.path).not.toBeNull()
    const events = readFileSync(recorder.path!, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(events.map((event) => event.type)).toEqual(['session_started', 'turn', 'session_reset', 'session_ended'])
    expect(events[0].system_prompt).toBe('system prompt')
    expect(events[1].question).toBe('Что такое RAG?')
    expect(events[1].contextText).toBe('<retrieved_context>facts</retrieved_context>')
    expect(events[1].answer).toBe('Ответ по делу.')
  })

  it('can be disabled explicitly without creating a file', () => {
    process.env.ANSWERLINE_SESSION_LOG = '0'
    const directory = mkdtempSync(join(tmpdir(), 'wisper-session-log-'))
    tempDirectories.push(directory)

    const recorder = createSessionRecorder(directory, {
      systemPrompt: 'system prompt',
      llmModel: 'gemma',
      embeddingModel: 'qwen',
      collection: 'qa',
      personalTopK: 1,
      generalTopK: 3,
      maxContextTokens: 4000,
    })

    expect(recorder.path).toBeNull()
  })
})
