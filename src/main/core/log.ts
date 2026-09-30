type Level = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/**
 * Resolved lazily, not at import time. ES module imports are hoisted, so anything
 * read at module scope here would run before .env is loaded and ANSWERLINE_LOG_LEVEL
 * would silently never work.
 */
let threshold: number | null = null

function currentThreshold(): number {
  if (threshold === null) {
    threshold = ORDER[(process.env.ANSWERLINE_LOG_LEVEL?.trim() as Level) ?? 'info'] ?? ORDER.info
  }
  return threshold
}

/**
 * Console logging with a scope tag. Nothing more: there is no telemetry, no
 * remote sink and no log file, so audio and transcript content cannot leave the
 * machine through this path.
 */
export function createLogger(scope: string) {
  const emit = (level: Level, args: unknown[]) => {
    if (ORDER[level] < currentThreshold()) return
    const line = `[${scope}]`
    if (level === 'error') console.error(line, ...args)
    else if (level === 'warn') console.warn(line, ...args)
    else console.log(line, ...args)
  }

  return {
    debug: (...args: unknown[]) => emit('debug', args),
    info: (...args: unknown[]) => emit('info', args),
    warn: (...args: unknown[]) => emit('warn', args),
    error: (...args: unknown[]) => emit('error', args),
  }
}
