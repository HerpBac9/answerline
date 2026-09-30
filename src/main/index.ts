import { app, BrowserWindow } from 'electron'
import { loadDotEnv } from './core/dotenv'
import { loadConfig, configFilePath, answerFromMicEnabled, llmSettings } from './core/config'
import { createOverlayWindow } from './ui/overlayWindow'
import { applyExcludeFromCapture } from './ui/overlayStyle'
import { CHANNELS, createPublisher, registerCommandHandlers, type StatusEvent } from './app/ipc'
import { Transcriber, type CaptureChannels } from './audio/transcriber'
import { TRAINING_MAX_UTTERANCE_MS } from './audio/vad'
import { captureBackend } from './audio/audioCapture'
import { Session } from './session/session'
import { registerHotkeys, unregisterHotkeys } from './input/hotkeys'
import { createLogger } from './core/log'
import { createBenchmarkRecorder } from './app/benchmark'
import { createSessionRecorder, type SessionRecorder } from './app/sessionLog'
import { TrainingSession, trainingModeEnabled, type TrainingEvent } from './training/training'
import SYSTEM_PROMPT from '../../prompts/systemPrompt.md?raw'
import SYSTEM_PROMPT_NO_PERSONAL_EXPERIENCE from '../../prompts/systemPrompt.noPersonalExperience.md?raw'

// First statement of the module body, before anything reads process.env. Every
// consumer reads env lazily, so this is enough - see the note in log.ts about why
// module-scope env reads would break it.
loadDotEnv()

const log = createLogger('App')

let window: BrowserWindow | null = null
let transcriber: Transcriber | null = null
let session: Session | null = null
let trainingSession: TrainingSession | null = null
let sessionRecorder: SessionRecorder | null = null
// Read once: the training loop is a startup decision, not a runtime toggle,
// so the practice UI and its IPC simply do not exist without the env flag.
const trainingMode = trainingModeEnabled()

const publish = createPublisher(() => window)

let stage: StatusEvent['stage'] = 'idle'
let detail: string | undefined
let answerFromMic = false
/**
 * Live state, not the config value: the user can toggle the requested capture
 * protection at runtime. The OS and meeting client still decide whether it is
 * honoured, especially on macOS ScreenCaptureKit.
 */
let captureExcluded = false

function pushStatus(): void {
  publish(CHANNELS.status, {
    // The button must remain a stop control while Whisper or the macOS tap is
    // still starting; otherwise a second click starts a duplicate request.
    capturing: Boolean(transcriber?.isRunning || transcriber?.isStarting),
    paused: transcriber?.isPaused ?? false,
    stage,
    detail,
    captureExcluded,
    answerFromMic,
    audioCaptureBackend: captureBackend(),
    trainingMode,
  } satisfies StatusEvent)
}

function setStage(next: StatusEvent['stage'], nextDetail?: string): void {
  stage = next
  detail = nextDetail
  pushStatus()
}

function toggleAnswerFromMic(): void {
  answerFromMic = !answerFromMic
  setStage(stage, answerFromMic
    ? 'буду отвечать и на вопросы из микрофона'
    : 'отвечаю только на вопросы интервьюера')
}

async function toggleCapture(): Promise<void> {
  if (!transcriber) return

  if (transcriber.isRunning || transcriber.isStarting) {
    setStage('idle', 'останавливаю…')
    await transcriber.stop()
    if (transcriber.usesRendererAudioCapture) publish(CHANNELS.macAudioEnded, undefined)
    setStage('idle')
    return
  }

  if (transcriber.usesRendererAudioCapture) {
    setStage('transcribing', 'запрашиваю запуск macOS-захвата…')
    publish(CHANNELS.macAudioStartRequested, undefined)
    return
  }

  setStage('transcribing', 'загружаю модель Whisper…')
  try {
    const start = transcriber.start()
    pushStatus()
    const channels = await start
    setCaptureStartedStatus(channels)
  } catch (error) {
    log.error('Could not start capture:', error)
    setStage('error', error instanceof Error ? error.message : String(error))
  }
}

function setCaptureStartedStatus(channels: CaptureChannels): void {
  if (!channels.system) {
    setStage('error', 'Системный звук не захватывается — вопросы интервьюера не будут распознаны')
  } else if (!channels.mic) {
    setStage('listening', 'Микрофон не захватывается — ваши реплики не попадут в контекст')
  } else {
    setStage('listening')
  }
}

// Only one instance may hold the audio devices and the global hotkeys.
if (!app.requestSingleInstanceLock()) {
  // Said out loud: quitting silently here looks identical to a crash from a
  // terminal, and a stale instance is easy to end up with.
  log.warn('Another instance already holds the audio devices and hotkeys - focusing it and exiting')
  app.quit()
} else {
  app.on('second-instance', () => {
    window?.show()
    window?.focus()
  })

  void app.whenReady().then(() => {
    const config = loadConfig()
    const personalTopK = nonNegativeIntegerEnv('RAG_PERSONAL_TOP_K', config.ragPersonalTopK)
    answerFromMic = answerFromMicEnabled()
    log.info(`config: ${configFilePath()}`)
    const benchmark = createBenchmarkRecorder(app.getPath('userData'))
    const llm = llmSettings()
    sessionRecorder = createSessionRecorder(app.getPath('userData'), {
      systemPrompt: (personalTopK === 0 ? SYSTEM_PROMPT_NO_PERSONAL_EXPERIENCE : SYSTEM_PROMPT).trim(),
      llmModel: llm.model,
      embeddingModel: process.env.EMBEDDING_MODEL?.trim() || config.ragEmbeddingModel,
      collection: process.env.QDRANT_COLLECTION?.trim() || config.ragCollection,
      personalTopK,
      generalTopK: positiveIntegerEnv('RAG_GENERAL_TOP_K', config.ragGeneralTopK),
      maxContextTokens: positiveIntegerEnv('RAG_MAX_CONTEXT_TOKENS', config.ragMaxContextTokens),
    })

    window = createOverlayWindow()
    captureExcluded = config.excludeFromCapture

    session = new Session({
      onAnswerStart: (id, question) => publish(CHANNELS.answer, { type: 'start', id, question }),
      onAnswerDelta: (id, text) => publish(CHANNELS.answer, { type: 'delta', id, text }),
      onAnswerDone: (id, fullText, metrics) => publish(CHANNELS.answer, { type: 'done', id, fullText, ...metrics }),
      onAnswerError: (id, error) => publish(CHANNELS.answer, { type: 'error', id, error }),
      onAnswerMetric: (metric) => benchmark.record(metric),
      onAnswerTrace: (trace) => sessionRecorder?.recordTurn(trace),
      onReset: () => sessionRecorder?.recordReset(),
      onStage: (next) => {
        // While answering, the answer stage wins; otherwise fall back to whatever
        // the capture side is doing.
        if (next === 'idle') setStage(transcriber?.isRunning ? 'listening' : 'idle')
        else setStage(next)
      },
    }, {
      // Read per utterance so ANSWERLINE_ANSWER_FROM_MIC or a config edit takes effect
      // without restarting the app.
      answerFromMic: () => answerFromMic,
      personalTopK,
    })

    if (trainingMode) {
      const training = new TrainingSession({
        onEvent: (event: TrainingEvent) => {
          publish(CHANNELS.training, event)
          // The interview Session drives the same stage through its own events;
          // training borrows the labels so the header badge stays truthful.
          if (event.type === 'question-start' || event.type === 'feedback-start' || event.type === 'reference-start') setStage('thinking')
          else if (event.type === 'question-done' || event.type === 'feedback-done' || event.type === 'reference-done') {
            setStage(transcriber?.isRunning ? 'listening' : 'idle')
          }
        },
      })
      trainingSession = training
      log.info('Training mode is active (ANSWERLINE_TRAINING_MODE=1): the AI interviews you')
    }

    transcriber = new Transcriber({
      onUtterance: (utterance) => {
        publish(CHANNELS.transcript, utterance)
        // In training mode your own final utterances become the answer draft,
        // not interview context; the interviewer pipeline stays untouched.
        if (!trainingMode) session?.handleUtterance(utterance)
      },
      onStateChange: ({ transcribing }) => {
        // Never overwrite an in-flight answer or a visible error with STT state.
        if (stage === 'listening' || stage === 'transcribing') {
          setStage(transcribing ? 'transcribing' : 'listening')
        }
      },
      onError: (message) => setStage('error', message),
      onRendererCaptureEnded: () => publish(CHANNELS.macAudioEnded, undefined),
      // Only the mic is stretched. In an interview a question must be answered
      // as soon as the interviewer pauses, so the system channel keeps the short
      // limit; in training the mic carries the whole spoken answer to grade.
      ...(trainingMode ? { maxUtteranceMs: { mic: TRAINING_MAX_UTTERANCE_MS } } : {}),
    })

    // A const capture lets TS narrow the nullable module variable inside the
    // IPC closures below.
    const activeTraining = trainingSession

    registerCommandHandlers({
      onToggleCapture: toggleCapture,
      onAsk: (question) => session?.ask(question),
      onStopAnswer: () => {
        trainingSession?.stop()
        session?.stopAnswer()
      },
      onClearSession: () => {
        session?.reset()
        trainingSession?.reset()
        pushStatus()
      },
      // In interview mode this field stays undefined, so the training IPC
      // channels are never registered at all.
      training: activeTraining
        ? {
            onNextQuestion: () => activeTraining.askNextQuestion(),
            onSubmitAnswer: (answer) => activeTraining.submitAnswer(answer),
            onRevealAnswer: () => activeTraining.revealReferenceAnswer(),
          }
        : undefined,
      onMinimizeWindow: () => window?.minimize(),
      onCloseWindow: () => window?.close(),
      onToggleCaptureExclusion: () => {
        if (!window) return
        const next = !captureExcluded
        if (applyExcludeFromCapture(window, next)) {
          captureExcluded = next
          setStage(stage, next
            ? 'защита окна от захвата запрошена (best effort)'
            : 'защита окна от захвата выключена')
        } else {
          setStage(stage, 'не удалось переключить скрытие от захвата')
        }
      },
      onToggleAnswerFromMic: toggleAnswerFromMic,
      onMacAudioReady: async (micAvailable) => {
        if (!transcriber?.usesRendererAudioCapture) {
          throw new Error('macOS renderer capture is not available in this runtime')
        }
        setStage('transcribing', 'загружаю модель Whisper…')
        try {
          const start = transcriber.startRendererCapture(micAvailable)
          pushStatus()
          const started = await start
          setCaptureStartedStatus(started)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          setStage('error', message)
          throw error
        }
      },
      onMacAudioChunk: (source, pcm) => transcriber?.pushRendererAudio(pcm, source),
      onMacAudioStopped: async () => {
        if (!transcriber?.usesRendererAudioCapture) return
        setStage('idle', 'останавливаю…')
        await transcriber.stop()
        setStage('idle')
      },
      onMacAudioFailed: async (message) => {
        if (transcriber?.usesRendererAudioCapture) await transcriber.stop()
        setStage('error', message || 'macOS не смогла начать захват звука')
      },
      isTrustedRenderer: (contents) => contents === window?.webContents,
    })

    const failed = registerHotkeys({
      onToggleWindow: () => {
        if (!window) return
        if (window.isVisible()) window.hide()
        else { window.show(); window.focus() }
      },
      onTogglePause: () => {
        if (!transcriber?.isRunning) return
        transcriber.setPaused(!transcriber.isPaused)
        setStage(transcriber.isPaused ? 'idle' : 'listening', transcriber.isPaused ? 'пауза' : undefined)
      },
      onAskLastUtterance: () => {
        if (trainingMode) {
          // Practice loop has no interviewer utterances; the hotkey asks for
          // the next training question instead.
          void trainingSession?.askNextQuestion()
          return
        }
        const last = session?.lastInterviewerUtterance()
        // The fallback for when the question gate did not fire, which is the
        // whole reason it is allowed to be conservative.
        if (last) void session?.ask(last)
        else setStage(stage, 'нет реплики интервьюера, которую можно отправить')
      },
    })
    if (failed.length > 0) {
      setStage(stage, `горячие клавиши заняты другим приложением: ${failed.join(', ')}`)
    }

    window.webContents.once('did-finish-load', () => pushStatus())
    log.info(`Ready. Hotkeys: ${Object.values(config.hotkeys).join(', ')}`)
    log.info(
      answerFromMic
        ? 'Answering questions from BOTH the microphone and the loopback channel (testing mode)'
        : 'Answering questions from the loopback channel only; your microphone is context',
    )
  })

  app.on('will-quit', () => unregisterHotkeys())

  // Whisper holds ~570MB of VRAM and a port; it must not outlive the app.
  app.on('before-quit', (event) => {
    sessionRecorder?.close()
    if (!transcriber || (!transcriber.isRunning && !transcriber.isStarting)) return
    event.preventDefault()
    void transcriber.stop().finally(() => app.quit())
  })

  app.on('window-all-closed', () => app.quit())
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function nonNegativeIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isInteger(value) && value >= 0 ? value : fallback
}
