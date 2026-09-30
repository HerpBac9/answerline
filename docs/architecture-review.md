# Ревью архитектуры после перехода на RAG

## Решение

Приложение больше не читает `knowledge/` и не добавляет личные факты целиком в
system prompt. Источник данных — `data/*.md`, индекс — Qdrant, runtime-клиент —
`src/main/rag.ts`.

Путь ответа:

```text
вопрос
  -> локальный embeddings endpoint
  -> Qdrant personal top-1 + knowledge top-3
  -> rerank + fixed context slots + token cap
  -> <retrieved_context> в текущий user-turn
  -> LocalLlm
```

System prompt строится один раз. История сохраняет вопрос/транскрипт и ответ, но
не retrieved chunks. При ошибке Qdrant или embeddings `Session` публикует ошибку
и не вызывает LLM.

## Что исправлено

- удалены `knowledgeDir`, `knowledgeTokens`, `reloadKnowledge` и IPC-кнопка
  перечитывания базы;
- добавлены RAG-настройки в `config.ts` и `.env.example`;
- добавлен изолированный `LocalRag` с timeout, score-based rerank, фиксированными
  context slots, ограничением контекста и защитой от envelope/model-marker injection;
- добавлены unit-тесты RAG и fail-closed тест Session;
- `doctor` теперь проверяет Qdrant, непустую коллекцию, embedding model и
  совпадение размерности;
- `answer-probe` теперь проверяет реальный embedding → Qdrant → LLM путь;
- документация и AGENTS приведены к RAG-контракту;
- benchmark-метрики дополнены latency retrieval, числом hits и объёмом context.

## Проверка

```text
npm.cmd run typecheck                 PASS
npm.cmd test                          PASS (72 tests)
npm.cmd run build                     PASS
npm.cmd run rag:index -- --dry-run   PASS (808 chunks, 7 modules)
npm.cmd run rag:evaluate              PASS (module@1 60.0%, module@5 83.3%, MRR 0.711; question-only + hybrid rerank)
```

`npm.cmd run doctor` подтвердил Whisper, native audio, Qdrant и embedding
модель. Единственная текущая ошибка окружения — в LM Studio не загружена LLM;
поэтому `answer-probe` и реальный поток генерации пока не проверены.

На пяти ручных запросах при запущенных Qdrant и embedding endpoint embedding
занимал примерно 150–390 ms, а сам Qdrant search — 5–11 ms. Поэтому основная
задержка retrieval сейчас — не в векторной базе, а в embedding-модели.

После загрузки обеих моделей выполнен реальный последовательный прогон 30
вопросов (`npm.cmd run rag:answers`): все 30 ответов завершились без ошибок,
100% были содержательными (более 80 символов), запрещённых envelope-маркеров не
обнаружено. Strict module@1 остался 60%, module@5 — 93.3%; среднее время ответа
LLM — 5.65 s, TTFT — 3.74 s, полный цикл retrieval+LLM — 8.01 s. В этом режиме
embedding после обращения к LLM занимал около 1.8–2.6 s (один cold-start — 5.1 s),
что указывает на переключение/конкуренцию моделей в LM Studio.

## Оставшиеся технические задачи

1. **Качество retrieval.** `module@1 = 60%` — строгая метрика модуля, а не
   качество готового ответа. Top-5 уже 93.3%, но для production стоит добавить
   hybrid BM25/FTS и/или reranker и отдельно оценивать factuality, citation
   validity, abstention и latency.
2. **Пути runtime.** В `src/main/config.ts` оставлены дефолтные абсолютные пути
   к внешнему Whisper/native runtime соседнего проекта. Это не RAG-костыль, но
   переносимость требует заполнения путей установщиком или явным пользовательским
   config.
3. **??????????????? probe.** `scripts/answer-probe.mjs` ??????????? ??? Electron,
   ?? ?????? ?????? ??? ?? `prompts/systemPrompt.md`, ??? ? Session. HTTP-???????
   ??-???????? ??????????? ?????????, ? ????????? LLM ??????? ?? ????? `LLM_*`
   ?????????? `.env`.
4. **Свежесть индекса.** `source_sha256` уже сохраняется в payload, но runtime не
   сравнивает его с `data/*.md` автоматически. Пока пересборка после изменения
   источников — явная операция `npm.cmd run rag:index`.
