import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { loadConfig } from '../core/config'
import { audioCaptureBackend, type AudioCaptureBackend } from '../core/platform'

const require = createRequire(import.meta.url)

/**
 * Windows has two independent capture channels from one prebuilt Rust module:
 * WASAPI loopback (what you hear) and the microphone (what you say). On macOS
 * the microphone is acquired in the trusted renderer while system audio comes
 * from the native CoreAudio Tap helper; see macosAudioTap.ts.
 *
 * Speaker attribution is physical, not statistical: the loopback channel is the
 * interviewer, the microphone is you. That is why no diarisation is needed.
 *
 * Deliberately NO acoustic echo cancellation. The upstream project routes both
 * channels through a GStreamer webrtcdsp pipeline, which drags in a GStreamer
 * install and its plugin path. AEC exists to stop the interviewer's voice
 * leaking from your speakers into your microphone - with headphones there is no
 * such leak. See the caveat in README: on speakers, the interviewer's words will
 * appear in your channel too.
 */
export type CaptureSource = 'mic' | 'system'
export type AudioChunkHandler = (chunk: Buffer, source: CaptureSource) => void

interface WindowsAudioModule {
  isSystemAudioAvailable: () => boolean
  hasPermission: () => boolean
  requestPermission: () => boolean
  isCapturing: () => boolean
  startSystemAudioCapture: (callback: (chunk: { data: Buffer; timestamp: number }) => void) => boolean
  stopSystemAudioCapture: () => boolean
  startMicCapture: (callback: (chunk: { data: Buffer; timestamp: number }) => void) => boolean
  stopMicCapture: () => boolean
}

/** PCM the module emits, and therefore the format of every buffer downstream. */
export const AUDIO_FORMAT = { sampleRate: 16_000, channels: 1, bitsPerSample: 16 } as const

let module: WindowsAudioModule | null = null

export function captureBackend(): AudioCaptureBackend {
  return audioCaptureBackend()
}

export function usesRendererAudioCapture(): boolean {
  return captureBackend() === 'macos-native'
}

function loadModule(): WindowsAudioModule {
  if (module) return module

  if (captureBackend() !== 'windows-native') {
    throw new Error('Нативный WASAPI-захват доступен только в Windows')
  }

  const path = loadConfig().windowsAudioModulePath
  if (!path || !existsSync(path)) {
    throw new Error(`Native audio module not found at ${path}. Fix windowsAudioModulePath in config.json, then run: npm run doctor`)
  }
  module = require(path) as WindowsAudioModule
  return module
}

export function isAvailable(): boolean {
  try {
    return loadModule().isSystemAudioAvailable()
  } catch {
    return false
  }
}

export function hasPermission(): boolean {
  try {
    return loadModule().hasPermission()
  } catch {
    return false
  }
}

export function requestPermission(): boolean {
  try {
    return loadModule().requestPermission()
  } catch {
    return false
  }
}

/**
 * Returns which channels came up. A missing microphone is not fatal: the
 * interviewer's questions are the important half, and answering still works
 * without hearing yourself.
 */
export function startCapture(onChunk: AudioChunkHandler): { system: boolean; mic: boolean } {
  if (captureBackend() !== 'windows-native') {
    throw new Error('Этот захват нельзя запустить вне Windows')
  }
  const native = loadModule()

  const system = native.startSystemAudioCapture((chunk) => onChunk(chunk.data, 'system'))
  const mic = native.startMicCapture((chunk) => onChunk(chunk.data, 'mic'))

  return { system, mic }
}

export function stopCapture(): void {
  if (captureBackend() !== 'windows-native') return
  if (!module) return
  try {
    module.stopSystemAudioCapture()
    module.stopMicCapture()
  } catch (error) {
    console.error(`Error stopping capture: ${String(error)}`)
  }
}
