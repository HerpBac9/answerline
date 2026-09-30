# Проверка RAG и latency

Benchmark recorder фиксирует только latency и размеры prompt, без текста ответа и
сырого транскрипта. Это позволяет сравнивать embedding-модель, индекс и параметры
retrieval, не записывая персональные данные.

## Что измеряется

Для каждого завершённого ответа в JSONL записываются:

- вопрос и статус (`done`/`error`);
- TTFT и полная задержка LLM;
- latency retrieval, число принятых hits и объём retrieved context;
- оценочные токены system prompt, истории и текущего user-turn;
- размер retrieved user-turn и длина ответа.

Офлайн-retrieval оценивается отдельно:

```powershell
npm.cmd run rag:evaluate
```

Отчёт `out/rag-evaluation.json` содержит 30 перефразированных вопросов,
найденные модули и previews ответов. `module@1` показывает строгую точность
первого модуля, `module@5` — наличие ожидаемого модуля в top-5, MRR учитывает
позицию первого совпадения. Эти метрики не заменяют ручную проверку фактов.

## Runtime-проверка

```powershell
node scripts/answer-probe.mjs
```

Проба проходит тот же путь, что и приложение: embedding → Qdrant → bounded
`<retrieved_context>` → потоковая LLM. Для каждого вопроса печатаются score,
module, найденный заголовок, retrieval latency, TTFT и ответ. Если ответ неверен,
сначала сравните найденный chunk с вопросом, затем проверяйте prompt и модель.

Для полноценного прогона 30 перефразированных вопросов используйте:

```powershell
npm.cmd run rag:answers
```

Скрипт работает последовательно, чтобы не смешивать состояния локальной LLM.
Он сохраняет полный локальный отчёт в `out/rag-answer-evaluation.json` и
`out/rag-answer-evaluation.md`: rank ожидаемого модуля, latency, TTFT, ответ и
эвристические признаки groundedness. Эти эвристики помогают найти кандидатов
на ручную проверку, но не заменяют проверку фактов по исходному Q&A.

Для серии с локальными метриками:

```powershell
$env:ANSWERLINE_BENCHMARK_LOG = '1'
npm.cmd run dev
```

После изменения `data/*.md` сначала выполните `npm.cmd run rag:index`, а после
удаления или переименования записей — чистую пересборку через
`$env:RAG_RECREATE = '1'`. Сравнивайте результаты только при одинаковой
embedding-модели и параметрах `RAG_PERSONAL_TOP_K`, `RAG_GENERAL_TOP_K` и
`RAG_MAX_CONTEXT_TOKENS`.
