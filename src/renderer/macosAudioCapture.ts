/**
 * macOS system audio is owned by the native CoreAudio Tap helper in the main
 * process. The renderer requests only the microphone and emits the same mono,
 * signed 16-bit LE PCM contract used by the Windows capture module.
 */
const TARGET_SAMPLE_RATE = 16_000
const PROCESSOR_BUFFER_SIZE = 4_096

interface AudioFrame {
  readonly length: number
  readonly numberOfChannels: number
  getChannelData(channel: number): Float32Array
}

export class Pcm16Resampler {
  /** Downmixed input samples waiting for a neighbouring sample. */
  private inputSamples: number[] = []
  private inputOffset = 0
  /** Position relative to inputOffset, in input samples. */
  private sourcePosition = 0

  constructor(
    private readonly inputSampleRate: number,
    private readonly outputSampleRate = TARGET_SAMPLE_RATE,
  ) {}

  encode(frame: AudioFrame): Uint8Array {
    if (frame.length === 0 || frame.numberOfChannels === 0) return new Uint8Array(0)

    const ratio = Math.max(this.inputSampleRate, 1) / this.outputSampleRate
    const channels = Array.from({ length: frame.numberOfChannels }, (_, index) => frame.getChannelData(index))
    for (let inputIndex = 0; inputIndex < frame.length; inputIndex += 1) {
      let sample = 0
      for (const channel of channels) sample += channel[inputIndex] ?? 0
      this.inputSamples.push(sample / channels.length)
    }

    const outputSamples: number[] = []
    const available = () => this.inputSamples.length - this.inputOffset
    // Keep one source sample for interpolation with the next callback. The
    // source position is carried across callbacks, so the output is a single
    // continuous stream rather than a repeated resampling of every browser
    // buffer from position zero.
    while (this.sourcePosition + 1 < available()) {
      const before = Math.floor(this.sourcePosition) + this.inputOffset
      const after = Math.min(this.inputSamples.length - 1, before + 1)
      const fraction = this.sourcePosition - Math.floor(this.sourcePosition)
      outputSamples.push(this.inputSamples[before] + (this.inputSamples[after] - this.inputSamples[before]) * fraction)
      this.sourcePosition += ratio
    }

    const consumed = Math.floor(this.sourcePosition)
    if (consumed > 0) {
      this.inputOffset += consumed
      this.sourcePosition -= consumed
      if (this.inputOffset >= 4096) {
        this.inputSamples = this.inputSamples.slice(this.inputOffset)
        this.inputOffset = 0
      }
    }

    if (outputSamples.length === 0) return new Uint8Array(0)
    const output = new Uint8Array(outputSamples.length * 2)
    const view = new DataView(output.buffer)

    for (let outputIndex = 0; outputIndex < outputSamples.length; outputIndex++) {
      // Linear interpolation is enough after the browser's device pipeline and
      // avoids a dependency/native module in the renderer. The VAD receives the
      // same fixed format as it does from the Windows addon.
      const sample = outputSamples[outputIndex] ?? 0
      const clamped = Math.max(-1, Math.min(1, sample))
      const int16 = clamped < 0 ? Math.round(clamped * 32_768) : Math.round(clamped * 32_767)
      view.setInt16(outputIndex * 2, int16, true)
    }

    return output
  }
}

interface Pipeline {
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  silence: GainNode
}

class MacosAudioCapture {
  private state: 'idle' | 'starting' | 'running' | 'stopping' = 'idle'
  private streams: MediaStream[] = []
  private pipelines: Pipeline[] = []
  private context: AudioContext | null = null

  async start(): Promise<void> {
    if (this.state !== 'idle') return
    this.state = 'starting'

    try {
      // Keep the AudioContext inside the click handler so microphone consent is
      // requested from a user gesture. System audio no longer uses getDisplayMedia.
      this.context = new AudioContext({ latencyHint: 'interactive' })
      void this.context.resume()

      const microphoneRequest = navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 1,
        },
        video: false,
      })
      const microphoneResult = await Promise.allSettled([microphoneRequest])
      if (this.state !== 'starting') {
        if (microphoneResult[0]?.status === 'fulfilled') {
          for (const track of microphoneResult[0].value.getTracks()) track.stop()
        }
        return
      }

      const microphoneStream = microphoneResult[0]?.status === 'fulfilled' ? microphoneResult[0].value : null
      if (microphoneResult[0]?.status === 'rejected' && microphoneStream === null) {
        // A missing microphone is non-fatal: system audio still carries the
        // interviewer's questions and remains the important channel.
        console.warn(describeMediaError(microphoneResult[0].reason).message)
      }
      this.streams = microphoneStream ? [microphoneStream] : []
      if (microphoneStream) this.stopWhenMicrophoneEnds(microphoneStream)

      // Main starts Whisper and the native system-audio tap. If it rejects,
      // the microphone stream is released in the catch block below.
      await window.solo.macAudioReady(microphoneStream !== null)
      if (this.state !== 'starting') return

      const context = this.context
      if (!context) throw new Error('Аудиоконтекст macOS не был создан')
      if (microphoneStream) this.pipelines.push(this.createPipeline(microphoneStream, 'mic', context))
      this.state = 'running'
    } catch (error) {
      const report = this.state === 'starting' || this.state === 'running'
      await this.release()
      this.state = 'idle'
      if (report) await window.solo.macAudioFailed(error instanceof Error ? error.message : String(error))
    }
  }

  async stop(): Promise<void> {
    await this.stopInternal(true)
  }

  /** Release a backend that died in the main process without sending a stop IPC back. */
  async stopFromMain(): Promise<void> {
    await this.stopInternal(false)
  }

  private async stopInternal(notifyMain: boolean): Promise<void> {
    if (this.state === 'idle') return
    const shouldNotifyMain = notifyMain && (this.state === 'starting' || this.state === 'running')
    this.state = 'stopping'
    await this.release()
    this.state = 'idle'
    if (shouldNotifyMain) await window.solo.macAudioStopped()
  }

  private createPipeline(stream: MediaStream, source: 'mic', context: AudioContext): Pipeline {
    const mediaSource = context.createMediaStreamSource(stream)
    const processor = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
    const silence = context.createGain()
    silence.gain.value = 0
    const resampler = new Pcm16Resampler(context.sampleRate)

    processor.onaudioprocess = (event) => {
      if (this.state !== 'running') return
      const pcm = resampler.encode(event.inputBuffer)
      if (pcm.byteLength > 0) window.solo.sendMacAudioChunk(source, pcm)
    }
    // ScriptProcessorNode must be connected to an active destination to receive
    // callbacks. The zero-gain node makes that connection inaudible.
    mediaSource.connect(processor)
    processor.connect(silence)
    silence.connect(context.destination)
    return { source: mediaSource, processor, silence }
  }

  private stopWhenMicrophoneEnds(stream: MediaStream): void {
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (this.state === 'running' || this.state === 'starting') {
          void this.fail('Микрофон macOS был отключён. Проверьте разрешение и выбранное устройство, затем запустите захват снова')
        }
      }, { once: true })
    }
  }

  private async fail(message: string): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopping') return
    this.state = 'stopping'
    await this.release()
    this.state = 'idle'
    await window.solo.macAudioFailed(message)
  }

  private async release(): Promise<void> {
    const pipelines = this.pipelines
    this.pipelines = []
    for (const pipeline of pipelines) {
      pipeline.processor.onaudioprocess = null
      pipeline.source.disconnect()
      pipeline.processor.disconnect()
      pipeline.silence.disconnect()
    }
    const context = this.context
    this.context = null
    if (context) await context.close().catch(() => undefined)

    const streams = this.streams
    this.streams = []
    for (const stream of streams) {
      for (const track of stream.getTracks()) track.stop()
    }
  }
}

function describeMediaError(error: unknown): Error {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new Error('macOS не разрешила микрофон. В System Settings → Privacy & Security разрешите приложению Microphone и повторите попытку')
  }
  if (name === 'NotFoundError') {
    return new Error('macOS не нашла доступный микрофон')
  }
  if (name === 'NotSupportedError') {
    return new Error('Эта версия Electron не поддерживает захват микрофона macOS')
  }
  if (name === 'NotReadableError') {
    return new Error('macOS не смогла открыть микрофон. Проверьте разрешение Microphone и повторите попытку')
  }
  return new Error(`Не удалось начать захват микрофона: ${error instanceof Error ? error.message : String(error)}`)
}

export const macosAudioCapture = new MacosAudioCapture()
