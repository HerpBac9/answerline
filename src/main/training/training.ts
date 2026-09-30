import { join } from 'node:path'
import { createLogger } from '../core/log'
import { LocalLlm, type ChatTurn } from '../llm/llm'
import { LocalRag, stripUntrusted, type RagRetriever } from '../rag/rag'
import { loadQuestionBank, QuestionBank } from './questionBank'
import TRAINING_INTERVIEWER_PROMPT from '../../../prompts/trainingInterviewerPrompt.md?raw'
import TRAINING_FEEDBACK_PROMPT from '../../../prompts/trainingFeedbackPrompt.md?raw'
import TRAINING_REFERENCE_ANSWER_PROMPT from '../../../prompts/trainingReferenceAnswerPrompt.md?raw'

const log = createLogger('Training')

/** Training mode is deliberately env-only: no config.json fallback, no UI toggle. */
export function trainingModeEnabled(): boolean {
  const value = process.env.ANSWERLINE_TRAINING_MODE?.trim().toLowerCase()
  return value === '1' || value === 'true'
}

export type TrainingEvent =
  | { type: 'question-start'; id: string }
  | { type: 'question-delta'; id: string; text: string }
  | { type: 'question-done'; id: string; question: string; sourceFile?: string }
  | { type: 'feedback-start'; id: string; question: string }
  | { type: 'feedback-delta'; id: string; text: string }
  | { type: 'feedback-done'; id: string; fullText: string }
  | { type: 'reference-start'; id: string; question: string }
  | { type: 'reference-delta'; id: string; text: string }
  | { type: 'reference-done'; id: string; fullText: string }
  | { type: 'error'; id: string; phase: 'question' | 'feedback' | 'reference'; error: string }

export interface TrainingEvents {
  onEvent: (event: TrainingEvent) => void
}

export interface TrainingDeps {
  llm?: Pick<LocalLlm, 'stream' | 'abort'>
  rag?: RagRetriever
  /** Corpus-backed question source; injected by tests. */
  bank?: QuestionBank
}

/** Corpus domains the interviewer rotates through. */
const TOPICS = [
  'RAG и retrieval (чанкинг, гибридный поиск, reranking, оценка качества)',
  'LLM и архитектура моделей (attention, токенизация, контекстное окно)',
  'AI-агенты и tool calling (планирование, память, надёжность циклов)',
  'MCP и интеграции агентов (протоколы, безопасность инструментов)',
  'Инференс и оптимизация (квантизация, batching, speculative decoding)',
  'Serving и production-инфраструктура LLM (масштабирование, latency, cost)',
  'System design AI-систем (архитектурные компромиссы, отказоустойчивость)',
  'Оценка качества и наблюдаемость LLM-приложений (evals, LLMOps)',
  'Python backend (асинхронность, типизация, работа с данными)',
]

const MAX_ASKED_HISTORY = 12

const QUESTION_ID_PREFIX = 'training-question-'
const FEEDBACK_ID_PREFIX = 'training-feedback-'
const REFERENCE_ID_PREFIX = 'training-reference-'

/**
 * Where the Markdown corpus lives. `data/` sits beside the packaged app in
 * development and is copied into resources when packaged, mirroring how the
 * other editable resource files are found.
 */
function corpusDataDir(): string {
  const override = process.env.ANSWERLINE_CORPUS_DIR?.trim()
  if (override) return override
  return process.resourcesPath ? join(process.resourcesPath, 'data') : join(process.cwd(), 'data')
}

/**
 * Self-contained practice loop, enabled only by ANSWERLINE_TRAINING_MODE in .env.
 * The AI plays the interviewer, the candidate answers (voice or typed), and
 * the AI grades the answer against retrieved corpus evidence. Interview
 * pipelines are not touched: when the env flag is off, nothing here runs.
 */
export class TrainingSession {
  private readonly llm: Pick<LocalLlm, 'stream' | 'abort'>
  private readonly rag: RagRetriever
  private readonly bank: QuestionBank
  private readonly interviewerPrompt: string
  private readonly feedbackPrompt: string
  private readonly referencePrompt: string
  private currentQuestion: string | null = null
  private readonly askedQuestions: string[] = []
  private generation = 0

  constructor(
    private readonly events: TrainingEvents,
    deps: TrainingDeps = {},
  ) {
    this.llm = deps.llm ?? new LocalLlm()
    this.rag = deps.rag ?? new LocalRag()
    // A missing corpus is a degraded session, not a failure: the interviewer
    // prompt then generates questions so practice still works.
    this.bank = deps.bank ?? new QuestionBank(loadQuestionBank(corpusDataDir()))
    if (this.bank.size === 0) {
      log.warn('No corpus questions found, falling back to generated questions')
    }
    this.interviewerPrompt = TRAINING_INTERVIEWER_PROMPT.trim()
    this.feedbackPrompt = TRAINING_FEEDBACK_PROMPT.trim()
    this.referencePrompt = TRAINING_REFERENCE_ANSWER_PROMPT.trim()
  }

  get hasCurrentQuestion(): boolean {
    return this.currentQuestion !== null
  }

  /**
   * Asks the next interview question. Prefer a real corpus question, so grading
   * and the reference answer align with the text the knowledge base actually
   * answers; generate one only when no corpus is available.
   */
  async askNextQuestion(): Promise<void> {
    const generation = ++this.generation
    this.llm.abort()
    const id = `${QUESTION_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.events.onEvent({ type: 'question-start', id })

    const corpus = this.bank.pick()
    if (corpus) {
      if (generation !== this.generation) return
      this.currentQuestion = corpus.text
      this.askedQuestions.push(corpus.text)
      this.events.onEvent({ type: 'question-delta', id, text: corpus.text })
      this.events.onEvent({ type: 'question-done', id, question: corpus.text, sourceFile: corpus.sourceFile })
      return
    }

    await this.stream(generation, id, 'question', this.interviewerPrompt, [{ role: 'user', content: this.generatedQuestionTurn() }], {
      onDone: (fullText) => {
        const question = this.cleanQuestion(fullText)
        if (!question) {
          this.events.onEvent({ type: 'error', id, phase: 'question', error: 'Модель не вернула вопрос' })
          return
        }
        this.currentQuestion = question
        this.askedQuestions.push(question)
        this.events.onEvent({ type: 'question-done', id, question })
      },
    })
  }

  private generatedQuestionTurn(): string {
    const asked = this.askedQuestions.slice(-MAX_ASKED_HISTORY)
    const topic = TOPICS[this.askedQuestions.length % TOPICS.length]
    return [
      `Тема: ${topic}`,
      asked.length > 0 ? `Уже спрашивалось (не повторяй):\n${asked.map((item) => `- ${item}`).join('\n')}` : 'Это первый вопрос.',
    ].join('\n\n')
  }

  /**
   * Grades the candidate's answer against retrieved evidence for the current
   * question. Retrieval failure degrades to evidence-free grading instead of
   * blocking practice, and the feedback prompt is told evidence is absent so
   * the model cannot dress up guesses as corpus facts.
   */
  async submitAnswer(answer: string): Promise<void> {
    const generation = ++this.generation
    this.llm.abort()
    const question = this.currentQuestion
    if (!question) {
      this.events.onEvent({
        type: 'error',
        id: `${FEEDBACK_ID_PREFIX}${Date.now()}`,
        phase: 'feedback',
        error: 'Сначала получите вопрос — оценивать нечего',
      })
      return
    }

    const id = `${FEEDBACK_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const cleanAnswer = stripUntrusted(answer).trim()
    if (!cleanAnswer) {
      this.events.onEvent({ type: 'error', id, phase: 'feedback', error: 'Пустой ответ' })
      return
    }
    this.events.onEvent({ type: 'feedback-start', id, question })

    let evidence: string | null = null
    try {
      const context = await this.rag.retrieve(question)
      evidence = context.text || null
    } catch (error) {
      log.warn('Retrieval unavailable, grading without evidence:', error instanceof Error ? error.message : error)
    }

    if (generation !== this.generation) return

    const referenceBlock = evidence
      ? `<reference_materials>\n${stripUntrusted(evidence)}\n</reference_materials>`
      : 'Эталонные материалы из базы недоступны. Отмечай только очевидные технические ошибки и пробелы; не утверждай факты, в которых не уверен.'

    const userTurn = [
      `<question>\n${stripUntrusted(question)}\n</question>`,
      `<candidate_answer>\n${cleanAnswer}\n</candidate_answer>`,
      referenceBlock,
    ].join('\n\n')

    await this.stream(generation, id, 'feedback', this.feedbackPrompt, [{ role: 'user', content: userTurn }], {})
  }

  /**
   * Reveals a model-written answer to the current question, grounded in the same
   * retrieved corpus evidence the grading path uses. This is a study aid, not a
   * ground truth: the corpus is a curated study base, so the model is told
   * explicitly when retrieval came back empty instead of being allowed to imply
   * the answer came from the base.
   */
  async revealReferenceAnswer(): Promise<void> {
    const generation = ++this.generation
    this.llm.abort()
    const question = this.currentQuestion
    if (!question) {
      this.events.onEvent({
        type: 'error',
        id: `${REFERENCE_ID_PREFIX}${Date.now()}`,
        phase: 'reference',
        error: 'Сначала получите вопрос — отвечать не на что',
      })
      return
    }

    const id = `${REFERENCE_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.events.onEvent({ type: 'reference-start', id, question })

    let evidence: string | null = null
    try {
      const context = await this.rag.retrieve(question)
      evidence = context.text || null
    } catch (error) {
      log.warn('Retrieval unavailable, reference answer without evidence:', error instanceof Error ? error.message : error)
    }

    if (generation !== this.generation) return

    const referenceBlock = evidence
      ? `<reference_materials>\n${stripUntrusted(evidence)}\n</reference_materials>`
      : 'Эталонные материалы из базы недоступны. Скажи это прямо в первом предложении и отдели своё понимание от фактов.'

    const userTurn = [`<question>\n${stripUntrusted(question)}\n</question>`, referenceBlock].join('\n\n')

    await this.stream(generation, id, 'reference', this.referencePrompt, [{ role: 'user', content: userTurn }], {})
  }

  reset(): void {
    this.generation += 1
    this.llm.abort()
    this.currentQuestion = null
    this.askedQuestions.length = 0
    this.bank.reset()
  }

  stop(): void {
    this.generation += 1
    this.llm.abort()
  }

  private cleanQuestion(text: string): string {
    return stripUntrusted(text).trim().replace(/^["«]+|["»]+$/gu, '').trim()
  }

  private async stream(
    generation: number,
    id: string,
    phase: 'question' | 'feedback' | 'reference',
    system: string,
    messages: ChatTurn[],
    extra: { onDone?: (fullText: string) => void },
  ): Promise<void> {
    try {
      await this.llm.stream(system, messages, {
        onDelta: (text) => {
          if (generation !== this.generation) return
          this.events.onEvent(
            phase === 'question'
              ? { type: 'question-delta', id, text }
              : phase === 'reference'
                ? { type: 'reference-delta', id, text }
                : { type: 'feedback-delta', id, text },
          )
        },
        onDone: (fullText) => {
          if (generation !== this.generation) return
          extra.onDone?.(fullText)
          if (phase === 'feedback') this.events.onEvent({ type: 'feedback-done', id, fullText })
          if (phase === 'reference') this.events.onEvent({ type: 'reference-done', id, fullText })
        },
        onError: (message) => {
          if (generation !== this.generation) return
          this.events.onEvent({ type: 'error', id, phase, error: message })
        },
      })
    } catch (error) {
      if (generation !== this.generation) return
      // stream() rejects only on transport-level failures before the response;
      // mid-stream errors arrive through onError.
      const message = error instanceof Error ? error.message : String(error)
      if (/abort/iu.test(message)) return
      log.error(`Training ${phase} failed:`, message)
      this.events.onEvent({ type: 'error', id, phase, error: message })
    }
  }
}
