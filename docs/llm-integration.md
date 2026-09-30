# Интеграция с локальной LLM

## Контракт сервера

Приложение использует LM Studio как локальный OpenAI-совместимый сервер. URL и
параметры генерации задаются переменными `.env`; стандартный URL —
`http://127.0.0.1:1234`. Трафик идёт только на loopback-адрес. Значения из
`.env` имеют приоритет над `%APPDATA%\answerline\config.json`.

При `llmModel: "auto"` клиент запрашивает:

```text
GET {llmBaseUrl}/api/v1/models
```

Он принимает ровно одну загруженную модель с `type: "llm"` и непустым
`loaded_instances`. Если моделей нет или их несколько, приложение выдаёт
понятную ошибку вместо неявного выбора. Для нескольких моделей задайте точный
key в `llmModel`.

Для генерации используется:

```text
POST {llmBaseUrl}/v1/chat/completions
Content-Type: application/json
```

Тело содержит `model`, `messages` и параметры из `.env`:
`max_tokens`, `temperature`, `top_p`, `top_k`, `min_p`, `repeat_penalty`,
`presence_penalty`, `frequency_penalty`, а также `stream: true`. Ответ читается как Server-Sent Events:
только строки `data:` с `choices[0].delta.content` попадают в UI.

Используемые переменные:

```text
LLM_BASE_URL=http://127.0.0.1:1234
LLM_MODEL=auto
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.1
LLM_TOP_P=1
LLM_TOP_K=40
LLM_MIN_P=0.05
LLM_REPEAT_PENALTY=1.1
LLM_PRESENCE_PENALTY=0
LLM_FREQUENCY_PENALTY=0
LLM_SEED=null       # необязательно; null отключает фиксированный seed
```

Для MacBook Pro с M5 и 16 ГБ оперативной памяти модель и параметры следует
сравнивать на локальном benchmark-наборе; проект не подменяет пользовательские
значения sampling-параметров рекомендациями конкретной модели.

Один и тот же файл `prompts/systemPrompt.md` используется Electron-сервером,
`rag:answers` и `answer-probe`. Поэтому изменение правил ответа не требует
синхронного редактирования нескольких строковых констант.

## Формирование контекста

The system message is built once by the Session constructor and contains only role,
answer format and the security boundary. The former full-document loading is not
part of runtime anymore.

For every question Session calls LocalRag.retrieve(question):

1. embed the question once through the local /v1/embeddings endpoint using the same
   model id as the index;
2. run two Qdrant searches in parallel: `RAG_PERSONAL_TOP_K` over project modules
   only, and `RAG_GENERAL_TOP_K` with those modules excluded;
3. put the best personal candidate into `<personal_experience>` and the best
   general candidates into `<knowledge_context>`; scores rank candidates but do
   not gate these fixed context slots;
4. cap evidence at `ragMaxContextTokens` and append `retrieved_context` only to the
   current user turn.

This keeps the system prefix stable and prevents evidence from multiplying in history.
History stores the transcript/question and answer, but not retrieved chunks. A
separate local session JSONL trace stores the exact evidence, candidate metadata,
prompt estimates, timings and generated answer so a bad response can be diagnosed
after the interview. If retrieval is unavailable, Session publishes an error and
does not call the LLM.

## Безопасность и достоверность

- Incoming text cannot forge question, retrieved_context or other envelope tags;
  these tags are stripped before sending.
- The model receives facts only from retrieved evidence and must not invent experience,
  companies, dates or metrics. If a fact is missing, it must say so and answer generally.
- Terminology is normalised from resources/it-ru-terms.md only before the LLM; the raw
  transcript remains visible in the UI.
- Source documents must stay local; do not point llmBaseUrl at an external service
  without a separate data and security decision.

## Отмена и ошибки

Каждый поток использует собственный `AbortController`. Новый вопрос отменяет
незавершённый предыдущий поток вместо очереди. Частичный ответ не попадает в
историю, поэтому не загрязняет последующие ответы. Ошибка сети, HTTP-статус
или ошибка разрешения модели публикуется в UI как ошибка ответа.

Проверьте интеграцию до ручного интервью:

```powershell
npm.cmd run doctor
node scripts/answer-probe.mjs
```

`doctor` проверяет, что LM Studio, embedding endpoint и Qdrant доступны, коллекция
не пуста, а размерность вектора совпадает. `answer-probe` выполняет тот же
embedding → retrieval → LLM путь, что и runtime, и показывает найденные модули,
score и TTFT для двух вопросов.

Для каждого запуска приложения создаётся файл
`app.getPath('userData')/sessions/session-*.jsonl`. Событие `session_started`
содержит snapshot системного промпта и runtime-настроек, событие `turn` — вопрос,
retrieval query, все выбранные hits с `recordKey`/module/question/score, exact
`contextText`, prompt estimates, TTFT, latency и ответ. Это локальный append-only
файл; сетевого sink для него нет. Сохранение можно отключить только явно через
`ANSWERLINE_SESSION_LOG=0`.

## Изменение провайдера или протокола

Основная точка интеграции — `src/main/llm.ts`. При поддержке другого локального
сервера сохраните следующие гарантии:

- потоковая выдача токенов в `onDelta`;
- корректная отмена по `AbortSignal`;
- явная проверка доступной/выбранной модели;
- отсутствие runtime SDK-зависимостей без необходимости;
- неизменяемый system prefix в рамках сессии;
- понятная ошибка, доступная в overlay.

Если сервер не полностью совместим с OpenAI SSE, адаптируйте только парсер и
контракт транспорта в `LocalLlm`; не переносите сетевую логику в renderer или
`Session`.
