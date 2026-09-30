import { describe, expect, it } from 'vitest'
import { Pcm16Resampler } from './macosAudioCapture'

function frame(channels: number[][]) {
  return {
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    getChannelData: (index: number) => Float32Array.from(channels[index] ?? []),
  }
}

function samples(pcm: Uint8Array): number[] {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  return Array.from({ length: Math.floor(pcm.byteLength / 2) }, (_, index) => view.getInt16(index * 2, true))
}

describe('Pcm16Resampler', () => {
  it('downsamples one channel into signed 16-bit little-endian PCM', () => {
    const pcm = new Pcm16Resampler(32_000).encode(frame([[0, 0.5, -0.5, 1]]))

    expect(samples(pcm)).toEqual([0, -16_384])
  })

  it('downmixes channels before encoding', () => {
    const encoder = new Pcm16Resampler(16_000)
    const pcm = encoder.encode(frame([[1, -1], [-1, 1]]))

    // A streaming linear resampler keeps the last sample for interpolation with
    // the next callback, so the final frame is emitted on the following input.
    expect(samples(pcm)).toEqual([0])
    expect(samples(encoder.encode(frame([[1, -1], [-1, 1]])))).toEqual([0, 0])
  })

  it('carries fractional frame rounding between callbacks', () => {
    const encoder = new Pcm16Resampler(44_100)
    const input = frame([Array.from({ length: 441 }, () => 0.25)])

    expect(encoder.encode(input)).toHaveLength(320)
    expect(encoder.encode(input)).toHaveLength(320)
  })

  it('keeps waveform continuity across browser callbacks', () => {
    const encoder = new Pcm16Resampler(16_000)
    const first = encoder.encode(frame([[0, 0.25]]))
    const second = encoder.encode(frame([[0.5, 0.75]]))

    expect([...samples(first), ...samples(second)]).toEqual([0, 8_192, 16_384])
  })
})
