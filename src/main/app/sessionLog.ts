import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLogger } from '../core/log'
import type { AnswerTrace } from '../session/session'

const log = createLogger('SessionLog')

export interface SessionLogOptions {
  systemPrompt: string
  llmModel: string
  embeddingModel: string
  collection: string
  personalTopK: number
  generalTopK: number
  maxContextTokens: number
}

export interface SessionRecorder {
  readonly path: string | null
  recordTurn(trace: AnswerTrace): void
  recordReset(): void
  close(): void
}

interface SessionLogEvent {
  schema_version: 1
  type: 'session_started' | 'turn' | 'session_reset' | 'session_ended'
  session_id: string
  timestamp: string
  [key: string]: unknown
}

type SessionLogEventInput = {
  type: SessionLogEvent['type']
  [key: string]: unknown
}

/**
 * Writes a local, append-only JSONL trace for every app session.
 *
 * Unlike the benchmark recorder, this intentionally includes the question,
 * retrieved candidates, exact prompt context and generated answer. It is the
 * evidence needed to distinguish a retrieval miss from an LLM hallucination.
 * Nothing is sent to a remote sink. Set ANSWERLINE_SESSION_LOG=0 only when a session
 * must not be persisted locally.
 */
export function createSessionRecorder(userDataDir: string, options: SessionLogOptions): SessionRecorder {
  if (process.env.ANSWERLINE_SESSION_LOG?.trim() === '0' || process.env.ANSWERLINE_SESSION_LOG?.trim().toLowerCase() === 'false') {
    return { path: null, recordTurn: () => undefined, recordReset: () => undefined, close: () => undefined }
  }

  const directory = join(userDataDir, 'sessions')
  try {
    mkdirSync(directory, { recursive: true })
  } catch (error) {
    log.error('Could not create session log directory:', error)
    return disabledRecorder()
  }
  const sessionId = randomUUID()
  const path = join(directory, `session-${fileTimestamp(new Date())}-${sessionId.slice(0, 8)}.jsonl`)
  let closed = false

  const write = (event: SessionLogEventInput): void => {
    if (closed) return
    try {
      const payload: SessionLogEvent = {
        schema_version: 1,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        ...event,
      }
      appendFileSync(path, `${JSON.stringify(payload)}\n`, 'utf8')
    } catch (error) {
      // Logging must never break an interview or the LLM stream.
      log.error('Could not write session log:', error)
    }
  }

  write({
    type: 'session_started',
    system_prompt: options.systemPrompt,
    runtime: {
      llm_model: options.llmModel,
      embedding_model: options.embeddingModel,
      qdrant_collection: options.collection,
      rag_personal_top_k: options.personalTopK,
      rag_general_top_k: options.generalTopK,
      rag_max_context_tokens: options.maxContextTokens,
    },
  })
  log.info(`Writing session trace to ${path}`)

  return {
    path,
    recordTurn(trace): void {
      write({ type: 'turn', ...trace })
    },
    recordReset(): void {
      write({ type: 'session_reset' })
    },
    close(): void {
      if (closed) return
      write({ type: 'session_ended' })
      closed = true
    },
  }
}

function disabledRecorder(): SessionRecorder {
  return { path: null, recordTurn: () => undefined, recordReset: () => undefined, close: () => undefined }
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/gu, '-')
}
