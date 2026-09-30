import { loadConfig, STT_LANGUAGE } from '../core/config'
import { resolveWhisperServerPath } from '../core/platform'
import { createLogger } from '../core/log'
import { captureBackend, startCapture, stopCapture, usesRendererAudioCapture, type CaptureSource } from './audioCapture'
import { ChannelVad, toWav } from './vad'
import { WhisperServer } from './whisperServer'
import { getHallucinationFilter } from './hallucinationFilter'
import { buildDecodePrompt } from './decodePrompt'
import { macosAudioTap } from './macosAudioTap'

const log = createLogger('Transcriber')

/** A dropped final loses a whole utterance; a late partial is worthless. */
const FINAL_TIMEOUT_MS = 60_000
const PARTIAL_TIMEOUT_MS = 8_000
const STOP_DRAIN_TIMEOUT_MS = 5_000

export type Speaker = 'me' | 'interviewer'

export interface Utterance {
  id: string
  speaker: Speaker
  text: string
  isFinal: boolean
  timestamp: number
}

export interface TranscriberEvents {
  onUtterance: (utterance: Utterance) => void
  onStateChange: (state: { transcribing: boolean }) => void
  onError: (message: string) => void
  /** Notifies a renderer-owned capture that its native backend died. */
  onRendererCaptureEnded?: () => void
  /**
   * Per-channel hard limit for a single utterance. Training mode raises the mic
   * limit so one long spoken answer stays one answer to grade. See vad.ts.
   */
  maxUtteranceMs?: Partial<Record<CaptureSource, number>>
}

export interface CaptureChannels {
  system: boolean
  mic: boolean
}

/** Physical channels, so speaker attribution needs no diarisation. */
const SPEAKER_OF: Record<CaptureSource, Speaker> = { mic: 'me', system: 'interviewer' }

/**
 * Audio in, labelled text out.
 *
 * Both channels share one Whisper process. whisper-server serialises requests
 * against a single model context, so a partial on one channel can briefly delay
 * the other - acceptable, and far better than two resident models on an 8GB card.
 */
export class Transcriber {
  private readonly server = new WhisperServer()
  private readonly vads: Record<CaptureSource, ChannelVad>
  private readonly inFlight = new Set<string>()
  private readonly pendingTranscriptions = new Set<Promise<void>>()
  private running = false
  private paused = false
  private stopping = false
  private stopCompletion: Promise<void> | null = null
  private channels: CaptureChannels = { system: false, mic: false }
  private startCompletion: Promise<CaptureChannels> | null = null
  private rendererStartCompletion: Promise<void> | null = null
  private stopRequested = false

  constructor(private readonly events: TranscriberEvents) {
    this.vads = {
      mic: this.createVad('mic'),
      system: this.createVad('system'),
    }
  }

  get isRunning(): boolean {
    return this.running
  }

  get isStarting(): boolean {
    return this.startCompletion !== null || this.rendererStartCompletion !== null
  }

  get isPaused(): boolean {
    return this.paused
  }

  /** True when the macOS renderer owns the microphone stream and feeds PCM over IPC. */
  get usesRendererAudioCapture(): boolean {
    return usesRendererAudioCapture()
  }

  /** Start the Windows WASAPI capture path. */
  async start(): Promise<CaptureChannels> {
    if (this.stopCompletion) await this.stopCompletion
    if (this.running) return this.channels
    if (this.startCompletion) return this.startCompletion
    if (this.usesRendererAudioCapture) throw new Error('В macOS захват должен быть начат через macAudioReady')
    if (captureBackend() === 'unsupported') {
      throw new Error(`Захват звука не поддерживается на ${process.platform}`)
    }

    this.stopRequested = false
    this.stopping = false
    const completion = this.startWindowsCapture()
    this.startCompletion = completion
    try {
      return await completion
    } finally {
      if (this.startCompletion === completion) this.startCompletion = null
    }
  }

  private async startWindowsCapture(): Promise<CaptureChannels> {
    await this.startWhisperServer()
    if (this.stopRequested) {
      await this.server.stop()
      return { system: false, mic: false }
    }

    let channels: CaptureChannels
    try {
      channels = startCapture((chunk, source) => {
        if (!this.running || this.paused) return
        this.vads[source].push(chunk)
      })
      if (!channels.system) {
        stopCapture()
        throw new Error('Не удалось открыть системный звук Windows — проверьте WASAPI loopback и разрешения')
      }
      if (this.stopRequested) {
        stopCapture()
        await this.server.stop()
        return { system: false, mic: false }
      }
    } catch (error) {
      // The server was already started; do not leave its model and port alive
      // when the native capture module fails to open a device.
      stopCapture()
      await this.server.stop()
      throw error
    }

    this.markRunning(channels)
    return channels
  }

  /**
   * Complete macOS startup after the renderer acquired the microphone. System
   * audio is opened by the native CoreAudio Tap helper, so it does not create a
   * ScreenCaptureKit display stream or a screen-sharing indicator.
   */
  async startRendererCapture(micAvailable: boolean): Promise<CaptureChannels> {
    if (this.stopCompletion) await this.stopCompletion
    if (this.running) return this.channels
    if (!this.usesRendererAudioCapture) {
      throw new Error('Renderer audio capture is only available on macOS')
    }
    if (this.rendererStartCompletion) {
      await this.rendererStartCompletion
      return this.channels
    }

    this.stopRequested = false
    this.stopping = false
    const completion = this.startRendererCaptureInternal(micAvailable)
    this.rendererStartCompletion = completion
    try {
      await completion
      return this.channels
    } finally {
      if (this.rendererStartCompletion === completion) this.rendererStartCompletion = null
    }
  }

  private async startRendererCaptureInternal(micAvailable: boolean): Promise<void> {
    await this.startWhisperServer()
    if (this.stopRequested) {
      await this.server.stop()
      return
    }

    try {
      await macosAudioTap.start({
        onChunk: (chunk) => {
          if (!this.running || this.paused) return
          this.vads.system.push(chunk)
        },
        onError: (error) => {
          this.events.onError(`Системный звук macOS остановлен: ${error.message}`)
          void this.stop().finally(() => this.events.onRendererCaptureEnded?.())
        },
      })
      if (this.stopRequested) {
        await macosAudioTap.stop()
        await this.server.stop()
        return
      }
      // The system channel is owned by this process; only microphone
      // availability is supplied by the renderer.
      this.markRunning({ system: true, mic: micAvailable })
    } catch (error) {
      await macosAudioTap.stop()
      await this.server.stop()
      throw error
    }
  }

  /** Accept already-resampled PCM from the named, allow-listed macOS IPC path. */
  pushRendererAudio(chunk: Buffer, source: 'mic'): void {
    if (!this.usesRendererAudioCapture || !this.running || this.paused) return
    this.vads[source].push(chunk)
  }

  private async startWhisperServer(): Promise<void> {
    const config = loadConfig()
    const executablePath = resolveWhisperServerPath(config)
    if (!executablePath) {
      throw new Error('Не задан путь к whisper-server. Укажите whisperServerPath или whisperRuntimeDir в config.json')
    }

    await this.server.start({
      executablePath,
      modelPath: config.whisperModelPath,
      language: STT_LANGUAGE,
      threads: 8,
      beamSize: config.sttBeamSize,
    })
  }

  private markRunning(channels: CaptureChannels): void {
    this.channels = channels
    this.running = true
    this.paused = false
    log.info(`Capture started - system: ${channels.system}, mic: ${channels.mic}`)
  }

  async stop(): Promise<void> {
    this.stopRequested = true
    if (this.stopCompletion) return this.stopCompletion

    const completion = this.stopInternal()
    this.stopCompletion = completion
    try {
      await completion
    } finally {
      if (this.stopCompletion === completion) this.stopCompletion = null
    }
  }

  private async stopInternal(): Promise<void> {
    this.stopping = true
    try {
      const startCompletion = this.startCompletion
      if (!this.running && startCompletion) await startCompletion.catch(() => ({ system: false, mic: false }))
      const rendererStartCompletion = this.rendererStartCompletion
      if (!this.running && rendererStartCompletion) await rendererStartCompletion.catch(() => undefined)
      if (!this.running) return

      // Stop producers first, then flush the VAD while `running` is still true
      // so its final utterance can finish transcription before the server exits.
      if (this.usesRendererAudioCapture) await macosAudioTap.stop()
      else stopCapture()
      for (const vad of Object.values(this.vads)) vad.flush()
      await this.drainTranscriptions()

      this.running = false
      this.paused = false
      this.channels = { system: false, mic: false }
      await this.server.stop()
      log.info('Capture stopped')
    } finally {
      this.running = false
      this.paused = false
      this.channels = { system: false, mic: false }
      await this.server.stop()
      this.stopping = false
    }
  }

  private async drainTranscriptions(): Promise<void> {
    if (this.pendingTranscriptions.size === 0) return
    await Promise.race([
      Promise.allSettled(this.pendingTranscriptions),
      new Promise<void>((resolve) => setTimeout(resolve, STOP_DRAIN_TIMEOUT_MS)),
    ])
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) for (const vad of Object.values(this.vads)) vad.reset()
  }

  private createVad(source: CaptureSource): ChannelVad {
    return new ChannelVad(
      {
        onPartial: (audio) => this.scheduleTranscription(audio, source, false),
        onFinal: (audio) => this.scheduleTranscription(audio, source, true),
      },
      this.events.maxUtteranceMs?.[source],
    )
  }

  private scheduleTranscription(audio: Buffer, source: CaptureSource, isFinal: boolean): void {
    const task = this.transcribe(audio, source, isFinal)
    this.pendingTranscriptions.add(task)
    void task.then(
      () => this.pendingTranscriptions.delete(task),
      () => this.pendingTranscriptions.delete(task),
    )
  }

  private async transcribe(audio: Buffer, source: CaptureSource, isFinal: boolean): Promise<void> {
    // One partial per channel at a time: a queue of stale snapshots is pure cost.
    const key = `${source}:${isFinal ? 'final' : 'partial'}`
    if (!isFinal && this.inFlight.has(key)) return
    this.inFlight.add(key)
    this.events.onStateChange({ transcribing: true })

    try {
      const text = await this.server.transcribe(toWav(audio), {
        timeoutMs: isFinal ? FINAL_TIMEOUT_MS : PARTIAL_TIMEOUT_MS,
        language: STT_LANGUAGE,
        // Biases the decoder towards IT terminology, so "RAG" is less likely to
        // come out as "RAC" in the first place. The glossary can only repair
        // spellings someone already listed; this reduces how often it has to.
        prompt: loadConfig().sttPromptBias ? buildDecodePrompt() : undefined,
      })
      if (!text || !this.running) return

      const pattern = getHallucinationFilter().match(text)
      if (pattern) {
        log.info(`Dropped a likely hallucination on ${source} (${pattern}): ${text}`)
        return
      }

      this.events.onUtterance({
        id: `${source}-${isFinal ? 'f' : 'i'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        speaker: SPEAKER_OF[source],
        text,
        isFinal,
        timestamp: Date.now(),
      })
    } catch (error) {
      if (this.stopping) return
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      if (timedOut && !isFinal) return
      if (timedOut) {
        this.events.onError('Whisper не успел распознать реплику — вероятно, GPU перегружен')
        return
      }
      log.error(`Transcription failed on ${source}:`, error)
      this.events.onError(`Ошибка распознавания: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.inFlight.delete(key)
      if (this.inFlight.size === 0) this.events.onStateChange({ transcribing: false })
    }
  }
}
