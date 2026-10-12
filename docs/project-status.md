# Статус проекта Answerline

**Дата исходного исторического среза:** 2026-08-28
**Состояние:** активный локальный MVP, готовый к дальнейшей стабилизации; macOS
требует проверки именно упакованного приложения и разрешений TCC.

## Дополнение от 2026-10-11: ChatGPT IDE Bridge

Введён выбираемый через `LLM_PROVIDER=lmstudio|bridge` генератор ответов.
`bridge` обращается к локальному gateway `http://127.0.0.1:17841/v1/responses`
по OpenAI Responses SSE; gateway сохраняет GPT-6 Extra High по умолчанию,
но теперь принимает выбор `reasoning.effort` для каждого запроса.
Answerline использует Low / GPT-6 Instant с флагом запрета `@Local`.
В standalone Web Bridge при обычном режиме `LLM_PROJECT_PROMPT_MODE=inline`
текущие system rules включаются в каждый user-turn. Для проекта `answerline`
включён режим `project`: правила ответа переносятся в ChatGPT Project
Instructions, а в API идут только короткая рамка, транскрипт, вопрос и RAG
материалы. История хранится в Web-чате по `x-session-id`, не пересылается.
Сброс сессии сбрасывает и идентификатор веб-диалога. Для LM Studio сохранён
прежний Chat Completions-клиент. В первом полноценном браузерном тесте
обнаружена CRLF-проблема: ChatGPT Web composer не сохранял символы `\\r`
из Windows Markdown system prompt, и Bridge возвращал ошибку целостности
при равной длине текста. Исправлено: перед отправкой в Bridge все CRLF/CR
нормализуются в LF (добавлен отдельный тест).

**Повторный live E2E 2026-10-11 — успешно:** `npm run doctor` проверил
Whisper, Windows WASAPI, Qdrant collection `wisper_interview_qa_06b`
(14 596 точек, 1024 измерения), embedding endpoint (1024) и Bridge (GPT-6
Extra High). `node scripts/answer-probe.mjs --question "Что такое
self-attention в трансформерах и зачем нужен механизм внимания?"`
прошёл реальные embeddings → Qdrant → selection 5 hits → prompt →
Responses SSE → итоговый текст из 1045 символов. Retrieval 174 мс,
TTFT 22 313 мс, всего 54 875 мс; с GPT-6 Extra High такая задержка
может быть чрезмерной для ответа в реальном времени. Это HTTP-проверка
вне Electron, захват живого аудио на собеседовании не проверялся.

**Следующее live E2E 2026-10-11 — GPT-6 Instant (Low):** Notion Bridge
перезапущен в своём обычном режиме с `@Local` для IDE; Answerline отправил
`reasoning.effort=low` и `client_metadata.x-bridge-no-local=true`.
Выполнен RAG-запрос «Что такое RAG и для чего он нужен?» без использования
Local: retrieval 181 мс, 5 релевантных результатов, TTFT 13 183 мс,
полный ответ 18 952 мс (1175 символов), HTTP-проба завершилась с exit 0.
Штатное значение для остальных клиентов Bridge по-прежнему Extra High.

**Ускорение повторного запроса в сохранённом чате:** Notion Bridge теперь
сохраняет подтверждение выбранной версии GPT-6 и уровня Low на той же
браузерной вкладке и при неизменной UI-кнопке пропускает дорогое открытие
меню. Новый чат, смена модели или пользовательское взаимодействие заставляют
провести полную проверку. `answer:probe` принимает несколько `--question` для
одного `x-session-id`. HTTP E2E из двух вопросов от 2026-10-11 завершился
успешно: первый вопрос — retrieval 170 мс, TTFT 11 757 мс, весь ответ
16 024 мс; второй — retrieval 169 мс, TTFT 7 566 мс, весь ответ 9 080 мс.
Экономия до первого токена в этом парном прогоне ~4,2 с; вопросы различаются,
поэтому цифру нельзя считать точной изолированной оценкой выигрыша на UI.

**Маршрутизация Answerline в пользовательский ChatGPT Project `answerline`:**
`LLM_PROJECT_URL` указывает на `/g/g-p-6acbc986ba2c8191bdbb04545b30a1ae-answerline/project`,
`LLM_PROJECT_PROMPT_MODE=project`. При создании `LocalLlm` генерируется
временный `x-session-id`; Gateway записывает версию 3 прямого назначения
треда к проекту и браузер создаёт новый чат в нём. Повторные вопросы используют
тот же ID, в другом запуске другой; реальный адрес хранит Bridge. Скопированный
URL существующего чата используется только для извлечения Project ID.
Защита от смены проекта внутри сессии и от отправки вне проекта встроена в
Gateway и browser worker. Краткий промпт в API не содержит полного файла
`prompts/systemPrompt.md`; статические правила подготовлены в
`prompts/chatgptProjectInstructions.md` для ручной вставки в настройки проекта.

**Реальный HTTP E2E 2026-10-11 — два запуска, три вопроса, успешно:**
в первой тестовой сессии два вопроса дали TTFT 12 539 и 5 293 мс,
полные ответы за 16 185 и 8 934 мс. Через штатное `node bridge.mjs show
thread` установлено, что они привязаны к новому Project-чату
`https://chatgpt.com/g/g-p-6acbc986ba2c8191bdbb04545b30a1ae-answerline/c/6acbec6d-8d58-83eb-9b3e-ef0eba2dba86`.
Новая тестовая сессия с новым `x-session-id` создала другой чат в том же
проекте — `/c/6acbec9e-fcf8-83eb-a18f-75d54465af2f`. Исходный URL
пользователя (`/c/6acbd45c-337c-83eb-bb17-d2fc187e89fc`) не переиспользовался.
Это тест HTTP-пути, не живого захвата аудио в Electron.

Все профильные тесты и сборка Windows проходят; полный `npm test`
до сих пор содержит 14 ошибок в проверке существующих пользовательских
`data/*.md` (`corpusLayout.test.ts`); эти Q&A-файлы не изменялись.

**Изменение приватности:** только при `bridge` выбранный контекст RAG,
вопрос и транскрипт уходят в ChatGPT Web. Облачную генерацию нельзя называть
полностью локальной; это добровольный альтернативный режим. Скрипт
`answer:probe` проверяет оба HTTP-протокола, но `rag:answers`, `prompt:evaluate`
и другие standalone evaluation tools пока используют LM Studio Chat Completions.

## Краткое резюме

Answerline — локальный Electron-overlay для технического собеседования.
Системный звук трактуется как речь интервьюера, микрофон — как речь кандидата.
Распознавание выполняется локальным whisper.cpp, retrieval — через локальную
embedding-модель и Qdrant, генерация — через локальный LM Studio.

Основной runtime-путь уже разделён на аудио, транскрибацию, Session, RAG, LLM,
preload и renderer. Внешние облачные STT/LLM, аналитика и telemetry в проект не
добавлялись.

## Что реализовано

### Платформа и аудио

- Windows: внешний WASAPI native audio module.
- macOS: отдельный CoreAudio Process Tap helper для системного звука и
  microphone capture через renderer.
- Общая PCM-цепочка с VAD, pre-roll, ограничением длины реплики и локальным
  Whisper server.
- Один долгоживущий Whisper process работает только во время захвата и
  останавливается при завершении.
- macOS usage descriptions и packaging-конфигурация находятся в Electron
  builder-конфиге.
- `setContentProtection` используется только как best effort; абсолютная
  невидимость overlay не обещается.

### Session, prompt и LLM

- Вопрос интервьюера автоматически запускает ответ; собственный микрофон по
  умолчанию остаётся контекстом.
- `ANSWERLINE_ANSWER_FROM_MIC=1` включает одиночный тестовый режим.
- System prompt один и общий для Electron, `rag:answers` и `answer-probe`.
- История LLM сохраняет вопрос/транскрипт и ответ, но не копирует retrieved
  chunks в следующие prompt. Отдельно каждая локальная сессия автоматически
  записывается в `userData/sessions/*.jsonl`: там сохраняются exact context,
  RAG-кандидаты, scores, prompt estimates, TTFT, ошибки и ответ модели для
  последующего разбора качества.
- Сохраняется строгая чередуемость `user`/`assistant`.
- Ответы идут потоково через OpenAI-compatible LM Studio endpoint.
- Параметры генерации читаются из `.env`; пользовательские temperature и другие
  sampling-настройки не переопределяются кодом.

### RAG

- Источник правды — верхнеуровневые `data/*.md`.
- Каждый `##`-раздел — отдельный вопрос и один vector point.
- Текущий embedding строится из retrieval-ключа: module, question, aliases и
  tags, если они есть.
- Полный ответ хранится в Qdrant payload и добавляется в текущий user-turn
  только после выбора кандидатов.
- Runtime один раз строит embedding и параллельно запрашивает два контура:
  top-1 только по модулям проекта для личного опыта и top-3 без них для общей
  теории.
  Semantic и lexical score используются для ранжирования, но не отбрасывают
  фиксированные контекстные слоты; затем применяется token cap.
- Входные envelope-теги и model markers очищаются; RAG недоступен — LLM не
  вызывается.
- Личный контур задаётся полем `authority` во front matter файла
  (`internal_project`/`personal_experience`); общий поиск исключает их через
  `must_not`. Authority берётся из `manifest.jsonl` либо из front matter записи.
- `data/manifest.jsonl` существует для двух проектных файлов (129 записей: aliases,
  стабильные id вида `<file-stem>.section-NNN`, authority). Генерация —
  `npm run rag:aliases -- --write` через локальную LLM с кэшем в
  `out/rag-alias-cache.json`.
- Текущая live-конфигурация ориентирована на
  `text-embedding-qwen3-0.6b-text-embedding`, collection
  `answerline_qa`, `RAG_GENERAL_TOP_K=3`,
  `RAG_PERSONAL_TOP_K=1` и
  `RAG_MAX_CONTEXT_TOKENS=4000`.

### Корпус и инструменты подготовки

В рабочем дереве находятся два проектных файла (канонические факты и интервью из
100 вопросов), 11 вариантных корпусов по 500 вопросов (`*_interview_knowledge_base_ru.md`
+ `*_question_variants.json`), корпус вопросов по Python backend и корпус из 150
кодовых задач. По dry-run `rag:index` от 2026-08-28: **6278 записей в 15
модулях, 13108 векторов** (канонический вопрос + каждый вариант). Медианные
ответы корпусов — 283–1552 знака, p95 — до ~1900, что помещает top-4 evidence в
бюджет `RAG_MAX_CONTEXT_TOKENS=4000` с запасом.

Поддерживаются:

- PDF/DOCX/HTML extraction;
- структурирование по heading/page/paragraph;
- checkpointed document ingestion через локальную LLM;
- независимая валидация candidate Q&A;
- перевод Q&A через локальную модель с JSONL checkpoint;
- подготовка `manifest.jsonl` с aliases, tags, stable IDs и provenance;
- benchmark embedding/LLM моделей с измерением TTFT, latency и tokens/s;
- session trace с полным локальным контекстом для разделения retrieval miss и
  ошибки генерации;
- offline retrieval evaluation и end-to-end `rag:answers` evaluation.

`promt_qa.md` — исследовательский prompt для подготовки внешних материалов. Он
не является runtime system prompt и не превращает непроверенный текст в
канонический факт автоматически.

## Текущий контракт источника Q&A

Фактически поддерживается простой формат:

```markdown
## Вопрос

Полный ответ.
```

В одном RAG-record хранится один полный ответ. Разделение базы на короткие и
подробные ответы не планируется: это создало бы дублирование и конкуренцию между
одинаковыми вопросами. Ближайшая задача — увеличить и измерить допустимый
retrieved context, не меняя схему Q&A.

## Что проверено автоматическими средствами

Для изменений кода обязательны следующие проверки:

```bash
npm run typecheck
npm test
npm run build
```

Последняя локальная проверка этого среза (2026-08-28):

```text
npm run typecheck                 PASS
npm test                          PASS (16 test files, 122 tests)
npm run build                     PASS
npm run rag:index -- --dry-run   PASS (6278 records, 13108 vectors, 15 modules)
RAG_RECREATE=1 npm run rag:index PASS (13108 points, collection recreated)
npm run rag:evaluate              PASS (30/30 queries with full top-5,
                                  avg semantic 0.686, avg reranked 0.708)
```

Реальный upsert в Qdrant и переиндексация выполнены 2026-08-28. Личный контур
проверен живым запросом с runtime-фильтром: вопрос из проектного модуля
возвращает top-1 с `authority=internal_project` (до фикса записи этого файла не
попадали в personal-поиск и не исключались из общего). Аппаратный захват аудио
в этом срезе не запускался.

Среда с реальным Whisper, LM Studio, Qdrant, native audio и macOS TCC проверяется
отдельно через `npm run doctor`, `scripts/audio-probe.mjs`, `answer-probe` и
упакованный `.app`. Результаты таких проверок действительны только для конкретной
машины, загруженных моделей и конфигурации.

## Известные ограничения и риски

1. **macOS capture protection.** Screen sharing и политики конкретного клиента
   могут игнорировать защиту окна; абсолютная невидимость не гарантируется.
2. **Внешние runtime-файлы.** Whisper, модели и native binaries не поставляются
   репозиторием; пути необходимо настроить в пользовательском `config.json`.
3. **RAG quality.** Semantic retrieval и lexical rerank реализованы, но полноценный
   BM25/FTS5+vector hybrid и dedicated reranker пока отсутствуют.
4. **Длинные ответы.** Они не участвуют в embedding, но увеличивают Qdrant
   payload и расходуют RAG context budget. Поэтому первым этапом является
   настройка и измерение большего context budget без изменения схемы данных.
5. **Свежесть индекса.** `source_sha256` сохраняется, но runtime автоматически не
   сравнивает его с текущими Markdown-файлами; переиндексация пока ручная.
6. **Документация.** Некоторые исторические review-файлы описывают старые пути
   или старые результаты; текущими источниками считаются `AGENTS.md`,
   `command.md`, `docs/architecture.md`, этот статус и roadmap.
7. **Качество STT.** Русская IT-терминология исправляется glossary-ресурсами, но
   полноценный корпус реальных аудиозаписей для измерения WER отсутствует.

## Как определить, что проект готов к следующему этапу

Нельзя считать задачу закрытой только потому, что `npm run build` прошёл. Для
изменений runtime нужны одновременно:

- автоматические тесты;
- успешный локальный probe затронутой подсистемы;
- обновлённая документация;
- понятный rollback или восстановление старого индекса/конфига;
- отсутствие расхождения между Windows и macOS контрактами.
