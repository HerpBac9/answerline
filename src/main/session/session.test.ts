import { describe, expect, it } from 'vitest'
import { isQuestion } from './session'

describe('isQuestion', () => {
  it.each([
    'Расскажите про самый сложный проект',
    'Почему вы выбрали Kafka',
    'Кто отвечал за релизы',
    'Какие подходы вы рассматривали',
    'Сколько человек было в команде',
    'Как вы декомпозировали монолит',
    'Чей это был выбор',
    'Есть ли у вас опыт с Kubernetes',
    'Объясните разницу между RAG и fine-tuning',
    'А что было самым сложным?',
    'What is your experience with Postgres',
  ])('treats %j as a question', (text) => {
    // Whisper often omits the question mark, so wording has to carry the signal.
    expect(isQuestion(text)).toBe(true)
  })

  it.each([
    'Как раз наоборот, мы это уже сделали',
    'Как я говорил, миграция заняла два месяца',
    'Как правило, мы деплоим по пятницам',
    'Как вы знаете, у нас микросервисы',
    'Как только закончим, покажу дашборд',
    'Мы закончили миграцию базы вчера',
    'Спасибо, понятно',
    'Ага',
  ])('does not treat %j as a question', (text) => {
    // A false positive burns an answer and a permanent pair of turns in history;
    // a miss costs nothing because the hotkey still works.
    expect(isQuestion(text)).toBe(false)
  })

  it('matches a question word that is not at the start of the sentence', () => {
    expect(isQuestion('Хорошо, а почему именно этот подход')).toBe(true)
  })

  it('is not fooled by a question word glued inside another word', () => {
    // `\b` cannot express this for Cyrillic, which is why the boundary is explicit.
    expect(isQuestion('Мы обсуждали чтото невнятное')).toBe(false)
    expect(isQuestion('Никто не возражал')).toBe(false)
  })

  it('ignores blank input', () => {
    expect(isQuestion('   ')).toBe(false)
  })
})
