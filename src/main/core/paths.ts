import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Locate a file shipped in resources/, in dev and when packaged.
 *
 * These are small user-editable data files (the glossary, hallucination
 * patterns). The heavy binaries are found via config.json instead, because they
 * are referenced rather than copied.
 */
export function resourcePath(name: string): string | null {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, name) : '',
    join(process.cwd(), 'resources', name),
  ].filter(Boolean)

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}
