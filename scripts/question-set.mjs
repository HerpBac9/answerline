import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Load an evaluation question set without coupling the questions to an eval
 * script. The file may contain either a bare array or an object with a
 * `questions` array; the latter also gives the set a place for metadata.
 */
export function loadQuestionSet(root, fallbackQuestions) {
  const configuredPath = process.env.RAG_QUESTIONS_FILE?.trim()
  if (!configuredPath) return fallbackQuestions

  const path = resolve(root, configuredPath)
  if (!existsSync(path)) throw new Error(`Question set does not exist: ${path}`)

  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot parse question set ${path}: ${message}`)
  }

  const baseQuestions = Array.isArray(parsed) ? parsed : parsed?.questions
  if (!Array.isArray(baseQuestions) || baseQuestions.length === 0) {
    throw new Error(`Question set ${path} must contain a non-empty JSON array or a {"questions": [...]} object`)
  }

  const seenIds = new Set()
  const questions = baseQuestions.flatMap((question, index) => {
    if (!question || typeof question !== 'object') {
      throw new Error(`Question set ${path}: item ${index + 1} is not an object`)
    }
    const id = typeof question.id === 'string' ? question.id.trim() : ''
    const text = typeof question.question === 'string' ? question.question.trim() : ''
    const variants = question.variants
    if (Array.isArray(variants)) {
      if (variants.length === 0) throw new Error(`Question set ${path}: item ${index + 1} has an empty variants array`)
      return variants.map((variant, variantIndex) => {
        if (!variant || typeof variant !== 'object') throw new Error(`Question set ${path}: item ${index + 1}, variant ${variantIndex + 1} is not an object`)
        const variantId = typeof variant.id === 'string' ? variant.id.trim() : ''
        const variantText = typeof variant.question === 'string' ? variant.question.trim() : ''
        const expandedId = `${id}-${variantId || variantIndex + 1}`
        if (!id || !variantText) throw new Error(`Question set ${path}: item ${index + 1}, variant ${variantIndex + 1} needs id and question`)
        if (seenIds.has(expandedId)) throw new Error(`Question set ${path}: duplicate question id ${expandedId}`)
        seenIds.add(expandedId)
        const { variants: _variants, question: _question, ...base } = question
        return {
          ...base,
          ...variant,
          id: expandedId,
          base_id: id,
          variant: variant.variant ?? variantId,
          question: variantText,
        }
      })
    }
    if (!id || !text) throw new Error(`Question set ${path}: item ${index + 1} needs non-empty id and question`)
    if (seenIds.has(id)) throw new Error(`Question set ${path}: duplicate question id ${id}`)
    seenIds.add(id)
    return [{ ...question, id, question: text }]
  }).flat()

  if (questions.length === 0) {
    throw new Error(`Question set ${path} expanded to an empty question list`)
  }

  const sampleSize = positiveInteger(process.env.RAG_QUESTIONS_SAMPLE_SIZE)
  if (!sampleSize) return questions
  if (sampleSize > questions.length) {
    throw new Error(`Question set ${path} contains ${questions.length} questions, cannot sample ${sampleSize}`)
  }

  const seed = process.env.RAG_QUESTIONS_SEED?.trim() || String(Date.now())
  const sampled = sampleQuestions(questions, sampleSize, seed)
  console.log(`Question set: ${path}; selected ${sampled.length}/${questions.length}; seed=${seed}`)
  return sampled
}

function positiveInteger(value) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function sampleQuestions(questions, count, seed) {
  const selected = [...questions]
  const random = seededRandom(seed)
  for (let index = 0; index < count; index += 1) {
    const swapIndex = index + Math.floor(random() * (selected.length - index))
    ;[selected[index], selected[swapIndex]] = [selected[swapIndex], selected[index]]
  }
  return selected.slice(0, count)
}

function seededRandom(seed) {
  let state = 2166136261
  for (const character of seed) {
    state ^= character.codePointAt(0)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
