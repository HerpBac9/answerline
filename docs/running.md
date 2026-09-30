# Запуск и проверка Answerline

## Предварительные условия

- Windows 10+ или macOS 14.4+ и Node.js 22.12 или новее;
- LM Studio с загруженной LLM и включённым local server;
- рабочая сборка whisper.cpp с `whisper-server.exe` в Windows или
  исполняемым `whisper-server` в macOS, плюс модель Whisper;
- в Windows — внешний native WASAPI audio module; в macOS — Swift/CoreAudio
  Process Tap helper (`npm run compile:mac-audio`) и упакованный Electron `.app`
  с `NSAudioCaptureUsageDescription`;
- наушники: приложение намеренно не использует активное echo cancellation.

## Первичная настройка

```bash
npm install
npm run doctor
npm run dev
```

В Windows PowerShell при заблокированном `npm.ps1` используйте `npm.cmd`.

После первого старта откройте файл `config.json` в пути, который напечатает
`doctor` (обычно `%APPDATA%\answerline\config.json` в Windows или
`~/Library/Application Support/answerline/config.json` в macOS), и проверьте:

- `whisperServerPath` — прямой путь к исполняемому `whisper-server` (или
  `whisperRuntimeDir` — каталог с ним и DLL; в Windows имя добавляется
  автоматически);
- `whisperModelPath` — файл модели Whisper;
- `windowsAudioModulePath` — prebuilt native audio module в Windows;
- `llmBaseUrl` — обычно `http://127.0.0.1:1234`;
- `llmModel` — `auto` для одной загруженной LLM или точный key модели;
- `ragQdrantUrl`, `ragCollection` — локальный Qdrant и имя коллекции;
- `ragEmbeddingBaseUrl`, `ragEmbeddingModel` — локальный embeddings endpoint и
  тот же model id, которым собран индекс;
- `ragTopK`, `ragMaxContextTokens`, `ragMinScore` — границы runtime retrieval;
- `hotkeys` и `excludeFromCapture` — под локальные требования.

Распознавание речи зафиксировано на русском (`ru`). Поле `sttLanguage` оставлено
в `config.json` только для совместимости со старыми конфигурациями и не может
включить автоопределение или другой язык.

Параметры генерации не нужно менять в `config.json`: они находятся в `.env` и
общие для приложения и RAG-тестов — `LLM_MAX_TOKENS`, `LLM_TEMPERATURE`,
`LLM_TOP_P`, `LLM_TOP_K`, `LLM_MIN_P`, `LLM_REPEAT_PENALTY`,
`LLM_PRESENCE_PENALTY`, `LLM_FREQUENCY_PENALTY` и необязательный `LLM_SEED`.
Полный пример находится в `.env.example`.

В новом macOS-профиле пути Whisper пустые намеренно — укажите свои до запуска
захвата. Старые Windows-конфиги продолжают работать через legacy-поля.

## Режимы запуска

| Задача | Команда |
|---|---|
| Разработка | `npm run dev` |
| Сборка JS | `npm run build` |
| Сборка macOS CoreAudio helper | `npm run compile:mac-audio` |
| macOS `.app`/DMG | `npm run package:mac` |
| macOS Intel | `npm run package:mac:x64` |
| macOS universal | `npm run package:mac:universal` |
| Предпросмотр собранного приложения | `npm run start` |
| Типы | `npm run typecheck` |
| Модульные тесты | `npm test` |
| Диагностика окружения | `npm run doctor` |
| Проверка доступных hotkeys | `npm run hotkeys` |

## Проверка реального пайплайна

Перед интервью выполните `npm run doctor` (в Windows при необходимости
`npm.cmd`): он проверит пути, Whisper-модель,
Qdrant, embedding endpoint и доступность LM Studio. Native audio module может не загружаться
из обычного Node из-за несовпадения ABI Electron; doctor сообщит об этом как о
предупреждении, а не как о доказанном дефекте.

Для ручной диагностики доступны:

```powershell
node scripts/audio-probe.mjs 8
node scripts/answer-probe.mjs
```

`audio-probe` слушает оба канала в Windows. В macOS сначала выполните
`npm run compile:mac-audio`, затем проверяйте упакованное Electron-приложение
после клика «Слушать»: микрофон требует user gesture, а CoreAudio Tap может
показать системный запрос **System Audio Recording**. `answer-probe` отправляет контрольные вопросы в
LLM и печатает ответы вместе с time-to-first-token.

Для одиночного E2E-теста скопируйте `.env.example` в `.env`. Файл включает
`ANSWERLINE_ANSWER_FROM_MIC=1`, поэтому вопрос, произнесённый в микрофон, также
запустит ответ. Не используйте этот режим на реальном интервью: собственные
вопросы интервьюеру начнут ошибочно вызывать подсказку.

Переменная окружения имеет приоритет над `.env`. Например, в macOS или zsh
можно временно отключить режим:

```bash
ANSWERLINE_ANSWER_FROM_MIC=0 npm run dev
```

## Во время работы

- `CommandOrControl+Shift+\` — показать или скрыть overlay;
- `CommandOrControl+Shift+P` — поставить захват на паузу или продолжить;
- `CommandOrControl+Shift+Enter` — отправить последнюю реплику интервьюера вручную;
- `Esc` в поле ручного вопроса — остановить генерацию.

Если сочетание занято другой программой, приложение сообщит об этом в статусе.
Кнопка «защита от захвата запрошена» не гарантирует невидимость в Zoom, Teams,
Meet, OBS или другой программе — macOS ScreenCaptureKit может всё равно показать
окно. Для гарантии невидимости перед демонстрацией спрячьте overlay горячей
клавишей или делитесь только окном конференции. Проведите тестовый звонок с тем
же способом демонстрации экрана.

## RAG-источник и ресурсы

Заполните `data/*.md` реальными Q&A о своём опыте. Каждый заголовок `##` создаёт
индексируемую запись, имя файла становится module. После изменения выполните
`npm run rag:index`; после удаления или переименования записей используйте
`RAG_RECREATE=1 npm run rag:index` (в PowerShell — `$env:RAG_RECREATE = '1'; npm.cmd run rag:index`).

`resources/it-ru-terms.md` исправляет известные варианты распознавания
терминов для модели. `resources/hallucinations.txt` содержит фразы и регулярные
выражения, которые Whisper доказанно выдумывает. Изменения в этих ресурсах
требуют перезапуска процесса приложения.
