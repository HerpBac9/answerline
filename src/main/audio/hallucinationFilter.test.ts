import { describe, expect, it } from 'vitest'
import { HallucinationFilter } from './hallucinationFilter'

describe('HallucinationFilter', () => {
  it('resets stateful regex flags between transcripts', () => {
    const filter = HallucinationFilter.fromText('/^thank you$/gi', 'test')

    expect(filter.match('Thank you')).toBe('^thank you$')
    expect(filter.match('Thank you')).toBe('^thank you$')
  })
})
