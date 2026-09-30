import { describe, expect, it } from 'vitest'
import { cleanSectionAnswer } from './section-answer.mjs'

describe('cleanSectionAnswer', () => {
  it('removes the Уровень metadata line and the leading Ответ marker', () => {
    expect(cleanSectionAnswer('\n**Уровень:** Junior\n\n**Ответ:**\nPython передаёт ссылки на объекты.\n'))
      .toBe('Python передаёт ссылки на объекты.')
  })

  it('removes the level line and marker when they arrive in either order', () => {
    expect(cleanSectionAnswer('**Ответ:**\n**Уровень:** Senior\nОтвет по существу.'))
      .toBe('Ответ по существу.')
  })

  it('keeps prose that merely mentions Уровень or Ответ mid-text', () => {
    expect(cleanSectionAnswer('Уровень доверия присваивается данным.\n\n**Ответ** внутри прозы не трогаем.'))
      .toBe('Уровень доверия присваивается данным.\n\n**Ответ** внутри прозы не трогаем.')
  })

  it('returns plain answers unchanged', () => {
    expect(cleanSectionAnswer('Простой ответ без маркеров.')).toBe('Простой ответ без маркеров.')
  })
})
