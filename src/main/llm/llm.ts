import { llmSettings, type LlmSettings } from '../core/config'
import { createLogger } from '../core/log'

const log = createLogger('LLM')

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  onDone: (fullText: string, stats?: StreamStats) => void
  onError: (message: string) => void
}

export interface StreamStats {
  /** May be absent when the local OpenAI-compatible server omits usage. */
  outputTokens: number | null
}

/**
 * Streaming client for an OpenAI-compatible local server (LM Studio).
 *
 * Written against fetch rather than the openai SDK: the app uses one endpoint
 * with one request shape, and a dependency that pulls its own transport stack is
 * not worth it for ~80 lines.
 */
export class LocalLlm {
  private resolvedModel: string | null = null
  private controller: AbortController | null = null

  /**
   * `auto` picks the single loaded LLM and refuses to guess between several.
   * Guessing is worse than failing: the wrong model mid-interview is silent and
   * confusing, while an error names the fix.
   */
  private async resolveModel(settings: LlmSettings): Promise<string> {
    if (this.resolvedModel) return this.resolvedModel

    if (settings.model !== 'auto') {
      this.resolvedModel = settings.model
      return this.resolvedModel
    }

    const response = await fetch(`${settings.baseUrl}/api/v1/models`, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) throw new Error(`LM Studio ответил HTTP ${response.status} на запрос списка моделей`)

    const payload = await response.json() as {
      models?: Array<{ key?: string; type?: string; loaded_instances?: unknown[] }>
    }
    const loaded = (payload.models ?? [])
      .filter((model) => model.type === 'llm' && (model.loaded_instances?.length ?? 0) > 0)
      .flatMap((model) => (typeof model.key === 'string' && model.key ? [model.key] : []))

    if (loaded.length === 0) throw new Error('В LM Studio не загружена ни одна LLM')
    if (loaded.length > 1) {
      throw new Error(`В LM Studio загружено несколько моделей (${loaded.join(', ')}). Укажите LLM_MODEL в .env`)
    }

    this.resolvedModel = loaded[0]
    log.info(`Using model ${this.resolvedModel}`)
    return this.resolvedModel
  }

  /** Cancel whatever is streaming, so a new question is not queued behind it. */
  abort(): void {
    this.controller?.abort()
    this.controller = null
  }

  async stream(system: string, messages: ChatTurn[], handlers: StreamHandlers): Promise<void> {
    const settings = llmSettings()
    this.abort()
    const controller = new AbortController()
    this.controller = controller

    let full = ''
    try {
      const model = await this.resolveModel(settings)
      const response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: settings.maxTokens,
          temperature: settings.temperature,
          top_p: settings.topP,
          top_k: settings.topK,
          min_p: settings.minP,
          repeat_penalty: settings.repeatPenalty,
          presence_penalty: settings.presencePenalty,
          frequency_penalty: settings.frequencyPenalty,
          ...(settings.seed === null ? {} : { seed: settings.seed }),
          stream: true,
        }),
      })
      if (!response.ok || !response.body) {
        throw new Error(`LM Studio ответил HTTP ${response.status}`)
      }

      let outputTokens: number | null = null
      for await (const chunk of readDeltas(response.body, controller.signal)) {
        if (chunk.content) {
          full += chunk.content
          handlers.onDelta(chunk.content)
        }
        if (chunk.outputTokens !== null) outputTokens = chunk.outputTokens
      }

      if (controller.signal.aborted) return
      handlers.onDone(full, { outputTokens })
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : String(error)
      log.error('Stream failed:', message)
      handlers.onError(message)
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }
}

/** Parse the SSE frames of an OpenAI-compatible stream into content deltas. */
interface StreamChunk {
  content: string | null
  outputTokens: number | null
}

async function* readDeltas(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break

      buffered += decoder.decode(value, { stream: true })
      const lines = buffered.split('\n')
      // The last element may be a partial line; keep it for the next read.
      buffered = lines.pop() ?? ''

      for (const line of lines) {
        const chunk = parseDeltaLine(line)
        if (chunk) yield chunk
      }
    }

    // Some OpenAI-compatible servers close the stream without a final newline.
    // Do not silently drop the last partial SSE frame (often the end of a sentence).
    const tail = parseDeltaLine(buffered)
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

function parseDeltaLine(line: string): StreamChunk | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return null
  try {
    const payload = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: unknown } }>
      usage?: { completion_tokens?: unknown }
    }
    const content = payload.choices?.[0]?.delta?.content
    const completionTokens = payload.usage?.completion_tokens
    const outputTokens = typeof completionTokens === 'number' && Number.isFinite(completionTokens)
      ? Math.max(0, Math.round(completionTokens))
      : null
    if (typeof content !== 'string' || !content) {
      return outputTokens === null ? null : { content: null, outputTokens }
    }
    return { content, outputTokens }
  } catch {
    // A malformed frame must not kill an answer that is already streaming.
    return null
  }
}
