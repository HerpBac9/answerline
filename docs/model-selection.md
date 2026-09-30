# Выбор локальных моделей

Профиль машины: MacBook Pro, Apple M5, 10 ядер, 16 ГБ памяти. Цель — короткий
ответ во время интервью, поэтому важнее задержка первого токена и отсутствие
лишнего reasoning, чем максимальный benchmark score.

## Embedding

| Модель | Размер/вектор | Что важно | Решение |
| --- | --- | --- | --- |
| [`google/embeddinggemma-300m`](https://huggingface.co/google/embeddinggemma-300m) (`text-embedding-embeddinggemma-300m`) | 300M, 768d | 100+ языков, 2048 токенов; MTEB Multilingual v2 61.15 в full precision и 60.62 для Q4 | кандидат на скорость |
| [`Qwen/Qwen3-Embedding-0.6B`](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) (`text-embedding-qwen3-0.6b-text-embedding`) | 600M, до 1024d | 100+ языков, 32K контекст; MTEB Multilingual 64.33 в таблице карточки (срез 24.05.2025) | кандидат для A/B, если Gemma теряет нужные русские chunks |

Количество лайков на Hugging Face не сравнивает качество на конкретном корпусе.
EmbeddingGemma заметно легче и быстрее для 808 небольших chunks. Qwen3-Embedding
выше в опубликованной multilingual-таблице, но потребляет больше памяти и даёт
1024-мерные векторы. Окончательного победителя нет: решение принимает
benchmark на собственном golden set, а не число лайков.

Обе модели требуют согласованного формата query/document. Для Gemma приложение
использует `task: search result | query: ...` для запроса и
`title: none | text: ...` для документа. После изменения модели или этих
префиксов нужна полная пересборка Qdrant с `RAG_RECREATE=1`.

## Генерация

Рекомендуемая модель — [`Qwen/Qwen3-4B-GGUF`](https://huggingface.co/Qwen/Qwen3-4B-GGUF), файл `Q4_K_M`, загруженный в LM
Studio. Карточка модели указывает 4B параметров, размер Q4_K_M около 2.5 ГБ,
поддержку 100+ языков и совместимость с LM Studio/llama.cpp. На 16 ГБ это
оставляет запас под Whisper, Qdrant и UI и обычно даёт лучшую скорость среди
моделей, которые ещё уверенно пишут код и отвечают по-русски.

Qwen3 по умолчанию умеет thinking; системный prompt проекта включает
`/no_think`, но sampling-параметры намеренно не меняются под рекомендации
модели. Benchmark читает текущие `LLM_*` значения из `.env`, чтобы сравнение
проходило на вашей реальной конфигурации.

Если нужна максимальная скорость — не переходите на 8B: он может дать немного
лучшее качество, но увеличит задержку генерации. Q5_K_M — разумный следующий
шаг только после проверки, что Q4 теряет код или русскую формулировку.

## Запуск сравнения

Скрипт получает список моделей через LM Studio `/api/v1/models`, оставляет
выбранный embedding-инстанс загруженным и переключает только LLM:

```bash
npm run benchmark:models -- --list
BENCHMARK_EMBEDDING_MODEL=text-embedding-embeddinggemma-300m \
BENCHMARK_LLM_MODELS='qwen3.5-9b-uncensored-hauhaucs-aggressive,gemma-4-e4b-uncensored-hauhaucs-aggressive,prism-ml/bonsai-27b' \
npm run benchmark:models -- --llm-only
```

`out/model-benchmark.md` содержит timings и ответы всех моделей рядом. Числовые
метрики качества — это module@1, module@5, MRR и overlap с evidence; финальную
корректность ответа нужно оценивать по самим текстам, а не поручать одной LLM
судить другую.
