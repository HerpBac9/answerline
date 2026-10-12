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
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase() === 'bridge' ? 'bridge' : 'lmstudio'
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || (provider === 'bridge' ? 'http://127.0.0.1:17841' : fallback.baseUrl || DEFAULTS.baseUrl)).replace(/\/$/u, '')
  const projectUrl = provider === 'bridge' ? bridgeProjectUrl() : undefined
  return {
    provider,
    baseUrl: provider === 'bridge' ? baseUrl.replace(/\/v1$/u, '') : baseUrl,
    model: process.env.LLM_MODEL?.trim() || (provider === 'bridge' ? 'chatgpt-web/gpt-6-sol' : fallback.model || DEFAULTS.model),
    ...(provider === 'bridge' ? {
      reasoningEffort: bridgeReasoningEffort(),
      ...(projectUrl ? { projectUrl } : {}),
      projectPromptMode: bridgeProjectPromptMode(Boolean(projectUrl)),
    } : {}),
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

function bridgeReasoningEffort() {
  const value = process.env.LLM_REASONING_EFFORT?.trim().toLowerCase() || 'low'
  if (!['low', 'medium', 'high', 'xhigh'].includes(value)) {
    throw new Error(`Invalid LLM_REASONING_EFFORT=${value}: use low, medium, high or xhigh (GPT-6 has no none mode)`)
  }
  return value
}

function bridgeProjectUrl() {
  const value = process.env.LLM_PROJECT_URL?.trim()
  if (!value) return undefined
  let url
  try { url = new URL(value) }
  catch { throw new Error('Invalid LLM_PROJECT_URL: expected a ChatGPT Project or Project-chat URL') }
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' ||
    url.port || url.username || url.password || url.search || url.hash ||
    !/^\/g\/g-p-[a-f0-9]{32}(?:-[a-z0-9]+)*\/(?:project\/?|c\/[a-fA-F0-9-]{24,80})$/.test(url.pathname)) {
    throw new Error('Invalid LLM_PROJECT_URL: expected https://chatgpt.com/g/g-p-.../project or /c/...')
  }
  return url.origin + url.pathname
}

function bridgeProjectPromptMode(hasProject) {
  const mode = process.env.LLM_PROJECT_PROMPT_MODE?.trim().toLowerCase() || (hasProject ? 'project' : 'inline')
  if (mode !== 'inline' && mode !== 'project') throw new Error('Invalid LLM_PROJECT_PROMPT_MODE: use inline or project')
  if (mode === 'project' && !hasProject) throw new Error('LLM_PROJECT_PROMPT_MODE=project requires LLM_PROJECT_URL')
  return mode
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
