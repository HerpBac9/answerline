const DEFAULTS = {
  baseUrl: 'http://127.0.0.1:1234',
  model: 'auto',
  maxTokens: 768,
  temperature: 0.2,
  topP: 1,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  seed: null,
}

/** Read the same LLM generation knobs used by the Electron main process. */
export function readLlmSettings(fallback = {}) {
  return {
    baseUrl: (process.env.LLM_BASE_URL?.trim() || fallback.baseUrl || DEFAULTS.baseUrl).replace(/\/$/u, ''),
    model: process.env.LLM_MODEL?.trim() || fallback.model || DEFAULTS.model,
    maxTokens: positiveInteger('LLM_MAX_TOKENS', fallback.maxTokens ?? DEFAULTS.maxTokens),
    temperature: boundedNumber('LLM_TEMPERATURE', fallback.temperature ?? DEFAULTS.temperature, 0, 2),
    topP: boundedNumber('LLM_TOP_P', fallback.topP ?? DEFAULTS.topP, 0, 1),
    topK: positiveInteger('LLM_TOP_K', fallback.topK ?? DEFAULTS.topK),
    minP: boundedNumber('LLM_MIN_P', fallback.minP ?? DEFAULTS.minP, 0, 1),
    repeatPenalty: positiveNumber('LLM_REPEAT_PENALTY', fallback.repeatPenalty ?? DEFAULTS.repeatPenalty),
    presencePenalty: finiteNumber('LLM_PRESENCE_PENALTY', fallback.presencePenalty ?? DEFAULTS.presencePenalty),
    frequencyPenalty: finiteNumber('LLM_FREQUENCY_PENALTY', fallback.frequencyPenalty ?? DEFAULTS.frequencyPenalty),
    seed: nullableInteger('LLM_SEED', fallback.seed ?? DEFAULTS.seed),
  }
}

export function llmRequestOptions(settings) {
  return {
    max_tokens: settings.maxTokens,
    temperature: settings.temperature,
    top_p: settings.topP,
    top_k: settings.topK,
    min_p: settings.minP,
    repeat_penalty: settings.repeatPenalty,
    presence_penalty: settings.presencePenalty,
    frequency_penalty: settings.frequencyPenalty,
    ...(settings.seed === null ? {} : { seed: settings.seed }),
    stream: true,
  }
}

function positiveInteger(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function positiveNumber(name, fallback) {
  const parsed = Number.parseFloat(process.env[name] ?? '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function finiteNumber(name, fallback) {
  const parsed = Number.parseFloat(process.env[name] ?? '')
  return Number.isFinite(parsed) ? parsed : fallback
}

function boundedNumber(name, fallback, min, max) {
  const parsed = Number.parseFloat(process.env[name] ?? '')
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function nullableInteger(name, fallback) {
  const value = process.env[name]?.trim()
  if (!value) return fallback
  if (value.toLowerCase() === 'none' || value.toLowerCase() === 'null') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : fallback
}
