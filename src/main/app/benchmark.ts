import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AnswerMetric } from '../session/session'

/**
 * Opt-in local baseline trace. It deliberately records no transcript or answer
 * body: the owner can compare quality in the overlay while this file captures
 * reproducible latency and context-pressure evidence for the RAG decision.
 */
export interface BenchmarkRecorder {
  readonly path: string | null
  record(metric: AnswerMetric): void
}

/**
 * Enabled only for an intentional benchmark run:
 *
 *   $env:ANSWERLINE_BENCHMARK_LOG = '1'; npm.cmd run dev
 *
 * A new file per process prevents an old run from being mixed with a new model
 * load or a changed RAG index.
 */
export function createBenchmarkRecorder(userDataDir: string): BenchmarkRecorder {
  if (process.env.ANSWERLINE_BENCHMARK_LOG !== '1') {
    return { path: null, record: () => undefined }
  }

  const directory = join(userDataDir, 'benchmarks')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `baseline-${new Date().toISOString().replace(/[:.]/gu, '-')}.jsonl`)
  console.log(`[Benchmark] Writing local metrics to ${path}`)

  return {
    path,
    record(metric): void {
      appendFileSync(path, `${JSON.stringify(metric)}\n`, 'utf8')
    },
  }
}
