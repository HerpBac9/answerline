import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDotEnv } from './dotenv'

const KEYS = ['ANSWERLINE_TEST_A', 'ANSWERLINE_TEST_B', 'ANSWERLINE_TEST_QUOTED', 'ANSWERLINE_TEST_EMPTY', 'ANSWERLINE_ANSWER_FROM_MIC']

function withEnvFile(contents: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'solo-dotenv-'))
  writeFileSync(join(dir, '.env'), contents, 'utf8')
  loadDotEnv(dir)
}

afterEach(() => {
  for (const key of KEYS) delete process.env[key]
})

describe('loadDotEnv', () => {
  it('loads simple assignments', () => {
    withEnvFile('ANSWERLINE_TEST_A=1\nANSWERLINE_TEST_B=hello world\n')

    expect(process.env.ANSWERLINE_TEST_A).toBe('1')
    expect(process.env.ANSWERLINE_TEST_B).toBe('hello world')
  })

  it('skips comments and blank lines', () => {
    withEnvFile('# a comment\n\n   \nANSWERLINE_TEST_A=2\n')

    expect(process.env.ANSWERLINE_TEST_A).toBe('2')
  })

  it('strips one layer of matching quotes', () => {
    withEnvFile('ANSWERLINE_TEST_QUOTED="with spaces"\n')

    expect(process.env.ANSWERLINE_TEST_QUOTED).toBe('with spaces')
  })

  it('does not override a variable already in the environment', () => {
    // `ANSWERLINE_ANSWER_FROM_MIC=0 npm run dev` must beat the file.
    process.env.ANSWERLINE_ANSWER_FROM_MIC = '0'
    withEnvFile('ANSWERLINE_ANSWER_FROM_MIC=1\n')

    expect(process.env.ANSWERLINE_ANSWER_FROM_MIC).toBe('0')
  })

  it('ignores malformed lines instead of throwing', () => {
    withEnvFile('this line has no equals sign\n=novalue\nANSWERLINE_TEST_A=3\n')

    expect(process.env.ANSWERLINE_TEST_A).toBe('3')
  })

  it('is a no-op when there is no .env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'solo-dotenv-none-'))
    expect(() => loadDotEnv(dir)).not.toThrow()
  })
})
