import { join } from 'node:path'

/**
 * The app deliberately supports only the two desktop platforms for which it
 * has an audio implementation. Keeping this decision in one place prevents a
 * Linux run from failing later with a misleading missing-WASAPI error.
 */
export type AudioCaptureBackend = 'windows-native' | 'macos-native' | 'unsupported'

export interface WhisperRuntimeConfig {
  /** An explicit executable wins over the conventional runtime directory. */
  whisperServerPath: string | null
  whisperRuntimeDir: string
}

export function audioCaptureBackend(platform: NodeJS.Platform = process.platform): AudioCaptureBackend {
  if (platform === 'win32') return 'windows-native'
  if (platform === 'darwin') return 'macos-native'
  return 'unsupported'
}

/** The filename produced by whisper.cpp's normal build on each supported OS. */
export function whisperServerFileName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'whisper-server.exe' : 'whisper-server'
}

/**
 * An explicit path is useful for Homebrew/custom whisper.cpp layouts. Existing
 * Windows configurations retain the old runtime-directory convention.
 */
export function resolveWhisperServerPath(
  config: WhisperRuntimeConfig,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const explicit = typeof config.whisperServerPath === 'string' ? config.whisperServerPath.trim() : ''
  if (explicit) return explicit

  const directory = typeof config.whisperRuntimeDir === 'string' ? config.whisperRuntimeDir.trim() : ''
  return directory ? join(directory, whisperServerFileName(platform)) : null
}
