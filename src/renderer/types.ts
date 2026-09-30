export type Speaker = 'me' | 'interviewer'

export interface TranscriptEvent {
  id: string
  speaker: Speaker
  text: string
  isFinal: boolean
  timestamp: number
}

export interface StatusEvent {
  capturing: boolean
  paused: boolean
  stage: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'answering' | 'error'
  detail?: string
  captureExcluded?: boolean
  answerFromMic?: boolean
  audioCaptureBackend: 'windows-native' | 'macos-native' | 'unsupported'
  /** Practice loop exists only when the app was started with ANSWERLINE_TRAINING_MODE=1. */
  trainingMode?: boolean
}

export type AnswerEvent =
  | { type: 'start'; id: string; question: string }
  | { type: 'delta'; id: string; text: string }
  | { type: 'done'; id: string; fullText: string; ttftMs: number | null; tokensPerSecond: number | null }
  | { type: 'error'; id: string; error: string }

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

export interface SoloApi {
  toggleCapture: () => Promise<void>
  ask: (question: string) => Promise<void>
  stopAnswer: () => Promise<void>
  clearSession: () => Promise<void>
  toggleCaptureExclusion: () => Promise<void>
  toggleAnswerFromMic: () => Promise<void>
  minimizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  macAudioReady: (micAvailable: boolean) => Promise<void>
  sendMacAudioChunk: (source: 'mic', pcm: Uint8Array) => void
  macAudioStopped: () => Promise<void>
  macAudioFailed: (message: string) => Promise<void>
  onMacAudioEnded: (handler: () => void) => () => void
  onMacAudioStartRequested: (handler: () => void) => () => void
  onStatus: (handler: (payload: unknown) => void) => () => void
  onTranscript: (handler: (payload: unknown) => void) => () => void
  onAnswer: (handler: (payload: unknown) => void) => () => void
  /** Training mode exists only when the main process enabled ANSWERLINE_TRAINING_MODE. */
  trainingNextQuestion: () => Promise<void>
  trainingSubmitAnswer: (answer: string) => Promise<void>
  trainingRevealAnswer: () => Promise<void>
  onTraining: (handler: (payload: unknown) => void) => () => void
}

declare global {
  interface Window {
    solo: SoloApi
  }
}
