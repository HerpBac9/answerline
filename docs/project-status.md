# Статус проекта Answerline

**Дата среза:** 2026-08-28  
**Состояние:** активный локальный MVP, готовый к дальнейшей стабилизации; macOS
требует проверки именно упакованного приложения и разрешений TCC.

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
