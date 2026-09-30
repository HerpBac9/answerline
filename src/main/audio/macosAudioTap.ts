import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { constants, existsSync, accessSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { loadConfig } from '../core/config'
import { createLogger } from '../core/log'

const log = createLogger('MacosAudioTap')
const SAMPLE_RATE = 16_000
const START_TIMEOUT_MS = 60_000
const STOP_TIMEOUT_MS = 5_000

export interface MacosAudioTapOptions {
  onChunk: (pcm: Buffer) => void
  onError: (error: Error) => void
}

/**
 * Owns the native CoreAudio Process Tap helper for one capture session.
 * stdout is deliberately raw signed-16 PCM; diagnostics are newline-delimited
 * JSON on stderr so audio can never be confused with a log message.
 */
export class MacosAudioTap {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null
  private stderrBuffer = ''
  private stdoutRemainder = Buffer.alloc(0)
  private stopping = false

  get isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null
  }

  isSupported(): boolean {
    if (process.platform !== 'darwin') return false
    const parts = process.getSystemVersion().split('.').map((part) => Number.parseInt(part, 10))
    const major = parts[0] ?? 0
    const minor = parts[1] ?? 0
    return major > 14 || (major === 14 && minor >= 4)
  }

  async start(options: MacosAudioTapOptions): Promise<void> {
    if (process.platform !== 'darwin') throw new Error('CoreAudio Tap доступен только на macOS')
    if (!this.isSupported()) throw new Error('Для системного аудио нужен macOS 14.4 или новее')
    if (this.isRunning) return

    const binaryPath = this.resolveBinary()
    if (!binaryPath) {
      throw new Error('Не найден macOS CoreAudio Tap helper. Выполните npm run compile:mac-audio и пересоберите app')
    }

    this.stopping = false
    this.stderrBuffer = ''
    this.stdoutRemainder = Buffer.alloc(0)
    const child = spawn(binaryPath, ['--sample-rate', String(SAMPLE_RATE), '--chunk-ms', '100'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => finish(false, new Error('macOS не подтвердил доступ к системному аудио за 60 секунд. Разрешите System Audio Recording и повторите попытку'), true), START_TIMEOUT_MS)

      const finish = (succeeded: boolean, error?: Error, stop = false) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (stop) void this.stop()
        if (succeeded) resolve()
        else reject(error ?? new Error('macOS CoreAudio Tap не запустился'))
      }

      child.stdout.on('data', (chunk: Buffer) => {
        // Keep draining bytes already buffered by the pipe while SIGTERM is
        // shutting the helper down; Transcriber stops the VAD only afterwards.
        if (this.child !== child) return
        const aligned = this.alignPcm(chunk)
        if (aligned) options.onChunk(aligned)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (this.child !== child) return
        this.consumeStderr(chunk, (message) => {
          if (message.type === 'start') {
            finish(true)
          } else if (message.type === 'error') {
            const error = this.describeNativeError(message)
            if (!settled) finish(false, error, true)
            else if (!this.stopping) options.onError(error)
          }
        })
      })
      child.on('error', (error) => {
        if (this.child === child) this.child = null
        finish(false, error)
      })
      child.on('exit', (code, signal) => {
        if (this.child === child) this.child = null
        if (!settled) {
          finish(false, new Error(`macOS CoreAudio Tap завершился до старта (code ${code ?? 'null'}, signal ${signal ?? 'null'})`))
        } else if (!this.stopping) {
          options.onError(new Error(`macOS CoreAudio Tap неожиданно завершился (code ${code ?? 'null'}, signal ${signal ?? 'null'})`))
        }
      })
    })
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) {
      this.stdoutRemainder = Buffer.alloc(0)
      return
    }
    this.stopping = true

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try { child.kill('SIGKILL') } catch { /* already exited */ }
        resolve()
      }, STOP_TIMEOUT_MS)
      child.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
      if (child.exitCode !== null) {
        clearTimeout(timeout)
        resolve()
      } else {
        try { child.kill('SIGTERM') } catch { resolve() }
      }
    })

    if (this.child === child) this.child = null
    this.stderrBuffer = ''
    this.stdoutRemainder = Buffer.alloc(0)
    this.stopping = false
  }

  resolveBinary(): string | null {
    const configured = loadConfig().macosAudioTapPath?.trim()
    const candidates = [
      configured,
      join(process.resourcesPath ?? '', 'macos-audio-tap'),
      join(process.resourcesPath ?? '', 'bin', 'macos-audio-tap'),
      join(process.cwd(), 'resources', 'bin', 'macos-audio-tap'),
      join(app.getAppPath(), 'resources', 'bin', 'macos-audio-tap'),
    ].filter((candidate): candidate is string => Boolean(candidate))

    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue
      try {
        accessSync(candidate, constants.X_OK)
      } catch {
        continue
      }
      return candidate
    }
    return null
  }

  private consumeStderr(chunk: Buffer, onMessage: (message: NativeMessage) => void): void {
    this.stderrBuffer += chunk.toString()
    let newline = this.stderrBuffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.stderrBuffer.slice(0, newline).trim()
      this.stderrBuffer = this.stderrBuffer.slice(newline + 1)
      if (line) {
        try { onMessage(JSON.parse(line) as NativeMessage) }
        catch { log.debug(`Native helper wrote a non-JSON diagnostic: ${line}`) }
      }
      newline = this.stderrBuffer.indexOf('\n')
    }
  }

  /** Node pipe chunks are not PCM frames; keep an odd trailing byte for the next read. */
  private alignPcm(chunk: Buffer): Buffer | null {
    const combined = this.stdoutRemainder.byteLength > 0
      ? Buffer.concat([this.stdoutRemainder, chunk])
      : chunk
    const usableBytes = combined.byteLength - (combined.byteLength % 2)
    this.stdoutRemainder = usableBytes < combined.byteLength
      ? Buffer.from(combined.subarray(usableBytes))
      : Buffer.alloc(0)
    if (usableBytes === 0) return null
    return Buffer.from(combined.subarray(0, usableBytes))
  }

  private describeNativeError(message: NativeMessage): Error {
    if (message.code === 'permission_denied') {
      return new Error('macOS не разрешила системный звук. В System Settings → Privacy & Security разрешите System Audio Recording для Answerline и перезапустите приложение')
    }
    if (message.status === 0x216f626a) {
      return new Error('macOS не зарегистрировала CoreAudio Tap. Проверьте System Audio Recording, перезапустите приложение и повторите попытку')
    }
    return new Error(message.message || 'macOS CoreAudio Tap не запустился')
  }
}

interface NativeMessage {
  type?: string
  code?: string
  message?: string
  status?: number
}

export const macosAudioTap = new MacosAudioTap()
