/**
 * Verify every path and service the app needs, before it is started.
 *
 * The app references heavy binaries by absolute path instead of copying them, so
 * a wrong path is the most likely reason nothing works. This turns that into one
 * clear report rather than a runtime failure somewhere in the audio pipeline.
 *
 *   npm run doctor
 */
import { constants, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { platform } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { SERVICE_DEFAULTS, readUserConfig } from './runtime-config.mjs'
import { formatEmbeddingInput } from './embedding-input.mjs'

const require = createRequire(import.meta.url)

let problems = 0

function loadDotEnv() {
  const path = join(process.cwd(), '.env')
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!key || key in process.env) continue
    process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/s, '$2')
  }
}

loadDotEnv()

function ok(label, detail = '') {
  console.log(`  ok    ${label}${detail ? `  ${detail}` : ''}`)
}

function bad(label, detail) {
  problems++
  console.log(`  FAIL  ${label}\n          ${detail}`)
}

function mb(path) {
  return `${(statSync(path).size / 1024 / 1024).toFixed(0)}MB`
}

const { path: userConfigPath, config: fileConfig, exists: usingUserConfig } = readUserConfig()
const config = { ...SERVICE_DEFAULTS, ...fileConfig }

const ragQdrantUrl = (process.env.QDRANT_URL ?? config.ragQdrantUrl ?? 'http://127.0.0.1:6333').replace(/\/$/, '')
const ragCollection = process.env.QDRANT_COLLECTION ?? config.ragCollection ?? 'answerline_qa'
const ragEmbeddingBaseUrl = (process.env.EMBEDDING_BASE_URL ?? config.ragEmbeddingBaseUrl ?? config.llmBaseUrl ?? 'http://127.0.0.1:1234').replace(/\/$/, '')
const ragEmbeddingModel = process.env.EMBEDDING_MODEL ?? config.ragEmbeddingModel ?? 'text-embedding-embeddinggemma-300m'

console.log(`\nconfig: ${usingUserConfig ? userConfigPath : `${userConfigPath} (not created yet; service defaults only)`}\n`)

console.log('Whisper runtime')
const serverName = platform() === 'win32' ? 'whisper-server.exe' : 'whisper-server'
const serverPath = config.whisperServerPath?.trim() || (config.whisperRuntimeDir ? join(config.whisperRuntimeDir, serverName) : null)
if (serverPath && existsSync(serverPath)) {
  const executable = platform() === 'win32' || (statSync(serverPath).mode & constants.S_IXUSR) !== 0
  if (executable) ok(serverName, mb(serverPath))
  else bad(serverName, `not executable: ${serverPath} (run chmod +x on macOS)`)
} else {
  bad(serverName, `not found at ${serverPath ?? '(set whisperServerPath or whisperRuntimeDir in config.json)'}`)
}

if (platform() === 'win32') {
  const cudaDll = config.whisperRuntimeDir ? join(config.whisperRuntimeDir, 'ggml-cuda.dll') : null
  if (cudaDll && existsSync(cudaDll)) ok('ggml-cuda.dll (GPU acceleration)', mb(cudaDll))
  else console.log('  warn  ggml-cuda.dll missing - transcription will run on CPU and be much slower')
} else if (platform() === 'darwin') {
  console.log('  note  On macOS use an arm64/universal whisper.cpp build with Metal when available.')
}

if (config.whisperModelPath && existsSync(config.whisperModelPath)) ok('model', mb(config.whisperModelPath))
else bad('model', config.whisperModelPath
  ? `not found at ${config.whisperModelPath}`
  : 'not set — fill whisperModelPath in config.json')

console.log('\nAudio capture')
if (platform() === 'darwin') {
  let macVersion = ''
  try { macVersion = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim() } catch { /* reported below */ }
  const [macMajor, macMinor] = macVersion.split('.').map((part) => Number.parseInt(part, 10))
  const supported = Number.isInteger(macMajor) && (macMajor > 14 || (macMajor === 14 && (macMinor ?? 0) >= 4))
  if (supported) {
    const configuredTap = config.macosAudioTapPath?.trim()
    const tapCandidates = [
      configuredTap,
      join(process.cwd(), 'resources', 'bin', 'macos-audio-tap'),
    ].filter(Boolean)
    const tapPath = tapCandidates.find((candidate) => existsSync(candidate))
    if (tapPath) ok('CoreAudio Tap helper', tapPath)
    else bad('CoreAudio Tap helper', 'not found; run npm run compile:mac-audio before launching the macOS app')
    ok('macOS audio backend', 'CoreAudio Process Tap; no ScreenCaptureKit display stream is created')
  } else {
    bad('CoreAudio Tap backend', `macOS 14.4+ is required (detected ${macVersion || 'unknown version'})`)
  }
  console.log('  note  The first native start asks for System Audio Recording; verify real capture in the packaged .app.')
} else if (platform() === 'win32' && config.windowsAudioModulePath && existsSync(config.windowsAudioModulePath)) {
  try {
    const module = require(config.windowsAudioModulePath)
    const missing = ['startSystemAudioCapture', 'startMicCapture', 'stopSystemAudioCapture', 'stopMicCapture']
      .filter((name) => typeof module[name] !== 'function')
    if (missing.length > 0) bad('windows audio module', `loaded but missing: ${missing.join(', ')}`)
    else ok('windows audio module loads and exports the capture API')
  } catch (error) {
    // Almost always an Electron/Node ABI mismatch: the module was built for
    // Electron's V8, and plain node cannot load it.
    console.log(`  warn  windows audio module present but not loadable from plain node (expected: built for Electron's ABI)\n          ${String(error).split('\n')[0]}`)
  }
} else if (platform() === 'win32') {
  bad('windows audio module', `not found at ${config.windowsAudioModulePath}`)
} else {
  bad('audio capture', `unsupported platform: ${platform()}`)
}

if (platform() === 'win32') {
  if (!config.aecModulePath) console.log('  warn  AEC disabled in config - your own voice may leak into the interviewer channel')
  else if (existsSync(config.aecModulePath)) ok('AEC module present')
  else console.log(`  warn  AEC module not found at ${config.aecModulePath} - capture still works, echo cancellation does not`)
}

console.log('\nRAG retrieval')
let ragDimension = null
try {
  const collectionResponse = await fetch(`${ragQdrantUrl}/collections/${encodeURIComponent(ragCollection)}`, {
    signal: AbortSignal.timeout(3000),
  })
  const collectionBody = await collectionResponse.json().catch(() => null)
  if (!collectionResponse.ok) {
    bad('Qdrant collection', `${ragQdrantUrl}/${ragCollection} returned HTTP ${collectionResponse.status}`)
  } else {
    ragDimension = collectionBody?.result?.config?.params?.vectors?.size ?? null
    const points = collectionBody?.result?.points_count ?? collectionBody?.result?.indexed_vectors_count ?? null
    if (typeof ragDimension !== 'number') bad('Qdrant collection', 'vector size is missing from collection metadata')
    else if (typeof points === 'number' && points === 0) bad('Qdrant collection', 'collection exists but contains no indexed points')
    else ok('Qdrant collection', `${ragCollection}, ${points ?? '?'} point(s), ${ragDimension} dimensions`)
  }
} catch (error) {
  bad('Qdrant unreachable', `${ragQdrantUrl} - ${String(error).split('\n')[0]}`)
}

try {
  const response = await fetch(`${ragEmbeddingBaseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ragEmbeddingModel,
      input: [formatEmbeddingInput(ragEmbeddingModel, 'doctor retrieval probe', 'query')],
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await response.json().catch(() => null)
  const vector = body?.data?.[0]?.embedding
  if (!response.ok || !Array.isArray(vector)) {
    bad('embedding model', `${ragEmbeddingBaseUrl} returned HTTP ${response.status} for ${ragEmbeddingModel}`)
  } else if (ragDimension !== null && vector.length !== ragDimension) {
    bad('embedding dimension', `${ragEmbeddingModel} returned ${vector.length}, collection expects ${ragDimension}; rebuild with RAG_RECREATE=1`)
  } else {
    ok('embedding model', `${ragEmbeddingModel}, ${vector.length} dimensions`)
  }
} catch (error) {
  bad('embedding endpoint unreachable', `${ragEmbeddingBaseUrl} - ${String(error).split('\n')[0]}`)
}

console.log('\nLM Studio')
try {
  const response = await fetch(`${config.llmBaseUrl}/api/v1/models`, { signal: AbortSignal.timeout(3000) })
  const payload = await response.json()
  const loaded = (payload.models ?? []).filter((m) => m.type === 'llm' && m.loaded_instances?.length > 0)
  if (loaded.length === 0) bad('no LLM loaded', 'load a model in LM Studio and start its local server')
  else {
    for (const model of loaded) {
      const context = model.loaded_instances[0]?.config?.context_length
      ok(`loaded: ${model.key}`, `${model.quantization?.name ?? '?'}, context ${context ?? '?'}`)
    }
    if (loaded.length > 1) console.log('  warn  more than one LLM loaded - set llmModel in config.json to a specific key')
  }
} catch (error) {
  bad('LM Studio unreachable', `${config.llmBaseUrl} - ${String(error).split('\n')[0]}`)
}

console.log(problems === 0 ? '\nReady.\n' : `\n${problems} problem(s) to fix before this will work.\n`)
// Let native modules and fetch close their handles cleanly. Calling
// process.exit() here can trigger a libuv assertion in the Windows audio addon
// after doctor has successfully inspected it.
process.exitCode = problems === 0 ? 0 : 1
