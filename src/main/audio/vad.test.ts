import { describe, expect, it, vi } from 'vitest'
import { AUDIO_FORMAT } from './audioCapture'
import { ChannelVad, hasSpeech, toWav, TRAINING_MAX_UTTERANCE_MS, trimTrailingSilence } from './vad'

const BYTES_PER_MS = (AUDIO_FORMAT.sampleRate * 2) / 1000

/** Loud enough to pass the RMS gate; a square wave keeps every sample at peak. */
function speech(ms: number, amplitude = 4_000): Buffer {
  const buffer = Buffer.alloc(Math.round(ms * BYTES_PER_MS))
  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    buffer.writeInt16LE(offset % 4 === 0 ? amplitude : -amplitude, offset)
  }
  return buffer
}

function silence(ms: number): Buffer {
  return Buffer.alloc(Math.round(ms * BYTES_PER_MS))
}

function collector() {
  const partials: Buffer[] = []
  const finals: Buffer[] = []
  return {
    partials,
    finals,
    events: {
      onPartial: (audio: Buffer) => partials.push(audio),
      onFinal: (audio: Buffer) => finals.push(audio),
    },
  }
}

const ms = (audio: Buffer) => Math.round(audio.byteLength / BYTES_PER_MS)

describe('hasSpeech', () => {
  it('accepts speech and rejects a quiet room', () => {
    expect(hasSpeech(speech(200))).toBe(true)
    expect(hasSpeech(silence(200))).toBe(false)
    expect(hasSpeech(speech(200, 100))).toBe(false)
  })

  it('does not throw on an empty buffer', () => {
    expect(hasSpeech(Buffer.alloc(0))).toBe(false)
  })

  it('reads PCM correctly when a pipe chunk starts at an odd byte offset', () => {
    const aligned = speech(200)
    const withPrefix = Buffer.concat([Buffer.from([0xff]), aligned]).subarray(1)

    expect(withPrefix.byteOffset % 2).toBe(1)
    expect(hasSpeech(withPrefix)).toBe(true)
  })
})

describe('ChannelVad', () => {
  it('emits a final only after the end-of-utterance silence', () => {
    const { finals, events } = collector()
    const vad = new ChannelVad(events)
    let now = 0

    vad.push(speech(800), (now += 800))
    expect(finals).toHaveLength(0)

    // 1.2s of silence is the threshold; 600ms must not be enough.
    vad.push(silence(600), (now += 600))
    expect(finals).toHaveLength(0)

    vad.push(silence(700), (now += 700))
    expect(finals).toHaveLength(1)
  })

  it('prepends pre-roll so the first syllable is not clipped', () => {
    const { finals, events } = collector()
    const vad = new ChannelVad(events)
    let now = 0

    // Quiet lead-in fills the ring buffer, then speech starts.
    vad.push(silence(2_000), (now += 2_000))
    vad.push(speech(500), (now += 500))
    vad.push(silence(1_300), (now += 1_300))

    expect(finals).toHaveLength(1)
    // 500ms of pre-roll plus 500ms of speech, minus the trimmed tail.
    expect(ms(finals[0])).toBeGreaterThan(700)
  })

  it('trims the trailing silence out of the final', () => {
    const { finals, events } = collector()
    const vad = new ChannelVad(events)
    let now = 0

    vad.push(speech(1_000), (now += 1_000))
    vad.push(silence(1_300), (now += 1_300))

    // The 1.3s of silence must not reach Whisper: it costs encode time and is
    // where the decoder starts inventing text.
    expect(ms(finals[0])).toBeLessThan(1_300)
    expect(ms(finals[0])).toBeGreaterThan(900)
  })

  it('emits interim partials no more than once a second', () => {
    const { partials, events } = collector()
    const vad = new ChannelVad(events)
    let now = 0

    // Buffer must exceed 1s before the first partial is worth sending.
    vad.push(speech(1_200), (now += 1_200))
    expect(partials).toHaveLength(1)

    vad.push(speech(300), (now += 300))
    expect(partials).toHaveLength(1)

    vad.push(speech(800), (now += 800))
    expect(partials).toHaveLength(2)
  })

  it('cuts a monologue at the hard limit instead of buffering forever', () => {
    const { finals, events } = collector()
    const vad = new ChannelVad(events)
    let now = 0

    for (let i = 0; i < 30; i++) vad.push(speech(1_000), (now += 1_000))

    expect(finals.length).toBeGreaterThanOrEqual(1)
    expect(ms(finals[0])).toBeLessThanOrEqual(26_000)
  })

  it('honours a caller-supplied limit so a long answer stays one utterance', () => {
    const { finals, events } = collector()
    const vad = new ChannelVad(events, TRAINING_MAX_UTTERANCE_MS)
    let now = 0

    // 60s of continuous speech: past the interview limit but inside the training
    // one, so the hard cut must not fire and the answer stays a single final.
    for (let i = 0; i < 60; i++) vad.push(speech(1_000), (now += 1_000))
    expect(finals.length).toBe(0)

    for (let i = 0; i < 3; i++) vad.push(silence(1_000), (now += 1_000))

    expect(finals.length).toBe(1)
    expect(ms(finals[0])).toBeGreaterThan(59_000)
  })

  it('flush emits what is buffered, and only once', () => {
    const { finals, events } = collector()
    const vad = new ChannelVad(events)

    vad.push(speech(600), 600)
    vad.flush()
    vad.flush()

    expect(finals).toHaveLength(1)
  })

  it('reset drops buffered audio without emitting it', () => {
    const { finals, partials, events } = collector()
    const vad = new ChannelVad(events)

    vad.push(speech(600), 600)
    vad.reset()
    vad.flush()

    expect(finals).toHaveLength(0)
    expect(partials).toHaveLength(0)
  })

  it('ignores a silent channel entirely', () => {
    const { finals, partials, events } = collector()
    const vad = new ChannelVad(events)
    let now = 0

    for (let i = 0; i < 20; i++) vad.push(silence(500), (now += 500))

    expect(finals).toHaveLength(0)
    expect(partials).toHaveLength(0)
  })

  it('uses the injected clock rather than wall time', () => {
    const { partials, events } = collector()
    const vad = new ChannelVad(events)
    const spy = vi.spyOn(Date, 'now')

    vad.push(speech(1_200), 1_200)

    expect(partials).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('trimTrailingSilence', () => {
  it('returns the buffer untouched when it is entirely silent', () => {
    const quiet = silence(500)
    expect(trimTrailingSilence(quiet).byteLength).toBe(quiet.byteLength)
  })

  it('keeps a short tail after the last loud sample', () => {
    const audio = Buffer.concat([speech(500), silence(2_000)])
    const trimmed = trimTrailingSilence(audio)

    expect(ms(trimmed)).toBeGreaterThan(500)
    expect(ms(trimmed)).toBeLessThan(900)
  })
})

describe('toWav', () => {
  it('writes a RIFF header that matches the capture format', () => {
    const pcm = speech(100)
    const wav = toWav(pcm)

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt16LE(22)).toBe(AUDIO_FORMAT.channels)
    expect(wav.readUInt32LE(24)).toBe(AUDIO_FORMAT.sampleRate)
    expect(wav.readUInt16LE(34)).toBe(AUDIO_FORMAT.bitsPerSample)
    expect(wav.readUInt32LE(40)).toBe(pcm.byteLength)
    expect(wav.byteLength).toBe(pcm.byteLength + 44)
  })
})
