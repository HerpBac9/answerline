import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Practice questions are drawn from the real interview corpus in `data/*.md`
 * rather than generated. A generated question drifts from the corpus wording,
 * which lowers retrieval quality and makes the graded feedback less targeted;
 * a corpus question is the exact text the knowledge base was written to answer.
 * The corpus is far too large to have been memorised, which is the point: this
 * is a study aid, so the candidate meets unfamiliar questions.
 */

/** Headings are `## <text>`; front matter must go before the count is trusted. */
const FRONT_MATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/u
const HEADING = /^##[ \t]+(.+?)[ \t]*$/gmu

/**
 * Headings that ask something. The corpus writes questions in the imperative as
 * often as in the interrogative ("Спроектируйте ...", "Покажите ..."), so a
 * `?`-only test would silently drop a few percent of the best questions - the
 * long system-design ones.
 *
 * The terminator is a Unicode-aware lookahead rather than `\b`: JavaScript
 * treats non-ASCII letters as non-word characters, so `\b` after a Cyrillic
 * word never matches and would reject every Russian question.
 */
const ASKS_SOMETHING =
  /^(как|что|почему|зачем|когда|где|какой|какая|какие|каким|какого|каких|кто|сколько|чем|в чём|с чем|расскажите|расскажи|опишите|опиши|объясните|объясни|сравните|сравни|выберите|представьте|спроектируйте|предложите|покажите|реализуйте|разберитесь|в каком|под каким|каким образом|какие риски|в каких|из чего|к какому|о чём|за счёт чего)(?!\p{L})/iu

/** Below this a heading is a section label ("Итоги", "Часть 2"), not a question. */
const MIN_QUESTION_LENGTH = 12

/**
 * `Вопрос 12. ...` and `12. ...` are corpus numbering, not part of the question
 * the candidate is asked. Stripping it also keeps the dedupe key stable against
 * renumbering.
 */
const NUMBERING = /^(?:вопрос\s+)?\d+(?:\.\d+)*\.?\s*/iu

export interface BankQuestion {
  /** Question text with corpus numbering removed, ready to show and to embed. */
  text: string
  /** Source file name, so the UI can name the domain the question came from. */
  sourceFile: string
}

/** Parse one corpus file into questions. Exported for tests. */
export function parseQuestions(markdown: string, sourceFile: string): BankQuestion[] {
  const body = markdown.replace(FRONT_MATTER, '$1')
  const questions: BankQuestion[] = []
  for (const match of body.matchAll(HEADING)) {
    const text = match[1].replace(NUMBERING, '').trim()
    if (text.length < MIN_QUESTION_LENGTH) continue
    if (!text.includes('?') && !ASKS_SOMETHING.test(text)) continue
    questions.push({ text, sourceFile })
  }
  return questions
}

/** Load every top-level `data/*.md` question. `data/_pipeline/` is not indexed. */
export function loadQuestionBank(dataDir: string): BankQuestion[] {
  if (!existsSync(dataDir)) return []
  const files = readdirSync(dataDir)
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .sort()

  const questions: BankQuestion[] = []
  for (const file of files) {
    try {
      questions.push(...parseQuestions(readFileSync(join(dataDir, file), 'utf8'), file))
    } catch {
      // A single unreadable corpus file must not empty the whole bank.
    }
  }
  return questions
}

/**
 * Draws questions from the corpus without repeats inside a session. The bank is
 * ~13k questions, so a shuffle is enough to keep a session fresh; `pick`
 * filters the already-asked set so "next question" is never a repeat.
 */
export class QuestionBank {
  private readonly questions: BankQuestion[]
  private order: number[] = []
  private readonly asked = new Set<string>()

  constructor(questions: BankQuestion[]) {
    this.questions = questions
    this.reshuffle()
  }

  get size(): number {
    return this.questions.length
  }

  /** Next unused question, or null when the corpus has been exhausted. */
  pick(): BankQuestion | null {
    for (const index of this.order) {
      const question = this.questions[index]
      if (!question || this.asked.has(question.text)) continue
      this.asked.add(question.text)
      return question
    }
    // Every question was asked: start over rather than returning nothing, since
    // a practice session should not dead-end on a long corpus.
    this.asked.clear()
    this.reshuffle()
    return this.order.length > 0 ? this.pick() : null
  }

  /** Forget what was already asked, so a new session can start from a new order. */
  reset(): void {
    this.asked.clear()
    this.reshuffle()
  }

  private reshuffle(): void {
    this.order = this.questions.map((_, index) => index)
    for (let i = this.order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.order[i], this.order[j]] = [this.order[j], this.order[i]]
    }
  }
}
