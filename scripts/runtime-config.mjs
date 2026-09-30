import { existsSync, readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Node-only probes cannot import Electron's `app.getPath('userData')`. Keep the
 * matching platform convention here, with ANSWERLINE_CONFIG_PATH available for a
 * custom Electron userData directory or an isolated test profile.
 */
export function userConfigPath() {
  const explicit = process.env.ANSWERLINE_CONFIG_PATH?.trim()
  if (explicit) return resolve(explicit)
  if (platform() === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'answerline', 'config.json')
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'answerline', 'config.json')
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'answerline', 'config.json')
}

export function readUserConfig() {
  const path = userConfigPath()
  if (!existsSync(path)) return { path, config: {}, exists: false }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return { path, config: value && typeof value === 'object' ? value : {}, exists: true }
  } catch (error) {
    throw new Error(`Invalid config.json at ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Defaults that standalone probes need before Electron has created a profile. */
export const SERVICE_DEFAULTS = {
  whisperRuntimeDir: '',
  whisperServerPath: null,
  whisperModelPath: '',
  windowsAudioModulePath: null,
  macosAudioTapPath: null,
  aecModulePath: null,
  llmBaseUrl: 'http://127.0.0.1:1234',
  llmModel: 'auto',
  answerMaxTokens: 768,
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
}
