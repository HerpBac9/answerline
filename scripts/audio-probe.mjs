/**
 * Verify that the two physical channels deliver audible PCM before debugging
 * Whisper or the LLM. Windows can do this in plain Node because its backend is
 * a native addon. macOS system audio uses a native helper owned by the Electron
 * app, while the microphone still requires a renderer click.
 *
 *   node scripts/audio-probe.mjs [seconds]
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import { readUserConfig } from './runtime-config.mjs'

const currentPlatform = platform()
if (currentPlatform === 'darwin') {
  console.log('macOS uses the native CoreAudio Process Tap helper for system audio and a renderer microphone stream.')
  console.log('Run the packaged app, click «Слушать», then verify both channels with real meeting audio and a microphone.')
  console.log('This plain Node probe cannot exercise the app-owned IPC/microphone path; npm run compile:mac-audio builds the helper.')
} else if (currentPlatform !== 'win32') {
  console.error(`Audio probe is unsupported on ${currentPlatform}.`)
  process.exitCode = 1
} else {
  const require = createRequire(import.meta.url)
  const seconds = Number(process.argv[2]) || 8
  const path = readUserConfig().config.windowsAudioModulePath

  if (!path || !existsSync(path)) {
    console.error(`Native audio module not found: ${path}\nFix windowsAudioModulePath in config.json.`)
    process.exitCode = 1
  } else {
    let audio
    try {
      audio = require(path)
    } catch (error) {
      console.error(`Native audio module could not be loaded from ${path}. It may be built for Electron's ABI.\n${String(error).split(/\r?\n/u)[0]}`)
      process.exitCode = 1
      process.exit()
    }
    const stats = {
      system: { chunks: 0, bytes: 0, peak: 0, loudChunks: 0 },
      mic: { chunks: 0, bytes: 0, peak: 0, loudChunks: 0 },
    }

    /** Same decimated RMS and threshold the app's VAD uses. */
    function rms(buffer) {
      const sampleCount = Math.floor(buffer.byteLength / 2)
      let sum = 0
      let counted = 0
      for (let index = 0; index < sampleCount; index += 16) {
        const sample = buffer.readInt16LE(index * 2)
        sum += sample * sample
        counted++
      }
      return counted === 0 ? 0 : Math.sqrt(sum / counted)
    }

    function record(channel, data) {
      const entry = stats[channel]
      entry.chunks++
      entry.bytes += data.byteLength
      const level = rms(data)
      entry.peak = Math.max(entry.peak, Math.round(level))
      if (level >= 350) entry.loudChunks++
    }

    console.log(`available: ${audio.isSystemAudioAvailable()}   permission: ${audio.hasPermission()}`)
    const systemStarted = audio.startSystemAudioCapture((chunk) => record('system', chunk.data))
    const micStarted = audio.startMicCapture((chunk) => record('mic', chunk.data))
    console.log(`started - loopback: ${systemStarted}, mic: ${micStarted}`)
    console.log(`\nListening for ${seconds}s. Play audio in your headphones AND say something.\n`)

    const started = Date.now()
    const ticker = setInterval(() => {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0)
      console.log(
        `  ${String(elapsed).padStart(2)}s  `
        + `loopback ${String(stats.system.chunks).padStart(4)} chunks, peak RMS ${String(stats.system.peak).padStart(5)}   `
        + `mic ${String(stats.mic.chunks).padStart(4)} chunks, peak RMS ${String(stats.mic.peak).padStart(5)}`,
      )
    }, 1000)

    setTimeout(() => {
      clearInterval(ticker)
      audio.stopSystemAudioCapture()
      audio.stopMicCapture()

      console.log('\nResult')
      for (const [channel, label] of [['system', 'loopback (interviewer)'], ['mic', 'microphone (you)']]) {
        const entry = stats[channel]
        const kb = (entry.bytes / 1024).toFixed(0)
        const secondsOfAudio = (entry.bytes / (16_000 * 2)).toFixed(1)
        if (entry.chunks === 0) {
          console.log(`  FAIL  ${label}: no chunks at all - the channel is not capturing`)
        } else if (entry.loudChunks === 0) {
          console.log(`  warn  ${label}: ${entry.chunks} chunks (${kb}KB, ${secondsOfAudio}s) but everything below the speech gate`)
          console.log(`          peak RMS ${entry.peak} < 350. Either nothing was playing, or it is the wrong device.`)
        } else {
          const percent = ((entry.loudChunks / entry.chunks) * 100).toFixed(0)
          console.log(`  ok    ${label}: ${entry.chunks} chunks (${secondsOfAudio}s), ${percent}% above the speech gate, peak RMS ${entry.peak}`)
        }
      }
      console.log('')
    }, seconds * 1000)
  }
}
