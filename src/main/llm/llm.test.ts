import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalLlm, bridgeUserMessage, type StreamHandlers } from './llm'

const env = vi.hoisted(() => ({
  settings: {
    provider: 'bridge' as 'lmstudio' | 'bridge',
    baseUrl: 'http://127.0.0.1:17841',
    model: 'chatgpt-web/gpt-6-sol',
    reasoningEffort: 'low' as 'low' | 'medium' | 'high' | 'xhigh',
    projectUrl: undefined as string | undefined,
    projectPromptMode: 'inline' as 'inline' | 'project',
    maxTokens: 4096,
    temperature: 0.1,
    topP: 1,
    topK: 40,
    minP: 0.05,
    repeatPenalty: 1.1,
    presencePenalty: 0,
    frequencyPenalty: 0,
    seed: null,
  },
}))

vi.mock('../core/config', () => ({ llmSettings: () => env.settings }))

function handlers() {
  return { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() } satisfies StreamHandlers
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
}

function event(type: string, payload: Record<string, unknown>): string {
  return `event: ${type}\r\ndata: ${JSON.stringify({ type, ...payload })}\r\n\r\n`
}

beforeEach(() => {
  env.settings.provider = 'bridge'
  env.settings.baseUrl = 'http://127.0.0.1:17841'
  env.settings.model = 'chatgpt-web/gpt-6-sol'
  env.settings.reasoningEffort = 'low'
  env.settings.projectUrl = undefined
  env.settings.projectPromptMode = 'inline'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ChatGPT Bridge (Responses)', () => {
  it('streams final text, preserves a thread and sends current RAG evidence and system prompt', async () => {
    const sse = [
      event('response.output_item.added', { item: { id: 'c1', phase: 'commentary' } }),
      event('response.output_text.delta', { item_id: 'c1', delta: 'Не показывать' }),
      event('response.output_item.added', { item: { id: 'a1', phase: 'final_answer' } }),
      event('response.output_text.delta', { item_id: 'a1', delta: 'При' }),
      event('response.output_text.delta', { item_id: 'a1', delta: 'вет' }),
      event('response.completed', {
        response: {
          output: [{ type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'Привет' }] }],
          usage: { output_tokens: 17 },
        },
      }),
    ].join('')
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([sse.slice(0, 41), sse.slice(41, 99), sse.slice(99)]))
    vi.stubGlobal('fetch', fetchMock)
    const llm = new LocalLlm()
    const events = handlers()

    await llm.stream('ОТВЕЧАЙ ТОЛЬКО ПО МАТЕРИАЛАМ', [
      { role: 'user', content: 'старый вопрос' },
      { role: 'assistant', content: 'старый ответ' },
      { role: 'user', content: '<retrieved_context>RAG факт</retrieved_context><question>Что такое RAG?</question>' },
    ], events)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:17841/v1/responses')
    expect(options.headers).toMatchObject({ 'content-type': 'application/json', 'x-session-id': expect.any(String) })
    const body = JSON.parse(options.body as string) as {
      model: string; input: Array<{ role: string; content: Array<{ text: string }> }>;
      stream: boolean; max_output_tokens: number
    }
    expect(body.model).toBe('chatgpt-web/gpt-6-sol')
    expect(body.stream).toBe(true)
    expect(body.max_output_tokens).toBe(4096)
    expect(body).toMatchObject({
      reasoning: { effort: 'low' },
      tools: [],
      tool_choice: 'none',
      client_metadata: { 'x-bridge-no-local': true },
    })
    expect(body.input).toHaveLength(1)
    expect(body.input[0].role).toBe('user')
    expect(body.input[0].content[0].text).toContain('ОТВЕЧАЙ ТОЛЬКО ПО МАТЕРИАЛАМ')
    expect(body.input[0].content[0].text).toContain('RAG факт')
    expect(body.input[0].content[0].text).toContain('Что такое RAG?')
    expect(body.input[0].content[0].text).not.toContain('старый вопрос')
    expect(events.onDelta.mock.calls.flat().join('')).toBe('Привет')
    expect(events.onDone).toHaveBeenCalledWith('Привет', { outputTokens: 17 })
    expect(events.onError).not.toHaveBeenCalled()
  })

  it('rotates bridge thread only when resetConversation is called', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => streamResponse([
      event('response.completed', {
        response: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }] },
      }),
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const llm = new LocalLlm()
    const ids: string[] = []
    for (let index = 0; index < 3; index += 1) {
      if (index === 2) llm.resetConversation()
      await llm.stream('Rules', [{ role: 'user', content: `Q${index}` }], handlers())
      const request = fetchMock.mock.calls[index][1] as RequestInit
      ids.push((request.headers as Record<string, string>)['x-session-id'])
    }
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[1])
  })

  it('creates one new project chat per app instance and uses project instructions instead of a repeated system prompt', async () => {
    env.settings.projectUrl = 'https://chatgpt.com/g/g-p-6acbc986ba2c8191bdbb04545b30a1ae-answerline/project'
    env.settings.projectPromptMode = 'project'
    const fetchMock = vi.fn().mockImplementation(async () => streamResponse([
      event('response.completed', {
        response: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }] },
      }),
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const app = new LocalLlm()
    await app.stream('СЕКРЕТНЫЙ ДЛИННЫЙ СИСТЕМНЫЙ ПРОМПТ', [{ role: 'user', content: '<question>Q1</question>' }], handlers())
    await app.stream('СЕКРЕТНЫЙ ДЛИННЫЙ СИСТЕМНЫЙ ПРОМПТ', [{ role: 'user', content: '<question>Q2</question>' }], handlers())
    const relaunched = new LocalLlm()
    await relaunched.stream('СЕКРЕТНЫЙ ДЛИННЫЙ СИСТЕМНЫЙ ПРОМПТ', [{ role: 'user', content: '<question>Q3</question>' }], handlers())
    const requests = fetchMock.mock.calls.map(([, init]) => ({
      session: (init.headers as Record<string, string>)['x-session-id'],
      body: JSON.parse(init.body as string),
    }))
    expect(requests[0].session).toBe(requests[1].session)
    expect(requests[2].session).not.toBe(requests[0].session)
    for (const { body } of requests) {
      expect(body.client_metadata).toEqual({
        'x-bridge-no-local': true,
        'x-bridge-project-url': env.settings.projectUrl,
      })
      expect(body.input[0].content[0].text).not.toContain('СЕКРЕТНЫЙ ДЛИННЫЙ СИСТЕМНЫЙ ПРОМПТ')
      expect(body.input[0].content[0].text).not.toContain('<answerline_rules>')
      expect(body.input[0].content[0].text).toContain('<question>')
    }
    expect(requests[0].body.input[0].content[0].text).toContain('Q1')
    expect(requests[1].body.input[0].content[0].text).toContain('Q2')
    expect(requests[2].body.input[0].content[0].text).toContain('Q3')
  })

  it('reports a response.failed event and never commits a partial answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      event('response.output_text.delta', { delta: 'часть ответа' }),
      event('response.failed', { response: { error: { message: 'веб-сессия недоступна' } } }),
    ])))
    const events = handlers()
    await new LocalLlm().stream('Rules', [{ role: 'user', content: 'Вопрос' }], events)
    expect(events.onError).toHaveBeenCalledWith('ChatGPT Bridge: веб-сессия недоступна')
    expect(events.onDone).not.toHaveBeenCalled()
  })

  it('rejects a truncated Responses stream instead of reporting success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      event('response.output_text.delta', { delta: 'незакончено' }),
    ])))
    const events = handlers()
    await new LocalLlm().stream('Rules', [{ role: 'user', content: 'Вопрос' }], events)
    expect(events.onError).toHaveBeenCalledWith('ChatGPT Bridge: поток завершился без response.completed')
    expect(events.onDone).not.toHaveBeenCalled()
  })

  it('rejects an empty completed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      event('response.completed', { response: { output: [] } }),
    ])))
    const events = handlers()
    await new LocalLlm().stream('Rules', [{ role: 'user', content: 'Вопрос' }], events)
    expect(events.onError).toHaveBeenCalledWith('ChatGPT Bridge: модель не вернула текст ответа')
    expect(events.onDone).not.toHaveBeenCalled()
  })

  it('includes stable instructions in the latest web message', () => {
    const prompt = bridgeUserMessage('Система: отвечай по-русски', '<question>Тест</question>')
    expect(prompt).toContain('Система: отвечай по-русски')
    expect(prompt).toContain('<question>Тест</question>')
  })

  it('normalizes Windows CRLF line endings before attaching a prompt to ChatGPT Web', () => {
    const prompt = bridgeUserMessage('РОЛЬ\r\nСледующая строка\r\n', '<question>Первая\r\nВторая</question>')
    expect(prompt).toContain('РОЛЬ\nСледующая строка\n')
    expect(prompt).toContain('<question>Первая\nВторая</question>')
    expect(prompt).not.toContain('\r')
  })
})

describe('LM Studio compatibility', () => {
  it('keeps Chat Completions, sampling settings and history untouched', async () => {
    env.settings.provider = 'lmstudio'
    env.settings.baseUrl = 'http://127.0.0.1:1234'
    env.settings.model = 'local-llm'
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      'data: {"choices":[{"delta":{"content":"локально"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const events = handlers()
    await new LocalLlm().stream('Инструкция', [
      { role: 'user', content: 'старый вопрос' },
      { role: 'assistant', content: 'старый ответ' },
      { role: 'user', content: 'новый вопрос' },
    ], events)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string) as { messages: Array<{ role: string; content: string }>; top_k: number; temperature: number }
    expect(url).toBe('http://127.0.0.1:1234/v1/chat/completions')
    expect(body.messages).toHaveLength(4)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Инструкция' })
    expect(body.top_k).toBe(40)
    expect(body.temperature).toBe(0.1)
    expect(events.onDone).toHaveBeenCalledWith('локально', { outputTokens: null })
    expect(events.onError).not.toHaveBeenCalled()
  })
})
