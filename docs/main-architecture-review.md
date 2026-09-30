# Ревью `src/main`

## Цель

Главный процесс разделён по ответственности, но точка входа остаётся в
`src/main/index.ts`: `electron-vite` ожидает этот entrypoint, а сам файл теперь
только собирает зависимости и связывает жизненный цикл приложения.

## Структура

```text
src/main/
├─ app/       IPC и локальные benchmark-метрики
├─ audio/     WASAPI, VAD, Whisper server, транскрибация и терминология
├─ core/      config, .env, логирование и пути к ресурсам
├─ input/     глобальные hotkeys
├─ llm/       OpenAI-compatible streaming client
├─ rag/       embedding, Qdrant retrieval и reranking
├─ session/   история, question gate и orchestration RAG → LLM
├─ shared/    общие утилиты (оценка токенов)
└─ ui/        overlay window и content-protection best effort
```

Тесты лежат рядом с модулем, который они защищают. Это позволяет быстро
понять границу ответственности и не держать большой плоский каталог.

## Что проверено

- старые относительные импорты после переноса удалены;
- strict TypeScript (`noUnusedLocals`, `noUnusedParameters`) проходит;
- RAG по-прежнему добавляет evidence только в текущий user turn;
- prompt и физическое speaker attribution не изменены; IPC остаётся allow-list
  и дополнен только именованными командами `minimize-window` и `close-window`;
- `decodePrompt.test.ts` не является временным тестом: он проверяет glossary
  для Whisper, лимит decode prompt и исправление RAG → RAC. Файл перенесён в
  `audio/`, а не удалён;
- добавлен regression-тест для stateful `/g`/`/y` regex в
  `HallucinationFilter`: `lastIndex` теперь сбрасывается перед каждым матчем.

## Безопасные оптимизации

1. `ChannelVad` больше не конкатенирует весь utterance на каждом аудиочанке.
   Чанки накапливаются, а единый `Buffer` создаётся только для partial/final
   snapshot. Для длинной реплики это убирает квадратичное копирование памяти.
2. Если native capture не открывает устройство после запуска Whisper, сервер
   гарантированно останавливается; модель и порт не остаются висеть в фоне.

Поведение сегментации, таймауты и формат WAV сохранены; изменения покрыты
существующими VAD-тестами.

## Проверки

- `npm.cmd run typecheck` — pass;
- `npm.cmd test` — 8 test files, 74 tests — pass.

Аппаратные проверки (`npm.cmd run doctor`, реальный LM Studio/Qdrant и build)
остаются отдельным этапом после структурного рефакторинга.
