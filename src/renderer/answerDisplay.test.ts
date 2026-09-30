import { describe, expect, it } from 'vitest'
import { stableAnswerPrefix } from './answerDisplay'

describe('stableAnswerPrefix', () => {
  it('keeps an unfinished sentence out of the layout', () => {
    expect(stableAnswerPrefix('Первое предложение уже закончено. Второе пока')).toBe('Первое предложение уже закончено.')
  })

  it('reveals a sentence only after its punctuation arrives', () => {
    expect(stableAnswerPrefix('Первое предложение уже закончено. Второе тоже.')).toBe('Первое предложение уже закончено. Второе тоже.')
  })

  it('reveals completed code lines while buffering the current line', () => {
    const text = '```python\ndef answer():\n    return 42\n'
    expect(stableAnswerPrefix(text)).toBe(text)
    expect(stableAnswerPrefix(`${text}    return`)).toBe(text)
  })

  it('does not reveal a partial code fence line', () => {
    expect(stableAnswerPrefix('```python')).toBe('')
    expect(stableAnswerPrefix('```python\ndef answer():')).toBe('```python\n')
  })
})
