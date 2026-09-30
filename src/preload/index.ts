import { contextBridge, ipcRenderer } from 'electron'

/**
 * The only surface the renderer gets. No `ipcRenderer` passthrough, no generic
 * invoke: each command is named, and every subscription returns its own
 * unsubscribe so React effects cannot leak listeners across hot reloads.
 */
const api = {
  toggleCapture: () => ipcRenderer.invoke('toggle-capture'),
  ask: (question: string) => ipcRenderer.invoke('ask', question),
  stopAnswer: () => ipcRenderer.invoke('stop-answer'),
  clearSession: () => ipcRenderer.invoke('clear-session'),
  toggleCaptureExclusion: () => ipcRenderer.invoke('toggle-capture-exclusion'),
  toggleAnswerFromMic: () => ipcRenderer.invoke('toggle-answer-from-mic'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // The native helper is started after the renderer click so microphone consent
  // remains user initiated. These are still narrow, named IPC methods: no
  // generic send/invoke or ipcRenderer object is exposed.
  macAudioReady: (micAvailable: boolean) => ipcRenderer.invoke('mac-audio-ready', micAvailable),
  sendMacAudioChunk: (source: 'mic', pcm: Uint8Array) => {
    if (pcm.byteLength === 0 || pcm.byteLength > 64 * 1024 || pcm.byteLength % 2 !== 0) return
    ipcRenderer.send('mac-audio-chunk', source, pcm)
  },
  macAudioStopped: () => ipcRenderer.invoke('mac-audio-stopped'),
  macAudioFailed: (message: string) => ipcRenderer.invoke('mac-audio-failed', message.slice(0, 600)),
  onMacAudioEnded: (handler: () => void) => subscribe('mac-audio-ended', handler),
  onMacAudioStartRequested: (handler: () => void) => subscribe('mac-audio-start-requested', handler),

  onStatus: (handler: (payload: unknown) => void) => subscribe('status', handler),
  onTranscript: (handler: (payload: unknown) => void) => subscribe('transcript', handler),
  onAnswer: (handler: (payload: unknown) => void) => subscribe('answer', handler),

  // Training mode. The main process registers these channels only when it was
  // started with ANSWERLINE_TRAINING_MODE=1; invoking them otherwise just fails.
  trainingNextQuestion: () => ipcRenderer.invoke('training-next-question'),
  trainingSubmitAnswer: (answer: string) => {
    const trimmed = answer.trim()
    if (!trimmed) return
    return ipcRenderer.invoke('training-submit-answer', trimmed.slice(0, 8_000))
  },
  trainingRevealAnswer: () => ipcRenderer.invoke('training-reveal-answer'),
  onTraining: (handler: (payload: unknown) => void) => subscribe('training', handler),
}

function subscribe(channel: string, handler: (payload: unknown) => void): () => void {
  const listener = (_event: unknown, payload: unknown) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('solo', api)

export type SoloApi = typeof api
