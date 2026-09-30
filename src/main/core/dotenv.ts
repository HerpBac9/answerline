import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Load `.env` from the project root into process.env.
 *
 * Written by hand rather than pulled in as a dependency: it is fifteen lines, and
 * electron-vite does not put .env into the main process anyway (its env handling
 * targets the renderer). Setting a variable inline before an npm script is also
 * awkward on Windows, where npm scripts run through cmd.
 *
 * Existing environment variables always win, so `ANSWERLINE_LOG_LEVEL=debug npm run dev`
 * still overrides the file.
 */
export function loadDotEnv(root = process.cwd()): void {
  const path = join(root, '.env')
  if (!existsSync(path)) return

  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator <= 0) continue

    const key = line.slice(0, separator).trim()
    if (!key || key in process.env) continue

    // Strip one layer of matching quotes so values with spaces work.
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/s, '$2')
    process.env[key] = value
  }
}
