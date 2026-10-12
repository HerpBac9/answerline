# Answerline — команды и рабочие процедуры

Запускайте команды из каталога проекта. В macOS/Linux используется `npm`; в
Windows PowerShell при блокировке `npm.ps1` используйте `npm.cmd`.

```bash
cd /path/to/answerline
```

Состояние реализации и известные ограничения описаны в
[`docs/project-status.md`](docs/project-status.md), план работ — в
[`docs/project-roadmap.md`](docs/project-roadmap.md).

## Быстрый запуск

Нужны локальный LM Studio server, локальный Qdrant и настроенный внешний
Whisper runtime. Пути к Whisper и платформенному native audio backend находятся
в `config.json` в `app.getPath('userData')`.

### macOS/Linux

```bash
npm install
cp .env.example .env
npm run doctor
npm run rag:index
npm run dev
```

### Windows PowerShell

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run doctor
npm.cmd run rag:index
npm.cmd run dev
```

Для обычного интервью оставьте `ANSWERLINE_ANSWER_FROM_MIC=0`. Значение `1` включает
ответы на вопросы, сказанные в микрофон, и предназначено для одиночного теста.

### Подключение ChatGPT IDE Bridge из проекта notion

Проверено с Gateway `http://127.0.0.1:17841` (`/v1/responses`, GPT-6).
Bridge по умолчанию сохраняет **Extra High**, но Answerline выбирает
**Low / GPT-6 Instant** для быстрых ответов. В `.env` Answerline установите:

```dotenv
LLM_PROVIDER=bridge
LLM_BASE_URL=http://127.0.0.1:17841
LLM_MODEL=chatgpt-web/gpt-6-sol
LLM_REASONING_EFFORT=low
LLM_PROJECT_URL=https://chatgpt.com/g/g-p-6acbc986ba2c8191bdbb04545b30a1ae-answerline/project
LLM_PROJECT_PROMPT_MODE=project
```

В `answerline` одна запущенная копия приложения = один уникальный `x-session-id`
в оперативной памяти. Bridge создаёт первый чат внутри этого проекта и
сохраняет реальный адрес, а следующие вопросы направляет в него. Новый запуск
после закрытия или явная кнопка сброса создают новый чат. Существующий чат,
если его URL передали в `LLM_PROJECT_URL`, используется только для извлечения
ID проекта, а не как адрес беседы. Настройте поле «Инструкции» внутри проекта,
вставив [`prompts/chatgptProjectInstructions.md`](prompts/chatgptProjectInstructions.md):
режим `project` не отправляет большой системный промпт на каждый запрос.
Для старого поведения `LLM_PROJECT_PROMPT_MODE=inline`.

Допустимые уровни: `low` (GPT-6 Instant), `medium`, `high`, `xhigh`.
Уровень `none` ChatGPT Web GPT-6 не поддерживает. Если параметр не указан
в Answerline, используется `low`; если не указан самим клиентом Bridge,
его стандартное значение — `xhigh`.

При старте `npm run doctor` проверяет Bridge через `/healthz` и
`/bridge/settings`, но **не отправляет реальное сообщение**. Для полной проверки
нужен запущенный Qdrant и индекс. Запуск приложения — `npm.cmd run dev` в
Windows, `npm run dev` в macOS/Linux. Для возврата к локальной генерации
поставьте `LLM_PROVIDER=lmstudio`, `LLM_BASE_URL=http://127.0.0.1:1234`,
`LLM_MODEL=auto` и перезапустите приложение. Эмбеддинги и Qdrant остаются
локальными на своих отдельных портах.

**Важно:** при Bridge текущий транскрипт, вопрос и RAG evidence отправляются
в ChatGPT Web; окно Answerline показывает предупреждение. Bridge не совместим
с `/v1/chat/completions`, используется OpenAI Responses SSE. Отдельные
скрипты проверки ответов на базе Chat Completions пока ориентированы на LM Studio.

Для проверяемого end-to-end теста всей HTTP-цепочки без Electron используйте
`answer:probe`. Сначала безопасный RAG dry-run (не отправляет данные в LLM),
затем два последовательных реальных вопроса в **одном** Bridge-треде —
это позволяет сравнить работу первого и повторного выбора модели:

```powershell
npm.cmd run answer:probe -- --dry-run --question "Что такое self-attention?"
npm.cmd run answer:probe -- --question "Что такое RAG?" --question "Зачем нужен гибридный поиск?"
```

При `LLM_PROVIDER=bridge` явное `--question` обязательно: `answer:probe`
передаст найденные ответы из Qdrant в ChatGPT Web. Если из личного корпуса
не хотите отправлять контекст в облако, используйте только `--dry-run`.
**Безопасность инструментов:** Bridge в режиме `npm run start` автоматически
подключает `@Local` для обычных клиентов и может подтверждать его вызовы.
Answerline передаёт `client_metadata.x-bridge-no-local=true`, `tools: []`
и `tool_choice: none`; обновлённый Bridge запрещает выбор нативного
`@Local` для таких запросов, независимо от глобального режима Bridge.
Без отдельного `x-bridge-no-local` только `tool_choice: none` **недостаточно**.
Для запрета Local всем клиентам можно по-прежнему использовать `npm run start:safe`.

### Тренировочный режим (ANSWERLINE_TRAINING_MODE=1)

`ANSWERLINE_TRAINING_MODE=1` запускает приложение в режиме самотренировки: ИИ играет
интервьюера — задаёт по одному вопросу из очередных тем корпуса, вы отвечаете
голосом (финальные реплики микрофона накапливаются в поле ответа) или текстом,
затем ИИ оценивает ответ и поправляет ошибки, подтягивая эталонные материалы из
RAG-базы. Режим реализован отдельным модулем `src/main/training/`:

- без переменной тренировочных IPC-каналов и UI не существует вовсе; обычный
  пайплайн собеседования не меняется;
- панель «Подсказки» заменяется панелью «Тренировка» с кнопками
  «Новый вопрос» и «Оценить ответ»; прямой ввод вопросов модели отключён;
- горячая клавиша «спросить последнюю реплику» вместо этого запрашивает
  следующий тренировочный вопрос;
- недоступный Qdrant не блокирует тренировку: оценка идёт без эталонов,
  и промпт честно сообщает модели, что доказательной базы нет;
- в реальном собеседовании держите переменную выключенной.

## Основные npm-команды

| Команда | Назначение |
|---|---|
| `npm install` | Установить зависимости из `package-lock.json`. |
| `npm run dev` | Запустить Electron в режиме разработки. На macOS перед этим собирается helper. |
| `npm run build` | Проверить TypeScript и собрать main, preload и renderer в `out/`. |
| `npm run start` | Запустить собранное приложение через Electron preview; это не замена упакованному `.app`. |
| `npm run compile:mac-audio` | Собрать macOS CoreAudio Process Tap helper. На Windows команда ничего не делает. |
| `npm run package:mac` | Собрать arm64 `.app`, DMG и ZIP с macOS usage descriptions. |
| `npm run package:mac:x64` | Собрать macOS x64-пакет для Intel. |
| `npm run package:mac:universal` | Собрать universal-пакет. Whisper runtime остаётся внешним. |
| `npm run typecheck` | Строгая проверка TypeScript без сборки. |
| `npm test` | Запустить Vitest. |
| `npm run doctor` | Проверить Whisper, native audio backend, Qdrant, embeddings и LLM. |
| `npm run hotkeys` | Проверить доступность глобальных сочетаний клавиш. |

Минимальная проверка перед коммитом кода:

```bash
npm run typecheck
npm test
npm run build
```

`doctor` и аппаратные проверки запускайте отдельно, когда доступны LM Studio,
Qdrant, Whisper и нужные разрешения ОС.

## macOS: захват и упаковка

В macOS системный звук захватывается отдельным CoreAudio Process Tap helper,
микрофон — renderer. Приложение не создаёт `getDisplayMedia` или screen-video
поток. Для TCC и usage descriptions проверяйте именно упакованный `.app`.

```bash
npm install
npm run compile:mac-audio
npm run package:mac
open "dist/mac-arm64/Answerline.app"
```

Разрешения выдаются в **System Settings → Privacy & Security**. `setContentProtection`
является best effort и не гарантирует невидимость overlay в каждом приложении.
Для реального теста демонстрации экрана используйте тот же клиент, который
будет применяться на собеседовании.

## RAG: источник и индексация

Источник знаний — только проверенные верхнеуровневые `data/*.md`. Один заголовок
`##` образует один вопрос/чанк; `data/_pipeline/` используется для промежуточных
материалов и текущим индексатором не сканируется.

Текущий vector point содержит один embedding на вопрос. В embedding попадает
retrieval-ключ (`module`, `question`, tags из manifest), а полный ответ
хранится в Qdrant payload и добавляется в prompt только после выбора кандидата.
Алиасы в embedding не входят — они лежат в payload и участвуют в lexical rerank.

Сгенерировать альтернативные формулировки для одного или нескольких файлов
можно локальной LLM. Алиасы не создают новые ответы или vector points. Для
300-вопросного корпуса используются ровно три варианта и отдельное поле
`paraphrases`:

```bash
npm run rag:aliases -- --file=my-topic.md --count=3 --write
npm run rag:aliases -- --file=my-topic.md --write
npm run rag:aliases -- --file=my-other-topic.md --write
```

Без `--write` команда работает в режиме просмотра. Скрипт сохраняет checkpoint
в `out/rag-alias-cache.json`, поэтому его можно продолжить после остановки.
После записи aliases выполните clean rebuild коллекции, если в ней уже были
старые точки. После изменения Q&A:

```bash
npm run rag:index
```

Проверить разбор без записи в Qdrant:

```bash
npm run rag:index -- --dry-run
```

После удаления, переименования записей или смены embedding-модели нужна чистая
пересборка коллекции.

macOS/Linux:

```bash
RAG_RECREATE=1 npm run rag:index
```

Windows PowerShell:

```powershell
$env:RAG_RECREATE = '1'
npm.cmd run rag:index
Remove-Item Env:RAG_RECREATE
```

Или используйте общий флаг:

```bash
npm run rag:index -- --recreate
```

Проверка retrieval:

```bash
npm run rag:evaluate
```

Отчёт сохраняется в `out/rag-evaluation.json` и содержит module@1, module@5,
MRR, кандидатов и failure/near-miss cases.

Проверка полного пути embedding → Qdrant → prompt → streaming LLM:

```bash
npm run rag:answers
```

Оба eval-скрипта поддерживают внешний JSON-набор вопросов через
`RAG_QUESTIONS_FILE`. Файл может быть массивом объектов или объектом с полем
`questions`; для каждого вопроса обязательны уникальные `id` и `question`, а
остальные поля (`variant`, `source`, `expected_facts`) сохраняются в отчёте.

Например:

```bash
RAG_QUESTIONS_FILE=my-questions.json \
RAG_EVAL_OUTPUT=out/retrieval.json \
npm run rag:evaluate

RAG_QUESTIONS_FILE=my-questions.json \
RAG_ANSWER_OUTPUT=out/answers.json \
npm run rag:answers
```

Для большого набора можно взять воспроизводимую случайную выборку без повторов:

```bash
RAG_QUESTIONS_FILE=my-questions.json \
RAG_QUESTIONS_SAMPLE_SIZE=10 \
RAG_QUESTIONS_SEED=20260816 \
RAG_ANSWER_OUTPUT=out/answers-sample.json \
npm run rag:answers
```

`RAG_QUESTIONS_SAMPLE_SIZE` ограничивает число вопросов в конкретном прогоне,
а `RAG_QUESTIONS_SEED` позволяет повторить тот же выбор. Без seed используется
текущее время.

Если `RAG_QUESTIONS_FILE` не задан, используются встроенные regression-наборы
скриптов.

Результаты:

```text
out/rag-answer-evaluation.json
out/rag-answer-evaluation.md
```

Проверяются retrieval latency, TTFT, полное время, размер контекста, длина
ответа, содержательность и запрещённые envelope-маркеры. Качество ответа всё
равно требует ручной проверки по исходным фактам.

Для собственного пути отчёта:

```bash
RAG_ANSWER_OUTPUT=out/my-rag-run.json npm run rag:answers
```

PowerShell:

```powershell
$env:RAG_ANSWER_OUTPUT = 'out/my-rag-run.json'
npm.cmd run rag:answers
Remove-Item Env:RAG_ANSWER_OUTPUT
```

Проверка только system prompt без влияния retrieval:

```bash
npm run prompt:evaluate
```

Скрипт берёт один полный ответ вместе с его вопросом из каждого из 30
детерминированно выбранных мест корпуса и передаёт модели ровно один evidence.
Он не обращается к embeddings или Qdrant. Оцениваются покрытие ключевых фактов,
релевантность вопросу, groundedness, сохранение чисел/кода и запрещённые
служебные маркеры. По умолчанию второй локальный reviewer оценивает тот же
ответ по рубрикатору и считает процент кейсов с оценкой не ниже 90; для запуска
только детерминированной эвристики используйте `PROMPT_EVAL_JUDGE=0`. Это не
проверка дословного совпадения: модель должна сформулировать самостоятельный
ответ по найденному материалу.

Для проверки одного фиксированного Q&A:

```bash
PROMPT_EVAL_RECORD='rag_500_interview_knowledge_base_ru.md::40' npm run prompt:evaluate
```

Для эксперимента с отдельным вариантом промта:

```bash
PROMPT_EVAL_PROMPT_FILE=prompts/systemPrompt.candidate.md npm run prompt:evaluate
```

## Документы: PDF, DOCX и HTML

Экстрактор поддерживает `.pdf`, `.docx`, `.html` и `.htm`. Он сохраняет
структурированные блоки, заголовки, страницы, таблицы, hash источника и статус
извлечения. LLM не должна восстанавливать повреждённый текст по памяти.

Только извлечь документ без обращения к LM Studio:

```bash
npm run document:extract -- path/to/document.pdf --output-dir out/document-ingest
```

Создать Q&A с checkpoint и независимой валидацией:

```bash
npm run document:ingest -- path/to/document.pdf --limit 5 --repair
```

Полезные параметры:

```text
--block-mode heading|page|paragraph
--max-chars N
--from N
--limit N
--repair
--include-unverified
--force
```

Результаты находятся в `out/document-ingest/`. Перед переносом материала в
верхний уровень `data/` проверьте формулы, числа, термины, дубли и полноту
ответов вручную.

## Подготовка и перевод Q&A

Подготовить стабильный `manifest.jsonl` и metadata для текущего корпуса:

```bash
npm run rag:prepare
```

Только обновить manifest и authority-классификацию, не переписывая Markdown:

```bash
RAG_MANIFEST_ONLY=1 npm run rag:prepare
```

Перевести Markdown Q&A через текущую локальную модель LM Studio. Исходный файл
не изменяется; checkpoint позволяет продолжить прерванный запуск:

```bash
npm run translate:qa -- data/source.qa.md --limit 20
npm run translate:qa -- data/source.qa.md --limit 100
```

Проверяйте, что checkpoint действительно соответствует текущему входному файлу
и версии pipeline. Не индексируйте неполный или невалидированный перевод.

## Сравнение локальных моделей

Показать модели LM Studio:

```bash
npm run benchmark:models -- --list
```

Сравнить LLM, оставив embedding-модель загруженной:

```bash
BENCHMARK_EMBEDDING_MODEL=text-embedding-qwen3-0.6b-text-embedding \
BENCHMARK_LLM_MODELS='qwen3.5-9b-uncensored-hauhaucs-aggressive,gemma-4-e4b-uncensored-hauhaucs-aggressive,prism-ml/bonsai-27b' \
npm run benchmark:models -- --llm-only
```

PowerShell:

```powershell
$env:BENCHMARK_EMBEDDING_MODEL = 'text-embedding-qwen3-0.6b-text-embedding'
$env:BENCHMARK_LLM_MODELS = 'qwen3.5-9b-uncensored-hauhaucs-aggressive,gemma-4-e4b-uncensored-hauhaucs-aggressive,prism-ml/bonsai-27b'
npm.cmd run benchmark:models -- --llm-only
Remove-Item Env:BENCHMARK_EMBEDDING_MODEL
Remove-Item Env:BENCHMARK_LLM_MODELS
```

Отчёт сохраняется в `out/model-benchmark.json` и `out/model-benchmark.md`.
Скорость измеряется автоматически, а фактическую корректность и полноту
ответов проверяйте по тексту, а не поручайте одной модели оценивать другую.

## Диагностические скрипты

Проверка аудиоканалов:

```bash
node scripts/audio-probe.mjs 8
```

`8` — длительность в секундах. На macOS системный канал требует запущенного
native helper и проверки в приложении; наушники обязательны.

Полный ручной E2E-пробник:

```bash
node scripts/answer-probe.mjs
```

Он использует тот же embedding → retrieval → prompt → LLM путь и показывает
найденные модули, score, retrieval latency, TTFT и ответы.

## Переменные окружения

Приоритет настроек:

1. переменная shell/PowerShell;
2. значение из `.env`;
3. `config.json` или встроенный default.

Основные настройки LLM:

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
# LLM_SEED=null
```

Настройки RAG:

```text
QDRANT_URL=http://127.0.0.1:6333
QDRANT_COLLECTION=answerline_qa
EMBEDDING_BASE_URL=http://127.0.0.1:1234
EMBEDDING_MODEL=text-embedding-qwen3-0.6b-text-embedding
RAG_GENERAL_TOP_K=0
RAG_PERSONAL_TOP_K=1
# RAG_TOP_K=5  # legacy fallback for старых конфигураций
RAG_MAX_CONTEXT_TOKENS=4000
```

В режиме GPT-6/Bridge активна политика **Personal RAG**: для каждого вопроса
строится embedding и выполняется только поиск по авторитетам `internal_project`
и `personal_experience`. В prompt передаётся не более **одного** подходящего
личного факта с учётом `RAG_PERSONAL_MIN_SCORE` (по умолчанию 0.60); если
подходящего факта нет, секция не добавляется. Общая теория не ищется и в
ChatGPT не передаётся. `RAG_GENERAL_TOP_K=3` можно вернуть при переходе на
локальную модель; тогда снова появится ветка общего поиска.
`RAG_MAX_CONTEXT_TOKENS` ограничивает только evidence-блок. Общий context
window модели также включает system prompt, историю, transcript и место под
генерацию. Увеличивайте его только после проверки context length в LM Studio,
TTFT, памяти и ошибок переполнения.

При `RAG_PERSONAL_TOP_K=0` поиск по модулям проекта не выполняется, personal
секция не добавляется в prompt, а runtime и evaluation используют
`prompts/systemPrompt.noPersonalExperience.md`. При любом ненулевом значении
используется `prompts/systemPrompt.md`.

Для debug-логов:

```bash
ANSWERLINE_LOG_LEVEL=debug npm run dev
```

Для локальной записи benchmark-метрик без текста транскриптов и ответов:

```bash
ANSWERLINE_BENCHMARK_LOG=1 npm run dev
```

## Режим интервью

Горячие клавиши по умолчанию:

| Комбинация | Действие |
|---|---|
| `CommandOrControl+Shift+\` | Показать или скрыть overlay. |
| `CommandOrControl+Shift+P` | Поставить аудиозахват на паузу или продолжить. |
| `CommandOrControl+Shift+Enter` | Отправить последнюю реплику интервьюера вручную. |
| `Esc` в поле ручного вопроса | Остановить текущую генерацию. |

Перед интервью:

1. Запустить LM Studio local server и загрузить одну LLM.
2. Запустить Qdrant и проверить embedding collection.
3. Выполнить `npm run doctor`.
4. На macOS использовать упакованный `.app`; на Windows можно использовать
   `npm run dev` или установленную сборку.
5. Проверить, что системный звук приходит через CoreAudio Tap/WASAPI, а
   микрофон используется как контекст.
6. Остановить приложение обычным закрытием окна, чтобы Whisper корректно
   завершил дочерний процесс.

## Где искать результаты

- `out/rag-evaluation.json` — offline retrieval evaluation;
- `out/rag-answer-evaluation.json` и `.md` — end-to-end RAG/LLM evaluation;
- `out/model-benchmark.json` и `.md` — сравнение embedding/LLM моделей;
- `out/document-ingest/` — extraction, checkpoints, candidates и validation;
- `app.getPath('userData')/config.json` — пользовательская конфигурация;
- `app.getPath('userData')/benchmarks/*.jsonl` — benchmark при включённом
  `ANSWERLINE_BENCHMARK_LOG=1`.
- `app.getPath('userData')/sessions/*.jsonl` — локальные трассировки каждой
  сессии: вопросы, exact retrieved context, кандидаты RAG, scores, prompt
  estimates, TTFT и ответы модели.

Обычная сессия логируется локально автоматически, чтобы после интервью можно
было понять, где возникла ошибка: в retrieval или уже в генерации. Файл содержит
текст интервью и может быть чувствительным. Если конкретную сессию нельзя
сохранять на диске, запустите приложение с `ANSWERLINE_SESSION_LOG=0`.

Не добавляйте в Git `.env`, `out/`, `dist/`, логи, модели, DLL и `.node`-файлы.
