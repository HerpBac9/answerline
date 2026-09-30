import { useEffect, useRef, useState } from 'react'
import type { AnswerEvent, StatusEvent, TrainingEvent, TranscriptEvent } from './types'
import { macosAudioCapture } from './macosAudioCapture'
import { stableAnswerPrefix } from './answerDisplay'

const STAGE_LABEL: Record<StatusEvent['stage'], string> = {
  idle: 'готов',
  listening: 'слушаю',
  transcribing: 'распознаю',
  thinking: 'думаю',
  answering: 'отвечаю',
  error: 'ошибка',
}

interface Answer {
  id: string
  question: string
  rawText: string
  error?: string
  done: boolean
  ttftMs: number | null
  tokensPerSecond: number | null
}

interface TrainingState {
  questionId: string | null
  /** Current question text; while streaming it grows from deltas. */
  question: string
  questionDone: boolean
  /** Corpus file the question came from, so the domain is visible. */
  questionSource: string | null
  feedbackId: string | null
  feedback: string
  feedbackDone: boolean
  referenceId: string | null
  /** Model-written answer to the current question, revealed on request. */
  reference: string
  referenceDone: boolean
  error: string | null
}

const EMPTY_TRAINING: TrainingState = {
  questionId: null,
  question: '',
  questionDone: false,
  questionSource: null,
  feedbackId: null,
  feedback: '',
  feedbackDone: false,
  referenceId: null,
  reference: '',
  referenceDone: false,
  error: null,
}

export function App() {
  const [status, setStatus] = useState<StatusEvent>({
    capturing: false,
    paused: false,
    stage: 'idle',
    audioCaptureBackend: 'unsupported',
  })
  const [transcript, setTranscript] = useState<TranscriptEvent[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [draft, setDraft] = useState('')
  const [training, setTraining] = useState<TrainingState>(EMPTY_TRAINING)
  const [trainingDraft, setTrainingDraft] = useState('')
  const trainingMode = status.trainingMode === true
  // The transcript subscription has an empty dependency array; a ref keeps the
  // voice-answer routing correct even when the status event arrives later.
  const trainingModeRef = useRef(false)

  useEffect(() => {
    trainingModeRef.current = trainingMode
  }, [trainingMode])

  useEffect(() => {
    const offStatus = window.solo.onStatus((payload) => setStatus(payload as StatusEvent))
    const offMacAudioEnded = window.solo.onMacAudioEnded(() => { void macosAudioCapture.stopFromMain() })
    const offMacAudioStartRequested = window.solo.onMacAudioStartRequested(() => { void macosAudioCapture.start() })

    const offTranscript = window.solo.onTranscript((payload) => {
      const entry = payload as TranscriptEvent
      setTranscript((current) => {
        // One interim line per speaker, replaced in place until it is finalised.
        const withoutInterim = current.filter((item) => item.isFinal || item.speaker !== entry.speaker)
        return [...withoutInterim, entry].slice(-200)
      })
      // In training mode your spoken answers accumulate into the answer box so
      // a whole spoken reply can be sent for grading in one action.
      if (trainingModeRef.current && entry.speaker === 'me' && entry.isFinal) {
        setTrainingDraft((current) => (current ? `${current} ${entry.text}` : entry.text))
      }
    })

    const offAnswer = window.solo.onAnswer((payload) => {
      const event = payload as AnswerEvent
      setAnswers((current) => {
        switch (event.type) {
          case 'start':
            return [...current, {
              id: event.id,
              question: event.question,
              rawText: '',
              done: false,
              ttftMs: null,
              tokensPerSecond: null,
            }].slice(-30)
          case 'delta':
            return current.map((answer) => answer.id === event.id ? { ...answer, rawText: answer.rawText + event.text } : answer)
          case 'done':
            return current.map((answer) => answer.id === event.id ? {
              ...answer,
              rawText: event.fullText,
              done: true,
              ttftMs: event.ttftMs,
              tokensPerSecond: event.tokensPerSecond,
            } : answer)
          case 'error':
            return current.map((answer) => answer.id === event.id ? { ...answer, error: event.error, done: true } : answer)
        }
      })
    })

    const offTraining = window.solo.onTraining((payload) => {
      const event = payload as TrainingEvent
      setTraining((current) => {
        switch (event.type) {
          case 'question-start':
            return { ...EMPTY_TRAINING, questionId: event.id }
          case 'question-delta':
            return current.questionId === event.id ? { ...current, question: current.question + event.text } : current
          case 'question-done':
            return current.questionId === event.id
              ? { ...current, question: event.question, questionDone: true, questionSource: event.sourceFile ?? null }
              : current
          case 'feedback-start':
            return { ...current, feedbackId: event.id, feedback: '', feedbackDone: false, error: null }
          case 'feedback-delta':
            return current.feedbackId === event.id ? { ...current, feedback: current.feedback + event.text } : current
          case 'feedback-done':
            return current.feedbackId === event.id ? { ...current, feedback: event.fullText, feedbackDone: true } : current
          case 'reference-start':
            return { ...current, referenceId: event.id, reference: '', referenceDone: false, error: null }
          case 'reference-delta':
            return current.referenceId === event.id ? { ...current, reference: current.reference + event.text } : current
          case 'reference-done':
            return current.referenceId === event.id ? { ...current, reference: event.fullText, referenceDone: true } : current
          case 'error': {
            const label = event.phase === 'question' ? 'Вопрос' : event.phase === 'reference' ? 'Эталонный ответ' : 'Оценка'
            return { ...current, error: `${label}: ${event.error}` }
          }
        }
      })
    })

    return () => { offStatus(); offMacAudioEnded(); offMacAudioStartRequested(); offTranscript(); offAnswer(); offTraining() }
  }, [])

  return (
    <div className="app">
      <Header
        status={status}
        onToggleCapture={() => {
          if (status.audioCaptureBackend === 'macos-native') {
            return status.capturing ? macosAudioCapture.stop() : macosAudioCapture.start()
          }
          return window.solo.toggleCapture()
        }}
        onClearSession={() => {
          void window.solo.clearSession()
          setTraining(EMPTY_TRAINING)
          setTrainingDraft('')
        }}
      />
      <div className="columns">
        <Transcript entries={transcript} isMacCapture={status.audioCaptureBackend === 'macos-native'} />
        {trainingMode
          ? <TrainingPane
              training={training}
              draft={trainingDraft}
              setDraft={setTrainingDraft}
              busy={!training.questionDone && training.questionId !== null}
              hasQuestion={training.questionDone}
              referenceBusy={!training.referenceDone && training.referenceId !== null}
              onAsk={() => void window.solo.trainingNextQuestion()}
              onReveal={() => void window.solo.trainingRevealAnswer()}
              onSubmit={() => {
                const answer = trainingDraft.trim()
                if (!answer) return
                setTrainingDraft('')
                void window.solo.trainingSubmitAnswer(answer)
              }}
              onStop={() => void window.solo.stopAnswer()}
            />
          : <Answers answers={answers} />}
      </div>
      {!trainingMode && (
        <Composer
          draft={draft}
          setDraft={setDraft}
          onSend={() => {
            const question = draft.trim()
            if (!question) return
            setDraft('')
            void window.solo.ask(question)
          }}
        />
      )}
    </div>
  )
}

function TrainingPane({
  training,
  draft,
  setDraft,
  busy,
  hasQuestion,
  referenceBusy,
  onAsk,
  onSubmit,
  onStop,
  onReveal,
}: {
  training: TrainingState
  draft: string
  setDraft: (value: string) => void
  busy: boolean
  hasQuestion: boolean
  referenceBusy: boolean
  onAsk: () => void
  onSubmit: () => void
  onStop: () => void
  onReveal: () => void
}) {
  return (
    <section className="pane">
      <h2>Тренировка</h2>
      {!training.questionId && <p className="empty">Нажмите «Новый вопрос» — ИИ задаст вопрос и оценит ваш ответ.</p>}

      {training.question && (
        <article className="answer">
          <p className="question">{training.question}</p>
          {training.questionSource && <p className="reference-label">{training.questionSource}</p>}
        </article>
      )}

      {training.feedback && (
        <article className="answer">
          <p className="body">{training.feedbackDone ? training.feedback : training.feedback}</p>
        </article>
      )}

      {training.reference && (
        <article className="answer reference">
          <p className="reference-label">Эталонный ответ</p>
          <p className="body">{training.reference}</p>
        </article>
      )}
      {training.error && <p className="error">{training.error}</p>}

      <div className="composer">
        <textarea
          value={draft}
          rows={3}
          placeholder="Ответьте голосом или напишите ответ здесь…  (Enter — отправить, Escape — прервать генерацию)"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
            if (event.key === 'Escape') onStop()
          }}
        />
        <div className="training-actions">
          <button className="btn btn-send" onClick={onAsk} disabled={busy}>
            {training.questionId ? 'Новый вопрос' : 'Новый вопрос'}
          </button>
          <button
            className="btn btn-send"
            onClick={onSubmit}
            disabled={!hasQuestion || !draft.trim()}
            title={hasQuestion ? 'Отправить ответ на оценку' : 'Сначала получите вопрос'}
          >
            Оценить ответ
          </button>
          <button
            className="btn"
            onClick={onReveal}
            disabled={!hasQuestion || referenceBusy}
            title={hasQuestion ? 'Показать эталонный ответ на этот вопрос' : 'Сначала получите вопрос'}
          >
            Показать ответ
          </button>
        </div>
      </div>
    </section>
  )
}

function Header({ status, onToggleCapture, onClearSession }: { status: StatusEvent; onToggleCapture: () => Promise<void>; onClearSession: () => void }) {
  return (
    <header className="header">
      <div className="header-row">
        <button
          className={status.capturing ? 'btn btn-stop' : 'btn btn-start'}
          onClick={() => void onToggleCapture()}
        >
          {status.capturing ? 'Стоп' : 'Слушать'}
        </button>
        <span className={`stage stage-${status.stage}`}>
          <i className="dot" /> {STAGE_LABEL[status.stage]}
        </span>
        <span className="spacer" />
        <button className="btn btn-ghost" title="Забыть текущую сессию" onClick={onClearSession}>
          сброс
        </button>
        <div className="window-controls" aria-label="Управление окном">
          <button
            className="btn btn-window"
            title="Свернуть"
            aria-label="Свернуть"
            onClick={() => void window.solo.minimizeWindow()}
          >
            <span className="window-icon window-icon-minimize" aria-hidden="true" />
          </button>
          <button
            className="btn btn-window btn-window-close"
            title="Закрыть"
            aria-label="Закрыть"
            onClick={() => void window.solo.closeWindow()}
          >
            <span className="window-icon window-icon-close" aria-hidden="true" />
          </button>
        </div>
      </div>
      {status.detail && <p className="detail">{status.detail}</p>}

      <div className="header-row header-row-secondary">
        {/* The requested OS mode is spelled out rather than implied by an icon.
            Electron does not certify the actual result for a meeting client. */}
        <button
          className={`btn btn-toggle ${status.captureExcluded ? 'btn-toggle-on' : ''}`}
          onClick={() => void window.solo.toggleCaptureExclusion()}
          title="Скрытие окна от захвата экрана и скриншотов"
        >
          {status.captureExcluded ? '🙈 защита от захвата запрошена' : '👁 защита выключена'}
        </button>
        <button
          className={`btn btn-toggle ${status.answerFromMic ? 'btn-toggle-on' : ''}`}
          onClick={() => void window.solo.toggleAnswerFromMic()}
          title="Переключить ответы на вопросы, сказанные в микрофон"
        >
          {status.answerFromMic ? '🎙️ отвечает и на микрофон' : '🎙️ не отвечает на микрофон'}
        </button>
      </div>

      {/* Never implied, always stated: best effort, needs verifying against the
          specific meeting app. */}
      <p className="capture-note">
        {status.captureExcluded
          ? 'best effort — проверьте в своём Zoom/Teams реальным звонком; macOS ScreenCaptureKit может всё равно показать окно'
          : 'окно попадёт в демонстрацию экрана и в скриншоты'}
      </p>
    </header>
  )
}

function Transcript({ entries, isMacCapture }: { entries: TranscriptEvent[]; isMacCapture: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [entries.length])

  return (
    <section className="pane">
      <h2>Разговор</h2>
      {entries.length === 0 && (
        <p className="empty">
          {isMacCapture
            ? 'Нажмите «Слушать» и разрешите macOS микрофон и System Audio Recording. Экран не записывается: микрофон — вы, системный звук — интервьюер.'
            : 'Нажмите «Слушать». Микрофон — вы, звук из наушников — интервьюер.'}
        </p>
      )}
      {entries.map((entry) => (
        <p key={entry.id} className={`line line-${entry.speaker}${entry.isFinal ? '' : ' interim'}`}>
          <span className="who">{entry.speaker === 'me' ? 'Я' : 'Интервьюер'}</span>
          {entry.text}
        </p>
      ))}
      <div ref={endRef} />
    </section>
  )
}

function Answers({ answers }: { answers: Answer[] }) {
  return (
    <section className="pane">
      <h2>Подсказки</h2>
      {answers.length === 0 && <p className="empty">Вопрос от интервьюера или свой запрос ниже — ответ появится здесь.</p>}
      {answers.map((answer) => (
        <article key={answer.id} className="answer">
          <p className="question">{answer.question}</p>
          {answer.error
            ? <p className="error">{answer.error}</p>
            : <>
                <p className="body">{answer.done ? answer.rawText : stableAnswerPrefix(answer.rawText)}</p>
                {answer.done && <AnswerMetrics answer={answer} />}
              </>}
        </article>
      ))}
    </section>
  )
}

function AnswerMetrics({ answer }: { answer: Answer }) {
  return (
    <p className="answer-metrics">
      до первого токена: {formatMilliseconds(answer.ttftMs)} · скорость: {formatTokensPerSecond(answer.tokensPerSecond)}
    </p>
  )
}

function formatMilliseconds(value: number | null): string {
  if (value === null) return '—'
  if (value < 1_000) return `${value} мс`
  return `${(value / 1_000).toFixed(1)} с`
}

function formatTokensPerSecond(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} токенов/с`
}

function Composer({ draft, setDraft, onSend }: { draft: string; setDraft: (value: string) => void; onSend: () => void }) {
  return (
    <div className="composer">
      <textarea
        value={draft}
        rows={2}
        placeholder="Спросить модель напрямую…  (Enter — отправить, Shift+Enter — новая строка)"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSend()
          }
          if (event.key === 'Escape') void window.solo.stopAnswer()
        }}
      />
      <button className="btn btn-send" onClick={onSend} disabled={!draft.trim()}>→</button>
    </div>
  )
}
