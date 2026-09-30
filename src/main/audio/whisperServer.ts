import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname } from 'node:path'
import { createLogger } from '../core/log'

const log = createLogger('WhisperServer')

const READY_TIMEOUT_MS = 60_000
const READY_POLL_MS = 100
const STOP_GRACE_MS = 3_000

export interface WhisperServerConfig {
  executablePath: string
  modelPath: string
  language: string
  threads: number
  /** 0 keeps whisper's greedy default; >0 enables beam search. */
  beamSize: number
}

export interface TranscribeOptions {
  /** Decode-time term biasing. Rebuilt per request; no restart needed. */
  prompt?: string
  timeoutMs: number
  /** Request-level override; set explicitly because server defaults vary by build. */
  language: string
}

/**
 * A single long-lived whisper.cpp server process.
 *
 * The previous design spawned whisper-cli per audio segment, which reloaded
 * the 574MB model every time. Measured on an RTX 3070: 1795-1820ms of the
 * 1867-2054ms total was that reload, for every partial and every final - so the
 * 1s/1.5s latency targets in AGENTS.md В§5.1 were unreachable by construction.
 * With the model resident the same request takes ~190ms warm.
 *
 * The process lives exactly as long as a recording. It is deliberately NOT kept
 * warm between recordings: the model holds ~573MB of VRAM, which on an 8GB card
 * is memory the answer model needs. A ~2s start once per recording is invisible;
 * 573MB held permanently is not.
 */
export class WhisperServer {
  private child: ChildProcess | null = null
  private baseUrl = ''
  private exitHandler: (() => void) | null = null

  get isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null
  }

  async start(config: WhisperServerConfig): Promise<void> {
    if (this.isRunning) return

    const port = await findFreePort()
    this.baseUrl = `http://127.0.0.1:${port}`

    const args = [
      '-m', config.modelPath,
      '-l', config.language,
      '-t', String(config.threads),
      '-nt',
      '--host', '127.0.0.1',
      '--port', String(port),
    ]
    // Beam search costs +60..100ms per request against a ~190ms warm baseline.
    // Off by default until measured under concurrent LLM load on the same GPU.
    if (config.beamSize > 0) args.push('-bs', String(config.beamSize))

    log.info(`Starting whisper-server on port ${port}, language=${config.language}`)
    const child = spawn(config.executablePath, args, {
      cwd: dirname(config.executablePath),
      // Ignored elsewhere, but keeping this Windows-only avoids putting a
      // platform implementation detail into the macOS launch path.
      ...(process.platform === 'win32' ? { windowsHide: true } : {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) log.debug(text)
    })
    child.on('exit', (code, signal) => {
      if (this.child === child) this.child = null
      // Only surprising if we did not ask for it; stop() clears this.child first.
      log.warn(`whisper-server exited unexpectedly (code ${code}, signal ${signal})`)
    })

    // Without this the model process outlives a crash or a hard quit, keeping
    // both VRAM and the port. AGENTS.md В§2 requires child processes to terminate.
    this.exitHandler = () => { child.kill() }
    process.once('exit', this.exitHandler)

    try {
      await this.waitUntilReady(child)
    } catch (error) {
      await this.stop()
      throw error
    }
    log.info('whisper-server is ready')
  }

  /** POST one WAV buffer. No temp files: the buffer goes straight into the body. */
  async transcribe(wav: Buffer, options: TranscribeOptions): Promise<string> {
    if (!this.isRunning) throw new Error('whisper-server is not running')

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav')
    form.append('response_format', 'json')
    // The process is started with -l ru, but whisper.cpp copies its defaults
    // into each request. Sending these fields too prevents an older/custom
    // server build from falling back to auto-detection or translation.
    form.append('language', options.language)
    form.append('detect_language', 'false')
    form.append('translate', 'false')
    form.append('temperature', '0')
    if (options.prompt) form.append('prompt', options.prompt)

    const response = await fetch(`${this.baseUrl}/inference`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(options.timeoutMs),
    })
    if (!response.ok) throw new Error(`whisper-server returned HTTP ${response.status}`)

    const payload = await response.json() as { text?: string; error?: string }
    if (payload.error) throw new Error(`whisper-server error: ${payload.error}`)
    return (payload.text ?? '').trim()
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    if (this.exitHandler) {
      process.removeListener('exit', this.exitHandler)
      this.exitHandler = null
    }
    if (!child || child.exitCode !== null) return

    await new Promise<void>((resolve) => {
      const done = setTimeout(() => {
        // Reached only if the graceful signal was ignored; leaving the server
        // alive would retain GPU memory (or RAM) and its port.
        child.kill('SIGKILL')
        resolve()
      }, STOP_GRACE_MS)
      child.once('exit', () => {
        clearTimeout(done)
        resolve()
      })
      child.kill()
    })
    log.info('whisper-server stopped')
  }

  /**
   * Poll until the HTTP layer answers. Any status counts, including 404: the
   * default `--public` folder does not exist in our layout, and all we need to
   * know is that the model finished loading and the socket is accepting.
   */
  private async waitUntilReady(child: ChildProcess): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS

    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`whisper-server exited during startup with code ${child.exitCode}`)
      }
      try {
        await fetch(`${this.baseUrl}/`, { signal: AbortSignal.timeout(READY_POLL_MS * 5) })
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
      }
    }
    throw new Error(`whisper-server did not become ready within ${READY_TIMEOUT_MS}ms`)
  }
}

/**
 * Ask the OS for an unused port, then hand it to whisper-server.
 *
 * There is a small race between closing this probe and the server binding. It is
 * preferred over a fixed port anyway: a fixed one collides with whatever else
 * the user runs, and a collision surfaces as a confusing startup failure rather
 * than "port busy".
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not determine a free port for whisper-server')))
        return
      }
      const { port } = address
      probe.close(() => resolve(port))
    })
  })
}
