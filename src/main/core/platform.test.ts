import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { audioCaptureBackend, resolveWhisperServerPath, whisperServerFileName } from './platform'

describe('audio platform selection', () => {
  it('keeps the Windows native backend and selects the native macOS audio path', () => {
    expect(audioCaptureBackend('win32')).toBe('windows-native')
    expect(audioCaptureBackend('darwin')).toBe('macos-native')
    expect(audioCaptureBackend('linux')).toBe('unsupported')
  })

  it('uses the platform filename when a legacy runtime directory is configured', () => {
    expect(whisperServerFileName('win32')).toBe('whisper-server.exe')
    expect(whisperServerFileName('darwin')).toBe('whisper-server')
    // join() uses the host separator, so assert against the platform's own join
    // rather than a hard-coded POSIX path: this suite also runs on Windows.
    expect(resolveWhisperServerPath({ whisperServerPath: null, whisperRuntimeDir: '/opt/whisper/bin' }, 'darwin'))
      .toBe(join('/opt/whisper/bin', 'whisper-server'))
  })

  it('prefers an explicit server executable without breaking old config files', () => {
    expect(resolveWhisperServerPath({
      whisperServerPath: '/Applications/Whisper/bin/whisper-server-metal',
      whisperRuntimeDir: 'C:/old/runtime',
    }, 'darwin')).toBe('/Applications/Whisper/bin/whisper-server-metal')
  })
})
