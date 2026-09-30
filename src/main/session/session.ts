import { createLogger } from '../core/log'
import { estimateTokens } from '../shared/tokenEstimate'
import { LocalLlm, type ChatTurn } from '../llm/llm'
import { LocalRag, type RagContext, type RagHit, type RagRetriever } from '../rag/rag'
import { getTerminologyResolver } from '../audio/terminology'
import type { Speaker, Utterance } from '../audio/transcriber'
import SYSTEM_PROMPT from '../../../prompts/systemPrompt.md?raw'
import SYSTEM_PROMPT_NO_PERSONAL_EXPERIENCE from '../../../prompts/systemPrompt.noPersonalExperience.md?raw'

const log = createLogger('Session')

const HISTORY_TOKEN_BUDGET = 4_000
const HISTORY_EVICT_TO = 2_800
const PENDING_TOKEN_BUDGET = 2_000

/** Tags the model is told about; stripped from untrusted text so it cannot forge them. */
const ENVELOPE_TAGS = /<\/?(transcript|question|retrieved_context|evidence|role|security)\b[^>]*>/giu
const MODEL_MARKERS = /<\|[^|]*\|>/gu

export interface SessionEvents {
  onAnswerStart: (id: string, question: string) => void
  onAnswerDelta: (id: string, text: string) => void
  onAnswerDone: (id: string, fullText: string, metrics: AnswerDisplayMetrics) => void
  onAnswerError: (id: string, error: string) => void
  onStage: (stage: 'thinking' | 'answering' | 'idle') => void
  onAnswerMetric?: (metric: AnswerMetric) => void
  /** Full trace is intentionally separate from the small benchmark metric. */
  onAnswerTrace?: (trace: AnswerTrace) => void
  onReset?: () => void
}

export interface AnswerDisplayMetrics {
  ttftMs: number | null
  tokensPerSecond: number | null
}

export interface AnswerMetric {
  id: string
  question: string
  status: 'done' | 'error'
  promptEstimateTokens: number
  systemEstimateTokens: number
  historyEstimateTokens: number
  userTurnEstimateTokens: number
  ragLatencyMs: number
  ragHitCount: number
  ragContextTokens: number
  ttftMs: number | null
  totalMs: number
  outputCharacters: number
  error?: string
}

/** Full local trace of one question, including the exact evidence sent to LLM. */
export interface AnswerTrace {
  id: string
  question: string
  retrievalQuery: string
  status: 'done' | 'error'
  history: ChatTurn[]
  userTurn: string
  contextText: string
  contextTokens: number
  hits: RagHit[]
  personalHit: RagHit | null
  generalHits: RagHit[]
  ragLatencyMs: number
  promptEstimateTokens: number
  systemEstimateTokens: number
  historyEstimateTokens: number
  userTurnEstimateTokens: number
  ttftMs: number | null
  totalMs: number
  outputCharacters: number
  answer: string
  error?: string
}

interface Turn extends ChatTurn {
  tokens: number
}

export interface SessionDeps {
  llm?: Pick<LocalLlm, 'stream' | 'abort'>
  rag?: RagRetriever
  /** Read per utterance, so the switch can be flipped without a restart. */
  answerFromMic?: () => boolean
  /** Selects the prompt variant together with the RAG personal context policy. */
  personalTopK?: number
}

/** Conversation state, RAG retrieval and answer generation. */
export class Session {
  private readonly llm: Pick<LocalLlm, 'stream' | 'abort'>
  private readonly rag: RagRetriever
  private readonly answerFromMic: () => boolean
  private readonly systemPrompt: string
  private turns: Turn[] = []
  private historyTokens = 0
  private pending: Array<{ speaker: Speaker; text: string }> = []
  private pendingTokens = 0
  /** Last answered question, used to expand short interviewer follow-ups for RAG. */
  private lastQuestion: string | null = null
  private answering = false
  private answerGeneration = 0

  constructor(private readonly events: SessionEvents, deps: SessionDeps = {}) {
    this.llm = deps.llm ?? new LocalLlm()
    this.rag = deps.rag ?? new LocalRag()
    this.answerFromMic = deps.answerFromMic ?? (() => false)
    this.systemPrompt = this.buildSystemPrompt(deps.personalTopK)
  }

  reset(): void {
    this.answerGeneration += 1
    this.turns = []
    this.historyTokens = 0
    this.pending = []
    this.pendingTokens = 0
    this.lastQuestion = null
    this.llm.abort()
    this.answering = false
    this.events.onReset?.()
    log.info('Session cleared')
  }

  stopAnswer(): void {
    this.answerGeneration += 1
    this.llm.abort()
    this.answering = false
    this.events.onStage('idle')
  }

  handleUtterance(utterance: Utterance): void {
    if (!utterance.isFinal) return
    const text = this.canonical(utterance.text)
    if (!text) return

    const mayAnswer = utterance.speaker === 'interviewer' || this.answerFromMic()
    if (mayAnswer && isQuestion(text)) {
      void this.answer(text)
      return
    }
    this.addPending(utterance.speaker, text)
  }

  async ask(question: string): Promise<void> {
    await this.answer(this.canonical(question))
  }

  lastInterviewerUtterance(): string | null {
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      if (this.pending[index].speaker === 'interviewer') return this.pending[index].text
    }
    return null
  }

  private async answer(question: string): Promise<void> {
    if (!question.trim()) return
    if (this.answering) this.llm.abort()
    this.answering = true

    const generation = ++this.answerGeneration
    const id = `answer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const startedAt = performance.now()
    const retrievalQuery = this.buildRetrievalQuery(question)
    this.events.onAnswerStart(id, question)
    this.events.onStage('thinking')

    let context: RagContext
    try {
      context = await this.rag.retrieve(retrievalQuery)
    } catch (error) {
      if (generation !== this.answerGeneration) return
      const message = error instanceof Error ? error.message : String(error)
      this.answering = false
      const historyMessages = this.turns.map(({ role, content }) => ({ role, content }))
      this.events.onAnswerTrace?.({
        id,
        question,
        retrievalQuery,
        status: 'error',
        history: historyMessages,
        userTurn: '',
        contextText: '',
        contextTokens: 0,
        hits: [],
        personalHit: null,
        generalHits: [],
        ragLatencyMs: 0,
        promptEstimateTokens: 0,
        systemEstimateTokens: estimateTokens(this.systemPrompt),
        historyEstimateTokens: this.historyTokens,
        userTurnEstimateTokens: 0,
        ttftMs: null,
        totalMs: Math.round(performance.now() - startedAt),
        outputCharacters: 0,
        answer: '',
        error: message,
      })
      this.events.onAnswerMetric?.({
        id,
        question,
        status: 'error',
        promptEstimateTokens: 0,
        systemEstimateTokens: estimateTokens(this.systemPrompt),
        historyEstimateTokens: this.historyTokens,
        userTurnEstimateTokens: 0,
        ragLatencyMs: 0,
        ragHitCount: 0,
        ragContextTokens: 0,
        ttftMs: null,
        totalMs: Math.round(performance.now() - startedAt),
        outputCharacters: 0,
        error: message,
      })
      this.events.onAnswerError(id, message)
      this.events.onStage('idle')
      return
    }
    if (generation !== this.answerGeneration) return

    // Store only the question/transcript in history. Retrieved evidence is
    // request-scoped and must not accumulate into every future turn.
    const historyUserTurn = this.buildUserTurn(question)
    const promptUserTurn = this.buildUserTurn(question, context.text)
    const systemEstimateTokens = estimateTokens(this.systemPrompt)
    const userTurnEstimateTokens = estimateTokens(promptUserTurn)
    const historyMessages = this.historyForPrompt(systemEstimateTokens + userTurnEstimateTokens)
    const historyEstimateTokens = historyMessages.reduce((total, turn) => total + estimateTokens(turn.content), 0)
    const promptEstimateTokens = systemEstimateTokens + historyEstimateTokens + userTurnEstimateTokens

    let started = false
    let ttftMs: number | null = null
    let streamedText = ''
    await this.llm.stream(
      this.systemPrompt,
      [...historyMessages, { role: 'user', content: promptUserTurn }],
      {
        onDelta: (text) => {
          streamedText += text
          if (!started) {
            started = true
            ttftMs = performance.now() - startedAt
            this.events.onStage('answering')
          }
          this.events.onAnswerDelta(id, text)
        },
        onDone: (fullText, streamStats = { outputTokens: null }) => {
          if (generation !== this.answerGeneration) return
          const cleanText = normalizeAnswerFormatting(fullText)
          if (cleanText) this.commit(historyUserTurn, cleanText)
          if (cleanText) this.lastQuestion = question
          this.answering = false
          const totalMs = Math.round(performance.now() - startedAt)
          const roundedTtftMs = ttftMs === null ? null : Math.round(ttftMs)
          const outputTokens = streamStats.outputTokens ?? estimateTokens(cleanText)
          const generationMs = roundedTtftMs === null ? null : Math.max(1, totalMs - roundedTtftMs)
          const tokensPerSecond = outputTokens > 0 && generationMs !== null
            ? Math.round((outputTokens * 1_000 / generationMs) * 10) / 10
            : null
          this.events.onAnswerTrace?.({
            id,
            question,
            retrievalQuery,
            status: 'done',
            history: historyMessages,
            userTurn: promptUserTurn,
            contextText: context.text,
            contextTokens: context.tokens,
            hits: context.hits,
            personalHit: context.personalHit ?? null,
            generalHits: context.generalHits ?? [],
            ragLatencyMs: context.latencyMs,
            promptEstimateTokens,
            systemEstimateTokens,
            historyEstimateTokens,
            userTurnEstimateTokens,
            ttftMs: roundedTtftMs,
            totalMs,
            outputCharacters: cleanText.length,
            answer: cleanText,
          })
          this.events.onAnswerMetric?.({
            id,
            question,
            status: 'done',
            promptEstimateTokens,
            systemEstimateTokens,
            historyEstimateTokens,
            userTurnEstimateTokens,
            ragLatencyMs: context.latencyMs,
            ragHitCount: context.hits.length,
            ragContextTokens: context.tokens,
            ttftMs: roundedTtftMs,
            totalMs,
            outputCharacters: cleanText.length,
          })
          this.events.onAnswerDone(id, cleanText, { ttftMs: roundedTtftMs, tokensPerSecond })
          this.events.onStage('idle')
        },
        onError: (message) => {
          if (generation !== this.answerGeneration) return
          this.answering = false
          const partialAnswer = normalizeAnswerFormatting(streamedText)
          this.events.onAnswerTrace?.({
            id,
            question,
            retrievalQuery,
            status: 'error',
            history: historyMessages,
            userTurn: promptUserTurn,
            contextText: context.text,
            contextTokens: context.tokens,
            hits: context.hits,
            personalHit: context.personalHit ?? null,
            generalHits: context.generalHits ?? [],
            ragLatencyMs: context.latencyMs,
            promptEstimateTokens,
            systemEstimateTokens,
            historyEstimateTokens,
            userTurnEstimateTokens,
            ttftMs: ttftMs === null ? null : Math.round(ttftMs),
            totalMs: Math.round(performance.now() - startedAt),
            outputCharacters: partialAnswer.length,
            answer: partialAnswer,
            error: message,
          })
          this.events.onAnswerMetric?.({
            id,
            question,
            status: 'error',
            promptEstimateTokens,
            systemEstimateTokens,
            historyEstimateTokens,
            userTurnEstimateTokens,
            ragLatencyMs: context.latencyMs,
            ragHitCount: context.hits.length,
            ragContextTokens: context.tokens,
            ttftMs: ttftMs === null ? null : Math.round(ttftMs),
            totalMs: Math.round(performance.now() - startedAt),
            outputCharacters: 0,
            error: message,
          })
          this.events.onAnswerError(id, message)
          this.events.onStage('idle')
        },
      },
    )
  }

  private buildSystemPrompt(personalTopK = 1): string {
    return (personalTopK === 0 ? SYSTEM_PROMPT_NO_PERSONAL_EXPERIENCE : SYSTEM_PROMPT).trim()
  }

  private buildRetrievalQuery(question: string): string {
    if (!this.lastQuestion || !isFollowUpQuestion(question)) return question
    return [
      `Предыдущий вопрос интервьюера: ${this.lastQuestion}`,
      `Текущий уточняющий вопрос: ${question}`,
    ].join('\n')
  }

  private buildUserTurn(question: string, retrievedContext = ''): string {
    const transcript = this.pending.length > 0
      ? this.pending.map((entry) => `${entry.speaker === 'me' ? 'Я' : 'Интервьюер'}: ${entry.text}`).join('\n')
      : '(с прошлого ответа ничего не сказано)'

    const parts = [`<transcript>\n${transcript}\n</transcript>`]
    if (retrievedContext) {
      // Keep the trusted envelope after sanitising any tags supplied by the
      // retriever. The system prompt relies on this boundary to distinguish
      // evidence from instructions and the current question.
      parts.push(`<retrieved_context>\n${this.strip(retrievedContext)}\n</retrieved_context>`)
    }
    parts.push(`<question>\n${this.strip(question)}\n</question>`)
    return parts.join('\n\n')
  }

  private addPending(speaker: Speaker, text: string): void {
    this.pending.push({ speaker, text })
    this.pendingTokens += estimateTokens(text)
    while (this.pendingTokens > PENDING_TOKEN_BUDGET && this.pending.length > 1) {
      const dropped = this.pending.shift()
      if (dropped) this.pendingTokens -= estimateTokens(dropped.text)
    }
  }

  private commit(userTurn: string, answer: string): void {
    this.turns.push({ role: 'user', content: userTurn, tokens: estimateTokens(userTurn) })
    this.turns.push({ role: 'assistant', content: answer, tokens: estimateTokens(answer) })
    this.historyTokens += estimateTokens(userTurn) + estimateTokens(answer)
    this.pending = []
    this.pendingTokens = 0
    this.evict()
  }

  private historyForPrompt(currentTokens: number): ChatTurn[] {
    const available = Math.max(0, HISTORY_TOKEN_BUDGET - currentTokens)
    let used = 0
    const selected: ChatTurn[] = []
    for (let index = this.turns.length - 2; index >= 0; index -= 2) {
      const pair = this.turns.slice(index, index + 2)
      const pairTokens = pair.reduce((total, turn) => total + turn.tokens, 0)
      if (selected.length > 0 && used + pairTokens > available) break
      selected.unshift(...pair.map(({ role, content }) => ({ role, content })))
      used += pairTokens
      if (used >= available) break
    }
    return selected
  }

  private evict(): void {
    if (this.historyTokens <= HISTORY_TOKEN_BUDGET) return
    let dropped = 0
    while (this.historyTokens > HISTORY_EVICT_TO && this.turns.length >= 2) {
      const pair = this.turns.splice(0, 2)
      this.historyTokens -= pair.reduce((total, turn) => total + turn.tokens, 0)
      dropped += pair.length
    }
    if (dropped > 0) log.info(`History trimmed: dropped ${dropped} turns, ${this.historyTokens} tokens kept`)
  }

  private canonical(text: string): string {
    try {
      return getTerminologyResolver().resolve(text).resolvedText.trim()
    } catch (error) {
      log.warn('Terminology glossary unavailable, using raw text:', error)
      return text.trim()
    }
  }

  private strip(text: string): string {
    return text.replace(ENVELOPE_TAGS, '').replace(MODEL_MARKERS, '')
  }
}

/** Removes a small class of formatting artifacts that are unsafe for speech/UI. */
export function normalizeAnswerFormatting(text: string): string {
  return text
    .replace(/\$\\leftrightarrow\$/giu, '↔')
    .replace(/\\leftrightarrow/giu, '↔')
    .replace(/\$\\(?:rightarrow|longrightarrow|to)\$/giu, '→')
    .replace(/\\(?:rightarrow|longrightarrow|to)/giu, '→')
    .replace(/\$([^$\r\n]+)\$/gu, '$1')
    .trim()
}

const QUESTION_WORD = /(^|[\s,;:—-])(кто|что|сколько|где|когда|почему|зачем|какой|какая|какое|какие|каким|чей|можно ли|нужно ли|будет ли|есть ли|стоит ли|who|what|where|when|why|how|which|can|does|is|are)(?=$|[\s,.:;!?])/iu
const HOW_QUESTION = /^\s*как(?=$|[\s,.:;!?])/iu
const HOW_ASIDE = /^\s*как\s+(?:раз|будто|бы|же|только|если|известно|правило|минимум|максимум|следствие|результат|обычно|всегда|говорится|видно|(?:я|мы)\s+(?:говорил|говорили|сказал|сказали|упоминал|упоминали|обсуждали|видели|уже)|вы\s+(?:знаете|понимаете|видите|помните))(?=$|[\s,.:;!?])/iu
const REQUEST_VERB = /(?:^|[\s,.:;!?])(расскажи(?:те)?|объясни(?:те)?|опиши(?:те)?|подскажи(?:те)?|покажи(?:те)?|сравни(?:те)?|назови(?:те)?|поясни(?:те)?|напиши(?:те)?|реализуй(?:те)?|сделай(?:те)?|приведи\s+пример|tell me|explain|describe|compare|write|implement)(?=$|[\s,.:;!?])/iu
const FOLLOW_UP = /^\s*(?:а теперь|ну а|а если|а что насчёт|а какие|а почему|а как|а где|а кто|а что|тогда|теперь|а|и)(?=$|[\s,.:;!?])/iu

function isFollowUpQuestion(text: string): boolean {
  return FOLLOW_UP.test(text)
}

export function isQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const lower = normalized.toLocaleLowerCase('ru-RU')
  if (/[?؟]\s*$/u.test(normalized)) return true
  if (REQUEST_VERB.test(lower)) return true
  if (HOW_QUESTION.test(lower) && !HOW_ASIDE.test(lower)) return true
  return QUESTION_WORD.test(lower)
}
