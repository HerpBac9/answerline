import { BrowserWindow, ipcMain, type IpcMainEvent, type WebContents } from 'electron'

/**
 * Channel names shared with the preload bridge.
 *
 * Main -> renderer is one-way and push-only; renderer -> main is a small set of
 * commands. There is no generic "get/set anything" channel, so the renderer
 * cannot reach state it has no business touching.
 */
export const CHANNELS = {
  // main -> renderer
  status: 'status',
  transcript: 'transcript',
  answer: 'answer',
  training: 'training',
  // renderer -> main
  toggleCapture: 'toggle-capture',
  ask: 'ask',
  stopAnswer: 'stop-answer',
  clearSession: 'clear-session',
  toggleCaptureExclusion: 'toggle-capture-exclusion',
  toggleAnswerFromMic: 'toggle-answer-from-mic',
  minimizeWindow: 'minimize-window',
  closeWindow: 'close-window',
  // Training mode (ANSWERLINE_TRAINING_MODE). Registered only when the flag is on,
  // so the regular app never exposes these channels at all.
  trainingNextQuestion: 'training-next-question',
  trainingSubmitAnswer: 'training-submit-answer',
  trainingRevealAnswer: 'training-reveal-answer',
  // macOS renderer -> main. These are purpose-specific rather than a generic
  // raw-IPC bridge: the renderer can submit only bounded 16 kHz PCM chunks.
  macAudioReady: 'mac-audio-ready',
  macAudioChunk: 'mac-audio-chunk',
  macAudioStopped: 'mac-audio-stopped',
  macAudioFailed: 'mac-audio-failed',
  macAudioEnded: 'mac-audio-ended',
  macAudioStartRequested: 'mac-audio-start-requested',
} as const

export type Speaker = 'me' | 'interviewer'

export interface TranscriptEvent {
  id: string
  speaker: Speaker
  text: string
  isFinal: boolean
  timestamp: number
}

export type StatusEvent = {
  capturing: boolean
  paused: boolean
  stage: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'answering' | 'error'
  detail?: string
  captureExcluded?: boolean
  /** True when your own microphone questions also trigger answers (testing). */
  answerFromMic?: boolean
  /** The only capture implementation appropriate to the current platform. */
  audioCaptureBackend: 'windows-native' | 'macos-native' | 'unsupported'
  /** Practice loop (AI plays the interviewer). Exists only with ANSWERLINE_TRAINING_MODE. */
  trainingMode?: boolean
}

export type AnswerEvent =
  | { type: 'start'; id: string; question: string }
  | { type: 'delta'; id: string; text: string }
  | { type: 'done'; id: string; fullText: string; ttftMs: number | null; tokensPerSecond: number | null }
  | { type: 'error'; id: string; error: string }

export interface RendererCommands {
  onToggleCapture: () => void | Promise<void>
  onAsk: (question: string) => void | Promise<void>
  onStopAnswer: () => void
  onClearSession: () => void
  onToggleCaptureExclusion: () => void
  onToggleAnswerFromMic: () => void
  onMinimizeWindow: () => void
  onCloseWindow: () => void
  onMacAudioReady: (micAvailable: boolean) => void | Promise<void>
  onMacAudioChunk: (source: 'mic', pcm: Buffer) => void
  onMacAudioStopped: () => void | Promise<void>
  onMacAudioFailed: (message: string) => void | Promise<void>
  /** Reject IPC originating from any WebContents other than the overlay. */
  isTrustedRenderer: (contents: WebContents) => boolean
  /** Present only in training mode (ANSWERLINE_TRAINING_MODE=1); otherwise no
   * training channels are registered, so the renderer cannot reach the loop. */
  training?: {
    onNextQuestion: () => void | Promise<void>
    onSubmitAnswer: (answer: string) => void | Promise<void>
    onRevealAnswer: () => void | Promise<void>
  }
}

export function registerCommandHandlers(commands: RendererCommands): void {
  const isTrusted = (event: Pick<IpcMainEvent, 'sender'>): boolean => commands.isTrustedRenderer(event.sender)

  ipcMain.handle(CHANNELS.toggleCapture, (event) => {
    if (!isTrusted(event)) return
    return commands.onToggleCapture()
  })
  ipcMain.handle(CHANNELS.ask, (event, question: unknown) => {
    if (!isTrusted(event)) return
    // Renderer input is still input: validate rather than trust the type.
    if (typeof question !== 'string' || !question.trim()) return
    return commands.onAsk(question.trim().slice(0, 4_000))
  })
  ipcMain.handle(CHANNELS.stopAnswer, (event) => {
    if (isTrusted(event)) commands.onStopAnswer()
  })
  ipcMain.handle(CHANNELS.clearSession, (event) => {
    if (isTrusted(event)) commands.onClearSession()
  })
  ipcMain.handle(CHANNELS.toggleCaptureExclusion, (event) => {
    if (isTrusted(event)) commands.onToggleCaptureExclusion()
  })
  ipcMain.handle(CHANNELS.toggleAnswerFromMic, (event) => {
    if (isTrusted(event)) commands.onToggleAnswerFromMic()
  })
  ipcMain.handle(CHANNELS.minimizeWindow, (event) => {
    if (isTrusted(event)) commands.onMinimizeWindow()
  })
  ipcMain.handle(CHANNELS.closeWindow, (event) => {
    if (isTrusted(event)) commands.onCloseWindow()
  })

  // Training channels exist only when the caller registered handlers for them,
  // which happens exclusively under ANSWERLINE_TRAINING_MODE=1.
  const training = commands.training
  if (training) {
    ipcMain.handle(CHANNELS.trainingNextQuestion, (event) => {
      if (isTrusted(event)) return training.onNextQuestion()
    })
    ipcMain.handle(CHANNELS.trainingSubmitAnswer, (event, answer: unknown) => {
      if (!isTrusted(event)) return
      if (typeof answer !== 'string' || !answer.trim()) return
      return training.onSubmitAnswer(answer.trim().slice(0, 8_000))
    })
    ipcMain.handle(CHANNELS.trainingRevealAnswer, (event) => {
      if (isTrusted(event)) return training.onRevealAnswer()
    })
  }

  ipcMain.handle(CHANNELS.macAudioReady, (event, micAvailable: unknown) => {
    if (!isTrusted(event) || typeof micAvailable !== 'boolean') return
    return commands.onMacAudioReady(micAvailable)
  })
  ipcMain.on(CHANNELS.macAudioChunk, (event, source: unknown, pcm: unknown) => {
    if (!isTrusted(event) || source !== 'mic') return
    const audio = boundedPcm(pcm)
    if (audio) commands.onMacAudioChunk(source, audio)
  })
  ipcMain.handle(CHANNELS.macAudioStopped, (event) => {
    if (!isTrusted(event)) return
    return commands.onMacAudioStopped()
  })
  ipcMain.handle(CHANNELS.macAudioFailed, (event, message: unknown) => {
    if (!isTrusted(event) || typeof message !== 'string') return
    return commands.onMacAudioFailed(message.trim().slice(0, 600))
  })
}

const MAX_PCM_CHUNK_BYTES = 64 * 1024

function boundedPcm(value: unknown): Buffer | null {
  if (!(value instanceof Uint8Array)) return null
  if (value.byteLength === 0 || value.byteLength > MAX_PCM_CHUNK_BYTES || value.byteLength % 2 !== 0) return null
  // Copy the structured-clone payload so the VAD never retains renderer-owned
  // memory; Buffer.readInt16LE also handles a non-zero byte offset safely.
  return Buffer.from(value)
}

/** Push to the window if it is still alive. */
export function createPublisher(getWindow: () => BrowserWindow | null) {
  return function publish(channel: string, payload: unknown): void {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(channel, payload)
  }
}
