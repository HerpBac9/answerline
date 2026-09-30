import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Everything the app needs to find on disk, plus the few knobs worth changing.
 *
 * Deliberately one JSON file rather than a settings framework: there are ~12
 * values, they change rarely, and a file the user can open in an editor is easier
 * to reason about than an encrypted store behind an IPC layer.
 *
 * Heavy runtime assets (Whisper models, GPU runtimes and the Windows native
 * audio module) are referenced by path rather than copied. Duplicating them in
 * this repository is not worth it; `npm run doctor` verifies the paths resolve.
 */
/** The interview assistant deliberately transcribes Russian only. */
export const STT_LANGUAGE = 'ru' as const

export interface Config {
  /** Directory holding the platform's whisper-server executable and its runtime files. */
  whisperRuntimeDir: string
  /** Optional direct path for a non-standard whisper.cpp layout. */
  whisperServerPath: string | null
  whisperModelPath: string
  /**
   * Prebuilt Rust WASAPI loopback + mic capture module. This is retained for
   * existing Windows configurations; macOS uses the bundled CoreAudio helper.
   */
  windowsAudioModulePath: string | null
  /** Optional path to the native macOS CoreAudio Tap helper. */
  macosAudioTapPath: string | null
  /** Prebuilt acoustic echo cancellation module. Optional: capture works without it. */
  aecModulePath: string | null

  /** OpenAI-compatible endpoint. LM Studio's local server by default. */
  llmBaseUrl: string
  /** Exact model id as LM Studio reports it, or 'auto' for the only loaded LLM. */
  llmModel: string

  /** Retained for config-file compatibility; runtime is fixed to Russian. */
  sttLanguage: typeof STT_LANGUAGE
  /** 0 = greedy. Beam search costs ~60-100ms per segment. */
  sttBeamSize: number
  /**
   * Feed the glossary's canonical terms to Whisper as an initial prompt, so it is
   * less likely to mishear them. Costs ~18ms per segment (measured).
   */
  sttPromptBias: boolean

  /** Local Qdrant collection used for per-question evidence retrieval. */
  ragQdrantUrl: string
  ragCollection: string
  /** OpenAI-compatible local embedding endpoint (normally LM Studio). */
  ragEmbeddingBaseUrl: string
  ragEmbeddingModel: string
/** Number of general-knowledge answers passed to the LLM. */
  ragGeneralTopK: number
  /** Maximum number of personal (project-specific) answers passed to the LLM. */
  ragPersonalTopK: number
  /** Minimum raw cosine score for the optional personal answer. */
  ragPersonalMinScore: number
  /** Legacy global top-K retained for older config files and probes. */
  ragTopK: number
  ragMaxContextTokens: number
  ragMinScore: number
  /** Legacy JSON fallback; runtime overrides it with LLM_MAX_TOKENS when set. */
  answerMaxTokens: number
  llmTemperature: number
  llmTopP: number
  llmTopK: number
  llmMinP: number
  llmRepeatPenalty: number
  llmPresencePenalty: number
  llmFrequencyPenalty: number
  llmSeed: number | null

  /**
   * Also answer questions you ask into the microphone, not just the ones coming
   * from the loopback channel.
   *
   * Off in real use: during an interview your own speech is context, and
   * answering it would fire on every question you ask the interviewer. On for
   * testing, because it is the only way to exercise the pipeline without a second
   * person. `ANSWERLINE_ANSWER_FROM_MIC=1` overrides this without editing the file.
   */
  answerFromMic: boolean

  hotkeys: {
    toggleWindow: string
    togglePause: string
    askLastUtterance: string
  }
  /** Best effort only: asks the OS to exclude the window from capture. */
  excludeFromCapture: boolean
}

function defaultConfig(): Config {
  const isWindows = process.platform === 'win32'

  return {
    // Heavy runtime assets are per-machine: whisper.cpp, its model and the
    // Windows native modules live wherever you built them, so every default
    // ships empty and `npm run doctor` tells you exactly what is missing.
    // Never seed these with paths from a developer's own machine.
    whisperRuntimeDir: '',
    whisperServerPath: null,
    whisperModelPath: '',
    windowsAudioModulePath: isWindows ? '' : null,
    macosAudioTapPath: null,
    aecModulePath: isWindows ? '' : null,

    llmBaseUrl: 'http://127.0.0.1:1234',
    llmModel: 'auto',

    sttLanguage: STT_LANGUAGE,
    sttBeamSize: 0,
    sttPromptBias: true,

    ragQdrantUrl: 'http://127.0.0.1:6333',
    ragCollection: 'answerline_qa',
    ragEmbeddingBaseUrl: 'http://127.0.0.1:1234',
    ragEmbeddingModel: 'text-embedding-embeddinggemma-300m',
    ragGeneralTopK: 3,
    ragPersonalTopK: 1,
    ragPersonalMinScore: 0.60,
    ragTopK: 5,
    ragMaxContextTokens: 4_000,
    ragMinScore: 0.45,

    answerMaxTokens: 768,
    llmTemperature: 0.2,
    llmTopP: 1,
    llmTopK: 40,
    llmMinP: 0.05,
    llmRepeatPenalty: 1.1,
    llmPresencePenalty: 0,
    llmFrequencyPenalty: 0,
    llmSeed: null,
    answerFromMic: false,

    hotkeys: {
      // CommandOrControl maps to Command on macOS and Control on Windows. It is
      // still only a default: `npm run hotkeys` reports what is free locally.
      toggleWindow: 'CommandOrControl+Shift+\\',
      togglePause: 'CommandOrControl+Shift+P',
      askLastUtterance: 'CommandOrControl+Shift+Enter',
    },
    excludeFromCapture: true,
  }
}

let cached: Config | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): Config {
  if (cached) return cached

  const defaults = defaultConfig()
  const path = configPath()

  if (!existsSync(path)) {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(path, `${JSON.stringify(defaults, null, 2)}\n`, 'utf8')
    cached = defaults
    return cached
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Config>
    // Shallow merge so a config written by an older version keeps working when
    // new keys appear, instead of failing to start.
    cached = {
      ...defaults,
      ...parsed,
      // Do not allow an old or hand-edited config to re-enable auto-detection
      // or another language. This product has a Russian-only speech contract.
      sttLanguage: STT_LANGUAGE,
      hotkeys: { ...defaults.hotkeys, ...(parsed.hotkeys ?? {}) },
    }
  } catch (error) {
    // A hand-edited file with a stray comma must not brick the app.
    console.error(`config.json is invalid, using defaults: ${String(error)}`)
    cached = defaults
  }
  return cached
}

export function configFilePath(): string {
  return configPath()
}

export interface LlmSettings {
  baseUrl: string
  model: string
  maxTokens: number
  temperature: number
  topP: number
  topK: number
  minP: number
  repeatPenalty: number
  presencePenalty: number
  frequencyPenalty: number
  seed: number | null
}

/**
 * Generation settings are controlled by `.env` for both the app and probes.
 * The JSON config remains only as a backwards-compatible fallback for users
 * who already have a config file from an older build.
 */
export function llmSettings(): LlmSettings {
  const config = loadConfig()
  return {
    baseUrl: (process.env.LLM_BASE_URL?.trim() || config.llmBaseUrl).replace(/\/$/u, ''),
    model: process.env.LLM_MODEL?.trim() || config.llmModel,
    maxTokens: positiveIntegerEnv('LLM_MAX_TOKENS', config.answerMaxTokens),
    temperature: boundedNumberEnv('LLM_TEMPERATURE', config.llmTemperature, 0, 2),
    topP: boundedNumberEnv('LLM_TOP_P', config.llmTopP, 0, 1),
    topK: positiveIntegerEnv('LLM_TOP_K', config.llmTopK),
    minP: boundedNumberEnv('LLM_MIN_P', config.llmMinP, 0, 1),
    repeatPenalty: positiveNumberEnv('LLM_REPEAT_PENALTY', config.llmRepeatPenalty),
    presencePenalty: finiteNumberEnv('LLM_PRESENCE_PENALTY', config.llmPresencePenalty),
    frequencyPenalty: finiteNumberEnv('LLM_FREQUENCY_PENALTY', config.llmFrequencyPenalty),
    seed: nullableIntegerEnv('LLM_SEED', config.llmSeed),
  }
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function positiveNumberEnv(name: string, fallback: number): number {
  const parsed = Number.parseFloat(process.env[name] ?? '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function finiteNumberEnv(name: string, fallback: number): number {
  const parsed = Number.parseFloat(process.env[name] ?? '')
  return Number.isFinite(parsed) ? parsed : fallback
}

function boundedNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(process.env[name] ?? '')
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function nullableIntegerEnv(name: string, fallback: number | null): number | null {
  const value = process.env[name]?.trim()
  if (!value) return fallback
  if (value.toLowerCase() === 'none' || value.toLowerCase() === 'null') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : fallback
}

/**
 * Env override for the testing switch, so it can be flipped per run without
 * editing config.json:
 *
 *   ANSWERLINE_ANSWER_FROM_MIC=1 npm run dev
 */
export function answerFromMicEnabled(): boolean {
  const fromEnv = process.env.ANSWERLINE_ANSWER_FROM_MIC?.trim().toLowerCase()
  if (fromEnv === '1' || fromEnv === 'true') return true
  if (fromEnv === '0' || fromEnv === 'false') return false
  return loadConfig().answerFromMic
}
