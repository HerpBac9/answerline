import { AUDIO_FORMAT } from './audioCapture'

const BYTES_PER_SECOND = AUDIO_FORMAT.sampleRate * 2
/** RMS floor for "this is speech". Tuned in the upstream project against real calls. */
const MIN_RMS = 350
/** Prepended on speech onset so the first syllable is not clipped. */
const PRE_ROLL_BYTES = BYTES_PER_SECOND / 2
/** Silence needed to call an utterance finished. */
const END_OF_UTTERANCE_MS = 1_200
/** Interim transcripts, so the user sees the pipeline is alive mid-sentence. */
const PARTIAL_INTERVAL_MS = 1_000
const MIN_PARTIAL_BYTES = BYTES_PER_SECOND
/** Hard cut so a monologue still produces output. */
const DEFAULT_MAX_UTTERANCE_MS = 25_000

/**
 * Training mode lengthens the mic limit, because a spoken interview answer is
 * routinely longer than 25s and the candidate grades one answer as a whole.
 * A mid-sentence cut is not free: each later chunk starts mid-phrase, so
 * Whisper has no context for it and often returns text the hallucination
 * filter then drops - which is what made long spoken answers arrive truncated.
 * The system channel keeps the interview-time limit so a question is still
 * answered promptly instead of waiting for the speaker to pause.
 */
export const TRAINING_MAX_UTTERANCE_MS = 90_000

export interface VadEvents {
  /** A snapshot of speech in progress. May be superseded by the next one. */
  onPartial: (audio: Buffer) => void
  /** A complete utterance, silence-trimmed. */
  onFinal: (audio: Buffer) => void
}

/**
 * Amplitude-gated segmentation for a single channel.
 *
 * Not a neural VAD, and it does not need to be: the job is only to decide where
 * an utterance ends so Whisper gets a bounded buffer. Cheap enough to run on
 * every chunk without touching the audio itself.
 */
export class ChannelVad {
  private preRoll: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  /**
   * Keep chunks until a partial/final snapshot is needed. Concatenating the
   * entire utterance for every incoming audio chunk made a long utterance
   * quadratic in both copying and temporary allocations.
   */
  private utteranceParts: Buffer<ArrayBufferLike>[] = []
  private utteranceBytes = 0
  private silenceBytes = 0
  private speaking = false
  private startedAt = 0
  private lastPartialAt = 0
  private readonly maxUtteranceMs: number

  constructor(private readonly events: VadEvents, maxUtteranceMs = DEFAULT_MAX_UTTERANCE_MS) {
    this.maxUtteranceMs = maxUtteranceMs
  }

  push(chunk: Buffer, now = Date.now()): void {
    if (hasSpeech(chunk)) {
      if (!this.speaking) {
        this.speaking = true
        this.startedAt = now
        // Speech began mid-chunk; the ring buffer holds what came just before.
        if (this.preRoll.byteLength > 0) {
          this.utteranceParts.push(this.preRoll)
          this.utteranceBytes += this.preRoll.byteLength
        }
        this.preRoll = Buffer.alloc(0)
      }
      this.appendChunk(chunk)
      this.silenceBytes = 0
      this.maybePartial(now)
      if (now - this.startedAt >= this.maxUtteranceMs) this.flush()
      return
    }

    if (!this.speaking) {
      this.preRoll = keepTail(Buffer.concat([this.preRoll, chunk]), PRE_ROLL_BYTES)
      return
    }

    // Trailing silence is kept in the buffer while deciding, then trimmed off.
    this.appendChunk(chunk)
    this.silenceBytes += chunk.byteLength
    if (this.silenceBytes >= (END_OF_UTTERANCE_MS / 1000) * BYTES_PER_SECOND) this.flush()
  }

  /** Emit whatever is buffered, e.g. when the user stops the session. */
  flush(): void {
    const audio = this.utteranceBytes > 0
      ? Buffer.concat(this.utteranceParts, this.utteranceBytes)
      : Buffer.alloc(0)
    this.utteranceParts = []
    this.utteranceBytes = 0
    this.silenceBytes = 0
    this.speaking = false
    this.lastPartialAt = 0
    if (audio.byteLength > 0) this.events.onFinal(trimTrailingSilence(audio))
  }

  reset(): void {
    this.preRoll = Buffer.alloc(0)
    this.utteranceParts = []
    this.utteranceBytes = 0
    this.silenceBytes = 0
    this.speaking = false
    this.lastPartialAt = 0
  }

  private maybePartial(now: number): void {
    if (this.utteranceBytes < MIN_PARTIAL_BYTES) return
    if (now - this.lastPartialAt < PARTIAL_INTERVAL_MS) return
    this.lastPartialAt = now
    this.events.onPartial(Buffer.concat(this.utteranceParts, this.utteranceBytes))
  }

  private appendChunk(chunk: Buffer): void {
    // Native callbacks own their input buffers. Copy once so a later reuse by
    // the addon cannot mutate an utterance that is waiting for a snapshot.
    const owned = Buffer.from(chunk)
    this.utteranceParts.push(owned)
    this.utteranceBytes += owned.byteLength
  }
}

/** Decimated RMS: every 16th sample is plenty to tell speech from a quiet room. */
export function hasSpeech(audio: Buffer): boolean {
  const sampleCount = Math.floor(audio.byteLength / 2)
  if (sampleCount === 0) return false

  let sum = 0
  let counted = 0
  for (let i = 0; i < sampleCount; i += 16) {
    const sample = audio.readInt16LE(i * 2)
    sum += sample * sample
    counted++
  }
  return Math.sqrt(sum / counted) >= MIN_RMS
}

/**
 * Drop the silence the end-of-utterance rule appended, keeping 200ms so a
 * trailing consonant survives.
 *
 * Two reasons beyond saving encode time: Whisper invents text when fed silence,
 * and a silent tail drags down the average RMS that gates the whole buffer - so
 * the gate is weakest exactly where the hallucination risk is highest.
 */
export function trimTrailingSilence(audio: Buffer): Buffer {
  const keepBytes = (AUDIO_FORMAT.sampleRate / 5) * 2
  const sampleCount = Math.floor(audio.byteLength / 2)

  let lastLoud = -1
  for (let i = sampleCount - 1; i >= 0; i -= 16) {
    if (Math.abs(audio.readInt16LE(i * 2)) >= MIN_RMS) {
      lastLoud = i
      break
    }
  }
  if (lastLoud < 0) return audio

  const end = Math.min(audio.byteLength, lastLoud * 2 + keepBytes)
  return end >= audio.byteLength ? audio : audio.subarray(0, end)
}

function keepTail(buffer: Buffer, limit: number): Buffer {
  return buffer.byteLength <= limit ? buffer : buffer.subarray(buffer.byteLength - limit)
}

/** 44-byte RIFF header so a raw PCM buffer can be posted as a WAV. */
export function toWav(pcm: Buffer): Buffer {
  const { sampleRate, channels, bitsPerSample } = AUDIO_FORMAT
  const byteRate = sampleRate * channels * (bitsPerSample / 8)

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.byteLength, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.byteLength, 40)

  return Buffer.concat([header, pcm])
}
