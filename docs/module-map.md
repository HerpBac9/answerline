# Answerline: карта модулей

Документ описывает текущее устройство кода. Источники архитектурных решений:
`docs/architecture.md`, `docs/project-status.md`, `docs/project-roadmap.md` и
`AGENTS.md`.

## Runtime поток

```text
Audio sources -> Capture -> VAD -> Whisper -> Transcriber -> Session
                                      Session -> RAG -> Qdrant
                                      Session -> LLM -> LM Studio
                                      Session -> IPC -> Preload -> React UI
```

## Main process

### `src/main/index.ts`

Точка запуска Electron. Создаёт окно, загружает конфигурацию, соединяет
подсистемы, управляет жизненным циклом приложения.

### Audio

- `audioCapture.ts` — общий PCM capture слой.
- `macosAudioTap.ts` — CoreAudio Process Tap helper для системного звука macOS.
- `vad.ts` — сегментация речи, pre-roll, ограничение длины фразы.
- `whisperServer.ts` — управление локальным whisper-server.
- `transcriber.ts` — преобразование Whisper результата в сообщения Session.
- `terminology.ts` — нормализация IT терминов для model-facing текста.
- `hallucinationFilter.ts` — фильтр известных STT артефактов.

### Session

`session/session.ts` — основной координатор.

Ответственность:

- хранение истории сообщений;
- запуск ответа на вопрос интервьюера;
- добавление RAG evidence только в текущий запрос;
- контроль размера контекста;
- сохранение правильной последовательности ролей.

### RAG

`rag/rag.ts` реализует локальный retrieval.

- `embeddingInput.ts` формирует вход для embedding.
- Qdrant хранит payload и векторы.
- Personal и general поиск выполняются раздельно.
- Источник истины — `data/*.md`, а не индекс.

### LLM

`llm/llm.ts` работает с локальным OpenAI-compatible endpoint LM Studio.

Поддерживает потоковый вывод и обработку ошибок генерации.

### Core и Application

- `core/config.ts` — конфигурация и совместимость старых конфигов.
- `core/platform.ts` — особенности ОС.
- `core/log.ts` — локальные логи.
- `app/ipc.ts` — разрешённый IPC контракт.
- `app/sessionLog.ts` — локальный trace сессий.

### UI

- `ui/overlayWindow.ts` — создание overlay окна.
- `ui/overlayStyle.ts` — стили окна.

## Preload и Renderer

`src/preload/index.ts` является единственной границей Electron API.

Renderer:

- `App.tsx` — интерфейс overlay.
- `types.ts` — контракты preload API.
- `answerDisplay.ts` — отображение ответов.
- `macosAudioCapture.ts` — получение микрофона на macOS.

Новые IPC возможности требуют изменения main handler, preload метода,
renderer типов и UI.

## Scripts

Скрипты разделены на:

- подготовку и индексацию RAG;
- evaluation retrieval и ответов;
- extraction документов;
- перевод Q&A;
- benchmark моделей;
- диагностику окружения.

## Ограничения архитектуры

- Retrieved context не переносится в историю диалога.
- Облачные STT/LLM и telemetry не добавляются без отдельного решения.
- `setContentProtection` остаётся best effort.
- `data/AGENTS.md` не является источником знаний для RAG.
