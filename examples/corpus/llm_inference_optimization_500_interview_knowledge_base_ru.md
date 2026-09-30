# LLM Inference & Optimization — 500 технических вопросов для интервью и production-дискуссий

## Вопрос 1. Что такое inference у большой языковой модели и чем он принципиально отличается от обучения?

## Вопрос 1.1. Что происходит с LLM во время инференса и какие части training pipeline при этом отсутствуют?

## Вопрос 1.2. Почему оптимизация запуска обученной LLM отличается от оптимизации её training-процесса?

**Ответ**

Inference (инференс, выполнение уже обученной модели) — это вычисление выходного распределения и генерация ответа без обновления параметров модели. При обучении выполняются прямой проход, вычисление функции потерь, обратное распространение ошибки и обновление весов; при inference обычно нужен только прямой проход. Поэтому требования к системе различаются: обучение оптимизируют под высокий суммарный FLOPS и большие batch, а inference — одновременно под latency, throughput, объём памяти, стоимость токена и предсказуемость хвостовых задержек. Для autoregressive LLM особенно важна последовательная decode-фаза, которой нет в таком виде при обычном обучении.

## Вопрос 2. На какие две основные вычислительные фазы делится autoregressive LLM inference и что происходит на каждой из них?

## Вопрос 2.1. Чем prefill отличается от decode в LLM serving?

## Вопрос 2.2. Что делает сервер LLM до первого токена и что он делает между последующими токенами?

**Ответ**

Autoregressive inference обычно делится на prefill (предварительное вычисление по входному контексту) и decode (пошаговая генерация). На prefill модель параллельно обрабатывает все токены prompt, строит скрытые состояния и заполняет KV cache (кэш ключей и значений attention). Эта фаза хорошо использует крупные матричные операции и часто более compute-bound. На decode каждый новый токен зависит от уже сгенерированных, поэтому шаги последовательны; матрицы становятся «тоньше», а чтение весов и KV cache часто делает фазу memory-bandwidth-bound. Разделение критично для выбора batching, parallelism и SLO.

## Вопрос 3. Почему стандартная LLM генерирует текст autoregressive, по одному токену, а не все токены ответа сразу?

## Вопрос 3.1. Откуда берётся последовательная зависимость между decode-шагами LLM?

## Вопрос 3.2. Почему нельзя просто вычислить весь ответ decoder-only Transformer одним параллельным forward pass?

**Ответ**

Autoregressive generation (авторегрессионная генерация) факторизует вероятность последовательности как произведение условных вероятностей: P(x₁…xₙ)=∏P(xᵢ|x₍<i₎). Чтобы получить токен i, модели нужен уже выбранный префикс до i−1, поэтому следующий decode step зависит от результата предыдущего. Внутри одного шага Transformer высоко параллелен, но между шагами возникает последовательная зависимость. Именно она ограничивает single-request latency и мотивирует speculative decoding (спекулятивное декодирование), multi-token prediction и другие техники, пытающиеся проверять несколько будущих токенов за один проход.

## Вопрос 4. Как токенизация влияет на скорость и стоимость LLM inference?

## Вопрос 4.1. Почему две модели с одинаковыми tokens/s могут иметь разную пользовательскую скорость?

## Вопрос 4.2. Как vocabulary и tokenizer могут повлиять на latency и цену одного и того же запроса?

**Ответ**

Tokenizer (токенизатор, алгоритм разбиения текста на токены) определяет, сколько модельных шагов потребуется для одного и того же текста. Более длинная токенизированная последовательность увеличивает prefill, размер KV cache и число decode-итераций, а при тарифе «за токен» — и стоимость. Важен не только средний tokens-per-character, но и язык, код, специальные символы и chat template. При сравнении моделей нельзя честно сопоставлять только tokens/s: разные tokenizer могут кодировать одинаковый пользовательский текст разным количеством токенов, поэтому полезно дополнительно измерять символы или байты в секунду.

## Вопрос 5. Что такое logits на выходе языковой модели и как из них получается следующий токен?

## Вопрос 5.1. Как численные выходы последнего слоя LLM превращаются в выбранный next token?

## Вопрос 5.2. Что именно модель выдаёт перед sampling — токен или распределение по vocabulary?

**Ответ**

Logits (логиты, ненормированные оценки токенов) — это значения последнего линейного слоя для всего vocabulary. Softmax (нормализация в вероятностное распределение) преобразует их в вероятности: pᵢ=exp(zᵢ)/Σⱼexp(zⱼ). Далее decoding policy выбирает токен: максимум для greedy decoding или случайная выборка после temperature/top-k/top-p преобразований. В production важно помнить, что logits processors, grammar constraints и penalties меняют распределение до sampling. Ошибка в порядке этих преобразований способна менять качество ответа даже при одинаковых весах модели и seed.

## Вопрос 6. Как temperature меняет распределение следующего токена при генерации?

## Вопрос 6.1. Почему понижение temperature делает генерацию более предсказуемой?

## Вопрос 6.2. Что математически происходит с logits при изменении temperature?

**Ответ**

Temperature (температура sampling) масштабирует logits перед softmax: pᵢ∝exp(zᵢ/T). При T<1 различия между logits усиливаются, распределение становится более острым и генерация — более детерминированной. При T>1 вероятности выравниваются, повышая разнообразие и риск маловероятных продолжений. При T→0 на практике переходят к greedy-поведению, а не делят буквально на ноль. Temperature не «улучшает интеллект» модели: она меняет стратегию выборки. Её влияние нужно оценивать вместе с top-p/top-k, seed и конкретным workload.

## Вопрос 7. Чем top-k sampling отличается от top-p sampling?

## Вопрос 7.1. Когда nucleus sampling оставляет больше или меньше токенов, чем top-k?

## Вопрос 7.2. В чём алгоритмическая разница между top-k и top-p при выборе следующего токена?

**Ответ**

Top-k sampling (выборка из k наиболее вероятных токенов) всегда оставляет фиксированное число кандидатов. Top-p, или nucleus sampling (ядерная выборка), оставляет минимальный набор токенов, чья суммарная вероятность достигает порога p. Поэтому top-p адаптируется к форме распределения: при уверенной модели кандидатов мало, при неопределённой — больше. Оба метода затем перенормируют вероятности и выполняют sampling. В production их нельзя сравнивать только по «креативности»: они влияют на acceptance rate speculative decoding, повторяемость результатов и иногда на эффективность constrained generation.

## Вопрос 8. Чем greedy decoding отличается от stochastic sampling и когда это важно для inference?

## Вопрос 8.1. Почему greedy и sampling дают разные свойства воспроизводимости при serving?

## Вопрос 8.2. В каких аспектах способ выбора next token влияет не только на качество, но и на производительность?

**Ответ**

Greedy decoding (жадное декодирование) на каждом шаге выбирает токен с максимальной вероятностью, поэтому при детерминированных kernels и одинаковом контексте стремится давать один и тот же результат. Stochastic sampling (случайная выборка) выбирает токен из распределения и требует управления RNG (генератором случайных чисел). Sampling увеличивает разнообразие, но усложняет воспроизводимость и тестирование. Для inference performance выбор также важен: некоторые методы speculative decoding имеют разную acceptance rate при greedy и sampling, а beam search или несколько samples увеличивают нагрузку и KV cache.

## Вопрос 9. Как EOS token, stop sequence и max_tokens завершают генерацию и чем они отличаются?

## Вопрос 9.1. Какими тремя способами обычно ограничивается длина ответа LLM?

## Вопрос 9.2. Чем завершение по EOS отличается от server-side stop condition?

**Ответ**

EOS (и-оу-эс; End Of Sequence — токен конца последовательности) — специальный токен vocabulary, который сама модель может сгенерировать. Stop sequence (стоп-последовательность) — правило serving-слоя, которое обнаруживает заданный текст или набор токенов и прекращает выдачу. max_tokens — жёсткий лимит числа новых токенов. Эти механизмы могут завершать запрос по разным причинам, поэтому finish reason нужно логировать отдельно. Неверная токенизация stop sequence или игнорирование EOS способна увеличить latency, стоимость и занятость KV cache без какой-либо пользы для пользователя.

## Вопрос 10. Что такое batch в LLM inference и почему batch size нельзя трактовать так же просто, как при обычном dense inference?

## Вопрос 10.1. Почему batch size в text generation меняется по ходу выполнения?

## Вопрос 10.2. Чем batching генеративных запросов отличается от статического batching классификатора?

**Ответ**

Batch (пакет одновременно обрабатываемых запросов) в LLM serving динамичен: запросы имеют разные prompt length, output length и заканчиваются в разные моменты. Поэтому фиксированный batch, собранный один раз, быстро теряет эффективность. Современные runtimes используют continuous batching (непрерывное пакетирование), где завершившиеся запросы удаляются, а новые могут добавляться между decode-итерациями. Реальная нагрузка лучше описывается числом active sequences и суммой токенов в итерации, а не одним static batch size. Ограничения задаются также объёмом KV cache и scheduler policy.

## Вопрос 11. В чём разница между latency и throughput при LLM serving?

## Вопрос 11.1. Почему максимальный throughput может означать плохой пользовательский latency?

## Вопрос 11.2. Как различаются цели оптимизации latency и throughput в LLM endpoint?

**Ответ**

Latency (задержка) описывает время, которое испытывает отдельный запрос: например, до первого токена или до полного ответа. Throughput (пропускная способность) показывает, сколько работы система выполняет за единицу времени — requests/s, input tokens/s или output tokens/s. Увеличение batch обычно повышает throughput, но может ухудшить latency из-за очереди и конкуренции за GPU. Поэтому «максимальный tokens/s» не равен хорошему production serving. Нужны SLO по хвостовым перцентилям и измерение goodput — объёма работы, выполненного с соблюдением заданных latency constraints.

## Вопрос 12. Что измеряет TTFT и какие компоненты времени входят в эту метрику?

## Вопрос 12.1. Из чего складывается time-to-first-token в production LLM service?

## Вопрос 12.2. Какая latency-метрика лучше всего отражает ожидание пользователя до начала streaming-ответа?

**Ответ**

TTFT (ти-ти-эф-ти; Time To First Token — время до первого токена) измеряет интервал от поступления запроса до появления первого сгенерированного токена. В end-to-end измерении туда могут входить network overhead, очередь, tokenization, scheduler delay, prefix-cache lookup, prefill и первый decode step. Поэтому высокий TTFT нельзя автоматически объяснять «медленным attention». Для диагностики его раскладывают на queue time и prefill time, а затем коррелируют с input length, cache hit rate, concurrency и GPU utilization. Особенно важны p95/p99, а не только среднее значение.

## Вопрос 13. Что такое TPOT и чем он отличается от inter-token latency?

## Вопрос 13.1. Почему средний time-per-output-token может скрывать рывки в streaming?

## Вопрос 13.2. Какая разница между TPOT как агрегатом и интервалами между отдельными токенами?

**Ответ**

TPOT (ти-пи-оу-ти; Time Per Output Token — среднее время на выходной токен после первого) обычно вычисляют как (end_time−first_token_time)/(N−1). ITL (ай-ти-эл; Inter-Token Latency — задержка между соседними токенами) — набор отдельных интервалов, поэтому позволяет видеть jitter и хвосты. Средний TPOT может выглядеть приемлемо, хотя отдельные ITL spikes портят streaming UX. Для performance analysis полезны обе метрики: TPOT удобен для capacity comparisons, а distribution ITL — для поиска scheduler stalls, длинных prefill-вставок, synchronization pauses и network buffering.

## Вопрос 14. Почему tokens per second нужно уточнять: input, output, per-request или aggregate?

## Вопрос 14.1. Почему фраза «модель выдаёт 2000 токенов в секунду» без контекста почти бессмысленна?

## Вопрос 14.2. Какие разные виды token throughput нужно различать при benchmark LLM serving?

**Ответ**

Tokens/s неоднозначен. Input tokens/s характеризует скорость обработки prompt и зависит от prefill workload. Output tokens/s показывает скорость генерации и чувствителен к decode batching. Per-request tokens/s отражает пользовательскую скорость одной последовательности, тогда как aggregate tokens/s суммирует работу всех одновременных запросов. Сервер может резко поднять aggregate throughput большим batch, одновременно ухудшив per-request скорость. Поэтому benchmark должен явно фиксировать input/output length distribution, concurrency, arrival process и метрику. Иначе сравнение runtimes или GPU легко становится методологически неверным.

## Вопрос 15. Что такое KV cache в decoder-only Transformer?

## Вопрос 15.1. Какие тензоры Transformer сохраняются между decode-шагами?

## Вопрос 15.2. Что именно хранит key-value cache и зачем он нужен генерации?

**Ответ**

KV cache (кей-ви кэш; Key-Value cache — кэш ключей и значений attention) хранит K и V, уже вычисленные для предыдущих токенов каждого attention layer. При генерации нового токена модели не нужно повторно строить keys и values для всего префикса: она вычисляет их только для нового токена и выполняет attention нового query по сохранённому контексту. Кэш ускоряет autoregressive decode, но растёт примерно линейно с sequence length и числом KV heads. В production его объём часто ограничивает число одновременно обслуживаемых длинных запросов.

## Вопрос 16. Почему KV cache резко уменьшает вычислительную работу при autoregressive decoding?

## Вопрос 16.1. Какую повторную работу устраняет KV cache при генерации?

## Вопрос 16.2. Почему Transformer не пересчитывает K и V всего префикса на каждом новом токене?

**Ответ**

Без KV cache (кэша ранее вычисленных keys и values) на каждом decode step пришлось бы снова пропускать весь накопленный префикс через проекции K и V во всех слоях, повторяя уже выполненную работу. С кэшем новый шаг вычисляет K/V только для одного нового токена и читает сохранённые значения предыдущих токенов. Это переводит основную стоимость attention decode из повторного полного prefill в чтение растущего кэша и dot-product с ним. Выигрыш по FLOPs огромен, но появляется новый bottleneck: memory capacity и memory bandwidth KV cache.

## Вопрос 17. Как приблизительно рассчитать объём KV cache для одной последовательности?

## Вопрос 17.1. От каких параметров модели и контекста зависит память key-value cache?

## Вопрос 17.2. Как оценить, сколько VRAM займёт KV cache до запуска benchmark?

**Ответ**

Для стандартного decoder Transformer объём KV cache можно оценить как 2 × L × T × Hkv × Dh × B, где 2 — K и V, L — число слоёв, T — число сохранённых токенов, Hkv — число KV heads, Dh — размер head, B — байт на элемент. Для MHA обычно Hkv=Hquery; для GQA/MQA меньше. Например, переход BF16→FP8 примерно вдвое уменьшает байты элемента, но качество и kernel support нужно проверять. Формула полезна для capacity planning: она напрямую связывает context length, concurrency и доступную GPU memory.

## Вопрос 18. Как работает multi-head attention на уровне Q, K, V и почему это важно для inference?

## Вопрос 18.1. Что вычисляет attention head и почему его workload отличается между prefill и decode?

## Вопрос 18.2. Как формула scaled dot-product attention связана с производительностью LLM inference?

**Ответ**

MHA (эм-эйч-эй; Multi-Head Attention — многоголовое внимание) строит для каждого head собственные Query, Key и Value проекции. Attention вычисляет softmax(QKᵀ/√d)V, после чего результаты heads объединяются. При prefill матрицы Q и K содержат множество токенов, и стоимость full attention растёт квадратично по длине последовательности. При cached decode query относится обычно к одному новому токену, а K/V берутся из cache; вычислительная форма меняется и становится значительно менее удобной для насыщения GPU. Поэтому kernels и parallelism для prefill и decode оптимизируют по-разному.

## Вопрос 19. Что такое MQA и почему он ускоряет autoregressive inference?

## Вопрос 19.1. Почему один общий K/V head уменьшает стоимость decode?

## Вопрос 19.2. Как multi-query attention сокращает KV cache по сравнению с multi-head attention?

**Ответ**

MQA (эм-кью-эй; Multi-Query Attention — многозапросное внимание) сохраняет несколько query heads, но использует один общий key head и один value head. Это резко уменьшает размер KV cache и объём данных, который нужно читать на каждом decode step. Поскольку autoregressive decode часто ограничен memory bandwidth, сокращение KV traffic может дать заметный выигрыш. Цена — меньшая выразительность K/V представления и возможная потеря качества относительно MHA. Поэтому MQA является архитектурным свойством модели: serving runtime не может безопасно «включить его флагом» для произвольного MHA checkpoint.

## Вопрос 20. Что такое GQA и какой trade-off он решает между MHA и MQA?

## Вопрос 20.1. Как grouped-query attention занимает промежуточное положение между MHA и MQA?

## Вопрос 20.2. Почему число KV heads в GQA важно для memory planning inference-сервера?

**Ответ**

GQA (джи-кью-эй; Grouped-Query Attention — сгруппированное query-внимание) использует меньше KV heads, чем query heads, но больше одного. Несколько query heads делят одну пару K/V внутри группы. Поэтому KV cache и memory bandwidth ниже, чем у MHA, а representational capacity обычно выше, чем у MQA. Это компромисс между качеством и decode efficiency. Для serving важно знать именно число KV heads в model config: оно определяет cache footprint, влияет на tensor parallel sharding и может создавать репликацию KV при неудачном соотношении TP size и числа heads.

## Вопрос 21. Что означает, что inference kernel является compute-bound или memory-bound?

## Вопрос 21.1. Как определить, ограничен ли LLM inference вычислениями или пропускной способностью памяти?

## Вопрос 21.2. Почему одна и та же модель может быть compute-bound на prefill и memory-bound на decode?

**Ответ**

Compute-bound означает, что время ограничивает количество арифметических операций, которое способен выполнить accelerator; ускорение требует более быстрых Tensor Cores, меньшего FLOP count или лучшей матричной загрузки. Memory-bound означает, что arithmetic units простаивают, ожидая данные из памяти; тогда важнее bandwidth, data reuse, quantization и fusion. LLM prefill с крупными GEMM часто ближе к compute-bound, а low-batch decode — к memory-bound из-за повторного чтения весов и KV cache. Это не абсолютное правило: граница меняется с batch, context length, architecture и precision.

## Вопрос 22. Что такое arithmetic intensity и как она помогает рассуждать о производительности LLM inference?

## Вопрос 22.1. Почему FLOPS GPU недостаточно для оценки decode speed?

## Вопрос 22.2. Как отношение FLOPs к переданным байтам объясняет разницу между batch=1 и большим batch?

**Ответ**

Arithmetic intensity (арифметическая интенсивность) — отношение числа выполненных FLOPs к объёму перемещённых байтов данных. Высокая интенсивность означает, что одни и те же данные переиспользуются для большого числа вычислений, поэтому workload способен приблизиться к compute ceiling. Низкая — что производительность ограничит memory bandwidth. Увеличение batch в GEMM повышает reuse весов и часто arithmetic intensity decode. Quantization уменьшает байты, а kernel fusion сокращает промежуточные reads/writes. Поэтому метрика помогает объяснить, почему «теоретические TFLOPS GPU» плохо предсказывают скорость генерации при batch=1.

## Вопрос 23. Как roofline model применяют к анализу LLM inference?

## Вопрос 23.1. Как по roofline понять, что именно ограничивает конкретный этап LLM?

## Вопрос 23.2. Когда имеет смысл использовать roofline analysis вместо сравнения одних TFLOPS?

**Ответ**

Roofline model (модель «крыши» производительности) сопоставляет arithmetic intensity workload с двумя пределами: peak compute и peak memory bandwidth. Теоретический performance ограничен min(PeakFLOPS, Bandwidth×ArithmeticIntensity). Если точка слева от «излома», workload memory-bound; справа — compute-bound. Для LLM удобно отдельно наносить prefill GEMM, decode GEMM, attention и MoE kernels. Модель не заменяет profiler: она не учитывает launch overhead, synchronization, network collectives и плохую occupancy. Но она быстро показывает, даст ли пользу более низкая precision, увеличение batch или ускорение interconnect.

## Вопрос 24. Почему иерархия памяти GPU — registers, shared memory/SRAM, HBM — критична для оптимизации Transformer?

## Вопрос 24.1. Почему сокращение обращений к HBM способно ускорить attention без уменьшения числа математических операций?

## Вопрос 24.2. Как on-chip memory и HBM определяют дизайн быстрых Transformer kernels?

**Ответ**

GPU имеет очень быструю, но маленькую on-chip память — registers и shared memory/SRAM — и значительно более ёмкую, но медленнее доступную HBM (эйч-би-эм; High Bandwidth Memory — высокопропускная память). Наивный attention материализует крупные промежуточные матрицы в HBM и многократно их читает. IO-aware kernels, например FlashAttention, разбивают вычисление на tiles, удерживают рабочие блоки on-chip и уменьшают HBM traffic. Аналогично fusion старается не записывать промежуточные тензоры во внешнюю память. Поэтому оптимизация LLM — это часто задача движения данных, а не только сокращения FLOPs.

## Вопрос 25. Что такое GPU occupancy и почему высокая загрузка GPU не гарантирует высокий LLM throughput?

## Вопрос 25.1. Почему высокий GPU utilization может соседствовать с низким tokens/s?

## Вопрос 25.2. Что именно показывает occupancy и чего она не говорит о производительности inference?

**Ответ**

Occupancy (заполняемость GPU, доля возможных active warps на Streaming Multiprocessor) показывает, насколько хорошо kernel способен скрывать latency памяти и поддерживать параллельную работу. Но 100% occupancy не означает 100% полезной производительности: kernel может быть memory-bound, выполнять лишние операции, ждать synchronization или иметь низкую Tensor Core utilization. Аналогично метрика `GPU utilization` из мониторинга часто лишь показывает, что GPU занят. Для LLM её нужно дополнять memory bandwidth, achieved FLOPS, kernel duration, SM efficiency, batch/tokens per iteration и end-to-end latency.

## Вопрос 26. Что такое GEMM и почему большая часть вычислений Transformer сводится к нему?

## Вопрос 26.1. Почему Tensor Cores особенно важны для линейных слоёв LLM?

## Вопрос 26.2. Какие операции Transformer в основном реализуются как matrix multiplication?

**Ответ**

GEMM (джемм; General Matrix-Matrix Multiplication — общее матричное умножение) лежит в основе линейных проекций Q/K/V/O и feed-forward слоёв Transformer. Современные GPU имеют Tensor Cores, оптимизированные именно под крупные матричные операции низкой precision. Чем лучше размеры матриц совпадают с поддерживаемыми tiles и чем больше batch/token dimension, тем выше utilization. На decode при маленьком batch матричные операции становятся узкими, и аппаратный peak недостижим. Поэтому архитектура модели, batching и shape alignment непосредственно влияют на скорость, даже если число параметров одинаково.

## Вопрос 27. Чем FP32, FP16 и BF16 отличаются с точки зрения LLM inference?

## Вопрос 27.1. Почему BF16 часто численно устойчивее FP16, хотя оба занимают 16 бит?

## Вопрос 27.2. Как выбор FP32/FP16/BF16 влияет на память и скорость inference?

**Ответ**

FP32 хранит 32-битные floating-point значения и даёт большой диапазон и точность, но требует больше памяти и bandwidth. FP16 (16-битное floating point) экономит память и хорошо поддерживается Tensor Cores, однако имеет меньший exponent range. BF16 (би-эф-сикстин; bfloat16 — 16-битный формат с диапазоном, близким FP32) сохраняет широкий exponent range при меньшей mantissa. Для inference FP16/BF16 обычно достаточны как baseline, но конкретная скорость зависит от GPU. Понижение precision полезно только при наличии эффективных hardware kernels и сохранении приемлемого качества.

## Вопрос 28. Что такое kernel fusion и зачем объединять несколько операций Transformer в один GPU kernel?

## Вопрос 28.1. Почему fused Transformer kernel может быть быстрее той же последовательности отдельных операций?

## Вопрос 28.2. Как kernel fusion уменьшает не арифметику, а накладные расходы и memory traffic?

**Ответ**

Kernel fusion (слияние вычислительных ядер) объединяет последовательные операции так, чтобы промежуточные данные оставались в registers/shared memory и не записывались лишний раз в HBM. Это уменьшает memory traffic и число kernel launches. Типичные кандидаты — bias+activation, normalization, RoPE, dequantization+GEMM, sampling stages. Fusion особенно полезен для небольших или memory-bound операций, где launch overhead и чтение памяти сопоставимы с вычислением. Ограничение: fused kernel сложнее поддерживать, он чувствительнее к shapes, precision и GPU architecture, поэтому универсальность часто уступает специализированной производительности.

## Вопрос 29. Что такое CUDA Graphs и почему они могут ускорять decode?

## Вопрос 29.1. Как CUDA Graph помогает, если сами матричные вычисления не становятся дешевле?

## Вопрос 29.2. Почему динамический batch усложняет применение CUDA Graphs в LLM serving?

**Ответ**

CUDA Graphs (графы CUDA, заранее записанная последовательность GPU-операций) позволяют захватить набор kernel launches и затем воспроизводить его с меньшим CPU launch overhead. Это особенно полезно для decode с маленькими batch, где отдельные kernels короткие и Python/driver overhead заметен. Основная сложность — динамические shapes и меняющийся состав batch: runtime обычно захватывает набор типовых размеров и padding-ит до ближайшего graph size либо падает обратно в eager execution. CUDA Graphs не уменьшают FLOPs модели; они уменьшают orchestration overhead и CPU-GPU gaps.

## Вопрос 30. Что делает FlashAttention и какую проблему стандартного attention он оптимизирует?

## Вопрос 30.1. Почему FlashAttention быстрее обычного exact attention, хотя считает тот же результат?

## Вопрос 30.2. Как tiling устраняет материализацию полной attention matrix в HBM?

**Ответ**

FlashAttention — IO-aware (учитывающий стоимость перемещения данных) точный алгоритм attention. Он вычисляет attention блоками, не материализуя целиком матрицу N×N scores в HBM. Tiles Q, K, V загружаются в быструю on-chip память, softmax обновляется по блокам с численно устойчивой нормализацией, а промежуточные результаты переиспользуются. Асимптотическое число арифметических операций exact attention остаётся квадратичным по sequence length, но объём HBM reads/writes существенно уменьшается. Поэтому ускорение возникает за счёт памяти и better parallelism, а не из-за аппроксимации внимания.

## Вопрос 31. Является ли FlashAttention приближённым attention и меняет ли он математическую функцию модели?

## Вопрос 31.1. Меняет ли FlashAttention качество модели за счёт approximate attention?

## Вопрос 31.2. FlashAttention — это новый тип attention или другая реализация того же exact computation?

**Ответ**

Нет: базовый FlashAttention реализует exact attention (точное внимание) с тем же математическим результатом в пределах обычных различий floating-point округления. Он меняет порядок вычислений и движение данных, используя tiling и online softmax, но не заменяет full attention sparse- или low-rank-приближением. Это важное отличие от методов, которые сокращают число attended tokens. На практике небольшие численные расхождения возможны из-за другого порядка reductions и precision, поэтому bitwise equality ожидать нельзя. Но семантически это оптимизированная реализация той же attention-функции.

## Вопрос 32. Чем FlashAttention отличается от PagedAttention?

## Вопрос 32.1. Почему PagedAttention не является заменой FlashAttention?

## Вопрос 32.2. Какие разные bottleneck решают FlashAttention и paged KV cache?

**Ответ**

FlashAttention оптимизирует вычисление attention внутри kernel: прежде всего уменьшает HBM traffic через tiling и on-chip reuse. PagedAttention (страничное внимание) решает другую проблему — управление KV cache для множества переменной длины запросов: cache делится на blocks/pages, которые могут физически лежать несмежно и адресуются через block table. Эти техники совместимы и часто используются вместе. Первая отвечает на вопрос «как быстро вычислить attention», вторая — «как эффективно разместить и переиспользовать KV state». Смешивать их как взаимозаменяемые алгоритмы некорректно.

## Вопрос 33. Зачем PagedAttention разбивает KV cache на фиксированные блоки вместо одного непрерывного буфера на запрос?

## Вопрос 33.1. Как paged KV cache уменьшает memory fragmentation при variable-length generation?

## Вопрос 33.2. Почему block table удобнее заранее выделенного contiguous KV buffer?

**Ответ**

При непрерывном выделении памяти сервер должен заранее резервировать место под неизвестную будущую длину генерации либо переносить/перевыделять буферы. Это создаёт internal/external fragmentation и мешает высокой concurrency. PagedAttention (страничное управление attention cache) хранит KV в небольших фиксированных blocks и выдаёт новые blocks по мере роста sequence. Логическая последовательность отображается на физические blocks через таблицу, подобно virtual memory. В результате память выделяется ближе к фактически использованному объёму, blocks проще переиспользовать, а разные requests могут безопасно разделять одинаковый prefix cache.

## Вопрос 34. Что такое memory fragmentation в контексте KV cache?

## Вопрос 34.1. Почему переменная длина ответов создаёт фрагментацию KV memory?

## Вопрос 34.2. Какие виды fragmentation возникают при размещении cache для генеративных запросов?

**Ответ**

Memory fragmentation (фрагментация памяти) означает, что часть доступной памяти нельзя эффективно использовать из-за способа её разбиения. Internal fragmentation возникает, когда выделенный блок больше реально нужного; external — когда свободное место разбросано между allocations и не образует нужного contiguous region. В LLM serving неизвестная output length делает эту проблему особенно заметной. Paged KV allocation ограничивает потери в основном незаполненным хвостом последней страницы и позволяет переиспользовать blocks без непрерывного размещения. Это повышает число sequences, которое помещается в одну и ту же VRAM.

## Вопрос 35. Как размер страницы или блока KV cache влияет на эффективность serving?

## Вопрос 35.1. Почему нельзя считать, что чем меньше KV page size, тем всегда лучше?

## Вопрос 35.2. Какие компромиссы появляются при выборе размера PagedAttention block?

**Ответ**

Меньший KV block (блок кэша ключей/значений) снижает internal fragmentation на хвостах sequences и делает eviction/reuse более гранулярными. Но он увеличивает размер block tables, количество metadata operations и потенциально усложняет kernel address translation. Крупный block уменьшает metadata overhead и может лучше подходить некоторым kernels, но тратит больше памяти на неполные blocks и снижает точность prefix matching. Поэтому page size — trade-off между memory efficiency, lookup/scheduling overhead и kernel implementation. Оптимальное значение зависит от model architecture, average sequence length и runtime.

## Вопрос 36. Что такое prefix caching и в каких запросах он даёт выигрыш?

## Вопрос 36.1. Как повторное использование system prompt сокращает prefill?

## Вопрос 36.2. Когда automatic prefix cache реально уменьшает time-to-first-token?

**Ответ**

Prefix caching (кэширование общего префикса) сохраняет KV state уже обработанного начала prompt и повторно использует его, если новый запрос имеет тот же token prefix. Это уменьшает объём нового prefill и TTFT. Типичные случаи: длинный system prompt, few-shot examples, общий документ, multi-turn conversation и параллельные samples одного prompt. Cache hit требует идентичности токенов и совместимости model state; даже небольшое изменение раннего token ломает последующий prefix match. Выигрыш зависит от длины повторяемой части, hit rate и стоимости поиска/хранения кэша.

## Вопрос 37. Почему prefix cache hit rate сам по себе недостаточен для оценки пользы кэша?

## Вопрос 37.1. Почему 90% prefix-cache hits не обязательно означает большой performance gain?

## Вопрос 37.2. Какая метрика лучше количества cache hits показывает реальную экономию prefill?

**Ответ**

Hit rate (доля попаданий в кэш) нужно измерять не только по requests, но и по tokens. Десять попаданий по короткому prefix могут экономить меньше вычислений, чем одно попадание по 50 тысячам токенов. Также важны TTFT reduction, bytes occupied, eviction pressure и стоимость восстановления cache из CPU/SSD при hierarchical caching. Высокий hit rate может быть бесполезным, если cached blocks вытесняют более ценные длинные prefixes. Поэтому production policy оценивает saved prefill tokens и saved compute per byte, а не только число cache hits.

## Вопрос 38. Что такое continuous batching и почему он повышает utilization LLM server?

## Вопрос 38.1. Как iteration-level scheduling позволяет добавлять новые запросы в уже работающий LLM batch?

## Вопрос 38.2. Почему continuous batching эффективнее ожидания завершения всего static batch?

**Ответ**

Continuous batching (непрерывное динамическое пакетирование) пересобирает рабочий batch между генерационными итерациями. Когда одна sequence заканчивается, её место может занять новый запрос, не дожидаясь завершения остальных длинных ответов. Это устраняет проблему static batch, где GPU постепенно обслуживает всё меньше активных sequences. Scheduler учитывает доступный KV cache, token budget и приоритеты, формируя batch на очередной step. Результат — выше aggregate throughput и лучше utilization, но при агрессивном batching может ухудшиться per-request latency, поэтому scheduler должен учитывать SLO.

## Вопрос 39. Чем dynamic batching обычного inference-сервера отличается от continuous batching autoregressive LLM?

## Вопрос 39.1. Почему классический micro-batching не решает полностью задачу LLM serving?

## Вопрос 39.2. В чём iteration-level batching отличается от накопления запросов перед одним inference call?

**Ответ**

Dynamic batching обычно означает короткое ожидание нескольких независимых запросов перед одним forward pass, после которого весь batch завершается. В autoregressive LLM один запрос требует десятки или тысячи sequential decode steps. Continuous batching (непрерывное пакетирование) управляет составом batch на уровне итераций: sequences входят и выходят во время генерации. Поэтому нужны KV state, per-sequence stopping, variable lengths и scheduler, понимающий token budget. Простого `max_batch_size` и batch timeout недостаточно: оптимизация должна учитывать длительность жизни каждого sequence и изменение memory pressure во времени.

## Вопрос 40. Какую роль выполняет scheduler в современном LLM serving runtime?

## Вопрос 40.1. Почему производительность LLM endpoint зависит не только от GPU kernels, но и от планировщика?

## Вопрос 40.2. Какие ресурсы и latency-цели должен учитывать scheduler генеративного сервера?

**Ответ**

Scheduler (планировщик) решает, какие requests и сколько их токенов попадут в следующий model step. Он балансирует очередь, доступный KV cache, max batched tokens, prefill и decode work, priorities, preemption и fairness. От него зависят TTFT, TPOT, throughput и starvation. Даже идеальные CUDA kernels не спасут систему, если scheduler вставляет огромные prefill так, что decode requests регулярно простаивают, либо заполняет cache запросами, которые вскоре будут preempted. Поэтому serving optimization — совместная задача kernels, memory manager и scheduler policy.

## Вопрос 41. Что такое chunked prefill и зачем делить длинный prompt на части?

## Вопрос 41.1. Как chunking длинного prompt помогает не останавливать уже идущую генерацию?

## Вопрос 41.2. Почему prefill chunk size влияет одновременно на TTFT, TPOT и throughput?

**Ответ**

Chunked prefill (предварительная обработка prompt частями) разбивает длинный prefill на несколько token chunks вместо одного огромного model step. Это позволяет scheduler смешивать небольшие части prefill с decode requests и уменьшать длинные stalls в inter-token latency. Дополнительно ограничивается пик workspace и число tokens per iteration. Цена — больше scheduling/kernels overhead и иногда меньшая эффективность GEMM, если chunks слишком малы. Поэтому chunk size настраивают по workload: слишком крупный ухудшает tail ITL, слишком мелкий теряет prefill throughput.

## Вопрос 42. Как streaming меняет восприятие latency пользователем, если полное время генерации не изменилось?

## Вопрос 42.1. Почему streaming может улучшить UX без изменения total generation time?

## Вопрос 42.2. Как отличить медленный decode от буферизации токенов в сети или reverse proxy?

**Ответ**

Streaming (потоковая выдача) отправляет токены или небольшие chunks клиенту сразу после генерации, поэтому пользователь начинает читать ответ после TTFT, а не после полного end-to-end latency. Это не обязательно ускоряет модель, но существенно улучшает perceived latency. Реализация должна избегать buffering в proxy, HTTP stack и client library: иначе токены генерируются быстро, но приходят пачками. Также следует отделять server-side ITL от network delivery jitter. Для structured outputs или tool calls иногда полезнее буферизовать часть результата ради валидности, поэтому streaming policy зависит от продукта.

## Вопрос 43. Почему CPU может стать bottleneck LLM server, хотя основная модель работает на GPU?

## Вопрос 43.1. Какие host-side операции способны ограничить скорость GPU LLM inference?

## Вопрос 43.2. Почему быстрый accelerator может простаивать из-за scheduler или tokenization на CPU?

**Ответ**

CPU выполняет tokenization, HTTP handling, scheduling, prefix matching, memory bookkeeping, sampling orchestration и kernel launches. При быстрых GPU и небольших decode batches эти операции могут занимать значимую долю iteration time, оставляя gaps между kernels. Симптомы — GPU utilization «пилообразный», низкая achieved bandwidth/FLOPS и рост throughput после увеличения CPU resources или включения CUDA Graphs. Решения включают асинхронный frontend, parallel tokenization, оптимизированный scheduler, fused sampling и overlap CPU work с GPU execution. Поэтому «GPU не загружен» не всегда означает нехватку запросов.

## Вопрос 44. Почему первый запрос после запуска LLM сервера часто медленнее последующих?

## Вопрос 44.1. Какие операции делают cold inference заметно медленнее steady state?

## Вопрос 44.2. Почему LLM benchmark должен отдельно измерять warmup и обычный режим?

**Ответ**

Cold start (холодный запуск) включает загрузку checkpoint, выделение памяти, создание communication groups, JIT compilation, autotuning kernels, CUDA Graph capture и прогрев caches. Даже после readiness endpoint первый shape может вызвать дополнительную компиляцию. Поэтому benchmark без warmup переоценивает steady-state latency, а benchmark только после долгого warmup скрывает startup SLO. Эти режимы измеряют отдельно: time-to-ready, cold-request latency и steady-state performance. В autoscaling холодный старт особенно важен, поскольку новая replica может появляться уже во время traffic spike.

## Вопрос 45. Какие ограничения динамических shapes возникают при использовании CUDA Graphs в LLM serving?

## Вопрос 45.1. Почему нельзя захватить один CUDA Graph и эффективно использовать его для любого LLM batch?

## Вопрос 45.2. Как serving runtime совмещает CUDA Graphs с variable-size continuous batching?

**Ответ**

CUDA Graph (записанный граф GPU-операций) лучше всего воспроизводит неизменную структуру launches и адресов памяти. Но LLM batch постоянно меняет число sequences, token counts и иногда attention metadata. Runtimes решают это capture нескольких заранее выбранных batch sizes, padding до ближайшего размера или hybrid eager/graph execution. Слишком много captured shapes увеличивает startup time и memory overhead; слишком мало — лишний padding или частые fallbacks. Поэтому graph coverage нужно измерять на реальном распределении workload, а не предполагать, что включение флага автоматически ускорит все запросы.

## Вопрос 46. Какие накладные расходы могут возникать вокруг самой модели в OpenAI-compatible inference endpoint?

## Вопрос 46.1. Почему latency через HTTP endpoint может быть заметно выше чистого model execution?

## Вопрос 46.2. Какие стадии вне GPU нужно учитывать в end-to-end LLM latency?

**Ответ**

Даже если model engine быстр, end-to-end request проходит JSON parsing, authentication, rate limiting, chat-template rendering, tokenization, queueing, streaming serialization, proxy и network stack. Для коротких outputs эти расходы могут быть сопоставимы с GPU time. Поэтому benchmark через локальный engine API и benchmark через production gateway отвечают на разные вопросы. Полезно трассировать timestamps: ingress → tokenized → scheduled → first GPU step → first token → first byte sent → completion. Это отделяет model latency от platform overhead и предотвращает оптимизацию неправильного слоя.

## Вопрос 47. Как LoRA adapter влияет на inference и почему «маленький adapter» не означает нулевую стоимость?

## Вопрос 47.1. Почему multi-LoRA serving сложнее обычного запуска одной модели?

## Вопрос 47.2. Откуда берётся inference overhead при применении low-rank adapter к общей базовой модели?

**Ответ**

LoRA (лоу-ра; Low-Rank Adaptation — низкоранговая адаптация) добавляет к базовым линейным слоям низкоранговое обновление весов. Хранить adapter значительно дешевле полного checkpoint, поэтому один base model может обслуживать много fine-tunes. Но во время inference нужно выполнить дополнительные low-rank матричные операции или использовать fused kernels. При multi-LoRA batching разные requests могут требовать разные adapters, усложняя batching, cache locality и weight management. Стоимость зависит от rank, числа адаптированных слоёв, kernel support и количества одновременно активных adapters, а не только от размера файла.

## Вопрос 48. Что такое quantization модели и какие ресурсы она пытается сэкономить?

## Вопрос 48.1. Почему low-bit checkpoint может занимать меньше VRAM, но не ускорять генерацию?

## Вопрос 48.2. Какие два основных performance-ресурса экономит quantization LLM?

**Ответ**

Quantization (квантование) представляет веса и/или activations меньшим числом бит, например INT8, FP8 или 4-bit formats, вместо FP16/BF16. Главные цели — уменьшить model memory, снизить memory bandwidth и, при наличии нативных hardware kernels, увеличить compute throughput. Но «в четыре раза меньше бит» не гарантирует «в четыре раза быстрее»: нужны dequantization, подходящие Tensor Core instructions, правильные shapes и достаточно крупный workload. Кроме скорости обязательно проверяют quality regression, поскольку чувствительность слоёв, outliers и calibration data различаются.

## Вопрос 49. Чем weight-only quantization отличается от quantization весов и activations?

## Вопрос 49.1. Почему W4A16 и W8A8 решают разные проблемы inference?

## Вопрос 49.2. Когда выгоднее квантовать только weights, а когда также activations?

**Ответ**

Weight-only quantization (квантование только весов) хранит веса, например, в 4 битах, но activations и часто accumulation оставляет в FP16/BF16. Она особенно полезна для memory-bound decode, потому что снижает объём чтения весов; перед GEMM данные распаковываются или kernel использует mixed-precision путь. W8A8 (8-битные веса и 8-битные activations) может дополнительно ускорить compute при нативной поддержке, но требует контролировать activation outliers и calibration. Выбор зависит от hardware: формат без эффективного kernel может экономить память и одновременно ухудшать latency.

## Вопрос 50. Как проверить, что inference optimization не испортила качество модели?

## Вопрос 50.1. Как доказать, что ускоренная или квантованная версия модели сохраняет исходное качество?

## Вопрос 50.2. Какие условия нужно зафиксировать при A/B проверке baseline и optimized inference?

**Ответ**

Нельзя принимать ускорение только по latency benchmark. Нужен quality gate (контроль качества) на representative evaluation set: task accuracy, exact match/pass rate для детерминированных задач, model-based или human evaluation для открытых ответов, а также regression cases. Сравнивают baseline и optimized engine при одинаковых tokenizer, chat template, sampling parameters и stop rules. Для quantization дополнительно проверяют длинный контекст, редкие языки, код и reasoning, где ошибки могут проявляться сильнее. Различия следует отделять от обычной stochastic variance, используя фиксированные seeds или статистическую оценку.

## Вопрос 51. Как обычно устроен tensor layout KV cache и какие размеры в нём определяют memory footprint?

## Вопрос 51.1. Какие оси содержит key-value cache и почему порядок этих осей важен для GPU kernel?

## Вопрос 51.2. От чего зависит физическая организация KV tensor в inference runtime?

**Ответ**

KV cache (кей-ви кэш; Key-Value cache — кэш ключей и значений attention) логически хранит K и V для каждого layer, sequence, KV head, token position и head dimension. Конкретный physical layout зависит от kernel: измерения могут быть переставлены ради coalesced memory access (объединённых обращений к памяти), vectorized loads и удобного paging. Для capacity важны `num_layers`, `num_kv_heads`, `head_dim`, число cached tokens и bytes per element. Для performance важен не только общий размер, но и stride: неудачный layout заставляет warp читать разрозненные адреса. Поэтому смена attention backend может менять layout и требовать переразмещения cache даже при той же математике.

## Вопрос 52. Как число KV heads в GQA влияет на размер cache и decode bandwidth?

## Вопрос 52.1. Почему уменьшение количества key/value heads сокращает память почти линейно, но не даёт такого же линейного speedup?

## Вопрос 52.2. Как GQA меняет bandwidth cost одного decode step?

**Ответ**

GQA (джи-кью-эй; Grouped-Query Attention — сгруппированное query-внимание) уменьшает число KV heads относительно query heads. Если MHA имеет Hq=Hkv, а GQA — Hkv<Hq, то объём KV cache и чтение K/V на decode сокращаются примерно пропорционально Hkv, при неизменных layers, head_dim, context и precision. Например, переход с 32 KV heads на 8 уменьшает K/V storage примерно в четыре раза. Однако ускорение end-to-end не обязано быть четырёхкратным: остаются чтение model weights, Q/O projections, MLP, synchronization и kernel overhead. Реальный выигрыш выше в режимах, где attention/KV bandwidth является доминирующим bottleneck.

## Вопрос 53. Как sliding-window attention ограничивает рост KV cache и какие знания модель при этом теряет?

## Вопрос 53.1. Когда KV cache можно безопасно держать фиксированного размера при растущем контексте?

## Вопрос 53.2. Что даёт local sliding window и какой ценой ограничивает дальние зависимости?

**Ответ**

Sliding-window attention (внимание со скользящим окном) разрешает токену обращаться только к последним W позициям, поэтому старые K/V для соответствующих layers можно не хранить после выхода из окна. Это ограничивает KV memory примерно O(W), а не O(T) для бесконечно растущего диалога. Но модель теряет прямой доступ к удалённым токенам в этих слоях. Некоторые architectures чередуют local и global layers, сохраняя дальние зависимости периодически. Serving runtime должен учитывать фактическую attention pattern: просто обрезать cache у full-attention модели нельзя — это изменит функцию модели и качество.

## Вопрос 54. Как сочетание local и global attention layers влияет на inference long-context модели?

## Вопрос 54.1. Почему hybrid local/global attention требует разных правил хранения KV для разных слоёв?

## Вопрос 54.2. Как чередование sliding-window и full-attention layers меняет memory planning?

**Ответ**

Local attention (локальное внимание) ограничивает receptive field отдельного слоя окном, уменьшая attention compute и cache requirement, а global attention (глобальное внимание) сохраняет доступ ко всему контексту. В hybrid architecture часть layers может быть local, часть full/global. Тогда KV manager не должен применять одинаковую retention policy ко всем слоям: local cache можно циклически переиспользовать, global продолжает расти. Производительность определяется долей каждого типа и kernel support. При capacity planning ошибочно умножать full-context KV formula на все layers, если architecture использует windows; столь же опасно предполагать, что весь cache bounded.

## Вопрос 55. Что такое MLA и почему он меняет структуру KV cache по сравнению с MHA/GQA?

## Вопрос 55.1. Почему DeepSeek-подобный Multi-head Latent Attention требует другого inference kernel, чем обычный GQA?

## Вопрос 55.2. Как latent compression в MLA уменьшает KV storage?

**Ответ**

MLA (эм-эл-эй; Multi-head Latent Attention — многоголовое латентное внимание) сжимает информацию, необходимую для K/V, в более компактное latent representation и реконструирует нужные компоненты внутри attention computation. Цель — существенно уменьшить KV cache и memory bandwidth по сравнению с хранением полных K/V heads. Но serving kernel становится архитектурно специфичным: появляются дополнительные projections, RoPE-компоненты и особые layout/fusion решения. Поэтому runtime, хорошо оптимизированный под обычный GQA, не обязательно эффективен для MLA. При выборе engine нужно проверять нативный MLA backend и benchmark именно нужной модели, а не переносить результаты Llama.

## Вопрос 56. Как RoPE применяется к query и key во время inference?

## Вопрос 56.1. Где именно в attention pipeline применяется rotary positional embedding?

## Вопрос 56.2. Почему неправильный position id в cached decoding может сломать ответ без runtime error?

**Ответ**

RoPE (роуп; Rotary Position Embedding — вращательное позиционное кодирование) поворачивает пары координат Q и K на угол, зависящий от token position и частоты. Благодаря свойствам rotation внутреннее произведение Qᵢ·Kⱼ содержит информацию об относительном смещении i−j. На prefill позиции известны для всех prompt tokens; на decode runtime применяет rotation только к новому Q/K с текущим position id. Оптимизированные kernels часто fuse RoPE с Q/K projection или attention preparation, чтобы не создавать лишние тензоры. Ошибка в position ids при cache reuse приводит к тихому quality corruption, хотя shapes и execution остаются корректными.

## Вопрос 57. Что делает RoPE scaling и почему увеличение `max_model_len` само по себе не создаёт качественный long context?

## Вопрос 57.1. Почему поднять лимит контекста в конфиге недостаточно для реальной поддержки 128K?

## Вопрос 57.2. Как RoPE scaling связан с extrapolation за training context?

**Ответ**

RoPE scaling (масштабирование rotary position encoding) изменяет отображение позиций/частот, чтобы модель могла работать на длинах выше исходного training context. Методы linear, dynamic, YaRN и их варианты используют разные transformations. Просто увеличить runtime limit означает лишь разрешить больше токенов и выделить под них cache; модель может плохо экстраполировать позиции, которых не видела. Даже корректный scaling не гарантирует long-context quality без validation на retrieval, reasoning и position-sensitive задачах. Кроме качества растут prefill compute и KV memory, поэтому «128K supported» должно означать одновременно архитектурную, runtime- и quality-поддержку.

## Вопрос 58. Как causal mask работает в prefill и почему на decode его вычислительная форма проще?

## Вопрос 58.1. Почему causal mask нужен математически, но его не следует хранить как полную T×T матрицу?

## Вопрос 58.2. Чем causal masking одного decode token отличается от prefill batch?

**Ответ**

Causal mask (каузальная маска) запрещает позиции i смотреть на будущие j>i. При prefill query содержит много токенов, поэтому attention kernel должен учитывать треугольную структуру внутри T×T score space. При decode одного нового токена весь сохранённый prefix находится в прошлом, поэтому этот query может attend ко всем cached positions; явная большая triangular mask не нужна. Optimized kernels передают causal flag и sequence boundaries как metadata вместо materialized boolean matrix. Материализация T×T mask в GPU memory была бы лишней тратой памяти и bandwidth, особенно на длинном контексте.

## Вопрос 59. Как ragged batching обрабатывает запросы разной длины без огромного padding overhead?

## Вопрос 59.1. Как varlen attention позволяет batch-ить 100, 1000 и 10000-токенные prompts без padding до 10000?

## Вопрос 59.2. Почему variable-length batch требует cumulative sequence offsets?

**Ответ**

Ragged batching (пакетирование последовательностей разной длины без выравнивания до общего максимума) хранит токены компактно, обычно concatenated, а границы sequences задаёт cumulative-length metadata. Attention backend использует эти offsets, чтобы не смешивать разные запросы. Это избегает вычислений на padding до `max_seq_len` каждого batch. Для prefill экономия особенно велика при широком распределении prompt lengths. Цена — более сложные kernels, indexing и scheduler metadata. Если backend вынужден перейти к dense padded representation, случайный один очень длинный prompt способен резко увеличить compute всего batch и испортить tail latency.

## Вопрос 60. Как block table связывает логические позиции sequence с физическими страницами paged KV cache?

## Вопрос 60.1. Как PagedAttention находит физический адрес K/V, если последовательность хранится несмежно?

## Вопрос 60.2. Какую роль играет page table при paged KV allocation?

**Ответ**

Block table (таблица отображения KV-блоков) хранит для каждой logical block position идентификатор physical page в общем memory pool. Чтобы получить K/V токена, attention kernel вычисляет logical block index и offset внутри блока, затем через table находит физический адрес. Это добавляет indirect addressing (косвенную адресацию), но позволяет sequence расти без contiguous allocation, переиспользовать blocks и делиться prefixes. Эффективная реализация держит metadata компактной и организует accesses так, чтобы lookup overhead был мал относительно attention memory traffic. Слишком мелкие pages увеличивают table и число indirections.

## Вопрос 61. Как automatic prefix caching определяет, что KV block можно повторно использовать?

## Вопрос 61.1. Почему для prefix-cache key недостаточно хэшировать только токены одного блока?

## Вопрос 61.2. Как runtime понимает, что найденный KV block соответствует именно тому же полному префиксу?

**Ответ**

Automatic prefix caching (автоматическое кэширование префикса) обычно идентифицирует block по token content и предшествующему prefix state: например, через hash предыдущего block hash вместе с токенами текущего блока и дополнительными model-specific attributes. Это делает identity зависимой от всей цепочки, а не только от локальных 16 токенов. Новый prompt разбивается на blocks, для которых runtime ищет уже вычисленные entries; совпавшие full blocks reuse-ятся, оставшийся suffix вычисляется. Важно включать факторы, меняющие hidden state: model/adapters, multimodal inputs, cache salt или другие runtime-specific keys.

## Вопрос 62. Какие риски создают hash collisions и cross-tenant prefix caching?

## Вопрос 62.1. Почему общий prefix cache между клиентами может стать timing side channel?

## Вопрос 62.2. Какие меры изоляции нужны, если cached prompts принадлежат разным tenants?

**Ответ**

Hash collision (коллизия хэша) теоретически может заставить cache manager принять разные prefixes за одинаковые, поэтому production implementations используют достаточно сильные hashes и при необходимости дополнительные checks. Более практический риск — side channel (побочный канал): shared prefix cache между tenants может раскрывать факт наличия одинакового prompt через различия TTFT или cache-hit behavior. Для чувствительных multi-tenant систем применяют tenant-scoped cache, cache salt, isolation pools или отключают reuse через trust boundary. Это уменьшает hit rate, но security boundary важнее максимального throughput. Cache design должен быть частью threat model, а не только performance optimization.

## Вопрос 63. Как copy-on-write помогает разделять KV prefix между несколькими генерациями?

## Вопрос 63.1. Как несколько samples одного prompt могут делить KV memory до точки ветвления?

## Вопрос 63.2. Зачем copy-on-write нужен при branching generation?

**Ответ**

Copy-on-write (копирование при записи) позволяет нескольким sequences ссылаться на одни и те же immutable KV blocks общего prefix. Пока токены совпадают, physical pages имеют несколько references и не дублируются. Когда ветвь должна модифицировать неполный последний block или продолжить собственным suffix, runtime выделяет отдельный block и копирует только необходимую часть. Это особенно полезно для parallel sampling, beam search и tree search: общий prompt может быть очень длинным, а ветвей много. Без sharing memory cost рос бы почти линейно с числом branches уже с первого prompt token.

## Вопрос 64. Как LRU eviction работает для prefix cache и когда простой LRU недостаточен?

## Вопрос 64.1. Почему обычный LRU может выбрасывать очень дорогой для повторного prefill префикс?

## Вопрос 64.2. Какие ограничения имеет recency-only eviction для KV cache?

**Ответ**

LRU (эл-ар-ю; Least Recently Used — вытеснение наименее недавно использованного) удаляет cached blocks, к которым дольше всего не обращались, когда нужен свободный KV page. Для radix/prefix cache обычно можно безопасно evict только blocks, не используемые active requests; tree structure требует корректно удалять leaves/descendants. LRU прост и адаптируется к temporal locality, но не учитывает стоимость пересчёта: 2K-token system prompt и 64K document prefix с одинаковым recency имеют разную ценность. Production policy может учитывать size, recompute cost, priority, tenant quota и expected reuse.

## Вопрос 65. Что даёт priority-aware eviction KV cache и какие данные нужны для его настройки?

## Вопрос 65.1. Когда имеет смысл вытеснять KV не только по LRU, но и по business/recompute priority?

## Вопрос 65.2. Как неправильные cache priorities могут снизить общий hit rate?

**Ответ**

Priority-aware eviction (вытеснение с учётом приоритета) присваивает cached blocks разную ценность и сначала удаляет менее важные. Приоритет можно связать с системными prompts, SLA-классом tenant, стоимостью recompute или ожидаемым повторным использованием. Полезно также учитывать duration/TTL (время жизни) и recency. Риск — cache pollution: постоянно высокий priority у больших редких prefixes вытеснит горячие данные и снизит hit rate. Поэтому policy проверяют trace replay или A/B benchmark на реальном traffic. Метрики: cached-token hit ratio, saved prefill tokens, eviction rate, TTFT и occupancy по классам.

## Вопрос 66. Как hierarchical KV cache расширяет prefix caching за пределы GPU memory?

## Вопрос 66.1. Когда лучше загрузить старый KV cache из CPU/SSD, а когда пересчитать prefix?

## Вопрос 66.2. Как многоуровневое хранение KV превращает cache reuse в задачу storage hierarchy?

**Ответ**

Hierarchical KV cache (иерархический кэш ключей/значений) использует несколько tiers: GPU HBM как самый быстрый, CPU DRAM как более ёмкий, а иногда NVMe/remote storage как ещё более дешёвый. При попадании во внешний tier prefill compute можно избежать, но cache blocks нужно передать обратно на GPU. Польза определяется сравнением transfer time с recomputation time. Для длинного дорогого prefix через быстрый interconnect восстановление выгодно; для короткого — пересчитать быстрее. Нужны async prefetch, eviction между уровнями и admission policy, иначе I/O легко станет новым bottleneck и ухудшит TTFT.

## Вопрос 67. Какие trade-offs возникают при offload KV cache из GPU в CPU memory?

## Вопрос 67.1. Почему хранить весь active KV cache в RAM обычно плохая идея для low-latency decode?

## Вопрос 67.2. Для каких частей conversation cache CPU offload наиболее оправдан?

**Ответ**

KV offload (выгрузка кэша ключей/значений) освобождает дорогую VRAM и позволяет поддержать больше sessions или длиннее context, но перенос по PCIe/NVLink добавляет bandwidth и latency cost. Если decode постоянно читает offloaded K/V, transfer может полностью уничтожить выигрыш; чаще offload полезен для inactive sessions или reusable prefixes между turns. Требуется понять reuse interval и объём данных. Хорошая система prefetch-ит cache до следующего GPU step и не блокирует critical path. Capacity растёт, но SLO становится зависимым от host memory bandwidth, interconnect contention и NUMA placement.

## Вопрос 68. Как quantization KV cache отличается от quantization model weights?

## Вопрос 68.1. Почему FP8/INT8 KV cache нужно оценивать отдельно от low-bit model checkpoint?

## Вопрос 68.2. Какие особенности делают quantization динамического K/V state отдельной задачей?

**Ответ**

KV cache quantization (квантование кэша ключей/значений) сжимает динамические activations, создаваемые отдельно для каждого request, тогда как weight quantization применяется к статическим параметрам model. Для KV особенно важны scaling granularity и outliers, потому что quantization error накапливается в attention context и может влиять на длинную генерацию. Зато экономия растёт вместе с context и concurrency. Формат должен поддерживаться attention kernel нативно: если каждый step требует дорогой dequantize в отдельный buffer, memory savings могут не превратиться в speedup. Quality тестируют именно на long-context workloads.

## Вопрос 69. Когда FP8 KV cache может повысить throughput, а когда даст только экономию памяти?

## Вопрос 69.1. Почему уменьшение KV cache с 16 до 8 бит не всегда вдвое ускоряет decode?

## Вопрос 69.2. Какие условия нужны, чтобы quantized KV дал именно speedup, а не только больше capacity?

**Ответ**

FP8 KV cache (8-битный floating-point кэш K/V) примерно вдвое уменьшает storage против FP16/BF16 и снижает bytes read attention decode. Если workload KV-bandwidth-bound и GPU/backend имеют fused FP8 cache path, это может поднять throughput и увеличить maximum batch. Если bottleneck — model weights, GEMM compute, network collectives или scheduler, ускорение будет меньше, хотя capacity всё равно вырастет. Дополнительные scaling/dequantization операции также имеют цену. Поэтому измеряют три результата отдельно: max concurrency before OOM, decode TPOT при фиксированной concurrency и quality regression на длинных контекстах.

## Вопрос 70. В чём идея eviction-based KV cache compression и почему она может менять качество?

## Вопрос 70.1. Почему удаление «неважных» KV positions принципиально отличается от PagedAttention?

## Вопрос 70.2. Как heavy-hitter cache eviction уменьшает память и где возникает риск потери информации?

**Ответ**

Eviction-based compression (сжатие KV cache через удаление позиций) хранит не все прошлые tokens, а выбирает subset, например recent tokens плюс позиции с высокой исторической attention importance. H2O (эйч-ту-оу; Heavy-Hitter Oracle — метод удержания «тяжёлых» attention-позиций) — пример такой идеи. В отличие от lossless paging, удаление K/V меняет доступный context модели и поэтому является approximation. Оно может сильно экономить memory, но ошибка выбора важного token необратима для последующих steps. Требуются task-specific long-context evaluation и comparison с sliding-window/quantization, которые имеют другие trade-offs.

## Вопрос 71. Что должно инвалидировать prefix cache, кроме изменения текста prompt?

## Вопрос 71.1. Почему одинаковые token IDs не всегда означают, что cached KV можно использовать после deployment change?

## Вопрос 71.2. Какие model-state параметры должны входить в namespace prefix cache?

**Ответ**

Prefix cache (кэш префикса) корректен только если одинаковые tokens приводят к тому же model state. Его identity должна учитывать checkpoint/revision, tokenizer и chat-template semantics, LoRA/prompt adapter, positional configuration, multimodal embeddings и некоторые decoding-independent model inputs. При model rollout старые KV нельзя автоматически reuse-ить новой версией, даже если token IDs совпали. Аналогично adapter-specific state не должен пересекаться. Надёжная схема version-ит namespace cache и включает relevant fingerprints в key. Ошибка здесь опаснее обычного miss: false hit возвращает вычислительно правдоподобный, но семантически повреждённый ответ.

## Вопрос 72. Как chat template влияет на prefix-cache reuse в multi-turn приложении?

## Вопрос 72.1. Почему два почти одинаковых массива chat messages могут не иметь общего cacheable prefix?

## Вопрос 72.2. Как расположение динамических полей в prompt template влияет на KV reuse?

**Ответ**

Chat template (шаблон преобразования сообщений в token sequence) определяет точные role markers, separators, tool blocks и assistant prefix. Prefix caching работает по tokens, а не по абстрактным объектам `messages`. Если приложение каждый turn вставляет динамический timestamp, request ID или переставляет system metadata в начале, общий prefix ломается и cache hit rate падает. Для multi-turn workload полезно держать стабильные части в начале, а изменяемые — ближе к suffix, если это допустимо для качества и semantics. Перед оптимизацией сравнивают rendered token streams, а не только JSON requests.

## Вопрос 73. Как организовать KV reuse между последовательными turns одного диалога?

## Вопрос 73.1. Как ускорить второй и последующие turns чата без повторного prefill всей истории?

## Вопрос 73.2. Почему session-aware routing может улучшить TTFT, но создать load imbalance?

**Ответ**

В multi-turn chat новый request обычно содержит весь conversation history плюс новое сообщение. Если предыдущий prefix cache сохранён, runtime может reuse-ить K/V старой истории и выполнить prefill только для новых tokens. Для этого routing должен по возможности направить session на replica, где cache ещё resident, либо использовать external/hierarchical cache. Нужно учитывать eviction и versioning: session affinity не должна превращаться в жёсткую привязку, создающую hotspot. Хороший load balancer балансирует cache locality и queue length. Метрики — reused tokens per turn, TTFT, imbalance между replicas и доля misses после routing.

## Вопрос 74. Как KV cache можно разделять между beams в beam search?

## Вопрос 74.1. Как PagedAttention уменьшает memory overhead beam search?

## Вопрос 74.2. Почему общий prompt у нескольких beams не нужно хранить в KV несколько раз?

**Ответ**

Beam search (лучевой поиск) поддерживает несколько наиболее перспективных sequence branches. До момента расхождения beams имеют общий prefix, поэтому paged cache с reference counting и copy-on-write может физически разделять одинаковые KV blocks. После выбора разных next tokens каждая ветвь получает собственный suffix. При pruning освободившиеся blocks возвращаются в pool. Без sharing память росла бы как `beam_width × full_prefix_cache`, что особенно дорого для длинных prompts. Однако сам beam search остаётся вычислительно тяжёлым: каждый step оценивает больше candidate sequences и увеличивает batching/sampling work.

## Вопрос 75. Почему parallel sampling нескольких ответов на один prompt может быть дешевле, чем столько же независимых запросов?

## Вопрос 75.1. Какая часть вычислений `n` completions может быть общей для всех samples?

## Вопрос 75.2. Почему несколько outputs одного длинного prompt экономят prefill, но не весь decode?

**Ответ**

Parallel sampling (параллельная генерация нескольких continuations) может один раз выполнить prefill общего prompt и разделить его KV blocks между N branches. Каждая ветвь хранит только собственный generated suffix, поэтому memory и prefill compute существенно ниже, чем у N независимых requests. Runtime также может batch-ить decode branches вместе. Но total decode tokens всё равно примерно умножаются на N, поэтому стоимость не становится «почти одной генерацией». Дополнительные sampling states и longer tail также влияют на scheduler. Выигрыш максимален при длинном prompt и относительно коротких независимых outputs.

## Вопрос 76. Что ограничивает параметр `max_num_batched_tokens` и как его настройка меняет latency/throughput?

## Вопрос 76.1. Почему увеличение token budget итерации может одновременно поднять throughput и ухудшить streaming latency?

## Вопрос 76.2. Как подобрать максимальное число tokens per scheduler step?

**Ответ**

`max_num_batched_tokens` задаёт token budget (бюджет токенов) одного scheduler iteration: суммарно для новых prefill chunks и decode tokens. Больший budget позволяет строить крупнее GEMM и повышать prefill throughput, но один iteration длится дольше и может увеличить inter-token latency уже генерирующих requests. Малый budget делает steps короче и отзывчивее, но повышает scheduler/kernel-launch overhead и снижает arithmetic intensity. Настраивать его нужно вместе с chunked prefill, model size и SLO. Практический метод — sweep по реальному input/output distribution с фиксацией p95/p99 TTFT, TPOT, throughput и preemption count.

## Вопрос 77. Что ограничивает `max_num_seqs` и почему его нельзя настраивать независимо от KV memory?

## Вопрос 77.1. Почему максимальное число concurrent sequences зависит от длины контекста, а не только от VRAM модели?

## Вопрос 77.2. Как связаны concurrency limit и доступный пул KV blocks?

**Ответ**

`max_num_seqs` ограничивает число одновременно active sequences, но каждая sequence потребляет разный KV cache в зависимости от prompt и уже сгенерированной длины. Поэтому одинаковое значение может быть безопасным на коротком chat workload и приводить к постоянным preemptions на long-context workload. Слишком низкий предел недоиспользует GPU; слишком высокий создаёт cache pressure, scheduler overhead и tail latency. Настройку начинают с memory model, затем проверяют реальную distribution lengths. Для GQA, KV quantization и sliding-window моделей допустимая concurrency сильно отличается, даже если parameter count похож.

## Вопрос 78. Чем decode-first scheduling отличается от prefill-first и какой SLO каждый подход защищает?

## Вопрос 78.1. Как конфликтуют цели TTFT новых запросов и TPOT уже идущих генераций?

## Вопрос 78.2. Когда планировщику выгодно приоритизировать decode, а когда prefill?

**Ответ**

Decode-first scheduling (приоритет уже генерирующих запросов) старается регулярно обслуживать active sequences и тем самым защищает TPOT/ITL, но новые prompts дольше ждут prefill и TTFT растёт. Prefill-first быстрее запускает новые requests, однако длинный prefill может задержать decode всего текущего batch. Современные schedulers часто используют hybrid policy: token budget, chunked prefill и quotas между фазами. Выбор зависит от продукта: интерактивный streaming обычно чувствителен к tail ITL, а batch/API workload может терпеть более неровную генерацию ради throughput и admission rate.

## Вопрос 79. Почему LLM runtime иногда preempt-ит уже начатый request и что происходит после preemption?

## Вопрос 79.1. Что делает serving engine, когда KV cache не хватает уже выполняющемуся запросу?

## Вопрос 79.2. Почему preemption может приводить либо к recompute, либо к переносу KV state?

**Ответ**

Preemption (вытеснение выполняющегося запроса) возникает, когда scheduler не может разместить необходимый KV state или должен освободить ресурсы для более приоритетной работы. Runtime может удалить request из active batch и позже восстановить его. Две основные стратегии — recomputation (повторно выполнить prefill до текущей позиции) или swap/offload (сохранить KV вне GPU). Recompute тратит FLOPs, но не требует хранить большой cache в host memory; swap экономит вычисления, но зависит от interconnect. Частые preemptions — признак перегруженного token/cache budget и обычно резко ухудшают tail latency.

## Вопрос 80. Когда recompute после preemption выгоднее swap KV cache в CPU memory?

## Вопрос 80.1. Как решить, пересчитывать ли вытесненный prefix или сохранить его KV на host?

## Вопрос 80.2. Какая простая cost model помогает выбрать recomputation против swapping?

**Ответ**

Recompute (повторное вычисление состояния) выгоден, если префикс относительно короткий, GPU prefill быстрый, а CPU-GPU transfer медленный или host memory ограничена. Swap (выгрузка состояния) лучше для очень длинного дорого вычисленного prefix, если interconnect позволяет быстро вернуть KV и есть свободная DRAM. Сравнивают estimated recompute time с transfer time `KV_bytes / effective_bandwidth`, включая queueing и serialization overhead. Важно не оценивать только среднюю bandwidth PCIe: параллельные swaps могут конкурировать между собой. Лучший policy может динамически выбирать стратегию по request length и system load.

## Вопрос 81. Как starvation возникает в LLM scheduler и как его предотвращать?

## Вопрос 81.1. Как decode-first policy может заставить длинный prompt ждать бесконечно?

## Вопрос 81.2. Какие механизмы scheduler fairness предотвращают голодание низкоприоритетных запросов?

**Ответ**

Starvation (голодание) возникает, когда определённый request практически не получает GPU time из-за постоянного прихода более выгодных или высокоприоритетных requests. Например, длинный prefill может бесконечно откладываться decode-first scheduler, а low-priority tenant — priority queue. Защита включает aging (повышение приоритета со временем), per-class token quotas, maximum wait time и fair scheduling. Нужно различать fairness по requests и по compute: один 100K prompt не эквивалентен короткому запросу. Production SLO должен включать queue-time percentiles и rejection policy, иначе система формально «обслуживает» запрос, но фактически держит его в очереди неопределённо долго.

## Вопрос 82. Как проектировать fairness между tenants, если их requests имеют сильно разную стоимость?

## Вопрос 82.1. Почему rate limit по requests/min плохо обеспечивает справедливость LLM platform?

## Вопрос 82.2. Как учитывать разную стоимость длинных и коротких запросов при multi-tenant scheduling?

**Ответ**

Fairness (справедливое распределение ресурсов) лучше считать в resource units, а не только requests/s. Запросы отличаются input/output tokens, model variant, adapter, context и speculative overhead. Один tenant с длинными reasoning outputs может занять GPU намного сильнее. Практические policies используют token-based quotas, weighted fair queuing (взвешенное справедливое обслуживание), concurrency caps и burst credits. При этом input и output tokens могут иметь разные cost weights: prefill и decode нагружают hardware по-разному. Метрики должны показывать served tokens, GPU time estimate, queue delay и SLO violations по tenant, чтобы «равные запросы» не скрывали фактическую монополизацию capacity.

## Вопрос 83. Какие проблемы создаёт strict priority scheduling для high/low-priority запросов?

## Вопрос 83.1. Почему «всегда обслуживать premium запросы первыми» может сломать и fairness, и throughput?

## Вопрос 83.2. На каких стадиях LLM request priority должен применяться, чтобы SLA был последовательным?

**Ответ**

Strict priority (строгий приоритет) минимизирует latency high-priority класса, но при устойчивой высокой нагрузке способен полностью вытеснить low-priority traffic. Кроме starvation, он может увеличить fragmentation KV cache и снизить throughput, если scheduler часто preempt-ит длинные low-priority sequences. Более устойчивы weighted quotas, reserved capacity или priority с aging. Также нужно решить, что именно приоритетно: admission, prefill, decode или eviction. Если high-priority request получает мгновенный prefill, но его decode затем конкурирует на общих условиях, ожидаемый SLA не выполняется. Policy следует тестировать burst scenarios, а не только steady state.

## Вопрос 84. Зачем LLM service нужен admission control до помещения запроса в очередь?

## Вопрос 84.1. Почему при перегрузке иногда лучше отклонить новый LLM request, чем поставить его в бесконечную очередь?

## Вопрос 84.2. Как admission control защищает latency SLO inference-сервиса?

**Ответ**

Admission control (контроль допуска) решает, принимать ли новый request с учётом текущей нагрузки, memory, estimated service time и SLO. Без него очередь может расти быстрее capacity, после чего latency деградирует для всех и сервер продолжает принимать работу, которую заведомо не выполнит вовремя. Возможные действия: reject/429, redirect на другую replica, downgrade model, ограничить max_tokens или поставить в отдельную batch queue. Для оценки нужны arrival rate, queue depth, KV pressure и latency headroom. Хороший admission control превращает overload в управляемую деградацию, а не в cascading latency collapse.

## Вопрос 85. Как закон Литтла помогает оценить concurrency LLM сервиса?

## Вопрос 85.1. Как связать requests per second, средний latency и среднее число одновременных запросов?

## Вопрос 85.2. Какую sanity-check формулу из queueing theory удобно применять к LLM serving?

**Ответ**

Little’s Law (закон Литтла) утверждает для стабильной системы: L=λW, где L — среднее число requests в системе, λ — throughput/arrival rate, W — среднее время пребывания. Например, если endpoint завершает 20 requests/s со средним latency 5 s, в нём в среднем около 100 requests одновременно — running плюс queued. Для LLM это полезная sanity check, но недостаточная capacity model: service time зависит от input/output lengths и batching взаимодействует между requests. Закон помогает ловить несогласованные метрики и оценивать масштабы concurrency, после чего нужны token-level simulations и percentile analysis.

## Вопрос 86. Почему benchmark с фиксированной concurrency и benchmark с Poisson arrivals измеряют разные свойства сервера?

## Вопрос 86.1. Почему constant-concurrency load test может скрыть перегрузку endpoint?

## Вопрос 86.2. Чем open-loop arrival process лучше показывает queueing collapse?

**Ответ**

Closed-loop benchmark (замкнутая нагрузка) поддерживает фиксированную concurrency: новый request отправляется после завершения предыдущего. Если сервер замедляется, generator автоматически снижает arrival rate, частично скрывая overload. Open-loop Poisson arrivals (поток с независимыми случайными прибытием) задаёт rate извне и лучше показывает queue buildup, tail latency и точку saturation. Реальный API часто ближе к bursty open-loop traffic. Для latency SLO важно тестировать arrival process, похожий на production. Фиксированная concurrency полезна для controlled throughput curves, но по ней нельзя напрямую определить устойчивый QPS при случайной нагрузке.

## Вопрос 87. Как burst traffic влияет на LLM serving сильнее, чем на короткий stateless API?

## Вопрос 87.1. Почему краткий всплеск запросов может держать LLM cluster перегруженным ещё долго после него?

## Вопрос 87.2. Какие token-level показатели лучше QPS описывают последствия traffic burst?

**Ответ**

Burst (всплеск нагрузки) создаёт очередь requests, каждый из которых может жить секунды или минуты и удерживать KV cache всё время генерации. Поэтому последствия продолжаются после окончания самого burst: active sequences ещё занимают memory и decode slots. Autoscaling также запаздывает из-за model load/warmup. Защита включает headroom, queue limits, admission control, prompt/output caps и fast scale-out заранее по leading indicators. Нельзя смотреть только на instantaneous QPS: полезны queued tokens, estimated remaining output work и KV occupancy. Длинный tail service time делает recovery после overload заметно медленнее.

## Вопрос 88. Что такое head-of-line blocking в LLM serving и как длинный prefill его создаёт?

## Вопрос 88.1. Как один 128K prompt способен испортить streaming latency всех остальных пользователей?

## Вопрос 88.2. Какие механизмы убирают head-of-line blocking от длинных prefills?

**Ответ**

Head-of-line blocking (блокировка очереди первым тяжёлым элементом) возникает, когда один дорогой request задерживает множество более коротких. Например, scheduler запускает 128K-token prefill одним шагом, и десятки decode sequences не получают GPU time до его завершения. Симптом — spikes ITL, коррелирующие с появлением long prompts, при нормальном среднем utilization. Chunked prefill, separate queues, token budgets и prefill/decode disaggregation уменьшают проблему. Аналогичный эффект возможен на gateway, если FIFO queue не различает стоимость requests. Поэтому стоимость задачи должна учитываться до GPU scheduler, а не только внутри engine.

## Вопрос 89. Как длинные prompts влияют на соседние decode requests в colocated serving?

## Вопрос 89.1. Почему compute-heavy prefill мешает memory-bound decode на одном GPU?

## Вопрос 89.2. Что означает prefill-decode interference в общем serving instance?

**Ответ**

Long prefill использует крупные compute-efficient GEMM и attention, занимая GPU заметно дольше обычного decode iteration. Если prefill и decode colocated (совмещены на одном наборе GPU), это создаёт phase interference (взаимное влияние фаз): decode requests получают длинные паузы, а scheduler вынужден уменьшать prefill chunks ради ITL. Чем длиннее input и строже TPOT SLO, тем сильнее конфликт. Уменьшить его можно chunked prefill, prefill quotas или разделением фаз по разным instances. Выбор зависит от traffic mix: disaggregation добавляет KV transfer и не всегда окупается на коротких prompts.

## Вопрос 90. Как практически подбирать chunk size для chunked prefill?

## Вопрос 90.1. Как найти chunked-prefill size экспериментально, а не выбрать его по интуиции?

## Вопрос 90.2. Какие метрики должны участвовать в tuning размера prefill chunks?

**Ответ**

Chunk size (размер порции prefill) подбирают как многокритериальный параметр. Большие chunks дают лучше GEMM efficiency и меньше launch/scheduler overhead, но увеличивают время одного iteration и p99 ITL. Малые защищают streaming latency, но дробят prefill и могут ухудшить TTFT/throughput. Практически строят sweep на production-like distribution: несколько QPS уровней × prompt lengths × output lengths. Для каждого размера фиксируют p50/p95/p99 TTFT и TPOT, input/output throughput, GPU utilization и queue depth. Выбирают не самый быстрый средний вариант, а максимальный goodput внутри SLO. При изменении hardware/model настройку пересматривают.

## Вопрос 91. Почему смешивание prefill и decode в одном batch может одновременно быть полезным и вредным?

## Вопрос 91.1. Почему добавление prefill work может улучшить GPU efficiency, но ухудшить user streaming?

## Вопрос 91.2. Каким образом hybrid prefill/decode batch меняет длительность scheduler step?

**Ответ**

Mixed batch (смешанный пакет) позволяет заполнить GPU работой: decode tokens сами по себе могут иметь низкую arithmetic intensity, а добавление prefill chunk улучшает utilization. Но слишком большой prefill удлиняет iteration и повышает latency всех decode sequences. Кроме того, attention paths и shapes у фаз различаются, что усложняет kernel scheduling. Поэтому scheduler строит hybrid batches в пределах token budget. Правильный баланс повышает throughput без stall; неправильный — превращает каждый приход длинного prompt в ITL spike. Нужны traces на уровне iteration: сколько prefill/decode tokens было вместе и как это повлияло на duration.

## Вопрос 92. В чём идея disaggregated prefill/decode serving?

## Вопрос 92.1. Почему prefill и decode иногда выгодно запускать на разных GPU pools?

## Вопрос 92.2. Как P/D disaggregation развязывает TTFT и TPOT tuning?

**Ответ**

Disaggregated serving (разделённое обслуживание) выполняет prefill и decode на разных GPU instances. Prefill workers оптимизируют TTFT и крупные compute-heavy batches, decode workers — стабильный TPOT и memory-bandwidth-heavy generation. После prefill нужно передать KV cache на decode side через high-speed interconnect/storage layer. Главное преимущество — независимое provisioning и parallelism для двух разных workloads и устранение direct phase interference. Цена — KV transfer, дополнительная orchestration, routing и failure modes. Такая архитектура особенно интересна при длинных prompts, строгих tail SLO и достаточно быстром fabric; для маленького сервиса она может быть избыточной.

## Вопрос 93. Почему prefill/decode disaggregation сама по себе не обязана повышать максимальный throughput?

## Вопрос 93.1. Почему P/D split следует оценивать по goodput under SLO, а не ожидать автоматического роста tokens/s?

## Вопрос 93.2. Как disaggregation может улучшить полезную capacity без уменьшения вычислений модели?

**Ответ**

Разделение фаз не удаляет model FLOPs и добавляет передачу KV state, поэтому «две группы GPU» не создают бесплатную compute capacity. Основная ценность — SLO isolation и возможность подобрать hardware/parallelism каждой фазе. В документации vLLM, например, disaggregated prefill прямо позиционируется для независимого TTFT/ITL tuning и контроля tail ITL, а не как гарантированный throughput optimization. Throughput может вырасти косвенно, если colocated system был вынужден сильно недоиспользовать ресурсы ради latency constraints. Сравнивать нужно goodput при одинаковых SLO и одинаковом total hardware budget.

## Вопрос 94. Как оценить, окупится ли перенос KV cache между prefill и decode workers?

## Вопрос 94.1. Как построить cost model для KV transfer в disaggregated serving?

## Вопрос 94.2. От каких параметров зависит цена передачи prefill state на decode replica?

**Ответ**

Нужно сравнить KV transfer latency с выигрышем от phase isolation. Приближённо `t_transfer = KV_bytes / effective_fabric_bandwidth + fixed_overhead`, но effective bandwidth измеряют под concurrent traffic, а не берут peak из спецификации. KV_bytes зависят от layers, tokens, KV heads и precision. Важно, можно ли overlap transfer с другими вычислениями и передавать blocks по мере готовности. Если 100K prompt создаёт гигабайты state через слабый Ethernet, split может ухудшить TTFT. Если NVLink/InfiniBand/NIXL дают быстрый pipeline, передача может быть малой частью prefill time.

## Вопрос 95. Что такое overlap scheduling и какие стадии LLM serving можно перекрывать по времени?

## Вопрос 95.1. Какие host и communication операции можно выполнять параллельно с текущим GPU step?

## Вопрос 95.2. Как overlap scheduler уменьшает gaps между LLM decode kernels?

**Ответ**

Overlap scheduling (перекрытие планирования и вычислений) старается выполнять CPU preparation следующего iteration, communication или KV movement одновременно с текущим GPU compute. Вместо последовательности `GPU → scheduler → GPU` host готовит metadata, пока accelerator занят, уменьшая idle gaps. В distributed inference можно также overlap collectives с independent computation, а в disaggregation — KV transfer с prefill/decode других requests. Сложность — dependencies и memory lifetime: нельзя переиспользовать buffers до завершения async operations. Профилировать нужно timeline, иначе высокий overlap в теории может скрывать contention за PCIe/NVLink и ухудшать critical path.

## Вопрос 96. Какие риски появляются при полностью asynchronous scheduling?

## Вопрос 96.1. Почему перенос scheduler с critical path усложняет корректность memory management?

## Вопрос 96.2. Какие race conditions возможны, если CPU планирует следующий batch до завершения текущего?

**Ответ**

Asynchronous scheduling (асинхронное планирование) уменьшает CPU critical path, но scheduler принимает решения на состоянии, которое может немного отставать от GPU. Это усложняет точный учёт свободных KV blocks, cancellations, priorities и failure handling. Нужно проектировать ownership buffers и completion events, чтобы два iterations не использовали один ресурс конфликтно. Ошибки проявляются редко: race conditions, stale metadata, memory corruption или неправильное завершение request. Поэтому performance gain следует сопровождать stress tests с cancellations, OOM pressure и dynamic batching. Асинхронность полезна, когда host overhead измеримо значим; добавлять её без профиля — ненужная сложность.

## Вопрос 97. Как доказать, что bottleneck находится в CPU scheduler, а не в GPU model execution?

## Вопрос 97.1. Как экспериментально отделить host scheduling overhead от медленных CUDA kernels?

## Вопрос 97.2. Какие признаки в Nsight timeline указывают на CPU-bound LLM serving?

**Ответ**

Нужен timeline profiler: измеряют длительность GPU kernels и gaps между ними, CPU thread utilization, scheduler-step time и launch latency. Если GPU kernels короткие, между ними регулярно есть пустые интервалы, а host core насыщен — вероятен scheduler bottleneck. Эксперимент: увеличить CPU frequency/cores, отключить дорогой logging/prefix lookup, включить CUDA Graphs или заменить scheduler path; если tokens/s растёт без изменения kernel duration, гипотеза подтверждается. Дополнительно сравнивают batch=1 и высокий concurrency. Нельзя делать вывод только по `nvidia-smi GPU-Util`, потому что его временное разрешение слишком грубое для iteration gaps.

## Вопрос 98. Как набор CUDA Graph capture sizes взаимодействует с scheduler batch sizes?

## Вопрос 98.1. Почему выбор captured batch sizes влияет на padding overhead continuous batching?

## Вопрос 98.2. Как связать histogram active sequences с настройкой CUDA Graph coverage?

**Ответ**

Serving runtime часто захватывает CUDA Graphs (предзаписанные GPU launch-графы) для набора размеров, например 1, 2, 4, 8, 16… active sequences. Scheduler может pad текущий batch до ближайшего capture size. Если 17 requests регулярно округляются до 32, GPU выполняет заметную пустую работу; если exact shape не покрыт, возможен eager fallback с большим launch overhead. Поэтому capture set должен соответствовать observed batch-size histogram. Можно добавить плотные sizes около типичной concurrency и редкие крупные ступени для хвоста. Больше graphs увеличивает capture/warmup time и memory, так что это оптимизационный budget.

## Вопрос 99. Почему token-level scheduling точнее request-level scheduling для LLM workloads?

## Вопрос 99.1. Почему два LLM requests нельзя считать одинаковыми единицами работы для scheduler?

## Вопрос 99.2. Чем token budget лучше обычного max batch size при генеративном serving?

**Ответ**

Request-level scheduler считает все requests примерно одинаковыми, но стоимость LLM запроса определяется тысячами token operations и меняется во времени: сначала много prefill tokens, затем по одному decode token на iteration. Token-level scheduling (планирование по токенам) позволяет задать budget вычислительной работы, chunk длинного prompt и смешать его с decode. Это лучше контролирует iteration duration и fairness. Однако токен — не идеально одинаковая единица стоимости: prefill и decode, dense и MoE, cached и uncached tokens имеют разные hardware costs. Продвинутый scheduler может использовать weighted token cost или predicted step time вместо простого count.

## Вопрос 100. Почему batch composition может менять численные результаты inference даже при одинаковом seed?

## Вопрос 100.1. Почему один и тот же prompt с одним seed может разойтись при другой concurrent нагрузке?

## Вопрос 100.2. Как floating-point non-associativity связывает dynamic batching с determinism?

**Ответ**

Batch composition (состав пакета) может менять порядок floating-point reductions, выбор kernels, padding/capture shape и distributed collectives. Floating-point арифметика неассоциативна, поэтому небольшие различия logits способны изменить sampled token, после чего autoregressive sequence полностью расходится. Greedy decoding тоже может измениться около почти равных logits. Это не обязательно ошибка модели. Если продукт требует reproducibility, нужны batch-invariant kernels/algorithms, фиксированный RNG mapping per request и контроль runtime versions. Обычный seed гарантирует воспроизводимость только при достаточно стабильном execution path, а не магическую bitwise identity при любой concurrency.

## Вопрос 101. Зачем post-training quantization нужен calibration dataset и какие статистики по нему собирают?

## Вопрос 101.1. Почему calibration examples должны быть похожи на production prompts при PTQ?

## Вопрос 101.2. Какие данные нужны алгоритму quantization, если веса модели уже обучены?

**Ответ**

PTQ (пи-ти-кью; Post-Training Quantization — квантование после обучения) часто требует representative calibration data, чтобы оценить диапазоны activations, outliers и подобрать scaling/clipping parameters. Для weight-only методов calibration может использоваться, чтобы измерить чувствительность весов через реальные activations; для W8A8 — чтобы выбрать activation scales. Набор не обязан быть огромным, но должен покрывать реальные языки, длины, код/математику и chat template. Плохая calibration distribution способна дать отличную perplexity на одном corpus и деградацию production tasks. Важно фиксировать tokenizer, sequence lengths и preprocessing, иначе quantized checkpoint невозможно воспроизводимо сравнить.

## Вопрос 102. Чем symmetric quantization отличается от asymmetric и где появляется zero-point?

## Вопрос 102.1. Когда quantization требует ненулевой zero-point?

## Вопрос 102.2. Какая математическая разница между symmetric и asymmetric low-bit representation?

**Ответ**

Symmetric quantization (симметричное квантование) отображает значения вокруг нуля с scale `s`, обычно `q=round(x/s)`, а нулю соответствует integer 0. Asymmetric quantization (асимметричное) дополнительно использует zero-point `z`: `q=round(x/s)+z`, чтобы лучше покрыть диапазон `[xmin,xmax]`, не симметричный относительно нуля. Asymmetric схема потенциально уменьшает quantization error, но усложняет kernels и arithmetic. Для LLM hardware efficiency часто важнее математически минимальной ошибки: формат с простым symmetric scaling может выполняться быстрее. Выбор зависит от distribution конкретного tensor и поддерживаемого GEMM path.

## Вопрос 103. Чем per-tensor, per-channel и group-wise quantization отличаются по точности и runtime overhead?

## Вопрос 103.1. Почему меньшая quantization group обычно точнее, но не обязательно быстрее?

## Вопрос 103.2. Как granularity scale влияет на error и объём metadata?

**Ответ**

Per-tensor quantization (один scale на весь тензор) минимизирует metadata и проста для hardware, но плохо переносит каналы с разными диапазонами. Per-channel даёт отдельный scale, например для каждой output channel, снижая error, но увеличивает scales и усложняет kernel. Group-wise quantization делит веса на небольшие группы элементов и хранит scale на группу — типичный компромисс для 4-bit weight-only formats. Меньший group size обычно повышает accuracy, но растёт metadata overhead и стоимость dequantization. Поэтому group size нельзя выбирать только по perplexity: нужно измерять effective memory bytes и kernel throughput на целевом accelerator.

## Вопрос 104. Как scale и zero-point используются при quantize/dequantize и где возникает quantization error?

## Вопрос 104.1. Откуда берутся rounding и clipping errors при low-bit quantization?

## Вопрос 104.2. Как выбор quantization scale балансирует точность центра распределения и outliers?

**Ответ**

Для uniform quantization (равномерного квантования) real value x отображается в ограниченное множество integer/low-bit кодов: `q=clip(round(x/s)+z)`. При dequantization восстанавливают `x̂=s(q−z)`. Ошибка `x−x̂` возникает из-за rounding и clipping значений вне выбранного representable range. Уменьшение scale повышает разрешение около нуля, но усиливает clipping outliers; увеличение scale сохраняет extremes, но делает шаг грубее для основной массы. Поэтому выбор ranges — ключ к качеству. В LLM проблема особенно выражена для activation outliers, из-за чего появились smoothing и activation-aware методы.

## Вопрос 105. Почему activation outliers особенно мешают W8A8 quantization LLM?

## Вопрос 105.1. Почему несколько экстремальных activation значений портят точность INT8 для всего tensor?

## Вопрос 105.2. Что делает LLM activations труднее для quantization, чем сами weights?

**Ответ**

Activation outliers (редкие значения activations значительно большего масштаба) заставляют общий quantization range быть широким. Тогда большая масса обычных значений использует мало эффективных уровней и получает крупный rounding error. Если же range сузить, outliers clip-ятся. У LLM такие outlier channels могут быть систематическими и появляться во многих токенах. Weight-only quantization обходит часть проблемы, потому что activations остаются высокой precision. W8A8 требует per-channel/group scales, smoothing или selective higher precision. Нельзя судить по histogram одного layer: чувствительность зависит от того, как ошибка распространяется через residual connections и последующие blocks.

## Вопрос 106. В чём основная идея SmoothQuant и почему она позволяет W8A8 quantization?

## Вопрос 106.1. Как SmoothQuant переносит проблему outliers из activations в weights без изменения исходной линейной функции?

## Вопрос 106.2. Почему smoothing помогает совместно квантовать и веса, и activations в INT8?

**Ответ**

SmoothQuant (метод сглаживания перед quantization) использует эквивалентное преобразование: масштабирует activation channels вниз, а соответствующие weight channels — обратно вверх, так что full-precision линейная функция не меняется. Тем самым quantization difficulty «переносится» из activations, где outliers сложны, в weights, которые обычно легче квантовать. Scaling factors подбираются по calibration statistics. После преобразования можно эффективнее использовать W8A8 (8-bit weights и activations) GEMM. Ключевой trade-off задаёт smoothing parameter: слишком агрессивное преобразование сделает weights более тяжёлыми для quantization. Реальный выигрыш появляется только с hardware INT8 kernels.

## Вопрос 107. Как GPTQ использует second-order information для weight-only quantization?

## Вопрос 107.1. Почему GPTQ не сводится к независимому округлению каждого weight к ближайшему 4-bit уровню?

## Вопрос 107.2. Как Hessian approximation помогает компенсировать ошибку при последовательном квантовании весов?

**Ответ**

GPTQ (джи-пи-ти-кью; алгоритм post-training weight quantization) последовательно квантует веса слоя и компенсирует возникающую ошибку в ещё не квантованных весах, используя приближение Hessian/second-order information (информации о кривизне ошибки) из calibration activations. Интуиция: не все направления ошибки одинаково влияют на выход слоя, поэтому простой nearest rounding не оптимален. Метод позволяет агрессивные 3–4-bit weights с небольшой деградацией. Но checkpoint format сам по себе не определяет скорость: serving engine нужен optimized packed GEMM/dequant kernel. Разные implementations GPTQ могут иметь разные group sizes, act-order и layout, влияющие на latency.

## Вопрос 108. В чём идея AWQ и почему он использует activation statistics для weight-only quantization?

## Вопрос 108.1. Почему AWQ смотрит на activations, хотя квантует только weights?

## Вопрос 108.2. Как activation-aware scaling защищает важные каналы при W4 quantization?

**Ответ**

AWQ (эй-дабл-ю-кью; Activation-aware Weight Quantization — квантование весов с учётом activations) исходит из того, что небольшая доля weight channels особенно важна для реальных inputs. Их определяют по activation magnitudes, а затем применяют эквивалентное channel scaling, чтобы уменьшить quantization error важных weights без hardware-неудобной смеси precision. В отличие от методов с reconstruction/backprop, AWQ использует calibration statistics и search scales. Практический плюс — хорошая generalization weight-only 4-bit checkpoints, но performance зависит от kernel packing. Название «activation-aware» не означает, что runtime activations обязательно хранятся в 4 битах.

## Вопрос 109. Чем GPTQ и AWQ различаются как инженерные подходы, а не как названия форматов?

## Вопрос 109.1. Почему два W4 checkpoints GPTQ и AWQ могут иметь разную скорость при похожем качестве?

## Вопрос 109.2. Какие принципиально разные сигналы используют GPTQ и AWQ для снижения quantization error?

**Ответ**

GPTQ и AWQ оба часто дают 4-bit weight-only checkpoints, но оптимизируют ошибку по-разному. GPTQ использует approximate second-order reconstruction и последовательную компенсацию quantization error. AWQ ищет activation-salient channels и масштабирует их, не опираясь на Hessian reconstruction. Поэтому calibration cost, sensitivity к dataset и resulting weight layout различаются. Для production нельзя выбирать только по benchmark quality из статьи: конкретный runtime может иметь гораздо быстрее Marlin/CUTLASS kernel для одного layout. Правильное сравнение фиксирует model, group size, calibration set, serving backend, batch/context distribution и task quality.

## Вопрос 110. Как group size в 4-bit weight quantization влияет на model size и accuracy?

## Вопрос 110.1. Почему W4 модель фактически занимает больше четырёх бит на один parameter?

## Вопрос 110.2. Как quantization groups создают компромисс между accuracy и metadata overhead?

**Ответ**

При group-wise W4 (4-битном квантовании по группам) каждая группа weights хранит собственный scale, иногда zero-point. Чем меньше group size, тем точнее scale соответствует локальному distribution и обычно ниже error. Но на каждые N четырёхбитных значений приходится больше high-precision metadata, поэтому эффективное bits-per-weight растёт выше 4. Дополнительно kernels должны чаще загружать scales. Большой group экономит metadata и может быть быстрее, но хуже обрабатывает неоднородные channels. Для capacity planning следует считать реальный checkpoint bytes, а не `parameters×4/8`, и отдельно benchmark-ить kernel throughput.

## Вопрос 111. Почему W4A16 часто ускоряет low-batch decode сильнее, чем compute-heavy prefill?

## Вопрос 111.1. Почему weight-only INT4 особенно подходит для memory-bound decode?

## Вопрос 111.2. Отчего 4-bit weights дают разный speedup на prompt processing и token generation?

**Ответ**

W4A16 означает 4-bit weights и 16-bit activations/accumulation path. На low-batch decode одна и та же большая матрица weights читается ради небольшого числа tokens, поэтому workload memory-bandwidth-bound: уменьшение weight bytes примерно в четыре раза относительно FP16 может сильно помочь. На prefill с тысячами tokens weights интенсивно переиспользуются, GEMM становится compute-bound, и dequantization/низкая эффективность конкретного W4 kernel может ограничить выигрыш. Поэтому quantized model может иметь отличный tokens/s при batch=1 и менее впечатляющий input throughput. Benchmark должен разделять prefill и decode режимы.

## Вопрос 112. Когда W8A8 может быть быстрее W4A16, несмотря на более крупные weights?

## Вопрос 112.1. Почему меньше бит у weights не гарантирует более быстрый GEMM?

## Вопрос 112.2. В каких workloads нативный 8-bit tensor-core path способен обогнать 4-bit weight-only?

**Ответ**

W8A8 использует 8-bit weights и 8-bit activations, что позволяет нативным INT8/FP8 Tensor Core GEMM обрабатывать и compute, и data movement эффективно. W4A16 сильнее сжимает weights, но может требовать unpack/dequantization и работать через менее производительный mixed-precision kernel. На compute-bound prefill аппаратно зрелый W8A8 путь способен выиграть. На memory-bound batch=1 W4A16 часто остаётся привлекательным из-за меньших weight bytes. Решение зависит от accelerator generation, matrix shapes и kernel library. Сравнивать нужно на одинаковом quality target, потому что разная precision может требовать разных calibration/accuracy compromises.

## Вопрос 113. Чем FP8 E4M3 и E5M2 отличаются и почему FP8 требует scaling?

## Вопрос 113.1. Почему E4M3 и E5M2 имеют разные компромиссы range/precision?

## Вопрос 113.2. Зачем FP8 tensors хранить вместе со scaling factors?

**Ответ**

FP8 (эф-пи-эйт; 8-битный floating-point формат) имеет очень мало exponent и mantissa bits. E4M3 выделяет 4 exponent и 3 mantissa bits, давая больше precision, но меньший range; E5M2 — больший range при меньшей precision. В deep-learning kernels значения обычно дополнительно масштабируются, чтобы рабочий distribution попадал в representable range. Поэтому FP8 operationally ближе к quantization scheme, чем к «просто уменьшенному FP16»: важны granularity scales, accumulation precision и hardware semantics. Выбор формата зависит от tensor type — weights, activations, gradients или KV — и конкретного accelerator backend.

## Вопрос 114. Что такое NVFP4 и почему его performance преимущество hardware-specific?

## Вопрос 114.1. Почему NVFP4 следует оценивать вместе с поколением NVIDIA GPU, а не как универсальный 4-bit формат?

## Вопрос 114.2. Что превращает FP4 из способа хранения в реальное ускорение Tensor Core inference?

**Ответ**

NVFP4 (эн-ви-эф-пи-фор; NVIDIA 4-bit floating-point format) использует низкобитные values вместе с fine-grained scaling, чтобы сократить storage/bandwidth и задействовать нативные Blackwell Tensor Core paths. Ключевое слово — нативные: тот же 4-bit checkpoint на GPU без соответствующих instructions может потребовать conversion или другой kernel и не дать ожидаемого speedup. По состоянию на 2026 TensorRT-LLM и связанные NVIDIA tools активно поддерживают NVFP4 на Blackwell, включая model/KV варианты. Quality всё равно нужно проверять на конкретном model/workload: hardware support решает efficiency, но не делает quantization error автоматически нулевым.

## Вопрос 115. Чем MXFP4 отличается по смыслу от vendor-specific NVFP4?

## Вопрос 115.1. Почему все FP4 checkpoints нельзя считать одним и тем же форматом?

## Вопрос 115.2. Какие детали block scaling отличают microscaling formats от простого 4-bit числа?

**Ответ**

MXFP4 (эм-икс-эф-пи-фор; microscaling 4-bit floating-point) относится к block-scaled low-precision formats, где небольшие группы значений разделяют scale. Идея fine-grained scaling помогает сохранять dynamic range при очень коротком value format. NVFP4 также использует microblock scaling, но является NVIDIA-specific representation и hardware path. Для инженера важны не только «4 бита», а точные value encoding, scale format/group size, accumulation и поддержка kernels. Checkpoints разных FP4 schemes не следует считать взаимозаменяемыми. Portability требует conversion и повторного quality/performance validation на целевой hardware/software stack.

## Вопрос 116. Чем INT4 и FP4 принципиально отличаются для LLM quantization?

## Вопрос 116.1. Как различается representable grid у 4-bit integer и 4-bit floating-point quantization?

## Вопрос 116.2. Почему INT4 vs FP4 нужно выбирать по hardware path и distribution, а не только по числу бит?

**Ответ**

INT4 представляет дискретные целые коды и нуждается во внешнем scale/zero-point, обычно одинаковом для группы weights. FP4 имеет собственную floating-point структуру exponent/mantissa, но на практике также часто используется block scaling. INT4 обеспечивает равномерную сетку после scale, FP4 — неравномерную относительную precision и больший dynamic behavior. Что точнее, зависит от distribution и quantization recipe; что быстрее — от accelerator instructions и packed kernel. Нельзя делать общий вывод «float лучше int» или наоборот. Production выбор — тройной trade-off: task quality, effective bytes и native kernel throughput.

## Вопрос 117. Как выбрать calibration dataset для multilingual или code-heavy production workload?

## Вопрос 117.1. Какие production dimensions должны быть представлены в PTQ calibration corpus?

## Вопрос 117.2. Почему английский WikiText-подобный calibration set недостаточен для multilingual coding assistant?

**Ответ**

Calibration set (набор для настройки quantization scales) должен воспроизводить activation distributions production. Для multilingual endpoint полезно стратифицировать данные по языкам и scripts; для coding — включить длинные identifiers, whitespace, uncommon symbols и разные programming languages; для agents — tool schemas/JSON. Важно покрыть реальные sequence lengths, потому что long context может менять activation statistics. Затем calibration не используют как единственный quality test: evaluation set должен быть независимым. Если calibration слишком «чистый» и англоязычный, quantization может оптимизироваться под него и неожиданно ухудшить русский, код или structured output.

## Вопрос 118. Как находят quantization-sensitive layers и что с ними делают?

## Вопрос 118.1. Как экспериментально решить, какие слои оставить в BF16 при low-bit model?

## Вопрос 118.2. Почему mixed-precision quantization может быть лучше одинаковых 4 бит для всех modules?

**Ответ**

Quantization sensitivity (чувствительность к квантованию) измеряют ablation: поочерёдно оставляют layer/module высокой precision или квантуют отдельно и смотрят output error/quality. Часто особенно чувствительны embeddings, lm_head, первые/последние layers или отдельные projections, но это model-specific и не должно считаться законом. Решение — mixed precision (смешанная точность), меньший group size, другой clipping/scaling или исключение module из quantization. Цена — больший checkpoint и иногда разрыв fused kernel path. Оптимизируют не минимальный средний bit-width, а Pareto frontier quality–latency–memory на реальном runtime.

## Вопрос 119. Почему perplexity недостаточно для оценки качества quantized instruction model?

## Вопрос 119.1. Почему одинаковая perplexity BF16 и W4 не доказывает одинаковое качество chat assistant?

## Вопрос 119.2. Какие evaluation types дополняют perplexity после quantization?

**Ответ**

Perplexity (перплексия, мера вероятностного соответствия тексту) чувствительна к language modeling error, но не напрямую измеряет instruction following, coding correctness, tool-call schema, factual retrieval или long-context reasoning. Quantization может почти не изменить average perplexity и при этом чаще переключать близкие logits на critical structured tokens. Поэтому используют task suite: exact match, pass@k/code execution, JSON validity, retrieval/needle tests, domain benchmarks и representative conversations. Для stochastic outputs нужна статистика по нескольким seeds. Perplexity полезна как дешёвый early signal, но production acceptance должен основываться на бизнес- и task-level quality criteria.

## Вопрос 120. Почему KV-cache quantization нужно тестировать на длинных последовательностях, а не только на коротком benchmark?

## Вопрос 120.1. Почему качество FP8/2-bit KV cache следует проверять ближе к максимальному context window?

## Вопрос 120.2. Как длина контекста усиливает требования к точности quantized K/V?

**Ответ**

KV cache quantization (низкоточное хранение keys/values) влияет на attention каждого последующего token. На коротком context ошибка затрагивает небольшой cache и может быть незаметна; на 64K/128K модель обращается к большому числу quantized vectors, а position/attention patterns отличаются. Некоторые schemes специально используют разные granularity для keys и values, например per-channel vs per-token. Поэтому validation включает long-context retrieval, multi-turn memory, generation stability и worst-case lengths. Параллельно измеряют memory saving и TPOT: если kernel постоянно dequantizes большой cache неэффективно, capacity выиграет, а latency может нет.

## Вопрос 121. Как quantization target model или draft model влияет на speculative decoding acceptance rate?

## Вопрос 121.1. Почему ускорение draft модели квантованием способно неожиданно ухудшить общий speculative speedup?

## Вопрос 121.2. Как low-precision logits меняют согласованность proposer и verifier?

**Ответ**

Speculative decoding (спекулятивное декодирование) выигрывает, когда draft хорошо предсказывает распределение target. Если target quantization немного меняет logits, но draft обучен/подобран под full-precision target, distribution mismatch может снизить acceptance rate. Quantization самого draft может ускорить proposal, но также ухудшить его predictions; итог зависит от баланса draft latency и accepted tokens. Поэтому нельзя оптимизировать компоненты независимо. Измеряют acceptance length, verifier steps, draft time, target verification time и end-to-end TPOT при одинаковом output distribution requirement. Иногда более точный, чуть медленнее draft даёт лучший общий результат.

## Вопрос 122. Как LoRA и quantized base model взаимодействуют во время inference?

## Вопрос 122.1. Почему QLoRA-подобный checkpoint и быстрый quantized-LoRA serving — не одно и то же?

## Вопрос 122.2. Какие дополнительные операции появляются при LoRA поверх 4-bit base weights?

**Ответ**

LoRA (лоу-ра; Low-Rank Adaptation — низкоранговая адаптация) обычно хранит adapter weights в более высокой precision, а base weights могут быть W4/W8. Runtime должен вычислить базовый quantized linear path и добавить low-rank update. Если kernel умеет fuse эти операции, overhead умеренный; иначе возникают дополнительные dequantized buffers и launches. Quality тоже требует проверки: adapter обучался относительно определённой base representation, а quantization меняет её. Multi-LoRA поверх quantized base усиливает требования к kernel specialization и adapter caching. Не каждый combination, который технически загружается, является оптимальным по latency.

## Вопрос 123. Почему dequantization overhead иногда делает quantized inference медленнее FP16?

## Вопрос 123.1. Как 4-bit model может занимать меньше VRAM и при этом генерировать медленнее BF16?

## Вопрос 123.2. Какие признаки profiler показывают, что dequantization съедает выигрыш low-bit weights?

**Ответ**

Если hardware не умеет напрямую умножать packed low-bit weights на activations, runtime должен unpack/dequantize values, возможно во временный FP16 buffer. Это добавляет instructions, memory traffic и register pressure. На маленьких матрицах overhead может превышать saved bandwidth; на compute-bound prefill FP16 Tensor Cores могут быть настолько эффективны, что слабый 4-bit kernel проигрывает. Дополнительно неподходящий group size нарушает vectorization. Поэтому «checkpoint в два раза меньше» — memory fact, не performance guarantee. Проверяют kernel-level profiler: achieved bandwidth, Tensor Core utilization, dequant fusion и долю времени в conversion operations.

## Вопрос 124. Как поколение GPU меняет выбор precision для LLM inference?

## Вопрос 124.1. Почему оптимальный quantization format на H100 не обязан быть оптимальным на A100 или Blackwell?

## Вопрос 124.2. Как hardware generation определяет практическую пользу FP8/FP4?

**Ответ**

GPU architecture определяет, какие precisions имеют нативные Tensor Core instructions, их throughput, supported scaling и memory subsystem. Ampere широко эффективен для FP16/BF16/INT8 и отдельных INT4 paths; Hopper добавил сильный FP8 path; Blackwell расширил native low-precision, включая FP4-class formats. Но software support важен не меньше silicon: kernel library, CUDA version, serving engine и конкретная model architecture должны использовать instructions. Поэтому перенос конфигурации `best on H100` на A100 или B200 может изменить ranking. Поддержку проверяют по актуальной runtime documentation и microbenchmarks, а не только по marketing peak TOPS.

## Вопрос 125. Как правильно сравнивать несколько quantization schemes на одной модели?

## Вопрос 125.1. Какие переменные нужно зафиксировать для честного AWQ/GPTQ/FP8 benchmark?

## Вопрос 125.2. Как построить Pareto-сравнение quantization по quality, latency, throughput и memory?

**Ответ**

Нужно зафиксировать исходный checkpoint, tokenizer/template, evaluation data и serving runtime version. Для каждого scheme измеряют effective model bytes, startup memory, max concurrency, prefill throughput, decode TPOT на нескольких batch/context regimes и task quality. Нельзя сравнивать AWQ batch=1 с FP8 batch=64 или разные max context. Benchmark должен включать warmup и одинаковый arrival pattern. Отдельно записывают kernel/backend, group size, KV precision и any mixed-precision exclusions. Финальный выбор делают по Pareto frontier: минимальная стоимость при заданных quality и p95/p99 SLO, а не по одной цифре tokens/s.

## Вопрос 126. Как работает классический draft-target speculative decoding?

## Вопрос 126.1. Как маленькая proposer-модель помогает большой LLM генерировать несколько токенов за один verification pass?

## Вопрос 126.2. Из каких стадий состоит обычный speculative decoding с draft и target моделями?

**Ответ**

Speculative decoding (спекулятивное декодирование) использует быструю draft model (черновую модель), которая предлагает несколько следующих токенов, и более дорогую target model (целевую модель), которая проверяет эти предложения параллельно одним проходом. Подходящие токены принимаются подряд до первого отклонения; затем target выбирает корректирующий токен и процесс повторяется. Выигрыш возникает, когда проверка нескольких предложений целевой моделью стоит ненамного дороже одного обычного decode step, а draft часто угадывает продолжение. Метод не уменьшает размер target model: он пытается получить больше подтверждённых output tokens на один её вызов.

## Вопрос 127. Почему корректный speculative sampling может сохранять то же распределение, что и обычный sampling target model?

## Вопрос 127.1. Как speculative decoding ускоряет sampling, не меняя статистическое распределение target model?

## Вопрос 127.2. Зачем при отклонении draft token нужен residual distribution, а не обычный пересэмплинг?

**Ответ**

Lossless speculative sampling (спекулятивная выборка без изменения целевого распределения) не просто принимает совпавший argmax. Для каждого draft token используется acceptance probability, зависящая от отношения вероятностей target и draft; если предложение отклонено, следующий токен выбирается из скорректированного residual distribution (остаточного распределения). Такая схема математически гарантирует выборку из того же target distribution, что и последовательный sampling, при выполнении assumptions алгоритма. Поэтому ускорение не обязано менять качество статистически. На практике implementation нужно валидировать: упрощённые heuristics, approximate verification или несовпадающие processors могут уже не быть distribution-preserving.

## Вопрос 128. Что такое acceptance rate в speculative decoding и почему одной этой метрики недостаточно?

## Вопрос 128.1. Почему высокий процент принятых speculative tokens ещё не гарантирует speedup?

## Вопрос 128.2. Какие метрики кроме acceptance rate нужны для оценки speculative decoding?

**Ответ**

Acceptance rate (доля принятых draft tokens) показывает, какая часть предложений проходит verification, но не описывает полную экономику метода. Важны accepted tokens per target step, средняя accepted prefix length, время draft generation, стоимость target verification, synchronization и memory overhead. Два draft могут иметь одинаковый acceptance rate: более крупный угадывает не хуже, но тратит слишком много времени на предложения. Поэтому итоговая метрика — end-to-end TPOT или throughput при фиксированном workload. Acceptance полезна как диагностический сигнал, а не как самостоятельная цель оптимизации.

## Вопрос 129. Как размер draft model влияет на speculative decoding speedup?

## Вопрос 129.1. Почему самый маленький draft и самый похожий на target draft обычно не являются автоматически лучшими?

## Вопрос 129.2. Как найти баланс между скоростью proposer и его совпадением с target model?

**Ответ**

Маленькая draft model (черновая модель) быстро предлагает токены, но хуже приближает target distribution и получает низкую acceptance rate. Более крупная обычно предсказывает лучше, однако её собственный decode становится дорогим и съедает выигрыш. Возникает U-shaped trade-off: оптимален не максимально точный и не минимальный draft, а тот, который максимизирует число принятых target tokens на единицу суммарного времени. Также важны placement и memory: отдельная draft model занимает VRAM и может уменьшить batch capacity target. Выбор подтверждают benchmark на конкретных domains, temperature и output lengths.

## Вопрос 130. Как число speculative tokens за итерацию влияет на latency и acceptance?

## Вопрос 130.1. Почему увеличение количества draft tokens после некоторой точки снижает выгоду speculative decoding?

## Вопрос 130.2. Как speculative depth балансирует число проверяемых токенов и wasted proposals?

**Ответ**

Speculation depth (глубина спекуляции) определяет, сколько будущих токенов draft предлагает до проверки. Большая глубина потенциально даёт больше output tokens за один target pass, но вероятность принять весь длинный prefix быстро падает, а target должен проверить больше позиций и выделить больше temporary state. При низкой acceptance лишние предложения становятся wasted work. Маленькая глубина безопаснее, но ограничивает максимальный speedup. Поэтому современные runtimes поддерживают dynamic speculation: глубину адаптируют к model pair, request phase или наблюдаемой acceptance, вместо фиксированного `gamma` для всех запросов.

## Вопрос 131. Почему draft и target модели обычно должны иметь совместимый tokenizer?

## Вопрос 131.1. Почему нельзя просто взять любую маленькую LLM как draft для любой большой target model?

## Вопрос 131.2. Что ломается в token-level verification, если proposer и verifier используют разные vocabularies?

**Ответ**

Классический token-level speculative decoding предполагает, что draft token IDs обозначают те же token strings и могут быть непосредственно проверены target model. При разных vocabularies последовательность draft IDs не соответствует target IDs, и простая verification схема ломается. Существуют методы vocabulary mapping или text-level retokenization, но они добавляют сложности вокруг границ токенов, probabilities и корректности sampling. Поэтому практические serving stacks предпочитают draft из того же model family/tokenizer либо используют специальные speculative methods без отдельного tokenizer. Совместимость проверяют не по размеру vocabulary, а по точному tokenizer configuration и special tokens.

## Вопрос 132. Почему speculative decoding часто лучше работает при низкой concurrency, чем при насыщенном большим batch сервере?

## Вопрос 132.1. Почему speculative decoding может ускорить batch=1, но ухудшить throughput загруженного сервера?

## Вопрос 132.2. Как высокая batching efficiency target model уменьшает пользу speculation?

**Ответ**

При low concurrency target decode плохо насыщает GPU: один обычный step memory-bound и оставляет compute headroom. Verification сразу нескольких speculative positions повышает arithmetic intensity и лучше использует accelerator. При высокой concurrency continuous batching уже создаёт крупный эффективный batch; target GPU близок к throughput optimum, а дополнительные draft/verification operations могут только увеличить работу. Поэтому speculative decoding часто позиционируется как latency optimization для underutilized decode regimes. При production QPS нужно сравнивать не single-request speedup, а aggregate goodput и SLO: метод, ускоряющий один stream в 1.8×, способен уменьшить число одновременно обслуживаемых requests.

## Вопрос 133. Как размещение draft model на том же или отдельном GPU влияет на speculative decoding?

## Вопрос 133.1. Когда proposer имеет смысл вынести на отдельный accelerator?

## Вопрос 133.2. Какие trade-offs возникают между colocated и remote draft model?

**Ответ**

Если draft и target находятся на одном GPU, не нужен network transfer logits/tokens, но draft занимает VRAM и конкурирует за compute/memory bandwidth. На отдельном GPU фазы можно частично pipeline-ить, зато появляются communication latency, synchronization и дополнительный accelerator. Для маленького draft отдельный GPU часто экономически неоправдан; для сложной multi-stage speculation или уже sharded target решение зависит от topology. Нужно профилировать critical path: proposal time, transfer, verification и idle periods. Архитектура выбирается по latency/cost, а не по идее «разделение всегда быстрее».

## Вопрос 134. В чём идея EAGLE speculative decoding?

## Вопрос 134.1. Чем EAGLE отличается от запуска отдельной маленькой draft LLM?

## Вопрос 134.2. Почему использование target hidden states может повысить качество speculative proposals?

**Ответ**

EAGLE (игл; speculative decoding family на уровне скрытых признаков) вместо независимой полноценной draft LLM использует lightweight draft head/model, который опирается на hidden states target model и предсказывает будущие токены или features. Это повышает согласованность proposer с target и снижает стоимость отдельной модели. Предложения затем проверяются target model, поэтому метод может оставаться lossless относительно выбранной verification scheme. Практическая эффективность зависит от наличия совместимого EAGLE checkpoint и runtime kernels. Это не универсальный флаг для любой модели: auxiliary head должен быть подготовлен под конкретную target architecture/version.

## Вопрос 135. Что изменяет EAGLE-3 по сравнению с ранними feature-level speculative approaches?

## Вопрос 135.1. Какие инфраструктурные требования появляются при использовании EAGLE-3 в serving runtime?

## Вопрос 135.2. Почему paper-level EAGLE-3 speedup нельзя переносить напрямую на любой production workload?

**Ответ**

EAGLE-3 — развитие EAGLE-family, ориентированное на более сильное предсказание speculative branches за счёт использования признаков target model и специального draft training. Для serving-инженера важнее не название версии, а operational contract: нужен соответствующий auxiliary checkpoint, tree proposal/verification path и backend, который умеет эффективно batch-ить кандидаты. По состоянию на 2026 EAGLE-3 поддерживается современными runtimes, включая TensorRT-LLM и vLLM для совместимых моделей. Выгоду следует измерять отдельно от paper claims: acceptance и speedup зависят от target, workload, batch и hardware.

## Вопрос 136. Что такое MTP и чем native multi-token prediction отличается от внешней draft model?

## Вопрос 136.1. Почему native MTP может быть дешевле отдельного draft checkpoint?

## Вопрос 136.2. В каких моделях speculative decoding может использовать собственные multi-token heads?

**Ответ**

MTP (эм-ти-пи; Multi-Token Prediction — предсказание нескольких будущих токенов) добавляет самой model architecture дополнительные heads/modules для предложения будущих токенов. При inference эти native predictors можно использовать как proposer, а основной target path проверяет кандидаты. В отличие от отдельной draft LLM не требуется второй полноценный checkpoint, и representations лучше согласованы с target. Но MTP доступен только у моделей, которые обучены с такими heads, и runtime должен знать их architecture. По состоянию на 2026 MTP активно используется для DeepSeek-class и других совместимых checkpoints в vLLM/TensorRT-LLM.

## Вопрос 137. Как n-gram speculative decoding работает без draft neural model?

## Вопрос 137.1. Как можно делать speculative proposals вообще без второй LLM?

## Вопрос 137.2. Почему prompt lookup особенно эффективен для редактирования кода и повторяющегося текста?

**Ответ**

N-gram speculation (спекуляция по n-граммам) ищет в уже имеющемся prompt или generated text повторяющийся token pattern и предлагает продолжение из найденного совпадения. Для задач с высокой локальной повторяемостью — code editing, document rewriting, templated outputs — это почти бесплатный proposer: не нужен дополнительный neural forward pass и VRAM под draft model. Target всё равно проверяет candidates. Метод бесполезен, если подходящих совпадений мало или продолжения творческие. Поэтому его ценность определяется workload structure, а не размером target. Современные runtimes поддерживают prompt-lookup/n-gram варианты как лёгкую альтернативу draft models.

## Вопрос 138. Что такое suffix-based speculative decoding и чем он отличается от обычного n-gram lookup?

## Вопрос 138.1. Как suffix matching превращает уже имеющийся контекст в speculative proposer?

## Вопрос 138.2. Когда поиск повторяющегося суффикса лучше фиксированных n-грамм?

**Ответ**

Suffix-based speculation (спекуляция по суффиксам) ищет совпадение текущего suffix с предыдущими участками контекста и использует последующие токены найденного occurrence как candidates. Концептуально это близко к n-gram lookup, но implementation может использовать suffix structures или более эффективный поиск длиннейшего совпадения, а не фиксированный n. Выигрыш появляется в workloads с копированием/повторением: code completion, structured documents, editing. Критический параметр — стоимость поиска: если CPU lookup становится дорогим на длинных contexts, «бесплатный» proposer уже не бесплатен. Поэтому полезно измерять lookup time и accepted length отдельно.

## Вопрос 139. Как tree-based speculative decoding позволяет проверять несколько альтернативных ветвей?

## Вопрос 139.1. Зачем speculative proposer генерировать дерево кандидатов вместо одной цепочки?

## Вопрос 139.2. Как target model может параллельно верифицировать несколько потенциальных continuation branches?

**Ответ**

Tree speculation (деревовидная спекуляция) предлагает не одну линейную цепочку, а дерево вероятных продолжений. Target model за один specially masked forward pass вычисляет logits для нескольких candidate branches, после чего verification выбирает допустимый путь. Это повышает шанс получить длинную accepted sequence, особенно если proposer не уверен в одном next token. Цена — больше verification tokens, сложная attention mask/KV management и lower effective batch locality. Дерево должно быть компактным: слишком широкое быстро превращает ускорение в перебор. Поэтому branch factors и depth оптимизируют под measured acceptance и target kernel.

## Вопрос 140. Почему dynamic speculative decoding может быть лучше фиксированной глубины?

## Вопрос 140.1. Как адаптировать количество speculative tokens к текущей acceptance?

## Вопрос 140.2. Почему одна фиксированная speculation depth редко оптимальна для всего request?

**Ответ**

Dynamic speculation (динамическая глубина спекуляции) меняет число proposals в зависимости от уверенности proposer, прошлой acceptance или текущей нагрузки. Если несколько последних iterations почти всё приняли, можно увеличить depth; после частых ранних reject — уменьшить и не тратить target verification. Policy также может учитывать concurrency: при насыщенном server speculation ограничивают, чтобы сохранить throughput. Это feedback-control problem, поэтому агрессивная реакция на один reject создаёт oscillation. Оценивать нужно распределение accepted lengths и end-to-end latency, а не только среднюю глубину. Современные runtimes уже предлагают dynamic modes для отдельных speculators.

## Вопрос 141. Почему target verification нескольких speculative tokens может быть дешевле такого же числа обычных decode steps?

## Вопрос 141.1. Откуда берётся аппаратный выигрыш проверки K кандидатов одним target pass?

## Вопрос 141.2. Почему несколько verified positions лучше насыщают GEMM, чем K последовательных decode iterations?

**Ответ**

При обычном decode каждый новый token запускает отдельную итерацию с узкими matrix multiplications и повторным чтением больших weights. В verification target обрабатывает несколько candidate positions за один forward pass, поэтому weights переиспользуются внутри более крупного GEMM, растёт arithmetic intensity и уменьшается launch/synchronization overhead. Это и создаёт hardware speedup. Но attention и KV updates всё равно выполняются для verified positions, часть которых затем отклоняется. Если verification batch слишком велик или target уже хорошо насыщен другими requests, дополнительный parallelism мало помогает.

## Вопрос 142. Как temperature и sampling policy влияют на speculative acceptance?

## Вопрос 142.1. Почему acceptance при greedy generation не отражает acceptance при temperature 0.8/top-p?

## Вопрос 142.2. Какие sampling transformations должны быть согласованы между proposer и verifier?

**Ответ**

Acceptance зависит от сходства draft и target distributions после всех relevant transformations. При низкой temperature distributions становятся sharper: если top choices совпадают, длинные chains часто принимаются; если models расходятся на лидере, reject может происходить быстро. При высокой temperature probability mass распределяется шире, и stochastic choices draft чаще отличаются. Top-p/top-k, penalties и logits processors также меняют effective distributions и должны применяться согласованно в verification. Поэтому benchmark speculative decoding только при greedy не предсказывает performance creative sampling workload. Нужно повторять реальные decoding parameters продукта.

## Вопрос 143. Как guided или constrained decoding взаимодействует со speculative decoding?

## Вопрос 143.1. Почему JSON grammar может как помочь, так и помешать speculative decoding?

## Вопрос 143.2. Что должен делать proposer, чтобы не предлагать запрещённые constrained-decoding tokens?

**Ответ**

Guided decoding (ограниченная генерация по grammar/JSON schema) маскирует недопустимые tokens на каждом step. Если draft model не учитывает ту же constraint state, она будет предлагать candidates, которые target немедленно отклонит, снижая acceptance. Runtime может применять grammar mask и к proposer либо строить candidates только из допустимых branches. С другой стороны, жёсткие constraints делают next-token distribution более предсказуемым и иногда повышают acceptance. Implementation усложняется, потому что grammar automaton state нужно корректно продвигать по нескольким speculative positions и откатывать после reject. Поэтому совместимость зависит от конкретного backend.

## Вопрос 144. Для каких workloads n-gram speculation обычно особенно эффективна?

## Вопрос 144.1. Почему code editing — хороший сценарий для prompt-lookup speculation?

## Вопрос 144.2. Как по структуре задачи предсказать пользу n-gram proposer?

**Ответ**

N-gram speculation (предложения по уже встречавшимся последовательностям) особенно сильна там, где output копирует большие фрагменты input или ранее сгенерированного текста: code editing, repository patching, document transformation, template filling и некоторых agentic traces. Если модель должна написать оригинальный ответ на вопрос, совпадений значительно меньше. Это делает workload classification важнее model size. Полезная метрика — доля output tokens, имеющих длинное exact continuation match в доступном context. Если она высока, lookup proposer даёт хороший speedup почти без дополнительной VRAM; если низка, лучше neural draft или обычный decode.

## Вопрос 145. Speculative decoding оказался медленнее baseline. Как расследовать причину?

## Вопрос 145.1. Какие метрики смотреть, если включение speculative decoding повысило TPOT?

## Вопрос 145.2. Как доказать, что slowdown вызван proposer cost, низкой acceptance или плохим verification kernel?

**Ответ**

Сначала разложите iteration time на proposal, target verification и scheduler/communication overhead и сравните с обычным target decode. Затем измерьте acceptance rate, accepted tokens per target call и rejected proposal work по длинам запросов. Проверьте, не насыщен ли target уже большим continuous batch, не занимает ли draft слишком много VRAM и не снижает ли поэтому concurrency. Отдельно профилируйте kernels: verification может падать на неоптимальный shape или eager path. После этого сделайте controlled experiments — уменьшите speculation depth, замените draft, отключите method при high concurrency. Root cause подтверждается ростом end-to-end goodput, а не только acceptance.

## Вопрос 146. Как проверить, что lossless speculative decoding действительно не изменяет качество и распределение ответов?

## Вопрос 146.1. Какими тестами подтвердить distribution preservation speculative sampling?

## Вопрос 146.2. Почему один и тот же sampled текст не обязан совпадать, даже если speculative algorithm математически lossless?

**Ответ**

Для greedy режима можно сравнивать token-by-token outputs baseline и speculative path при одинаковом runtime semantics, понимая возможные floating-point differences. Для sampling нужна статистическая проверка, а не обязательное совпадение конкретной sequence: сравнивают token distributions/aggregate task metrics на множестве seeds и убеждаются, что implementation следует acceptance-correction алгоритму. Нужно зафиксировать logits processors, temperature, top-p, repetition penalties и RNG mapping. Дополнительно запускают regression suite для EOS, stop sequences, constrained output и long context. Любая heuristic verification, меняющая правила acceptance, должна документироваться как approximate, а не «lossless».

## Вопрос 147. Что меняется в speculative decoding, если target model квантована?

## Вопрос 147.1. Почему speedup от quantization и speculative decoding нельзя просто перемножить?

## Вопрос 147.2. Как low-bit target изменяет и baseline cost, и совпадение с draft model?

**Ответ**

Quantized target (квантованная целевая модель) может менять и verification cost, и distributions. Более быстрый target уменьшает долю времени, которую speculative decoding способен сэкономить; proposer overhead становится относительно крупнее. Одновременно небольшие logits shifts могут изменить acceptance относительно draft, подготовленного под BF16 target. Поэтому после quantization нужно заново подобрать draft/depth и измерить acceptance. Если target W4 decode уже ограничен другим bottleneck, verification нескольких positions может иметь иной kernel scaling. Нельзя складывать speedups «W4 × speculation» как независимые множители: optimizations взаимодействуют через hardware utilization и model agreement.

## Вопрос 148. Какую память добавляет speculative decoding и почему это может уменьшить maximum concurrency?

## Вопрос 148.1. Почему speculative decoding может ухудшить capacity даже при ускорении одной генерации?

## Вопрос 148.2. Какие дополнительные VRAM consumers появляются у draft-target serving?

**Ответ**

Отдельная draft model требует собственных weights, runtime workspace и часто KV cache; tree speculation добавляет temporary candidate state. Даже небольшой proposer может отнять несколько гигабайт VRAM у target KV pool. Если сервер был memory-capacity-bound, это уменьшит `max_num_seqs` и aggregate throughput, несмотря на лучший single-request latency. Native MTP/EAGLE heads обычно компактнее, но тоже имеют parameters/workspace. Поэтому capacity benchmark должен сравнивать maximum sustainable concurrency при одинаковой GPU memory fraction и context distribution. Иногда выгоднее разместить draft на другом GPU или использовать n-gram proposer без neural weights.

## Вопрос 149. Как высокая QPS нагрузка меняет стратегию включения speculative decoding?

## Вопрос 149.1. Когда имеет смысл автоматически отключать speculative decoding по мере роста нагрузки?

## Вопрос 149.2. Почему low-latency optimization одного request может вредить queue latency при high QPS?

**Ответ**

При высоком QPS (кью-пи-эс; Queries Per Second — запросов в секунду) target decode naturally batch-ится и хорошо использует GPU. Speculation добавляет extra tokens и proposer work, поэтому marginal benefit падает. Практичный scheduler может включать speculation только при низкой active-sequence count, для latency-sensitive priority class или в начале/конце traffic valleys. Это adaptive serving policy, а не статический model option. Нужно следить за queue depth и goodput: если speculation снижает per-request TPOT, но увеличивает queue time новых requests, пользовательский end-to-end latency может ухудшиться. Решение принимают по SLO-weighted system metrics.

## Вопрос 150. Как построить корректный benchmark speculative decoding?

## Вопрос 150.1. Какие нагрузки и метрики нужны для честного baseline-vs-speculative comparison?

## Вопрос 150.2. Почему benchmark speculation на одном prompt и batch=1 не позволяет выбирать production configuration?

**Ответ**

Сравнение проводят с тем же target checkpoint, precision, tokenizer, sampling и serving engine; меняется только speculative path. Нужны разные regimes: batch=1 interactive latency, moderate concurrency и saturated throughput. Разделяют prompt/output lengths и domains, поскольку acceptance очень workload-dependent. Записывают TTFT, TPOT, output throughput, acceptance length, proposer/verification time, VRAM и maximum stable concurrency. Для lossless sampling проверяют quality/distribution equivalence. Обязательно включают warmup и одинаковый arrival process. Итог — не одна цифра speedup, а область нагрузок, где method улучшает goodput при заданных latency SLO.

## Вопрос 151. Почему стоимость exact self-attention на prefill растёт квадратично по длине контекста?

## Вопрос 151.1. Почему FlashAttention не превращает full-attention prefill из O(T²) в O(T)?

**Ответ**

На prefill (предварительной обработке prompt) каждый из T query tokens взаимодействует со всеми допустимыми предыдущими key positions, поэтому attention score space имеет порядка T² элементов. Для одного head вычисление QKᵀ и последующего умножения на V имеет O(T²·d) arithmetic complexity, где d — head dimension. Causal mask уменьшает константу примерно вдвое, но не меняет асимптотику. FlashAttention сокращает memory traffic и не материализует полную score matrix, однако exact computation остаётся квадратичным. Поэтому удлинение prompt с 32K до 128K может резко увеличить prefill work даже при достаточном KV memory.

## Вопрос 152. Почему attention-часть cached decode растёт примерно линейно с длиной уже накопленного контекста?

## Вопрос 152.1. Почему один новый токен на 128K context дороже attention-wise, чем на 4K context?

**Ответ**

При cached decode (декодировании с KV cache) новый query относится обычно к одному токену и сравнивается со всеми T сохранёнными keys. Поэтому attention work для этого шага порядка O(T·d), а чтение K/V также растёт линейно с T. Проекции и MLP для нового token не растут с context length, поэтому на очень длинных sequences доля attention/KV bandwidth становится всё заметнее. Суммарно генерация N новых токенов поверх длинного контекста включает последовательность всё более дорогих decode steps. Sliding-window или cache compression ограничивают этот рост, но уже изменяют архитектурные/quality trade-offs.

## Вопрос 153. Почему заявленное context window модели нужно разделять на architectural limit, runtime limit и validated quality limit?

## Вопрос 153.1. Почему `max_model_len=128000` в конфиге не доказывает качественную работу модели на 128K?

**Ответ**

Architectural limit (архитектурный предел) задаётся positional scheme и attention design; runtime limit — тем, сколько токенов engine позволяет и способен разместить по памяти; quality limit — длиной, на которой модель реально сохраняет нужную способность retrieval/reasoning. Эти три значения могут не совпадать. Runtime может разрешить 256K через RoPE scaling и достаточный KV pool, но модель, обученная на существенно меньших длинах, деградирует. И наоборот, checkpoint поддерживает long context, но engine ограничен memory или неподдерживаемым kernel. Production спецификация должна фиксировать проверенный context при конкретной model revision и serving configuration.

## Вопрос 154. Что делает YaRN при расширении RoPE-based context?

## Вопрос 154.1. Какую проблему long context решает YaRN и какие проблемы он принципиально не решает?

**Ответ**

YaRN (ярн; Yet another RoPE extensioN — метод расширения rotary positional encoding) модифицирует частоты RoPE и сочетает interpolation/extrapolation идеи так, чтобы расширить эффективный context с меньшей деградацией, чем простое linear scaling. Метод также вводит attention-related scaling и предполагает fine-tuning или адаптацию на расширенных длинах в исходной работе. Для serving engineer важно точно воспроизвести model-specific RoPE parameters: неправильный factor или original context length меняет positional geometry. YaRN не уменьшает KV memory и exact-attention complexity; он решает прежде всего positional generalization, а performance-проблемы long context остаются.

## Вопрос 155. Почему context extension без дообучения может работать технически, но плохо по качеству?

## Вопрос 155.1. Почему отсутствие OOM на 128K не означает, что модель действительно умеет пользоваться 128K контекстом?

**Ответ**

Inference engine способен вычислить positions за training range, если positional encoding допускает scaling/extrapolation, но веса attention/MLP не обязательно научились использовать такие дальние зависимости. Модель может демонстрировать lost-in-the-middle behavior, плохой retrieval на отдельных позициях или нестабильное reasoning. Поэтому успешный allocation 128K KV и отсутствие NaN — лишь runtime correctness. Нужны position-stratified tests: needle retrieval на разных depths, multi-document QA, long-code tasks и generation near maximum length. Если extension применяется через custom RoPE parameters, эти параметры становятся частью model artifact и должны version-иться вместе с checkpoint.

## Вопрос 156. Что такое attention sinks и почему несколько начальных токенов иногда сохраняют при sliding-window inference?

## Вопрос 156.1. Почему sliding-window cache иногда хранит несколько самых первых токенов наряду с последними?

**Ответ**

Attention sinks (токены-«стоки» внимания) — ранние positions, на которые модель может направлять заметную attention mass независимо от их семантической важности. StreamingLLM показал, что при постоянном sliding window удаление самых первых tokens способно резко ухудшать стабильность, а сохранение небольшого набора sink tokens вместе с recent window помогает поддерживать streaming inference. Это approximation относительно full context: старое содержимое всё равно забывается. Метод полезен для бесконечного stream-like processing, но не заменяет long-context model, если задача требует точного доступа к давним фактам.

## Вопрос 157. Как sliding-window attention сравнить с full attention для production long-context workload?

## Вопрос 157.1. Когда ограниченное attention window является разумным компромиссом, а когда ломает задачу?

**Ответ**

Sliding-window attention ограничивает compute/KV рост и делает latency предсказуемее, но каждый local layer видит только последние W tokens. Full attention сохраняет прямой доступ ко всему prefix, но prefill и KV cost растут с длиной. Если architecture была обучена с windowed attention, это штатный режим; насильственно обрезать cache у full-attention checkpoint — approximation. Сравнение должно включать task dependency distance: чат с недавним контекстом может почти не пострадать, а поиск факта 50K tokens назад — критично. Метрики quality и cost строят по одинаковым effective history requirements.

## Вопрос 158. Как H2O выбирает, какие KV positions сохранить при ограниченном cache budget?

## Вопрос 158.1. По какому сигналу heavy-hitter KV eviction решает, какие старые токены оставить?

**Ответ**

H2O (эйч-ту-оу; Heavy-Hitter Oracle — метод heavy-hitter KV retention) использует наблюдаемую accumulated attention importance, чтобы удерживать небольшой набор historically important tokens, одновременно сохраняя recent tokens. Идея основана на том, что attention часто концентрируется на подмножестве positions. При переполнении менее значимые entries вытесняются. Это уменьшает KV footprint, но selection зависит от прошлой attention и является lossy: будущий query может внезапно потребовать ранее удалённый token. Поэтому метод требует evaluation на workload, где long-range dependencies репрезентативны, и сравнения с lossless quantization/offload.

## Вопрос 159. В чём идея SnapKV и почему выбор KV positions можно делать по prompt observation window?

## Вопрос 159.1. Как SnapKV пытается предсказать важные части длинного prompt до начала основной генерации?

**Ответ**

SnapKV (метод сжатия KV cache) наблюдает attention patterns около конца prompt и выбирает небольшой набор исторических positions, которые считаются важными для последующей generation, обычно с clustering/pooling вокруг selected positions. Это позволяет один раз сократить prompt KV перед decode и затем генерировать с меньшим cache. Подход предполагает, что attention preferences в observation window предсказывают важные context regions для будущих tokens. Если задача меняет focus по ходу длинной генерации, assumption может нарушиться. Поэтому speed/memory savings нужно оценивать вместе с long-context accuracy, а не воспринимать compression ratio как бесплатный.

## Вопрос 160. Что делает KIVI и почему keys и values могут требовать разной quantization granularity?

## Вопрос 160.1. Почему KIVI не использует одну и ту же quantization granularity для K и V?

**Ответ**

KIVI (метод низкобитного KV-cache quantization) исследует asymmetric structure distributions keys и values и использует 2-bit representation с разной granularity: keys удобнее квантовать per-channel, values — per-token, сохраняя небольшой residual cache высокой precision для последних tokens. Идея позволяет заметно сократить KV memory без удаления positions. В отличие от eviction-based methods весь context логически остаётся доступен, но значения приближены. Production implementation должен иметь efficient packed attention kernel; иначе theoretical memory reduction сопровождается costly dequantization. Quality проверяют особенно на длинном context.

## Вопрос 161. Какие три основных класса методов уменьшают стоимость KV cache и чем различаются их риски?

## Вопрос 161.1. Чем KV quantization, pruning и offload принципиально отличаются по quality/latency trade-off?

**Ответ**

Первый класс — quantization (квантование): сохраняет все positions, но снижает precision; риск — numerical quality degradation. Второй — eviction/pruning (удаление): хранит subset tokens; экономия выше, но потерянный context недоступен. Третий — offload/hierarchical caching (выгрузка): сохраняет точные данные вне GPU; quality не меняется, но появляется transfer latency и bandwidth dependency. Sliding-window — архитектурно или приближённо ограничивает историю. Выбор зависит от того, что ограничивает систему: VRAM capacity, decode bandwidth или latency. Часто методы комбинируют, например FP8 cache плюс CPU tier, но взаимодействие нужно benchmark-ить.

## Вопрос 162. Почему TTFT длинного prompt растёт не только из-за attention, но и из-за tokenization и queueing?

## Вопрос 162.1. Как разложить TTFT 100K-token запроса, чтобы не обвинять attention без доказательств?

**Ответ**

Для длинного prompt prefill GPU work действительно растёт существенно, но end-to-end TTFT включает CPU tokenization, request parsing, scheduler queue и возможный chunking. 500K-character document может занять заметное CPU время до попадания в engine; затем admission policy может задержать его, потому что request требует большой token budget. Чтобы диагностировать рост, логируют timestamps по стадиям и строят TTFT против input tokens. Если `prefill_time` растёт ожидаемо, оптимизируют kernels/cache reuse; если `queue_time` доминирует, нужен scheduler/capacity; если tokenizer — parallel/native tokenization.

## Вопрос 163. Что такое context parallelism и какую проблему long-context inference он решает?

## Вопрос 163.1. Чем context parallelism отличается от tensor parallelism при обработке одной очень длинной sequence?

**Ответ**

Context parallelism (параллелизм по контексту) распределяет tokens одной длинной sequence между несколькими GPUs, чтобы разделить activation/KV memory и attention work. В отличие от tensor parallelism, который шардирует model dimensions, context parallelism масштабирует именно sequence dimension. Attention требует обмена K/V или промежуточными результатами между participants, поэтому communication pattern зависит от algorithm — ring, all-gather, all-to-all и архитектуры attention. Метод полезен, когда один context не помещается или prefill слишком дорог на одном device. Цена — interconnect traffic и более сложные kernels; для коротких prompts он может быть медленнее.

## Вопрос 164. Как ring attention позволяет распределить exact attention по sequence dimension?

## Вопрос 164.1. Как exact attention вычислить на нескольких GPU, не реплицируя весь K/V контекст на каждый?

**Ответ**

Ring attention (кольцевое внимание) делит sequence blocks между devices. Каждый GPU держит локальный Q block, а K/V blocks циркулируют по ring; на каждом шаге вычисляется вклад локальных queries к очередной части K/V, после чего online softmax объединяет partial results. Так full exact attention можно выполнить без хранения всей sequence на каждом GPU. Communication можно перекрывать с computation, если blocks достаточно крупные и fabric быстрый. Для causal attention часть взаимодействий можно пропускать. Эффективность падает, когда network latency/volume превышает saved local compute/memory benefit.

## Вопрос 165. Почему context parallelism особенно полезен на prefill, но сложнее оценить для decode?

## Вопрос 165.1. Почему sequence sharding хорошо масштабирует длинный prompt, но может добавить latency каждому decode step?

**Ответ**

Prefill длинного context содержит много token-parallel work и большие attention matrices, поэтому распределение sequence dimension даёт достаточно compute, чтобы amortize communication. На decode появляется всего один новый query token, а historical K/V распределены по devices; каждому шагу нужно собрать partial attention result через communication. При batch=1 network latency может доминировать. Однако при огромном KV и высокой concurrency context parallelism может оставаться необходимым по capacity. Поэтому конфигурацию prefill и decode иногда различают или используют disaggregation: context-parallel prefill и другой decode placement.

## Вопрос 166. Как prefix caching меняет экономику повторной работы с одним длинным документом?

## Вопрос 166.1. Как перестановка query и длинного документа в prompt может радикально изменить prefix-cache hit rate?

**Ответ**

Если много requests используют идентичный длинный document prefix, prefix caching (кэширование префикса) превращает дорогой repeated prefill в одно вычисление плюс небольшие suffixes. На 100K-token document saved compute может быть огромным, поэтому даже умеренный request-level hit rate экономически значим. Но document должен находиться в токенизированном prompt в той же позиции и version. Если каждый query вставляется перед document или меняется metadata в начале, common prefix исчезает. Поэтому prompt layout становится performance design: стабильный shared content размещают раньше, переменную user query — позже, если model quality позволяет.

## Вопрос 167. Почему множество уникальных длинных документов может вызвать cache churn и ухудшить serving?

## Вопрос 167.1. Почему кэшировать каждый 100K-token prompt иногда хуже, чем вообще не принимать его в prefix cache?

**Ответ**

Cache churn (постоянное вытеснение и повторное заполнение кэша) возникает, когда working set длинных prefixes существенно больше GPU/host cache. Каждый новый документ занимает много blocks, вытесняет другие, а следующий request снова выполняет дорогой prefill. Hit rate падает, eviction bandwidth и allocator work растут. Симптомы — высокая KV occupancy почти постоянно, частые evictions и низкие reused-token counts. Решения: admission в cache только для prefixes с ожидаемым reuse, hierarchical storage, tenant quotas, larger cache pool или RAG вместо полного document stuffing. LRU без cost-awareness может особенно плохо работать с гигантскими одноразовыми prompts.

## Вопрос 168. Как chunked prefill помогает обслуживать 100K+ context без разрушения latency соседних requests?

## Вопрос 168.1. Что получает и что теряет 100K-token request при включении chunked prefill?

**Ответ**

Chunked prefill (обработка prompt порциями) ограничивает число новых prompt tokens в одном scheduler iteration. Вместо монолитного 100K prefill GPU выполняет, например, несколько chunks, между которыми обслуживает decode других sequences. Это уменьшает head-of-line blocking и p99 inter-token latency, а также может снизить peak temporary memory. Сам общий prefill compute не исчезает и TTFT длинного request иногда растёт из-за interleaving. Chunk size выбирают по SLO: interactive system обычно жертвует частью TTFT длинного запроса, чтобы сохранить плавность уже начатых streams.

## Вопрос 169. Long-context запросы начали давать OOM только под concurrency. Как локализовать причину?

## Вопрос 169.1. Как отличить нормальное исчерпание KV pool от memory leak при long-context serving?

**Ответ**

Сначала отделите static model memory от dynamic KV и workspace. Запишите input/output token lengths active sequences в момент OOM, KV block usage, allocator free pages и preemption events. Рассчитайте ожидаемый KV bytes по architecture и precision; если prediction совпадает с ростом, причина — capacity, а не leak. Затем воспроизведите controlled sweep concurrency×context length. Если memory не освобождается после completion/cancel, исследуйте reference counts/cache retention. Если spikes зависят от prefill length, проверьте attention workspace/graph captures. Исправление подтверждают устойчивым soak test без monotonic memory growth и с ожидаемым rejection/preemption behavior.

## Вопрос 170. Как проверить long-context quality отдельно от способности runtime принять длинный prompt?

## Вопрос 170.1. Какая evaluation отличает «движок не падает на 128K» от «модель полезно использует 128K»?

**Ответ**

Нужно строить evaluation по позиции и типу зависимости. Простые needle-in-a-haystack tests проверяют retrieval факта на разных depths, но их недостаточно: добавляют multi-needle, conflicting documents, summarization, long-code dependency и reasoning, требующее объединить удалённые части. Измеряют quality по длинам от обычной до near-limit и сравнивают с short-context baseline. Важно исключить truncation/tokenizer bugs и проверить фактические token positions. Если runtime использует RoPE scaling, KV quantization или compression, каждую оптимизацию тестируют отдельно, иначе невозможно определить источник degradation.

## Вопрос 171. Когда длинный context разумнее заменить retrieval, а не просто передавать весь corpus в prompt?

## Вопрос 171.1. По каким признакам выбрать RAG вместо stuffing огромного документа в context window?

**Ответ**

Retrieval (извлечение релевантных фрагментов) уменьшает input tokens, prefill cost и KV memory, но добавляет индекс, retrieval latency и риск пропустить нужный evidence. Full long context сохраняет весь материал и упрощает pipeline, однако цена растёт с длиной и модель может хуже использовать далёкую информацию. Решение зависит от corpus size, query selectivity, reuse, update frequency и quality. Если каждый запрос относится к 2–3 фрагментам из миллионов документов, retrieval почти неизбежен. Если документ один, относительно стабилен и многократно переиспользуется через prefix cache, long-context serving может быть конкурентоспособным.

## Вопрос 172. Почему неправильный учёт absolute position при prefix reuse может испортить RoPE attention?

## Вопрос 172.1. Почему KV block нельзя произвольно переставить в другую позицию sequence у RoPE-модели?

**Ответ**

RoPE (Rotary Position Embedding — вращательное позиционное кодирование) кодирует position непосредственно в Q/K rotations. Cached K для token position 100 нельзя без преобразования считать K позиции 5000. Поэтому prefix reuse корректен, когда reused tokens занимают те же logical positions и runtime продолжает position IDs с правильного offset. Некоторые advanced cache/rebase methods умеют преобразовывать state, но обычный prefix cache — нет. Bug особенно коварен: tensor shapes правильные, сервер не падает, но attention geometry меняется и quality деградирует. Regression test должен сравнивать cached и uncached outputs на разных prefix lengths.

## Вопрос 173. Как image/audio tokens в multimodal LLM влияют на prefill и KV cache?

## Вопрос 173.1. Почему одна картинка может заметно увеличить TTFT и KV memory, хотя текстовый prompt короткий?

**Ответ**

Multimodal encoder превращает изображение, аудио или видео в embeddings/tokens, которые затем участвуют в language-model context. Сотни или тысячи visual tokens увеличивают effective sequence length, prefill compute и KV cache примерно так же, как text tokens на decoder side; отдельно оплачивается vision/audio encoder. Некоторые architectures используют cross-attention и имеют другой cache structure. Поэтому лимит «текстовых токенов» не описывает полную стоимость. Capacity planning должен учитывать distribution media resolutions/durations, число resulting tokens и возможность cache/reuse encoder outputs. Два API requests с одинаковым текстом могут иметь радикально разный GPU footprint.

## Вопрос 174. Какие дополнительные условия нужны для безопасного prefix caching multimodal prompts?

## Вопрос 174.1. Почему placeholder `<image>` нельзя использовать как единственный cache key для vision-language request?

**Ответ**

Для multimodal prefix cache (кэша префикса с изображениями/аудио) одинаковых text token IDs недостаточно. Cache key должен учитывать media content или stable media hash, preprocessing parameters, encoder revision, resolution/crop policy и полученные embeddings. Иначе два разных изображения с одинаковым placeholder token могут ошибочно разделить KV state. Кэширование encoder outputs также требует versioning. Privacy risk выше, потому что media может быть tenant-sensitive. Поэтому modern runtimes включают multimodal-specific hashes/UUIDs или namespace attributes. False miss лишь уменьшает performance; false hit создаёт неверный ответ и потенциальную cross-user leakage.

## Вопрос 175. Почему agentic workload создаёт особенно быстро растущий context и как это отражается на inference?

## Вопрос 175.1. Почему AI agent может съедать context и GPU capacity намного быстрее обычного single-turn chat?

**Ответ**

Agentic loop (агентный цикл) на каждом шаге добавляет assistant reasoning/output, tool call, tool result и новые instructions. Контекст растёт быстрее обычного чата, а десятки steps создают repeated prefill, если KV/session state не reuse-ится. Tool outputs могут быть огромными JSON/HTML blobs, резко увеличивая TTFT и KV memory. Поэтому inference optimization включает context hygiene: ограничение tool payloads, summarization/compaction, stable prefix caching и session-aware reuse. В 2026 agentic inference уже выделяется как отдельный benchmark class, потому что latency/cost определяется многократными model invocations, а не одной completion.

## Вопрос 176. Из каких основных компонентов состоит vLLM-подобный inference engine?

## Вопрос 176.1. Какие подсистемы кроме CUDA kernels нужны полноценному LLM serving engine?

**Ответ**

Современный inference engine обычно разделяет frontend/API, tokenizer, request scheduler, KV-cache manager, model executor и output/sampling layer. Scheduler формирует token-level batches, cache manager выдаёт/освобождает paged KV blocks, executor запускает attention/GEMM kernels на одном или нескольких devices, а sampling layer выбирает output tokens и проверяет stopping conditions. Отдельно могут существовать prefix-cache index, multimodal preprocessors и distributed workers. Такое разбиение важно для профилирования: низкий throughput может быть вызван не model executor, а tokenizer, scheduler или cache bookkeeping. vLLM — один из production runtimes, реализующих подобную архитектуру вокруг PagedAttention и continuous batching.

## Вопрос 177. Чем RadixAttention в SGLang отличается от простого cache по полным prompt strings?

## Вопрос 177.1. Почему radix tree лучше точного hash lookup для повторяющихся, но не полностью одинаковых prompts?

**Ответ**

RadixAttention (radix-tree-based автоматическое reuse KV cache) организует cached token prefixes в radix tree, поэтому разные requests могут разделять не только полностью одинаковые prompts, но и максимально длинные общие prefixes. Узлы соответствуют token sequences/cache blocks, а tree поддерживает match, split и eviction. Это особенно полезно для multi-turn chats, few-shot templates и branching agent workloads. В отличие от hash map `full_prompt → KV`, reuse возможно на частичном совпадении. Цена — tree metadata, concurrency control и cache-aware scheduling. Эффективность определяется prefix locality traffic, а не самим фактом включения radix cache.

## Вопрос 178. Чем TensorRT-LLM engine отличается от более динамичного PyTorch-first serving path?

## Вопрос 178.1. Какие trade-offs возникают между highly specialized TensorRT serving и более гибким PyTorch runtime?

**Ответ**

TensorRT-LLM ориентирован на специализированные NVIDIA kernels, explicit engine/runtime configuration и глубокое использование аппаратных возможностей — low precision, fused attention, in-flight batching и distributed mappings. PyTorch-first runtimes обычно быстрее адаптируют новые architectures и позволяют более динамичный execution, используя custom kernels, `torch.compile` и CUDA Graphs. Это не означает автоматически «TensorRT быстрее всегда»: build complexity, supported model features, shapes и version lag могут изменить результат. Инженер выбирает по целевой NVIDIA hardware, model support, latency/throughput SLO, rollout speed и observability. Benchmark нужен на конкретном revision, а не по репутации framework.

## Вопрос 179. Как в 2026 году следует относиться к Hugging Face TGI при выборе нового serving runtime?

## Вопрос 179.1. Стоит ли в 2026 начинать новый production deployment на TGI и что учитывать для существующего?

**Ответ**

TGI (ти-джи-ай; Text Generation Inference — сервер генерации текста Hugging Face) сыграл важную роль в production LLM serving и поддерживает continuous batching, Flash/PagedAttention, tensor parallelism и quantization. Однако актуальная документация Hugging Face к 2026 году помечает проект как maintenance mode (режим поддержки без активного развития) и рекомендует для новых endpoints рассматривать vLLM или SGLang, а для local inference — llama.cpp/MLX. Это не делает существующий TGI deployment немедленно плохим: миграцию оправдывают security/support risk, feature gap и measured economics, а не один статус проекта.

## Вопрос 180. Почему GGUF и llama.cpp особенно популярны для local/edge inference, но не являются универсальной заменой GPU datacenter runtimes?

## Вопрос 180.1. Почему llama.cpp может быть отличным выбором на ноутбуке и слабее подходить для большого multi-tenant API?

**Ответ**

GGUF (формат хранения моделей и quantization metadata семейства llama.cpp) удобен для компактных low-bit checkpoints, memory mapping и CPU/heterogeneous offload. llama.cpp имеет широкую portability — CPU, Apple Silicon и разные GPU backends — поэтому силён на workstation/edge. Datacenter runtimes вроде vLLM/TensorRT-LLM обычно сильнее оптимизированы под large-concurrency continuous batching, multi-GPU parallelism и fleet observability. На single-user локальном запуске overhead сложного server scheduler не нужен; на сотнях concurrent API requests он критичен. Выбор определяется deployment shape, а не тем, какой формат «лучше вообще».

## Вопрос 181. Какую роль играет FlashInfer в современных LLM runtimes?

## Вопрос 181.1. Зачем serving framework использовать отдельную kernel-библиотеку вроде FlashInfer?

**Ответ**

FlashInfer — библиотека высокопроизводительных GPU kernels и primitives для LLM inference: attention для разных cache layouts, sampling, GEMM-related paths, communication и emerging architectures. Serving systems могут использовать её как backend вместо написания каждого kernel самостоятельно. Ценность — оптимизированные implementations для prefill/decode, paged KV и разных attention variants. Но подключение backend не гарантирует speedup: model shape, GPU generation, precision и scheduler определяют, какой kernel реально выбирается. При regression нужно логировать backend selection и профилировать конкретный path, потому что fallback на другой kernel может объяснить внезапное изменение latency.

## Вопрос 182. Что может дать `torch.compile` inference runtime и почему graph breaks снижают пользу?

## Вопрос 182.1. Почему `torch.compile(model)` может почти не ускорить dynamic LLM serving, если execution постоянно разрывает graph?

**Ответ**

`torch.compile` (компиляция PyTorch graph) пытается объединить и специализировать операции, уменьшить Python overhead и сгенерировать более эффективные kernels через compiler stack. Для LLM inference выигрыш зависит от того, насколько стабильна graph structure и поддерживаются custom attention/cache operations. Graph break (разрыв графа) заставляет часть execution вернуться в eager mode и создаёт границы, через которые compiler не может оптимизировать/fuse. Dynamic shapes, Python-side control flow и unsupported ops повышают число breaks. Поэтому сначала используют compile diagnostics, затем устраняют наиболее дорогие breaks и сравнивают end-to-end, включая compilation/warmup cost.

## Вопрос 183. Как диагностировать graph breaks и recompilations в compiled LLM inference?

## Вопрос 183.1. Как доказать, что latency spikes вызваны recompilation, а не GPU congestion?

**Ответ**

Нужно включить compiler diagnostics/logging и посмотреть причины breaks, число unique compiled graphs и recompilation triggers. Частая причина — изменение tensor shapes, Python values или guards из-за dynamic batch. Затем коррелируют recompilation timestamps с latency spikes. Controlled test фиксирует batch/context shape: если steady state резко быстрее, а dynamic traffic вызывает compile misses, проблема подтверждена. Исправления — dynamic-shape-friendly code, bucketization/capture sizes, вынос Python control flow из compiled region или custom op boundary. В production следует прогреть типовые shapes и мониторить cache hit компилятора после rollout новой версии.

## Вопрос 184. Как PyTorch SDPA выбирает attention backend и почему фактический backend нужно проверять?

## Вопрос 184.1. Почему вызов PyTorch SDPA ещё не означает, что реально выполняется FlashAttention?

**Ответ**

SDPA (эс-ди-пи-эй; Scaled Dot Product Attention — масштабированное скалярное внимание) в PyTorch предоставляет единый API и может выбрать FlashAttention, memory-efficient/fused backend или math implementation в зависимости от device, dtype, shapes и flags. Если быстрый backend не поддерживает конкретную комбинацию mask/GQA/dtype, framework может выбрать другой path или выдать warning. Поэтому наличие вызова `scaled_dot_product_attention` не доказывает использование FlashAttention. Для performance regression проверяют backend diagnostics/profiler. Тот же model code после изменения sequence shape или PyTorch version способен попасть на другой kernel и изменить latency без изменения архитектуры.

## Вопрос 185. Когда sampling и logits processing становятся заметным bottleneck после model forward?

## Вопрос 185.1. Почему после сильной оптимизации основной LLM bottleneck может неожиданно переместиться в top-p/sampling?

**Ответ**

При очень быстрой или сильно квантованной model, большом vocabulary, большом batch либо сложных constraints операции над logits могут занимать существенную долю decode step. Temperature, penalties, top-k/top-p, grammar masks и softmax затрагивают десятки тысяч vocabulary entries. Если они выполняются отдельными kernels с multiple reads/writes или на CPU, появляется latency и synchronization. Профиль показывает значительное время после lm_head до следующего model step. Решения — fused GPU sampling, reduced candidate sets, efficient grammar kernels и асинхронная обработка output. Оптимизировать это стоит только после измерения: у крупных models forward обычно всё ещё доминирует.

## Вопрос 186. Как CPU tokenization масштабировать для high-QPS LLM API?

## Вопрос 186.1. Как не дать tokenization больших prompts стать CPU bottleneck перед быстрым GPU engine?

**Ответ**

Tokenization (преобразование текста в token IDs) параллелится независимо между requests и часто выполняется Rust/C++ backend, освобождающим Python GIL. Для high QPS используют worker pool, batching tokenizer calls и backpressure, чтобы огромные prompts не монополизировали CPU. Нельзя бесконтрольно запускать по thread на request: contention и memory allocations ухудшат tail latency. Метрики — chars/tokens per second, tokenization queue time и CPU utilization. Ещё полезно принимать уже tokenized inputs только в доверенном internal API, потому что externally supplied IDs обходят text validation/template semantics и могут создавать security/correctness проблемы.

## Вопрос 187. Почему формат safetensors удобен для загрузки LLM checkpoints?

## Вопрос 187.1. Какие преимущества safetensors относятся к loading/security, а какие не имеют отношения к runtime tokens/s?

**Ответ**

safetensors — формат tensor storage без произвольного executable pickle code, с metadata и возможностью эффективно читать участки файла. Это уменьшает security risk загрузки untrusted Python pickle и позволяет memory-mapped/parallel loading patterns. Для огромных sharded checkpoints startup всё равно зависит от storage bandwidth, filesystem cache и conversion/quantization steps. Формат не ускоряет model execution после загрузки. Production pipeline должен pin конкретные model revisions, проверять hashes и избегать автоматического исполнения remote model code без review; safetensors решает только часть supply-chain surface, а не всю проблему доверия checkpoint.

## Вопрос 188. Как memory mapping model files влияет на startup и resident memory?

## Вопрос 188.1. Почему mmap ускоряет открытие большого checkpoint, но не отменяет перенос weights на GPU?

**Ответ**

Memory mapping (отображение файла в виртуальную память) позволяет ОС подгружать страницы по требованию и избегать дополнительной user-space копии всего checkpoint. Для CPU/edge inference это может существенно сократить startup и сделать shared file-backed pages удобными. Но первое обращение вызывает page faults и storage reads; если benchmark начинается сразу, cold latency будет нестабильной. На GPU weights всё равно нужно передать в device memory, если backend не использует unified/offloaded memory. Поэтому mmap оптимизирует loading path, а не автоматически GPU inference. Измеряют cold/warm page-cache modes отдельно.

## Вопрос 189. Как sharded checkpoint loading ускорить на multi-GPU server?

## Вопрос 189.1. Почему восемь GPU не делают загрузку checkpoint в восемь раз быстрее без правильного sharding/storage path?

**Ответ**

Если checkpoint разбит на shards, каждый worker должен читать только нужные tensor partitions либо загрузка должна эффективно scatter-ить данные. Узкое место может быть shared network filesystem: 8 GPUs одновременно читают сотни гигабайт и насыщают storage, не PCIe. Используют local NVMe cache, parallel readers с ограниченной concurrency, topology-aware direct loading и заранее сохранённый runtime-specific sharded format. Метрики startup разбивают на storage read, deserialization, host-to-device copy и engine initialization. Если каждая replica сначала читает полный checkpoint, а затем отбрасывает ненужные weights, scale-out time и I/O расходуются впустую.

## Вопрос 190. Как Server-Sent Events применяются для streaming LLM tokens и где может появиться buffering?

## Вопрос 190.1. Почему хороший server TPOT может выглядеть как редкие пачки текста при SSE streaming?

**Ответ**

SSE (эс-эс-и; Server-Sent Events — серверные события) поверх HTTP позволяет серверу держать соединение и отправлять последовательные text events по мере генерации. Model engine может выдавать token каждые десятки миллисекунд, но reverse proxy, compression middleware или client library способны буферизовать данные до определённого размера. Тогда server-side TPOT хороший, а пользователь видит bursts. Диагностика сравнивает timestamp token-ready, write/flush и client-receive. Нужно корректно обрабатывать disconnect/cancellation, heartbeat/timeouts и backpressure медленного клиента, иначе finished GPU work продолжит занимать resources без потребителя.

## Вопрос 191. Как правильно обрабатывать cancellation LLM request во время генерации?

## Вопрос 191.1. Что должно произойти внутри serving engine после того, как клиент закрыл streaming connection?

**Ответ**

Cancellation (отмена запроса) должна пройти от HTTP disconnect/API signal до scheduler как можно быстрее. Scheduler прекращает новые decode steps, удаляет sequence из active batch и освобождает его KV blocks/reference counts. Для distributed request cancellation нужно распространить на все workers, не нарушив collective synchronization. Race возможен, если token step уже выполняется: обычно его завершают, затем безопасно освобождают state. Метрики abandoned requests и cancellation-to-resource-release latency помогают обнаружить утечки. Если frontend просто закрывает socket, но engine продолжает генерировать до `max_tokens`, система тратит GPU capacity на результат, который никто не получит.

## Вопрос 192. Чем request timeout отличается от model-generation stopping condition?

## Вопрос 192.1. Почему HTTP timeout и `max_tokens` решают разные проблемы и требуют разного cleanup?

**Ответ**

Timeout (тайм-аут) — platform policy по wall-clock времени: request может быть отменён из-за слишком долгой очереди, TTFT или общей длительности независимо от того, закончила ли model semantic generation. EOS/stop/max_tokens — model/decoding conditions. Timeout должен приводить к cleanup KV state и понятному error status, а не просто разрыву gateway socket. Полезно разделять queue timeout и execution timeout: первый защищает SLO при overload, второй — от pathological long generations. При distributed serving нужна idempotent cancellation, чтобы поздний worker response не воскресил уже завершённый request.

## Вопрос 193. Как guided decoding по JSON Schema обычно ограничивает vocabulary на каждом шаге?

## Вопрос 193.1. Как JSON Schema превращается в token mask при constrained LLM generation?

**Ответ**

Guided decoding (направляемая генерация) компилирует JSON Schema/grammar в automaton или другой constraint state. На каждом token step backend определяет, какие tokenizer tokens могут продолжить хотя бы одну валидную строку, и маскирует остальные logits перед sampling. После выбранного token constraint state обновляется. Сложность возникает из-за токенов, содержащих несколько символов или частичные JSON fragments: нельзя проверять только следующий character. Хорошие backends precompute/cache transitions и выполняют mask эффективно. Гарантия syntactic validity не гарантирует semantic correctness значений — model может вернуть валидный, но неверный JSON.

## Вопрос 194. Почему сложная grammar может ухудшить decode latency даже при том же количестве output tokens?

## Вопрос 194.1. Почему structured output может иметь худший TPOT, хотя target model и длина ответа те же?

**Ответ**

Grammar constraint (грамматическое ограничение) добавляет работу на каждом decode step: вычисление допустимых tokens, применение mask, обновление automaton state и иногда CPU↔GPU synchronization. Большой vocabulary и сложные regex/JSON alternatives увеличивают cost. Если backend не cache-ит transitions, одинаковые prefixes пересчитываются. Кроме того, ограничения меняют speculative acceptance и могут отключить некоторые fused sampling paths. Профилируют время constraint engine отдельно от model forward. Ускорение — precompiled grammar, cached token transitions, GPU-friendly masks и simplification schema. Сначала убедитесь, что bottleneck действительно grammar, а не longer outputs из-за schema.

## Вопрос 195. Как реализовать простую модель continuous batching на уровне scheduler logic?

## Вопрос 195.1. Как выглядит минимальный event loop iteration-level LLM scheduler?

**Ответ**

Упрощённый scheduler хранит waiting и running queues. На каждом iteration он удаляет завершённые sequences, освобождает их cache, допускает новые requests в пределах memory/token budget и формирует один decode token для каждой running sequence плюс допустимые prefill chunks. После model step результаты обновляют state и stopping conditions. Псевдокод:

```python
while True:
    retire_finished()
    admit_waiting()
    batch = build_token_budget()
    outputs = model_step(batch)
    update_sequences(outputs)
```

Production implementation значительно сложнее: variable-length KV pages, priorities, preemption, asynchronous execution и distributed synchronization. Но ключевое отличие от static batching видно: состав `running` меняется между model steps.

## Вопрос 196. Как устроить минимальный allocator фиксированных KV blocks и какие инварианты нужно защищать?

## Вопрос 196.1. Какие invariants предотвращают double-free и corruption в paged KV allocator?

**Ответ**

Block allocator (распределитель фиксированных KV-страниц) может хранить stack свободных block IDs и reference count занятых страниц. `allocate()` извлекает свободный ID; `retain()` увеличивает счётчик при shared prefix; `release()` уменьшает его и возвращает block в free pool только при нуле. Критические инварианты: один physical block не выдаётся двум mutable owners, refcount не становится отрицательным, cancelled request освобождает все references. В concurrent engine операции должны быть синхронизированы или принадлежать одному scheduler thread. Stress test генерирует случайные allocate/share/release sequences и после каждой операции проверяет `free + uniquely allocated == capacity`.

## Вопрос 197. Как реализовать LRU для reusable prefix blocks и не удалить KV активного запроса?

## Вопрос 197.1. Как совместить prefix-cache eviction с reference counting активных sequences?

**Ответ**

LRU (Least Recently Used — вытеснение наименее недавно использованного) должен разделять cache ownership и active references. Block, refcount которого больше нуля из-за running sequence, не является eviction candidate. Свободные reusable blocks помещают в recency structure; cache hit обновляет timestamp/позицию. При нехватке страницы allocator evict-ит oldest unpinned entry и удаляет его из prefix index. В tree cache нужно evict leaves или корректно обновлять ancestors. Тесты обязательно покрывают simultaneous reuse, cancellation и повторное выделение ID. Простая `OrderedDict` подходит для учебного prototype, но production hot path требует меньшего lock/allocation overhead.

## Вопрос 198. Как измерять TTFT и TPOT в клиентском Python benchmark без смешения clock sources?

## Вопрос 198.1. Какие timestamps нужны, чтобы корректно посчитать client-side TTFT и TPOT?

**Ответ**

Используйте monotonic high-resolution clock, например `time.perf_counter()`, и ставьте timestamps в одном процессе: перед отправкой request, при получении первого streamed chunk/token и после completion. TTFT=`t_first−t_start`; TPOT≈`(t_end−t_first)/(n_output−1)`. Для честности нужно считать именно model tokens через тот же tokenizer, а network benchmark явно называть end-to-end. Не используйте `datetime.now()` для durations: системное время может корректироваться. При SSE один chunk может содержать несколько tokens, поэтому точный ITL требует server-side token timestamps либо streaming granularity один token.

## Вопрос 199. Как задавать распределение prompt/output lengths в realistic load test?

## Вопрос 199.1. Почему `input=1K, output=256` для каждого запроса плохо моделирует реальный LLM traffic?

**Ответ**

Средние длины недостаточны: serving nonlinear по sequence length и memory. Возьмите production histogram или trace и сохраните joint distribution (совместное распределение) input/output lengths, потому что длинные prompts могут коррелировать с длинными answers. Если реальных данных нет, задайте несколько classes — short chat, medium RAG, long document — с долями и stochastic arrival process. Не заставляйте model всегда генерировать фиксированные N tokens, если в production часто появляется EOS: это меняет service time. Для controlled hardware comparison дополнительно полезны fixed-length synthetic tests, но их нужно отделять от capacity prediction.

## Вопрос 200. Как организовать warmup и повторения в performance benchmark, чтобы не измерять компиляцию вместо inference?

## Вопрос 200.1. Как benchmark отделяет cold-start cost от устойчивой скорости уже прогретого inference engine?

**Ответ**

Сначала отдельно измерьте cold startup, затем выполните warmup для типичных shapes, чтобы прошли JIT/`torch.compile`, CUDA Graph capture, allocator initialization и kernel autotuning. После этого собирайте steady-state samples достаточно долго, чтобы увидеть scheduler и thermal/clock variability. Не удаляйте первые медленные результаты молча: cold latency — отдельная production метрика. Для сравнения конфигураций используйте одинаковый порядок или randomization, фиксируйте software versions и report distributions p50/p95/p99, а не только mean. На shared cluster убедитесь, что network/storage/background load не менялся между runs.

## Вопрос 201. Когда tensor parallelism нужен для inference и как он шардирует Transformer layer?

## Вопрос 201.1. Как tensor parallelism делит один Transformer block между GPU и какой communication за это платит?

**Ответ**

Tensor parallelism, TP (ти-пи; Tensor Parallelism — тензорный параллелизм), делит крупные weight matrices одного layer между несколькими GPU. В типичном Transformer column/row-parallel схемы позволяют каждому device вычислять часть attention/MLP, после чего collective operations объединяют результаты. TP нужен, когда модель не помещается на одном accelerator или один GPU не даёт нужной latency. Цена — communication на каждом layer, обычно all-reduce/all-gather. Поэтому TP хорошо работает внутри узла с NVLink/NVSwitch, но может плохо масштабироваться через медленную сеть. Увеличивать TP сверх необходимого по памяти следует только после latency benchmark: communication способен перекрыть выигрыш от меньших локальных matrices.

## Вопрос 202. Как оценить, когда увеличение tensor parallel size перестаёт ускорять inference?

## Вопрос 202.1. Какими метриками найти границу, после которой дополнительный TP GPU только добавляет коммуникацию?

**Ответ**

С ростом TP локальный GEMM становится меньше и быстрее, но количество/объём collective communication остаётся значимым, а kernel efficiency может падать из-за маленьких shapes. Постройте scaling curve TP=1,2,4,8 при фиксированном batch/context и измерьте compute time, NCCL collective time, TTFT и TPOT. Точка diminishing returns появляется, когда saved GEMM time сравним с добавленным communication/synchronization. Для decode batch=1 это часто происходит раньше, чем для large prefill. Дополнительно topology важна: TP внутри NVLink island и TP между nodes — разные режимы. Оптимальный TP определяется SLO и memory, а не максимальным числом доступных GPU.

## Вопрос 203. Чем pipeline parallelism отличается от tensor parallelism в inference?

## Вопрос 203.1. Почему pipeline parallelism лучше переносит медленный межузловой interconnect, но может ухудшить single-request latency?

**Ответ**

Pipeline parallelism, PP (пи-пи; Pipeline Parallelism — конвейерный параллелизм), распределяет последовательные groups layers по GPU stages; token activations проходят stage за stage. TP шардирует один layer между devices и требует частых collectives внутри каждого layer. PP уменьшает требования к fast interconnect между всеми devices, но для одного request вводит serial stage latency и pipeline bubbles. Высокий batch/microbatch помогает заполнить конвейер; low-latency decode может страдать. PP полезен при multi-node model placement, когда TP через сеть слишком дорог, или когда модель просто не помещается в один TP domain. Часто используют гибрид TP×PP.

## Вопрос 204. Что такое pipeline bubble и почему autoregressive decode делает его особенно неприятным?

## Вопрос 204.1. Почему pipeline parallelism легче насытить training microbatches, чем одним streaming LLM request?

**Ответ**

Pipeline bubble (пустой такт конвейера) — время, когда часть PP stages простаивает, потому что activations ещё не пришли или уже прошли дальше. В training его уменьшают большим количеством microbatches. В autoregressive decode каждый request производит один token step, а следующий зависит от предыдущего; при маленькой concurrency недостаточно независимой работы, чтобы постоянно заполнять stages. Поэтому PP utilization может быть низкой и latency одного token включает прохождение всех stages. Continuous batching помогает, но не устраняет dependency. При выборе PP смотрят stage utilization и microbatch occupancy, а не только model-fit memory.

## Вопрос 205. Как data parallelism применяется к inference, если веса модели одинаковы на replicas?

## Вопрос 205.1. Почему inference data parallelism концептуально проще training DP, но routing cache делает его нетривиальным?

**Ответ**

Data parallelism, DP (ди-пи; Data Parallelism — параллелизм по данным), запускает несколько полных или одинаково шардированных replicas модели и распределяет между ними независимые requests. В отличие от training gradients не синхронизируются. DP масштабирует aggregate throughput почти линейно, пока load balancer и shared infrastructure не становятся bottleneck. Однако prefix/KV cache locality усложняет routing: случайное распределение теряет reuse, а строгая session affinity создаёт imbalance. Для MoE современные runtimes также связывают DP с expert parallelism, поэтому термин может означать более сложную hybrid topology. Capacity planning должен различать replica count и intra-replica TP/PP.

## Вопрос 206. Как expert parallelism распределяет MoE experts между GPU?

## Вопрос 206.1. Какая communication pattern возникает, когда MoE experts физически распределены по разным GPU?

**Ответ**

Expert parallelism, EP (и-пи; Expert Parallelism — параллелизм экспертов), размещает разные experts слоя Mixture-of-Experts на разных devices. Router выбирает top-k experts для каждого token, после чего tokens перераспределяются через all-to-all-like communication, experts выполняют свои FFN, а outputs возвращаются. EP экономит memory replication и позволяет масштабировать огромное число expert parameters, но performance зависит от token balance и network. Если один expert получает непропорционально много tokens, часть GPUs простаивает. Поэтому нужны load-balancing routing, capacity-aware kernels и быстрый interconnect. Для decode маленький token batch особенно чувствителен к communication latency.

## Вопрос 207. Почему MoE-модель с 600B total parameters может стоить по вычислениям ближе к гораздо меньшей dense model?

## Вопрос 207.1. Почему total parameter count плохо предсказывает latency Mixture-of-Experts модели?

**Ответ**

MoE (эм-оу-и; Mixture of Experts — смесь экспертов) содержит много expert parameters, но router активирует только top-k experts для каждого token. Поэтому total parameter count определяет storage/model-fit, а active parameters per token — значительную часть FLOPs. Например, сотни миллиардов stored weights не означают использование всех на каждом forward. Однако inference всё равно платит за routing, expert weight placement, all-to-all communication и load imbalance. Кроме experts остаются shared attention/dense layers. Поэтому сравнивать MoE и dense только по total parameters или только по active parameters одинаково неверно; нужны реальные bytes moved, FLOPs и topology.

## Вопрос 208. Что такое expert load imbalance и как он проявляется в production inference?

## Вопрос 208.1. Как обнаружить, что MoE decode тормозит не GEMM, а hot experts?

**Ответ**

Expert load imbalance (неравномерная загрузка экспертов) возникает, когда router направляет слишком много tokens в небольшой subset experts. В distributed EP весь step ждёт самых загруженных devices, поэтому p99 expert workload определяет iteration time. Симптомы — низкий average GPU utilization при высоком utilization отдельных ranks, большие all-to-all waits и variable TPOT в зависимости от prompt domain. Диагностика строит per-expert token counts, coefficient of variation и communication timeline. Исправления зависят от model/runtime: expert placement/replication, load-balancing router, redundant experts или EPLB (Expert Parallel Load Balancing — балансировка expert placement). Нельзя произвольно менять learned routing без quality validation.

## Вопрос 209. Как expert replication может уменьшить MoE hotspot и какой ценой?

## Вопрос 209.1. Когда стоит дублировать популярный MoE expert вместо добавления ещё одной полной model replica?

**Ответ**

Expert replication (репликация отдельных экспертов) создаёт несколько copies наиболее популярных experts на разных GPUs и распределяет routed tokens между ними. Это снижает hotspot и tail iteration time, особенно если routing distribution устойчиво skewed. Цена — дополнительная VRAM и необходимость runtime-aware routing к replica; если popularity меняется по workload, статическая replication быстро становится неэффективной. Некоторые systems dynamically rebalance expert placement по observed load. Решение сравнивают с увеличением EP/DP capacity: replicate нужно только там, где bottleneck действительно expert imbalance, иначе memory лучше использовать для KV cache или большей concurrency.

## Вопрос 210. Почему all-to-all communication является ключевым bottleneck expert parallelism?

## Вопрос 210.1. Почему MoE decode особенно чувствителен к latency interconnect даже при небольшом объёме данных?

**Ответ**

При EP каждый GPU сначала имеет tokens своего local batch, но selected experts могут находиться на других devices. Поэтому token activations отправляются owners экспертов и затем результаты возвращаются. All-to-all (обмен каждого со многими) создаёт большое число peer transfers, чувствительных к latency, bandwidth и network topology. На prefill крупные token batches дают хороший payload и amortization; decode может пересылать совсем небольшие messages, где latency доминирует. Оптимизации включают fused dispatch/combine kernels, topology-aware placement, DeepEP-like communication libraries и overlap с expert compute. Профилировать нужно bytes и wait time по ranks, а не только aggregate network bandwidth.

## Вопрос 211. Когда context parallelism лучше tensor parallelism для очень длинного prompt?

## Вопрос 211.1. Почему проблема model-fit и проблема context-fit требуют разных видов параллелизма?

**Ответ**

Если модель сама помещается на небольшом TP, но одна sequence создаёт чрезмерный KV/attention footprint, добавление TP шардирует model dimensions, однако не всегда достаточно эффективно делит sequence memory. Context parallelism, CP (си-пи; Context Parallelism — параллелизм по контексту), непосредственно распределяет token dimension и long-attention work. На очень длинном prefill это может масштабироваться лучше. Но CP требует communication K/V/partial attention, а на decode network latency может быть дорогой. Практичная topology может использовать минимальный TP для model fit и CP только для long-context class, вместо увеличения TP всем requests.

## Вопрос 212. Как sequence parallelism связан с tensor parallelism и зачем он уменьшает activation memory?

## Вопрос 212.1. Почему sequence parallel и context parallel нельзя считать автоматически одним и тем же механизмом?

**Ответ**

Sequence parallelism (параллелизм по последовательности) распределяет некоторые activations, normalization и elementwise operations по sequence dimension между TP ranks вместо их полной репликации. В training это хорошо известно как способ экономии activation memory; в inference идеи применяются к отдельным paths, особенно prefill. Он не тождественен full context parallel attention: attention может всё ещё требовать collective communication по model dimensions. Польза зависит от runtime implementation и layer layout. Термины в разных frameworks иногда различаются, поэтому архитектурное обсуждение должно описывать конкретно, какие tensors шардированы и какие collectives выполняются, а не ограничиваться названием режима.

## Вопрос 213. Как выбирать гибридную topology TP×PP×DP для большой dense модели?

## Вопрос 213.1. Как системно разложить 16–32 GPU между TP, PP и DP вместо выбора topology на глаз?

**Ответ**

Начните с model-fit: выберите минимальный TP×PP, при котором weights, KV reserve и workspace помещаются с headroom. Затем предпочитайте TP внутри fast-interconnect domain, а PP — через более медленные node boundaries, если это уменьшает per-layer collectives. Оставшиеся GPUs используйте как DP replicas для throughput. После этого benchmark-ите representative short/long requests: PP bubbles и TP collectives меняются с batch. Например, 16 GPUs могут быть лучше как 2 replicas по TP=8, чем один TP=16, если модель помещается в 8 и QPS высокий. Финальный критерий — goodput/SLO на total cluster cost.

## Вопрос 214. Почему topology-aware placement критичен для multi-GPU inference?

## Вопрос 214.1. Почему одинаковые восемь GPU могут давать разную inference скорость только из-за rank placement?

**Ответ**

Физические links неоднородны: GPUs могут быть соединены NVLink/NVSwitch внутри узла, PCIe через разные root complexes и InfiniBand между nodes. TP выполняет частые collectives, поэтому ranks нужно размещать на самых быстрых links; PP передаёт activations реже и лучше переносит network boundary. EP all-to-all также чувствителен к topology и fabric contention. Ошибка placement может сделать TP=8 через две машины значительно медленнее двух TP=4 replicas. Поэтому scheduler/orchestrator должен знать GPU topology, а benchmark фиксировать mapping ranks→devices. `nvidia-smi topo`/fabric telemetry полезнее абстрактного числа GPUs.

## Вопрос 215. Как NCCL collective latency проявляется в профиле tensor-parallel decode?

## Вопрос 215.1. Как отличить плохое TP scaling из-за NCCL от недостаточной эффективности локальных GEMM?

**Ответ**

NCCL (эн-си-си-эл; NVIDIA Collective Communications Library — библиотека коллективных коммуникаций) выполняет all-reduce/all-gather/reduce-scatter между TP ranks. В profiler после локальных GEMM появляются communication kernels, а следующий dependent layer ждёт их completion. На decode matrices маленькие, поэтому collective latency может составлять большую долю step. Признаки — слабое TP scaling, communication bars растут относительно compute и сильная зависимость от topology. Эксперименты: TP внутри одного NVLink node против cross-node, разные NCCL algorithms/channels, увеличение batch. Root cause считается доказанным, если локальные GEMM неизменны, а TPOT следует времени collectives.

## Вопрос 216. Как overlap communication с compute уменьшает стоимость tensor/expert parallelism?

## Вопрос 216.1. Почему визуально overlapped NCCL и GEMM ещё не гарантируют уменьшение end-to-end iteration time?

**Ответ**

Communication-compute overlap (перекрытие обмена и вычислений) запускает collective для одной части данных, пока GPU считает независимую другую часть. Для TP возможности ограничены strict layer dependencies, но можно chunk tensors или overlap communication отдельных projections. В MoE dispatch следующей группы tokens можно перекрывать с expert GEMM предыдущей. Выигрыш возможен только если compute и communication используют достаточно независимые hardware resources; конкуренция за HBM или SM может уменьшить эффект. Профиль должен показать сокращение critical path, а не просто визуальное наложение bars. Асинхронные collectives также усложняют buffer lifetime и error handling.

## Вопрос 217. Что происходит с GQA/MQA KV heads при tensor parallelism, если KV heads меньше TP size?

## Вопрос 217.1. Почему MQA-модель может плохо делить KV cache на большое число tensor-parallel ranks?

**Ответ**

В GQA/MQA число KV heads может быть меньше числа TP ranks. Нельзя бесконечно шардировать один head обычным head-wise способом, поэтому runtime может replicate KV heads между группами ranks или использовать специальное sharding. Такая replication увеличивает KV memory и attention work относительно наивной формулы `1/TP`. Особенно MQA с одним KV head ограничивает head-parallel scaling. Поэтому capacity planning должен учитывать implementation конкретного engine. TensorRT-LLM, например, явно описывает replication KV heads при некоторых TP configurations. Выбирать TP только по query heads без проверки KV layout может привести к неожиданному OOM.

## Вопрос 218. Как MLA меняет выбор parallelism относительно обычного GQA?

## Вопрос 218.1. Почему topology, оптимальная для Llama GQA, может быть плохой для DeepSeek MLA+MoE?

**Ответ**

MLA (Multi-head Latent Attention — многоголовое латентное внимание) хранит compressed latent KV state и имеет projection paths, не совпадающие с head-wise GQA. Поэтому оптимальное TP sharding зависит от latent dimensions, RoPE-specific components и fused MLA kernels. Для DeepSeek-class MoE models attention TP часто сочетают с expert parallelism для FFN, а memory bottleneck может смещаться от KV к expert weights/communication. Нельзя экстраполировать Llama topology. Нужно использовать runtime-specific parallel mapping, проверять latent cache replication и profiler collectives. Современные vLLM/TensorRT/SGLang имеют отдельные optimized MLA backends именно из-за этой архитектурной разницы.

## Вопрос 219. Что такое Wide-EP и когда большое число expert-parallel ranks становится полезным?

## Вопрос 219.1. Почему very-wide expert parallelism лучше подходит high-throughput MoE workload, чем одинокому chat request?

**Ответ**

Wide-EP (широкий expert parallelism) распределяет experts по большому числу GPUs, часто поперёк nodes, чтобы огромная MoE model и её active experts обслуживались с высокой aggregate capacity. Это особенно применимо при больших token batches, где all-to-all payload достаточно крупный и expert compute способен amortize network. При low-concurrency interactive decode слишком широкий EP может стать latency-bound на communication. Современные Blackwell/fast-fabric systems и специализированные communication libraries делают Wide-EP практичнее, но benefit workload-specific. Нужны load-balance metrics, per-rank tokens и network utilization; просто увеличить EP degree — не бесплатное масштабирование.

## Вопрос 220. Как disaggregated prefill сочетать с разными parallelism strategies на двух фазах?

## Вопрос 220.1. Можно ли использовать разные TP/CP конфигурации для prefill и decode и какую проблему тогда создаёт KV redistribution?

**Ответ**

Prefill и decode имеют разные bottlenecks, поэтому disaggregation позволяет использовать разные topology. Prefill длинных prompts может применять context/tensor parallelism для compute и model fit; decode — меньший TP, больше DP replicas или expert configuration, оптимизированную под bandwidth. После prefill KV layout должен быть совместим или преобразован при transfer. Если parallel mappings различаются, redistribution KV state может добавить дорогое communication. Поэтому architecture проектируют вместе с connector protocol: какой rank владеет какими blocks, как reshuffle выполняется и можно ли overlap. Цель — независимое SLO tuning, а не максимальная сложность topology.

## Вопрос 221. Как distributed KV transfer должен обрабатывать partial failure между prefill и decode workers?

## Вопрос 221.1. Какие гарантии нужны KV-transfer protocol, чтобы partial network failure не привёл к corrupt decode state?

**Ответ**

Если prefill завершён, но KV transfer оборвался, decode worker не должен начинать с неполного state. Transfer protocol нужен с request/segment IDs, expected block metadata, checksums или completion markers и timeout. После failure система выбирает retry transfer, другой decode worker с повторной отправкой либо recompute prefill. Cleanup должен освободить orphaned blocks на обеих сторонах. Idempotency важна: повторный segment не должен удваивать allocation. Метрики transfer failures, retries и leaked-block reconciliation нужны для эксплуатации. Disaggregation добавляет distributed state machine, поэтому reliability cost следует учитывать вместе с latency benefit.

## Вопрос 222. Как routing между data-parallel replicas учитывать одновременно queue length и prefix-cache locality?

## Вопрос 222.1. Как балансировать locality prefix cache и равномерность загрузки replicas?

**Ответ**

Cache-aware routing (маршрутизация с учётом кэша) пытается отправить request на replica, где уже есть длинный reusable prefix, но shortest-queue routing минимизирует ожидание. Если всегда выбирать cache hit, популярный replica становится hotspot; если всегда shortest queue — reuse исчезает. Нужна cost function: estimated queue delay + recompute cost missed prefix + transfer/migration options. SGLang и другие systems исследуют tree/cache-aware load balancing именно по этой причине. Практически измеряют saved prefill tokens и load skew. При большой разнице queue лучше miss и быстрый prefill на свободной replica, чем ждать cache-local worker.

## Вопрос 223. Что такое locality-aware scheduling для LoRA adapters и почему оно похоже на cache-aware routing?

## Вопрос 223.1. Почему multi-LoRA routing должен знать, какие adapters уже загружены на каждой replica?

**Ответ**

Multi-LoRA server хранит base model постоянно, а adapters может загружать/выгружать по demand. Если request направить на worker, где нужный adapter resident, избегается storage/host-to-device loading. Но концентрация популярного adapter создаёт queue hotspot. Поэтому routing учитывает adapter locality, queue delay и memory pressure аналогично prefix cache. Возможна replication hot adapters и eviction cold ones. Метрики — adapter hit rate, load time, queue latency и VRAM occupancy. При сотнях adapters модельный scheduler становится cache system для weights: naive round-robin способен тратить больше времени на swapping, чем на собственно low-rank compute.

## Вопрос 224. Когда model parallelism лучше заменить quantization, чтобы модель поместилась на меньшем числе GPU?

## Вопрос 224.1. Когда сжатие weights выгоднее добавления tensor-parallel GPU для model fit?

**Ответ**

Если FP16 model требует TP=8 только из-за weight memory, W8/W4/FP8 может позволить TP=4 или даже 1–2. Это уменьшает collective communication и инфраструктурную сложность, часто снижая latency/cost. Но quantization может ухудшить quality и иметь менее эффективный kernel на данном GPU; меньший TP также оставляет меньше aggregate memory bandwidth. Поэтому сравнивают два design points целиком: BF16+TP8 против validated low-bit+TP4, включая KV capacity, quality и throughput. Иногда quantization освобождает VRAM под larger batch, что даёт второй-order benefit. Нельзя выбирать по model-fit одному.

## Вопрос 225. Как pipeline parallelism влияет на failure domain inference request?

## Вопрос 225.1. Почему отказ одного GPU в pipeline-parallel replica обычно прерывает все её active requests?

**Ответ**

В PP один request зависит от всех stages: падение одного rank делает pipeline replica недоступной и active sequences теряют distributed state. Чем больше stages/nodes, тем шире failure domain и выше вероятность interruption. Recovery обычно не продолжает token generation с surviving stages без replicated KV/activations; request retry выполняется на healthy replica, возможно с повторным prefill. Поэтому large PP deployment требует replica-level redundancy, health checks и fast rerouting. Не следует считать 16-stage pipeline «16 независимыми workers». Availability capacity измеряют количеством complete pipeline replicas, а maintenance одного node может вывести из строя весь pipeline group.

## Вопрос 226. Как определить saturation point LLM server и почему после неё tail latency растёт нелинейно?

## Вопрос 226.1. Почему последние 10% utilization могут стоить непропорционально дорого по p99 latency?

**Ответ**

Saturation point (точка насыщения) достигается, когда offered load приближается к устойчивой service capacity: GPU/KV/scheduler почти постоянно заняты, свободного headroom для случайных bursts нет. Небольшое увеличение arrival rate начинает накапливать очередь, поэтому p95/p99 latency растут намного быстрее throughput. Для LLM дополнительно увеличивается lifetime requests и KV occupancy, что может вызвать preemptions и ещё сильнее снизить effective capacity — положительная обратная связь. Точку находят open-loop load sweep: повышают rate ступенями и ищут уровень, после которого queue depth/latency не возвращаются к steady state. Production target обычно ставят ниже этого уровня.

## Вопрос 227. Что такое goodput для LLM serving и почему он полезнее максимального throughput при наличии SLO?

## Вопрос 227.1. Как сравнить две serving конфигурации, если одна быстрее суммарно, но чаще нарушает TTFT/TPOT?

**Ответ**

Goodput (полезная пропускная способность) считает только requests или tokens, завершённые с соблюдением заданных constraints — например TTFT≤2 s и TPOT≤50 ms. Сервер может показать высокий aggregate throughput, но если половина запросов нарушает latency objective, эта capacity непригодна для продукта. Goodput позволяет честно сравнивать batching, disaggregation и parallelism: конфигурация с меньшим raw tokens/s может обслужить больше SLO-compliant traffic. Нужно явно определить единицу и правила: request считается успешным по обоим SLO или token-weighted; retries/rejections тоже учитываются. DistServe-подобные работы используют SLO-aware goodput именно для такой оценки.

## Вопрос 228. Почему p99 TTFT нельзя оптимизировать отдельно от p99 TPOT?

## Вопрос 228.1. Почему лучший TTFT scheduler может оказаться худшим streaming scheduler?

**Ответ**

TTFT и TPOT конкурируют за один GPU scheduler. Агрессивный приоритет новым prefill уменьшает TTFT, но задерживает decode и ухудшает TPOT; decode-first делает обратное. Увеличение chunk size улучшает prefill efficiency, но создаёт длинные iteration stalls. Поэтому оптимизация одной percentile метрики способна скрыто нарушить другую. Нужен joint SLO и анализ per-request pair: сколько запросов одновременно удовлетворили обе границы. Disaggregated prefill/decode позволяет частично развязать эти цели, но добавляет KV transfer. Production scheduler выбирают по workload utility, а не минимальному числу одной метрики.

## Вопрос 229. Как определить, что batch слишком большой для latency-sensitive decode?

## Вопрос 229.1. Как по throughput-latency curve найти оптимальный decode batch вместо максимального?

**Ответ**

Сделайте concurrency/batch sweep и измерьте aggregate output throughput вместе с per-request TPOT/ITL. Пока рост active sequences повышает arithmetic intensity, throughput растёт, а TPOT ухудшается умеренно. После определённой точки iteration duration, KV bandwidth и scheduling queue начинают расти быстрее, а marginal throughput почти исчезает. Дополнительно profiler покажет near-saturated memory/compute. Этот knee (излом) — разумный upper batch target для latency class. Не используйте единую границу для всех prompts: длинный context делает attention дороже, поэтому token/KV-aware scheduler точнее fixed `max_batch_size`.

## Вопрос 230. Почему одинаковая concurrency даёт разную GPU нагрузку при разных output lengths?

## Вопрос 230.1. Почему `concurrency=64` не является достаточным описанием нагрузки генеративного сервера?

**Ответ**

Concurrency показывает число одновременно живущих requests, но короткие outputs быстро освобождают slots, а длинные остаются active и многократно проходят decode. При одинаковых 64 concurrent requests один workload может иметь большинство sequences near completion, другой — тысячи remaining tokens и большой KV. Arrival process также меняет age distribution. Поэтому capacity лучше описывать active token state: context lengths, remaining output estimate и KV occupancy. Benchmark с fixed concurrency и forced 32-token outputs сильно недооценивает pressure reasoning workload на 2K outputs. Для production используют traces или хотя бы несколько length classes.

## Вопрос 231. Как output length variance создаёт straggler effect в batching?

## Вопрос 231.1. Что continuous batching исправляет в проблеме длинных straggler outputs, а что остаётся?

**Ответ**

Straggler (отстающий запрос) — sequence, которая генерирует намного дольше остальных. В static batch она заставляет batch жить до своего окончания, оставляя GPU с уменьшающимся числом active sequences. Continuous batching почти устраняет этот классический эффект, подставляя новые requests, но длинная sequence всё равно удерживает KV memory и может ухудшать fairness. При strict per-request ordering или batch jobs straggler может задерживать completion всего job. Анализируют distribution generated lengths и occupancy age. Ограничение max_tokens, early stopping и отделение long-generation class помогают, если продукт допускает. Нельзя «оптимизировать» stragglers, обрезая полезные ответы без product-level решения.

## Вопрос 232. Как prefix-cache hit может неожиданно ухудшить fairness между пользователями?

## Вопрос 232.1. Почему пользователи с хорошей cache locality могут непреднамеренно вытеснять uncached traffic?

**Ответ**

Cached request требует мало prefill compute и быстрее проходит scheduler, поэтому policy, оптимизирующая tokens processed, может систематически предпочитать tenants с повторяемыми prompts. Uncached long-context users получают больше queue time даже при одинаковом product priority. Кроме того, cache-resident tenant занимает GPU memory и способен вытеснять чужие prefixes. Fairness policy должна считать charged work осмысленно: quota по logical input tokens, фактическому compute или business tier. Cache — platform optimization, и экономию не обязательно превращать в приоритет. Мониторинг сравнивает latency/cache hit по tenants и ловит систематическую дискриминацию workload classes.

## Вопрос 233. Как cache-aware routing может ухудшиться после scale-out replicas?

## Вопрос 233.1. Почему новая LLM replica после autoscaling может долго оставаться пустой рядом с перегруженными cache-hot workers?

**Ответ**

При scale-out новый worker начинает с cold prefix cache, а existing hot workers уже содержат popular prefixes. Если router слишком ценит locality, traffic продолжит идти на старые replicas, новая остаётся недогруженной и не прогревается. Если резко перейти на round-robin, hit rate падает у всех. Нужен cache warmup/rebalancing policy: часть misses намеренно направлять на новые workers, replicate hottest prefixes или снижать locality weight при queue skew. После autoscaling отслеживают per-replica cache hit и utilization. Этот cold-cache effect объясняет, почему добавление GPU иногда временно ухудшает TTFT вместо мгновенного улучшения.

## Вопрос 234. Как autoscaling metric выбрать для LLM service и почему GPU utilization часто запаздывает?

## Вопрос 234.1. Какие signals лучше GPU-Util подходят для упреждающего autoscaling LLM endpoints?

**Ответ**

GPU utilization — lagging signal: при росте traffic accelerator может уже быть почти 100% занят задолго до того, как queue станет опасной, а новая replica загружается минуты. Более полезны leading indicators: queued requests/tokens, estimated queue delay, KV occupancy, arrival rate и SLO headroom. Autoscaler может прогнозировать required replicas по token workload, а utilization использовать как sanity check. Для heterogeneous prompts request count недостаточен. Scale-in также осторожен: replica с active long generations или valuable cache нельзя мгновенно убить. Нужны draining и minimum warm pool, если cold start велик.

## Вопрос 235. Как graceful draining LLM replica отличается от обычного stateless HTTP сервиса?

## Вопрос 235.1. Почему Kubernetes termination grace period для LLM replica должен учитывать длину текущих generations?

**Ответ**

При draining (мягком выводе из эксплуатации) replica перестаёт принимать новые requests, но уже active generations могут жить десятки секунд и удерживать KV. Немедленное завершение заставит клиентов retry, повторив prefill и потенциально ответы. Поэтому orchestrator ждёт active sequence count=0 либо после deadline мигрирует/прерывает. Session/prefix cache locality также теряется после shutdown, поэтому rolling update может временно увеличить TTFT. Для долгих agentic sessions жёсткая affinity делает draining ещё сложнее. Метрики drain duration и interrupted requests помогают выбрать termination grace period. Update strategy должна учитывать generation lifetime distribution.

## Вопрос 236. Как rolling deployment новой model/runtime версии влияет на prefix cache?

## Вопрос 236.1. Почему смена модели без изменения API может вызвать временный TTFT spike из-за cache invalidation?

**Ответ**

KV state обычно нельзя reuse-ить между разными model revisions, attention kernels с несовместимым layout или positional settings. Rolling deployment создаёт два cache namespaces и дробит traffic, временно снижая hit rate. Если load balancer смешивает версии для одной session, каждый turn может заново выполнять prefill. Поэтому version-aware routing и cache namespace обязательны. После cutover старые caches естественно удаляются вместе с replicas. Performance acceptance нового release следует проводить не только на warm isolated benchmark, но и на rollout transient: cold cache + compile warmup + mixed version routing могут стать реальным p99 regression.

## Вопрос 237. Как canary deployment оценивать для LLM inference, если новый runtime меняет stochastic outputs?

## Вопрос 237.1. Почему 1% canary LLM runtime может выглядеть медленнее production только из-за меньшей batching opportunity?

**Ответ**

Canary (канареечный rollout) нужно оценивать по независимым dimensions: system performance, correctness/quality и errors. Stochastic текст нельзя сравнивать строка-в-строку; используют task metrics, safety/format checks и distribution-based signals. Performance сравнивают на сопоставимых request classes, потому что canary получает малую долю traffic и может иметь меньший batch, что искусственно ухудшает throughput/TPOT. Можно shadow-replay trace для controlled comparison и отдельно live canary для integration. Важно учитывать cold cache/warmup. Rollback criteria задают заранее: p99 SLO, OOM/preemption, malformed outputs, quality regression, crash rate.

## Вопрос 238. Что такое shadow traffic для inference и какие ограничения безопасности у него есть?

## Вопрос 238.1. Как безопасно проверить новый inference stack на реальных prompts, не отдавая его ответы пользователям?

**Ответ**

Shadow traffic (теневой трафик) копирует production requests в новую model/runtime версию, но её ответы не возвращаются пользователю. Это даёт realistic lengths, prompts и concurrency для performance/quality comparison. Однако запрос фактически обрабатывается вторым system, что удваивает compute и может нарушить data residency/privacy, если shadow cluster имеет другой trust boundary. Tool calls и side effects должны быть отключены; иначе shadow agent может повторно совершить действие. Sensitive payloads можно redact или replay offline trace. Shadow результаты привязывают к исходному request ID для paired metrics, не смешивая с live billing.

## Вопрос 239. Как benchmark noisy-neighbor effect в multi-tenant LLM service?

## Вопрос 239.1. Как экспериментально измерить, насколько один тяжёлый tenant портит latency другого?

**Ответ**

Создайте baseline tenant с фиксированным latency-sensitive workload и измерьте его p50/p99 TTFT/TPOT. Затем добавьте controlled noisy neighbor classes: long prefills, long outputs, high-rate short requests, adapter churn. Сохраняйте total offered load и наблюдайте, какие ресурсы общие — KV pool, scheduler, CPU tokenizer, network. Если сосед меняет baseline latency сильнее допустимого isolation SLO, вводите quotas, separate queues/pools или reserved capacity. Важно тестировать burst, не только steady state. Отдельно проверьте cross-tenant cache/security boundaries. «Средний cluster latency нормальный» не доказывает tenant isolation.

## Вопрос 240. Как определить optimal GPU memory utilization fraction для KV cache?

## Вопрос 240.1. Почему `gpu_memory_utilization=0.99` может снизить надёжность, даже если обычный benchmark проходит?

**Ответ**

Выделять почти всю VRAM под weights+KV повышает theoretical capacity, но оставляет мало headroom для CUDA graphs, temporary workspaces, NCCL buffers, fragmentation и runtime variations. Слишком низкая fraction, наоборот, вызывает ранние preemptions при свободной памяти. Начните с documented engine behavior, затем stress-test maximum context/concurrency, speculative/guided paths и distributed collectives. Мониторьте peak allocated/reserved memory и OOM margin. Production headroom нужен для редких largest-shape kernels и version changes. Оптимум — не 100%, а максимальная fraction, которая проходит soak/burst tests без allocator/OOM instability.

## Вопрос 241. Почему memory leak в LLM serving часто маскируется под normal prefix-cache growth?

## Вопрос 241.1. Как отличить полезно зарезервированный KV pool от настоящей утечки GPU memory?

**Ответ**

После startup cache закономерно заполняется до budget, поэтому resident GPU memory растёт и затем должна стабилизироваться. Leak (утечка) проявляется иначе: число unreleased blocks/references или host metadata продолжает расти после того, как workload и cache capacity достигли steady state. Для диагностики разделяют allocated active KV, reusable cache, workspace и unknown/unaccounted memory. Выполняют cyclic test: generate→cancel/finish→evict, проверяя возврат counters. Если cache eviction освобождает logical block, но CUDA allocation остаётся reserved pool, это ещё не leak. Нужно сравнивать allocator accounting, а не только `nvidia-smi`.

## Вопрос 242. Как preemption rate использовать как сигнал неправильного capacity tuning?

## Вопрос 242.1. Когда счётчик preemptions становится индикатором перегруженной конфигурации, а не просто штатной работы scheduler?

**Ответ**

Preemption (вытеснение requests) может быть нормальным защитным механизмом, но устойчиво высокая частота означает, что scheduler допускает больше active state, чем KV pool способен удержать. Это приводит к recompute/swap, увеличивает wasted work и tail latency. Коррелируйте preemptions с KV utilization, request lengths и `max_num_seqs/max_batched_tokens`. Controlled reduction concurrency, увеличение KV capacity или quantization должны снизить preemptions; если latency улучшается, причина подтверждена. Нулевые preemptions не обязательны любой ценой — слишком консервативный admission недоиспользует GPU. Нужен optimum по goodput и SLO.

## Вопрос 243. Почему queue depth в requests хуже queue depth в tokens для capacity monitoring?

## Вопрос 243.1. Почему пять длинных prompts могут быть более опасной очередью, чем тысяча коротких requests?

**Ответ**

Один queued request может содержать 20 tokens, другой 200K. Request count не отражает предстоящий prefill work, memory allocation и service time. Queued input tokens уже лучше оценивают начальную работу; ещё полезнее estimated work units, учитывающие expected output tokens и phase costs. Но output length неизвестна, поэтому используют historical prediction или caps. В dashboard показывают и requests, и tokens, распределённые по size class. Autoscaling по одному queue-count может недореагировать на несколько гигантских documents или переотреагировать на тысячи коротких cached prompts.

## Вопрос 244. Как оценивать remaining work активной генерации, если output length заранее неизвестна?

## Вопрос 244.1. Как scheduler может учитывать будущую стоимость output, если модель ещё не знает, когда сгенерирует EOS?

**Ответ**

Точного значения нет: EOS — случайная/модельная остановка. Можно использовать requested `max_tokens` как upper bound, историческое distribution по endpoint/task или lightweight predictor по prompt/features. Для capacity control консервативный bound защищает SLO, но снижает utilization; expected remaining tokens эффективнее, но ошибается на tails. Практичная policy обновляет estimate по мере generation и сочетает с hard caps. Для agentic endpoints лучше оценивать на уровне step type. Важно не использовать predicted length для billing/correctness — это scheduling heuristic. Ошибки prediction мониторят и калибруют по actual generated lengths.

## Вопрос 245. Как hedged requests применимы к LLM inference и почему они очень дороги?

## Вопрос 245.1. Почему tail-latency hedging опаснее для LLM, чем для дешёвого stateless RPC?

**Ответ**

Hedged request (дублирующий запрос для снижения tail latency) отправляет вторую копию, если первая слишком долго ждёт/выполняется, и принимает первый успешный ответ. Для коротких RPC это популярная tail technique; для LLM дубликат может повторить дорогой prefill и generation, удвоить GPU state и дать другой stochastic output. Поэтому hedge разумен только после queue-delay threshold, для high-value requests и желательно до начала substantial generation. Cache-local alternate replica может снизить cost. Нужна cancellation проигравшей копии. Массовое hedging при overload создаёт retry storm и ещё сильнее ухудшает saturation.

## Вопрос 246. Как retry policy должна различать ошибки до и после начала streaming ответа?

## Вопрос 246.1. Почему автоматический retry после 200 уже отправленных токенов нельзя считать эквивалентом retry до TTFT?

**Ответ**

До первого token request можно безопаснее retry-ить на другой replica, если операция side-effect-free: пользователь ещё ничего не получил. После streaming клиент уже видел prefix; повторная generation может отличаться и создать дублированный/несогласованный текст. Возможны resumable protocols с сохранённым state, но обычный LLM API этого не гарантирует. Для tool-using agent retry ещё опаснее из-за side effects. Поэтому ошибки классифицируют по stage и idempotency. Backend retries ограничивают jitter/backoff и capacity budget, чтобы outage не породил retry storm. Логируют wasted compute и partial-stream failures отдельно.

## Вопрос 247. Как backpressure должен распространяться от GPU scheduler до API gateway?

## Вопрос 247.1. Как не допустить, чтобы reverse proxy скрывал реальную перегрузку LLM engine огромной собственной очередью?

**Ответ**

Backpressure (обратное давление) означает, что перегруженный engine сообщает upstream, что не может бесконечно принимать работу. Scheduler экспортирует queue/capacity signal; admission layer ограничивает concurrency или возвращает 429/503 с retry guidance; gateway не накапливает огромную скрытую очередь. Для streaming обратное давление существует и downstream: медленный клиент не должен бесконечно удерживать buffers/resources. Правильная цепочка предотвращает ситуацию, когда GPU queue формально мала, а десятки тысяч requests уже ждут в proxy. End-to-end observability должна показывать queue time на каждом уровне. Capacity limit должен находиться ближе к ресурсу, но быть видим upstream.

## Вопрос 248. Как slow client влияет на streaming inference и что с ним делать?

## Вопрос 248.1. Почему медленный получатель SSE stream может стать resource leak, даже если GPU работает нормально?

**Ответ**

Если клиент читает stream медленнее генерации, network/application buffers растут. Сам GPU может продолжать генерировать, но connection memory и serialization queues увеличиваются; при bounded buffers write блокируется и может удерживать request state. Политика должна задавать maximum buffered bytes/time и при превышении cancel request либо throttle output path. Останавливать GPU sequence каждый раз из-за TCP backpressure может усложнить batching, поэтому обычно допускают небольшой buffer. Метрики client write latency и buffered tokens отделяют network consumer problem от model TPOT. Особенно важно для mobile/unstable networks и длинных outputs.

## Вопрос 249. Почему max_tokens является не только product parameter, но и capacity-control mechanism?

## Вопрос 249.1. Как ограничение output length одновременно защищает стоимость, KV memory и fairness?

**Ответ**

`max_tokens` ограничивает worst-case lifetime sequence, рост KV cache и число decode iterations. Без server-side cap клиент может запросить огромный output, заняв slot/GPU memory на минуты и ухудшив fairness. Но слишком низкий cap обрезает legitimate tasks. Поэтому platform задаёт absolute model/tenant limits, а product — более точные defaults. Admission может использовать max_tokens как upper-bound estimate для reservation, хотя фактический EOS часто наступает раньше. Для untrusted public API лимит также защищает cost abuse. Finish reason должен явно показывать truncation, чтобы application не принимало неполный JSON/answer за завершённый результат.

## Вопрос 250. Как prompt length limit использовать без неожиданного отказа long-context пользователей?

## Вопрос 250.1. Почему production endpoint может сознательно разрешать меньше context, чем поддерживает checkpoint?

**Ответ**

Hard input limit защищает prefill latency и KV capacity, но должен быть выражен в model tokens после фактического chat template, а не символах. API может сначала оценить token count, затем вернуть понятную ошибку с limit/current value или предложить compaction. Для multi-tenant platform лимиты могут различаться по SLO tier. Dynamic admission иногда принимает длинный prompt при низкой нагрузке, но такой behavior сложнее предсказать и контрактировать. Если model заявляет 128K, platform может всё равно ограничить endpoint 64K ради SLO — это нужно документировать отдельно от architectural capability.

## Вопрос 251. Как load shedding выбирать между reject, degrade model и truncate context?

## Вопрос 251.1. Как выбрать graceful degradation LLM endpoint так, чтобы снижение нагрузки не превратилось в скрытую semantic corruption?

**Ответ**

Load shedding (управляемое сбрасывание нагрузки) должно сохранять semantics по возможности. Reject с 429 честен и безопасен, но ухудшает availability. Routing на меньшую/квантованную model сохраняет ответ, но меняет quality; это допустимо только если product contract разрешает fallback. Truncating context может тихо убрать критические instructions и обычно опаснее явного отказа. Можно также уменьшить optional `max_tokens`, отключить expensive speculation или отправить low-priority batch traffic позже. Policy должна быть заранее протестирована и observable: response metadata показывает fallback. Нельзя незаметно менять security-critical model/path при overload.

## Вопрос 252. Как capacity reserve разделять между interactive и batch inference traffic?

## Вопрос 252.1. Как использовать idle GPU для batch задач, не рискуя latency интерактивного API?

**Ответ**

Interactive traffic имеет строгий TTFT/TPOT, но bursty arrival; batch jobs обычно терпят ожидание и могут заполнять idle capacity. Полезна hierarchical policy: reserved minimum GPUs/token budget для interactive, batch использует spare capacity и первым preempted/throttled при росте live load. Полностью отдельные clusters дают лучшую isolation, но хуже utilization. Shared pool требует быстрых signals и preemption, желательно на request boundaries или с cheap resumability. Экономику оценивают по interactive SLO violations и batch completion time. Нельзя позволять overnight batch занять весь KV/cache так, что утренний burst ждёт eviction/reload.

## Вопрос 253. Как router в MoE выбирает experts и почему top-k напрямую влияет на inference cost?

## Вопрос 253.1. Почему top-2 MoE routing почти всегда дороже top-1, даже если total model parameters одинаковы?

**Ответ**

MoE router (маршрутизатор смеси экспертов) вычисляет score для каждого expert и выбирает top-k, обычно k=1 или 2 у конкретной architecture. Каждый дополнительный selected expert требует ещё одного FFN execution для token и больше dispatch/combine traffic, поэтому active FLOPs и communication растут примерно с k. Одновременно несколько experts могут улучшать model quality/capacity. Serving runtime обязан следовать trained architecture: уменьшить k ради скорости нельзя без изменения функции модели. Для performance анализа отделяют router GEMM, top-k selection, token dispatch, expert GEMM и combine. На small decode batch overhead routing/communication может быть заметнее собственно expert arithmetic.

## Вопрос 254. Что такое token dispatch и combine в MoE kernel pipeline?

## Вопрос 254.1. Какие операции происходят между MoE router logits и фактическим expert FFN?

**Ответ**

После router selection token dispatch (распределение токенов) группирует activations по выбранным experts и, при expert parallelism, отправляет их на owning ranks. Затем grouped expert GEMM обрабатывает группы разного размера. Combine (объединение) возвращает results к исходным token positions и применяет routing weights. Эти data-movement stages могут требовать permutations, prefix sums и all-to-all communication. На prefill много tokens, поэтому grouping amortized; на decode группы малы и нерегулярны. Fused dispatch/combine и grouped GEMM уменьшают launches/copies. Если profiler показывает много времени в permutation/communication, ускорение отдельного expert GEMM мало изменит TPOT.

## Вопрос 255. Почему grouped GEMM важен для эффективного MoE inference?

## Вопрос 255.1. Почему запуск одного CUDA GEMM на каждого MoE expert обычно неэффективен?

**Ответ**

В одном MoE layer каждый expert получает различное число tokens, поэтому запуск отдельного GEMM на каждого expert создаёт множество маленьких, плохо насыщенных kernels. Grouped GEMM (сгруппированное матричное умножение) объединяет набор независимых matrix multiplications в один scheduling/kernel framework, лучше используя GPU и уменьшая launch overhead. Shapes всё ещё неравномерны, поэтому эффективность зависит от token distribution и expert size. При batch=1 некоторые experts получают 0–1 token, и grouped GEMM остаётся трудным workload. Это объясняет, почему MoE theoretical active FLOPs не гарантируют такую же latency, как dense model с теми же FLOPs.

## Вопрос 256. Как expert placement по GPU влияет на network traffic MoE inference?

## Вопрос 256.1. Как расположение экспертов по ranks способно изменить MoE latency без изменения модели?

**Ответ**

Если experts, которые часто совместно выбираются или получают много traffic от определённых ranks, размещены неудачно, all-to-all пересылает больше activations через дорогие links. Topology-aware placement пытается держать hot experts/replicas там, где fabric capacity выше и load распределён. Но routing distribution зависит от domain и может меняться во времени. Static placement по uniform assumption часто проигрывает real trace. Практически собирают expert affinity/load matrix и network counters, моделируют candidate placements, затем canary-ят. Dynamic rebalance требует миграции expert weights, поэтому частота изменений должна быть намного ниже token routing frequency.

## Вопрос 257. Что такое EPLB и как динамическая балансировка experts может работать в inference cluster?

## Вопрос 257.1. Как динамически переразмещать MoE experts, не превратив rebalance в новый bottleneck?

**Ответ**

EPLB (и-пи-эл-би; Expert Parallel Load Balancing — балансировка нагрузки expert parallelism) использует наблюдаемую routing load, чтобы перераспределять experts или их replicas между ranks и уменьшать max-rank workload. Обычно load собирают за окно, затем compute placement plan и применяют его на controlled boundary. Слишком частая миграция weights создаёт bandwidth spikes и cache invalidation; слишком редкая не успевает за domain shifts. Success metric — не идеальное равенство token counts, а уменьшение critical-path iteration/collective time при приемлемой memory overhead. Нужно также учитывать shared experts и topology, а не только количество tokens.

## Вопрос 258. Как shared experts в MoE меняют performance profile?

## Вопрос 258.1. Почему shared expert делает MoE workload менее sparse, чем следует из одного top-k?

**Ответ**

Shared expert (общий эксперт) выполняется для каждого token независимо от router top-k, тогда как routed experts активируются выборочно. Поэтому его weights/compute похожи на dense FFN и могут стать заметной постоянной частью cost. Shared expert часто можно шардировать tensor parallel способом, а routed experts — expert parallel, создавая hybrid communication. Если shared path медленный, улучшение expert balance не даст ожидаемого speedup. В memory planning shared weights могут быть replicated иначе, чем routed. Профиль MoE нужно разбивать на attention, shared FFN, routed FFN, routing и communication — «active parameters» одним числом скрывают эту структуру.

## Вопрос 259. Почему small-batch MoE decode часто сложнее оптимизировать, чем dense decode?

## Вопрос 259.1. Почему sparse activation MoE не гарантирует низкую latency при batch=1?

**Ответ**

Dense decode читает одинаковые weight matrices для всех tokens batch, поэтому batching повышает reuse. В MoE tokens расходятся по experts: effective batch каждого expert намного меньше общего batch, а weights hot experts читаются нерегулярно. Добавляются routing, permutations и distributed all-to-all. При низкой concurrency может быть десятки experts с 0–1 token — плохие GEMM shapes. Поэтому MoE выигрывает по active FLOPs, но не обязательно пропорционально по TPOT. Увеличение global batch, expert replication, fused grouped GEMM и fast EP fabric помогают. Single-user benchmark особенно чувствителен к implementation quality.

## Вопрос 260. Как continuous batching влияет на expert utilization в MoE model?

## Вопрос 260.1. Почему увеличение числа одновременных requests помогает не только GEMM, но и балансировке MoE experts?

**Ответ**

Continuous batching объединяет tokens разных requests в один decode iteration. Это увеличивает global token count, а значит больше selected experts получают достаточно tokens для efficient grouped GEMM; routing imbalance статистически сглаживается. Поэтому aggregate MoE throughput может резко улучшаться с concurrency. Но requests разных domains могут иметь разные expert preferences, и mix workload меняет distribution. Кроме того, крупный batch удлиняет iteration и TPOT. Для MoE особенно важно benchmark-ить realistic domain mixture: synthetic random prompts могут распределять experts равномернее, чем production traffic, и завышать scaling.

## Вопрос 261. Как FP8/FP4 quantization interacts с MoE expert weights?

## Вопрос 261.1. Почему quantization experts может косвенно ускорить MoE ещё и за счёт уменьшения expert-parallel degree?

**Ответ**

MoE хранит огромный объём expert weights, поэтому low-precision representation даёт особенно большую memory/bandwidth экономию и может позволить больше experts на GPU, уменьшив EP degree. Но каждый expert получает маленький dynamic batch, поэтому quantized grouped-GEMM kernel должен быть эффективен на нерегулярных shapes. Scaling granularity и outliers могут различаться между experts; uniform calibration может плохо обработать редкие experts. На Blackwell-class hardware FP4 paths особенно привлекательны при нативной поддержке, но quality и kernel coverage model-specific. Сравнивают memory saved, expert GEMM time, network topology change и task quality одновременно.

## Вопрос 262. Как load imbalance MoE влияет на p99 сильнее, чем на средний throughput?

## Вопрос 262.1. Почему редкие hot-expert batches могут быть почти невидимы в среднем GPU utilization, но портить p99?

**Ответ**

Iteration synchronization означает, что все ranks ждут самый загруженный expert/rank. Большинство steps могут иметь умеренный balance, но редкий domain-specific batch направляет много tokens в один subset experts и создаёт длинный straggler. Средний tokens/s почти не изменится, а p99 TPOT получит spike. Поэтому мониторят distribution max/mean expert load per iteration и correlates с latency, а не только cumulative token counts. Mitigation может быть priority replication hot experts или batch mixing. Tail issue подтверждают trace replay с problematic prompts и уменьшением skew после placement change.

## Вопрос 263. Как attention и MoE FFN могут иметь разные оптимальные parallelism degrees в одной модели?

## Вопрос 263.1. Почему DeepSeek-подобной модели может понадобиться разный sharding attention и expert layers?

**Ответ**

Attention может лучше работать с небольшим TP из-за KV/head structure и frequent collectives, тогда как сотни experts требуют более широкого EP для weight placement. Современная MoE topology поэтому может использовать attention TP, routed FFN EP и DP одновременно. Это создаёт разные communication groups и требует runtime, умеющего преобразовать tensor layout между sublayers. Если заставить весь layer использовать один большой TP, attention collectives станут дорогими; если ограничить всё малым TP, experts не помещаются. Architecture-aware mapping — ключевой reason, почему универсальное `tensor_parallel_size=N` недостаточно для large MoE.

## Вопрос 264. Что такое decode context parallelism и когда его memory benefit оправдывает communication?

## Вопрос 264.1. Когда стоит распределять KV history одной sequence между GPU даже во время decode?

**Ответ**

Decode context parallelism делит historical KV tokens одной sequence между devices. Новый query отправляется/используется на каждом participant, каждый вычисляет partial attention по своему KV segment, затем partial softmax/result объединяются. Это уменьшает KV memory per device и позволяет обслуживать экстремально длинный context. Цена — collective каждый output token, поэтому single-request TPOT чувствителен к network latency. Метод оправдан, когда context иначе не помещается или KV bandwidth одного GPU уже bottleneck, а fabric очень быстрый. Для обычного 8K chat дополнительный communication обычно не нужен.

## Вопрос 265. Как disaggregated serving может использовать heterogeneous GPU types для prefill и decode?

## Вопрос 265.1. Как выбрать разные accelerator classes для compute-heavy prefill и bandwidth-heavy decode?

**Ответ**

Prefill чаще compute-heavy и выигрывает от высокой Tensor Core производительности; decode — от memory bandwidth/capacity и low-latency scheduling. Теоретически можно назначить разные accelerator types двум pools и оптимизировать cost. Но checkpoint precision/kernels должны поддерживаться обоими, а KV format/layout — переноситься между ними. Разные GPU speeds усложняют routing и autoscaling. Например, дешёвый high-memory decode GPU может быть выгоден только если его bandwidth достаточен для TPOT SLO. Решение требует end-to-end cost model: $/input token, $/output token, transfer fabric и utilization каждого pool, а не peak specs.

## Вопрос 266. Как pipeline disaggregation отличается от pipeline parallelism?

## Вопрос 266.1. Почему P/D disaggregation не является разновидностью pipeline parallelism?

**Ответ**

Pipeline parallelism делит layers одной model execution на последовательные stages: каждый token проходит все stages. Prefill/decode disaggregation делит жизненный цикл request по фазам: весь prefill выполняется в одном worker group, затем KV state передаётся другому group для всех decode steps. В первом случае communication — activations между layer stages каждый forward; во втором — крупная передача KV один раз на phase boundary. Поэтому bottlenecks и failure modes различны. Термины нельзя смешивать. Более того, каждый prefill/decode group сам может быть TP/PP/EP distributed, создавая двухуровневую architecture.

## Вопрос 267. Как model parallelism влияет на TTFT длинного prompt по сравнению с TPOT?

## Вопрос 267.1. Почему TP=8 может хорошо ускорять 100K prefill и почти не помогать batch=1 decode?

**Ответ**

Длинный prefill содержит большие GEMM и attention, поэтому TP/CP может хорошо масштабировать compute при достаточных matrix sizes; communication amortized. Decode одного token имеет маленькие matrices и frequent synchronization, поэтому увеличение same parallelism degree часто даёт меньше speedup или даже ухудшает TPOT. Следовательно, topology, оптимальная по TTFT, не обязана быть оптимальной по streaming latency. Это одна из причин фазового disaggregation. При colocated deployment выбирают compromise и проверяют оба SLO. Scaling curves нужно строить отдельно для prefill tokens/s и decode tokens/s.

## Вопрос 268. Как collective algorithm и message size влияют на distributed inference latency?

## Вопрос 268.1. Почему удвоение network bandwidth может почти не изменить latency маленьких decode collectives?

**Ответ**

Collectives имеют startup latency и bandwidth term. Для маленьких messages decode часто latency-dominated: ring, tree или topology-specific algorithm дают разную стоимость. Для больших prefill tensors bandwidth utilization важнее. NCCL/runtime обычно выбирает algorithm автоматически, но unusual topology или message sizes могут требовать tuning. Модель `T ≈ α·steps + bytes/β` полезна: α — per-step/network latency, β — effective bandwidth. Профилируя collective size distribution по layers, можно понять, почему faster network bandwidth не улучшил TPOT: bottleneck мог быть α. Эксперименты проводят без необоснованных глобальных NCCL overrides, которые могут ускорить один case и сломать другой.

## Вопрос 269. Как NUMA placement CPU threads и NIC/GPU affinity влияют на multi-GPU serving?

## Вопрос 269.1. Почему неправильная CPU/NIC/GPU affinity способна замедлить KV transfer и distributed serving?

**Ответ**

NUMA (нума; Non-Uniform Memory Access — неравномерный доступ к памяти) означает, что CPU socket быстрее обращается к своей local RAM/PCIe devices. Если tokenizer/scheduler thread, NIC и GPU находятся на разных NUMA nodes, host memory transfers и network path могут пересекать inter-socket link, добавляя latency и уменьшая bandwidth. Особенно это заметно при KV offload, RDMA и high-QPS frontend. Проверяют topology и pin workers/memory near devices. Симптомы — асимметрия ranks и lower PCIe/NIC throughput без GPU compute differences. Datacenter inference tuning включает host topology, а не заканчивается на выборе accelerator.

## Вопрос 270. Как GPUDirect/RDMA уменьшает host overhead при распределённом inference?

## Вопрос 270.1. Как доказать, что межузловой KV/NCCL traffic действительно использует direct GPU memory path?

**Ответ**

GPUDirect RDMA (Remote Direct Memory Access — удалённый прямой доступ к памяти GPU) позволяет network adapter передавать данные непосредственно из/в GPU memory, уменьшая staging через CPU DRAM и host copies. Это полезно для large collectives и KV transfer между nodes. Но end-to-end benefit требует supported NIC/GPU topology, drivers, IOMMU/configuration и communication library. Маленькие messages могут оставаться latency-dominated. Диагностика сравнивает effective GPU-to-GPU bandwidth и CPU utilization с/без direct path. Наличие InfiniBand само по себе не доказывает, что data действительно идёт GPUDirect route.

## Вопрос 271. Как network contention между TP collectives и KV transfers проявляется в disaggregated cluster?

## Вопрос 271.1. Как KV handoff может портить decode latency других replicas через общий network fabric?

**Ответ**

Если один fabric одновременно несёт TP/EP collectives и bulk KV transfers, они конкурируют за links/queues. Средний bandwidth может быть ниже capacity, но synchronized bursts создают p99 spikes decode collectives. Симптом — TPOT ухудшается именно при long-prefill handoffs, хотя GPU kernels не изменились. Нужны per-link telemetry и correlated traces. Mitigations: отдельные fabrics/traffic classes, rate limiting KV transfers, topology-aware routing, chunked/pipelined transfer и overlap только если он не увеличивает contention critical traffic. «Передавать асинхронно» не значит бесплатно: bandwidth остаётся общим ресурсом.

## Вопрос 272. Почему checkpoint sharding topology желательно согласовывать с runtime parallelism?

## Вопрос 272.1. Почему модель, сохранённая под TP=8, может неудобно запускаться с TP=4 без resharding?

**Ответ**

Если model files заранее сохранены в partitions, соответствующих TP/EP ranks, каждый worker может читать только свои weights и избежать startup-time reshard. Если checkpoint sharded иначе, runtime сначала загружает большие tensors и выполняет CPU/GPU slicing/all-to-all, увеличивая memory peak и time-to-ready. Для frequent autoscaling это влияет на availability economics. Но слишком topology-specific artifact уменьшает portability: смена TP size требует нового conversion. Поэтому platform может хранить canonical checkpoint плюс несколько optimized deployment variants, versioned вместе с quantization. Выбор — storage duplication против startup latency и operational simplicity.

## Вопрос 273. Как оценить distributed serving efficiency относительно идеального linear scaling?

## Вопрос 273.1. Как посчитать strong-scaling efficiency LLM inference и почему она не является единственным критерием?

**Ответ**

Определите baseline performance на минимальной topology и идеальный speedup N×, затем efficiency=`observed_speedup/N`. Но для inference нужно фиксировать цель: single-request latency, aggregate throughput или goodput. TP=8 может иметь 60% latency scaling efficiency, но позволить модель, которая вообще не помещается на 1 GPU. Разложите потерю на communication, smaller-GEMM efficiency, imbalance и scheduler. Для DP throughput scaling отдельно учитывают load balancer/cache. Не называйте 70% «плохим» без economics: если дополнительный GPU дешевле engineering effort и SLO достигается, решение может быть рациональным. Efficiency — диагностическая, не бизнес-метрика.

## Вопрос 274. Как fault одного rank обнаруживается в NCCL-based inference group и почему timeout важен?

## Вопрос 274.1. Почему один зависший tensor-parallel rank способен повесить все остальные и как ограничить blast radius?

**Ответ**

Collective operation требует участия всех expected ranks. Если один process/GPU завис или умер, остальные могут блокироваться в NCCL call. Поэтому distributed runtime нужны watchdog/heartbeat и finite collective timeout, после которого group считается unhealthy и requests fail/retry на другой replica. Слишком длинный timeout превращает один hardware fault в минуты висящих connections; слишком короткий даёт false positives при редких long kernels/network congestion. После failure group обычно пересоздаётся целиком: продолжить текущий TP request без rank невозможно. Monitoring должен связывать NCCL errors с node/GPU health, а orchestrator — quarantining faulty hardware.

## Вопрос 275. Как ECC/Xid GPU ошибки должны влиять на health state inference replica?

## Вопрос 275.1. Когда GPU error должен приводить не к retry одного запроса, а к quarantine всей replica/node?

**Ответ**

GPU hardware/driver faults могут проявляться как Xid events, uncorrectable ECC errors, context resets или CUDA illegal memory access. После серьёзной ошибки продолжать отдавать traffic рискованно: CUDA context может быть повреждён, distributed peers — в inconsistent state. Health agent должен классифицировать events, снять replica из load balancing, завершить/drain process и при необходимости cordon node для диагностики. Correctable ECC counters полезны как predictive signal, но threshold зависит от hardware/vendor guidance. Application-level retry скрывает отдельный failure от пользователя, но не должен бесконечно возвращать traffic на подозрительный GPU.

## Вопрос 276. Production LLM внезапно потерял 25% throughput после обновления runtime. Как построить расследование?

## Вопрос 276.1. Как отличить kernel regression после upgrade от изменения workload или scheduler behavior?

**Ответ**

Сначала зафиксируйте regression boundary: model revision, runtime/CUDA/driver, kernel backend, quantization и traffic mix. Сравните одинаковый trace до/после, отдельно prefill и decode. Затем профилируйте GPU timeline: изменились ли kernel choices, graph coverage, GEMM/attention duration, NCCL или CPU gaps. Проверьте release notes и fallback warnings — новый shape мог уйти с fused backend. Далее применяйте binary search по изменениям или rollback отдельных компонентов. Root cause считается найденным, когда конкретное изменение воспроизводимо возвращает потерянный throughput без изменения workload. Не начинайте с случайного tuning scheduler: сначала локализуйте слой regression.

## Вопрос 277. TTFT вырос в четыре раза после увеличения context limit с 8K до 128K, хотя фактические prompts остались короткими. Какие гипотезы проверить?

## Вопрос 277.1. Почему увеличение разрешённого max context может замедлить короткие запросы даже без длинных prompts?

**Ответ**

Сам лимит не должен автоматически делать каждый короткий prefill в 16 раз дороже, поэтому ищите косвенные effects. Проверьте, увеличился ли заранее резервируемый KV pool/workspace, изменился ли CUDA Graph capture/fallback, attention backend или RoPE configuration. Сравните actual token lengths и queue time. Возможно scheduler уменьшил effective concurrency из-за conservative memory planning или большие graph/workspace allocations вытеснили cache. Запустите один и тот же short prompt при старом/новом `max_model_len` и profiler diff. Если pure kernel time одинаков, причина выше — queue/capacity/configuration, а не attention complexity.

## Вопрос 278. TPOT вырос, GPU utilization почти не изменился, а output throughput снизился. Что проверять первым?

## Вопрос 278.1. Как расследовать падение tokens/s при неизменно высоком `nvidia-smi` GPU-Util?

**Ответ**

Грубый GPU utilization не показывает, чем занят accelerator. Сравните iteration duration, active sequences и tokens/iteration; затем profiler — memory bandwidth, achieved FLOPS, attention/GEMM kernels, NCCL и CPU gaps. Возможен переход на более медленный attention backend, снижение batch из-за KV pressure, больше long-context requests или collective latency. Если GPU постоянно «занят» менее эффективными kernels, utilization останется высоким. Коррелируйте TPOT с context length и batch. Controlled fixed-shape benchmark отделит workload shift от runtime regression. Только после этого меняйте scheduler/quantization.

## Вопрос 279. После включения prefix caching p99 TTFT ухудшился, хотя hit rate высокий. Какие причины вероятны?

## Вопрос 279.1. Почему высокий prefix-cache hit ratio может сопровождаться худшим p99 latency?

**Ответ**

Проверьте не только hit rate, а saved tokens distribution и cache lookup/eviction cost. Высокий request hit по коротким prefixes может давать мало compute savings, при этом radix/hash index и lock contention добавляют CPU delay. Большие cached prefixes могли занять KV pool, уменьшить active concurrency и вызвать preemptions. Cache-aware routing мог создать hotspots. Сравните queue time, lookup latency, KV occupancy, evictions и per-replica load hit/miss cohorts. Затем A/B: cache on без cache-aware routing, ограниченный cache budget, cost-aware admission. Root cause подтверждается конкретной стадией TTFT, а не общей корреляцией.

## Вопрос 280. После включения chunked prefill средний TPOT улучшился, но TTFT длинных prompts ухудшился. Это баг или ожидаемый trade-off?

## Вопрос 280.1. Как отличить нормальную цену chunked prefill от неэффективного слишком мелкого chunk size?

**Ответ**

Это ожидаемо: chunked prefill дробит длинный prompt и interleave-ит его с decode work. Уже генерирующие requests получают более короткие scheduler iterations и лучший TPOT, но длинный новый request может ждать между chunks и позже получить первый token. Определите, соответствует ли ухудшение выбранному SLO budget. Измерьте total prefill compute time отдельно от scheduler waiting between chunks. Если pure prefill стал сильно медленнее, chunks могут быть слишком малы и терять GEMM efficiency. Если compute почти тот же, а TTFT вырос из-за fairness — это policy trade-off, который настраивают token budget/chunk size.

## Вопрос 281. После перехода на FP8 модель иногда выдаёт NaN logits. Как диагностировать numerical failure?

## Вопрос 281.1. Как найти первый слой, где low-precision inference начинает производить NaN?

**Ответ**

Сначала воспроизведите минимальный prompt/seed и включите layer-wise finite checks на activations после quantized GEMM, normalization и attention. Найдите первый tensor с NaN/Inf, затем сравните BF16 baseline и scaling metadata. Проверьте calibration/scales, overflow range выбранного FP8 format, unsupported kernel path и version-specific bugs. Если failure только на длинном context, исследуйте attention/softmax и KV precision. Временно оставьте подозрительный layer BF16: исчезновение NaN локализует проблему. Не маскируйте `nan_to_num` на logits — это скрывает corruption. Fix должен проходить stress/edge evaluation без non-finite counters.

## Вопрос 282. После quantization JSON validity упала на 2%, а общая benchmark accuracy почти не изменилась. Как интерпретировать?

## Вопрос 282.1. Почему небольшая quantization error может непропорционально ударить по structured output?

**Ответ**

Это реальная product regression, если structured output является контрактом. Aggregate academic metric может быть нечувствителен к небольшим logits shifts около punctuation/quote/bracket tokens, тогда как JSON parser — бинарен. Разбейте failures по position/token и сравните logit margins BF16 vs quantized. Проверьте, помогает ли guided decoding: если syntactic validity восстанавливается без semantic loss, это возможное mitigation, но добавляет latency. Также попробуйте mixed precision для lm_head/sensitive layers или другой scheme. Acceptance criteria должны весить production critical metrics выше среднего benchmark score; «почти тот же MMLU» здесь не аргумент.

## Вопрос 283. Server периодически зависает на всех TP ranks без OOM. Как расследовать distributed deadlock?

## Вопрос 283.1. Как доказать, что зависание TP replica вызвано рассинхронизацией collectives, а не долгим CUDA kernel?

**Ответ**

Соберите synchronized thread/GPU traces и NCCL logs по всем ranks, найдите последний collective sequence. Частая причина — control-flow divergence: один rank отменил request/упал до collective, остальные вошли в него; либо ranks вызывают collectives в разном порядке. Проверьте watchdog timeout и asynchronous error handling. Воспроизведите с deterministic request/cancellation sequence и меньшим topology. Добавьте sequence numbers вокруг distributed operations. Если зависание исчезает без cancellations, исследуйте cleanup race. Исправление должно гарантировать одинаковый collective protocol для group или fail-fast пересоздание всей replica; бесконечный timeout недопустим.

## Вопрос 284. Почему cancellation race может приводить к use-after-free KV blocks?

## Вопрос 284.1. Почему нельзя освобождать paged KV сразу в HTTP cancellation callback?

**Ответ**

Request может быть помечен cancelled на CPU, пока GPU step ещё читает его KV pages. Если allocator сразу уменьшит refcount до нуля и выдаст block новому request, старый kernel продолжит читать/писать уже переиспользованную память — редкая silent corruption или illegal access. Поэтому освобождение привязано к completion event/iteration boundary, где гарантировано завершение всех dependent kernels. Async scheduler усложняет lifetime ещё сильнее. Stress test должен массово cancel requests на случайных phases под высоким reuse и проверять allocator invariants/output correctness. «Request удалён из queue» не равнозначно «его GPU buffers уже безопасно свободны».

## Вопрос 285. Как обнаружить silent correctness bug в prefix cache?

## Вопрос 285.1. Каким differential test проверить, что automatic prefix caching не меняет семантику inference?

**Ответ**

Сравнивайте cached и forced-uncached execution одинаковых deterministic requests. Для greedy режима outputs/logits на checkpoints должны совпадать в допустимой numerical tolerance; для stochastic можно сравнивать pre-sampling logits при фиксированном execution path. Стратифицируйте tests по partial-block prefixes, adapters, multimodal inputs, model rollouts и position lengths. Логируйте cache key/fingerprint и reused block count. Если corruption появляется только при reuse, binary search по block boundary помогает найти key/layout bug. Это важный regression suite: false cache hit не вызывает crash и способен долго выглядеть как «модель иногда галлюцинирует».

## Вопрос 286. Как диагностировать неожиданный рост preemptions после model update без изменения traffic?

## Вопрос 286.1. Почему model revision может увеличить preemption rate при абсолютно том же количестве запросов?

**Ответ**

Сравните dynamic memory budget: model weights могли стать больше, KV dtype/number of heads — измениться, CUDA graphs/workspace — занять дополнительную VRAM. Проверьте фактический cache block count и bytes/block до/после. Даже небольшая model memory прибавка уменьшает KV capacity и при прежнем `max_num_seqs` создаёт pressure. Также new architecture может отключить sliding window или изменить cache layout. Controlled replay старого trace покажет момент preemption. Решение — снизить concurrency, уменьшить KV precision, изменить memory fraction или topology; но сначала подтвердите accounting, чтобы не компенсировать memory leak настройками.

## Вопрос 287. Как разобраться, почему prefix-cache hit есть, но TTFT почти не уменьшается?

## Вопрос 287.1. Какие причины объясняют cache hit без заметного выигрыша time-to-first-token?

**Ответ**

Измерьте число действительно reused tokens, а не boolean hit. Возможно совпал только один block из 20K prompt. Затем разложите TTFT: если queue/tokenization/network доминируют, saved prefill не виден end-to-end. Для маленькой модели short prefix compute может быть дешевле cache lookup. При distributed routing cached KV может требовать transfer, близкий по времени recompute. Сравните engine prefill tokens processed и GPU prefill duration hit vs miss cohorts. Если saved compute есть, но пользователь не видит эффект, bottleneck находится вне prefill. Это важнее попытки повышать hit rate ещё сильнее.

## Вопрос 288. Как расследовать latency spike, который появляется только при длинных stop sequences или grammar constraints?

## Вопрос 288.1. Почему naive stop-string checking способно сделать длинную генерацию всё медленнее с каждым токеном?

**Ответ**

Сначала отделите model forward от post-processing через timestamps. Проверьте CPU/GPU time stop matching, tokenizer decoding и grammar state transition. Наивный поиск stop string по всей накопленной строке каждый token может дать растущую O(N²) CPU работу; корректнее поддерживать incremental matcher. Grammar backend может пересчитывать allowed token set. Профилируйте problematic and normal requests при одинаковой output length. Если GPU kernels одинаковы, bottleneck подтверждён вне model. Исправление — incremental automaton, cached transitions/fused masks, а regression test должен включать длинные outputs и overlapping stop patterns.

## Вопрос 289. Почему rare long prompts могут портить p99 даже при доле меньше 1%?

## Вопрос 289.1. Как доказать, что 0.5% 100K-token запросов вызывают p99 проблемы у короткого chat traffic?

**Ответ**

p99 как раз чувствителен к редкому одному проценту. Кроме собственной высокой TTFT, long prefill способен задерживать decode соседей, занимать крупный KV region и вызывать cache eviction/preemption. Поэтому его blast radius выходит за пределы самого request. Анализируйте latency conditioned on co-running workload: сравните обычные requests в windows с long-prefill arrival и без него. Если корреляция сильна, используйте separate queue/class, chunked prefill или dedicated pool. Средняя prompt length не отражает проблему. Capacity/SLO design должен учитывать tail размеров, а не только tail самой latency.

## Вопрос 290. Как выявить regression из-за изменения chat template, а не model runtime?

## Вопрос 290.1. Почему изменение нескольких строк chat template может выглядеть как серьёзный inference performance regression?

**Ответ**

Сохраните rendered prompt/token IDs до и после deployment. Новая template может добавить system tokens, повторять tools schema, изменить assistant prefix или переставить history, увеличив input length и сломав prefix-cache reuse. Model/runtime profiler покажет больше prefill tokens, хотя per-token speed неизменна. Paired replay с old/new template на одном engine локализует эффект. Проверяют также quality и stop semantics: template — часть model interface. Versioning только checkpoint недостаточно; template/tokenizer revision должны входить в deployment artifact и cache namespace.

## Вопрос 291. Как расследовать memory fragmentation, если общий free memory кажется достаточным для allocation?

## Вопрос 291.1. Почему несколько гигабайт суммарно свободной VRAM не гарантируют успешный большой contiguous allocation?

**Ответ**

Сначала определите allocator layer. Paged KV pool почти устраняет external fragmentation внутри cache, но CUDA/general workspace allocations могут требовать contiguous region. Сравните framework reserved/allocated bytes, largest free block и failure allocation size. Если OOM исчезает после restart при том же workload, fragmentation/leaked references вероятнее raw capacity. CUDA memory snapshots/allocator diagnostics помогают найти long-lived blocks между transient allocations. Также capture graphs удерживают address-stable buffers. Не пытайтесь лечить всё `empty_cache()`: production fix — стабилизировать allocation sizes, preallocate pools или изменить lifecycle buffers.

## Вопрос 292. Как проверить, что CUDA Graph padding съедает throughput после изменения traffic mix?

## Вопрос 292.1. Как измерить скрытую цену округления dynamic batch до ближайшего CUDA Graph size?

**Ответ**

Логируйте actual active batch size и selected captured graph size. Если большинство iterations с batch 17–20 исполняются в graph size 32, значительная доля padded slots — пустая работа. Сравните achieved tokens/iteration и kernel time с eager/exact-size capture. Постройте histogram padding ratio по production trace. После изменения capture set добавьте sizes вокруг новой mode distribution и повторите benchmark, учитывая extra graph memory. Root cause подтверждён, если GPU kernel duration уменьшается при том же logical batch без изменений scheduler. Такой regression часто возникает после смены concurrency pattern, а не software bug.

## Вопрос 293. Почему model server может показывать высокий memory bandwidth, но низкий useful throughput?

## Вопрос 293.1. Как отличить полезное насыщение HBM от ситуации, когда сервер просто очень быстро двигает лишние байты?

**Ответ**

Bandwidth может расходоваться на бесполезные данные: padded graph slots, repeated dequantization buffers, KV blocks, которые вскоре preempt/recompute, или unfused intermediates. Поэтому high HBM utilization доказывает только memory traffic, не эффективность. Рассчитайте useful bytes/work: logical tokens completed против measured DRAM bytes. Сравните с theoretical minimum weight+KV reads для выбранной architecture. Profiler kernel names покажет источники. Optimization должна уменьшить bytes per useful output token или увеличить reuse. Если bandwidth уже на peak, добавление compute optimization не поможет — нужно изменить data movement.

## Вопрос 294. Как определить, что kernel launch overhead стал значимой долей TPOT?

## Вопрос 294.1. Каким экспериментом подтвердить, что decode ограничен запуском kernels, а не самими kernels?

**Ответ**

Nsight Systems-подобный timeline показывает множество коротких GPU kernels и CPU gaps между ними. Суммируйте kernel durations и wall-clock decode iteration: если gap/launch доля велика, особенно batch=1, host overhead значим. Затем включите CUDA Graphs или fusion и сравните без изменения model math. Если iteration time сокращается, hypothesis подтверждена. На больших batch kernels длиннее и launch overhead amortized, поэтому проблема может исчезнуть. Также проверьте Python logging/hooks, которые синхронизируют device. Не используйте число kernels как единственную метрику: несколько коротких asynchronous launches могут уже хорошо overlap-иться.

## Вопрос 295. Как синхронный logging может неожиданно снизить LLM throughput?

## Вопрос 295.1. Почему безобидный debug log внутри token loop способен заметно увеличить TPOT?

**Ответ**

Если hot decode loop форматирует большие log records, пишет их на disk/network или вызывает `.item()`/tensor printing, он может синхронизировать CPU и GPU каждый token. Даже миллисекунда overhead на сотни steps заметна. Симптомы — CPU gaps между kernels и сильный speedup после снижения log level. Решение — structured asynchronous logging, sampling, aggregation counters и отсутствие device synchronization в hot path. Incident debugging instrumentation следует включать ограниченно: подробный per-token trace может изменить наблюдаемую систему. Benchmark всегда запускают с тем же telemetry level, что production, либо явно измеряют observability tax.

## Вопрос 296. Почему изменение tokenizer version может вызвать как quality, так и performance regression?

## Вопрос 296.1. Как tokenizer upgrade может замедлить ответы без какого-либо изменения GPU kernels?

**Ответ**

Tokenizer определяет token IDs, длину sequence, special tokens и boundaries. Даже небольшое изменение normalization/chat special tokens может увеличить input/output token count, нарушить checkpoint expectations или prefix-cache identity. Performance per token останется тем же, но пользовательский text latency/cost изменится. Более опасно несовпадение model vocabulary/config, которое даёт неверные IDs. Поэтому tokenizer version pin-ится вместе с model, а rollout сравнивает rendered tokens на golden prompts. Cache namespace должен инвалидироваться при semantic tokenizer change. Tokens/s benchmark между tokenizer versions недостаточен — сравнивайте одинаковый text workload.

## Вопрос 297. Как проверить, что проблема long-context latency вызвана attention, а не MLP/weight bandwidth?

## Вопрос 297.1. Как по зависимости TPOT от context length отделить KV-attention cost от чтения model weights?

**Ответ**

Постройте sweep context length при фиксированном batch и одном output token, затем профиль по kernel categories. MLP/linear weight reads для decode почти не зависят от past context, attention K/V work растёт примерно линейно. Если TPOT slope с context length соответствует росту attention duration/bytes, причина подтверждена. Если total TPOT почти constant до большого threshold, доминируют weights/other overhead. С KV quantization или sliding window slope должен измениться предсказуемо. Такой experiment позволяет решить, поможет ли оптимизация attention/cache; quantizing weights не устранит bottleneck, который растёт именно с T.

## Вопрос 298. Как диагностировать неравномерный latency между одинаковыми GPU replicas?

## Вопрос 298.1. Как системно найти причину, если одна из восьми одинаковых LLM replicas стабильно медленнее остальных?

**Ответ**

Сравните hardware health/clocks, thermal/power throttling, topology, NUMA affinity, driver/runtime, graph warmup и cache state. Затем replay один trace локально на каждой replica без load balancer. Если разница сохраняется — host/hardware/config; если исчезает — routing/workload skew. Для distributed groups проверьте slow rank/NIC. `nvidia-smi` model name одинаков, но power limit, PCIe link width или degraded NVLink могут различаться. Cache-hot replica может быть быстрее TTFT и одновременно сильнее загружена. Fleet observability должна хранить per-replica percentiles, а не только aggregate, иначе один slow node маскируется средним.

## Вопрос 299. Как расследовать intermittent CUDA OOM, который не воспроизводится фиксированным synthetic test?

## Вопрос 299.1. Почему OOM может возникать только на редкой комбинации features, хотя обычный maximum-context test проходит?

**Ответ**

Запишите request trace около OOM: concurrent sequence lengths, multimodal sizes, adapters, speculative/guided modes, graph size и cache occupancy. Intermittent failure часто требует редкой комбинации largest workspace + high KV usage + adapter/model temporary buffers. Replay exact trace с deterministic admission. Снимите allocator snapshot перед failure и классифицируйте largest allocations. Synthetic fixed-length test мог не активировать конкретный kernel path. После fix выполните randomized stress/soak с adversarial combinations и headroom. Не ограничивайтесь увеличением memory fraction или уменьшением concurrency без понимания rare allocation, иначе следующая версия снова пересечёт границу.

## Вопрос 300. Как postmortem inference incident должен отличать trigger, root cause и contributing factors?

## Вопрос 300.1. Почему `резкий рост трафика` обычно является триггером, а не достаточным root cause LLM outage?

**Ответ**

Trigger (триггер) — событие, после которого incident проявился, например traffic burst или rollout. Root cause (коренная причина) — дефект/ограничение, без которого trigger не вызвал бы outage: отсутствующий admission control, memory leak, NCCL hang. Contributing factors — long cold start, слабый alerting, cache churn, retry policy. Если назвать burst «root cause», система останется уязвимой к следующему burst. Postmortem связывает timeline с telemetry, оценивает blast radius и формулирует actions: immediate mitigation, durable engineering fix, detection/prevention. Для LLM отдельно полезно считать wasted GPU tokens и SLO impact по workload classes.

## Вопрос 301. Какие RED/USE-подобные метрики нужны для LLM inference, кроме обычного HTTP QPS?

## Вопрос 301.1. Какие метрики превращают обычный HTTP dashboard в действительно полезный LLM-serving dashboard?

**Ответ**

Для request plane полезны rate, errors и duration, но duration нужно разложить на queue, tokenization, prefill, TTFT, decode/TPOT и total latency. Для resource plane нужны GPU compute/memory utilization, HBM bandwidth, KV cache usage, preemptions, cache hits, CPU/NIC/NCCL. В отличие от обычного RPC важны token dimensions: input/output tokens/s и length distributions. Ошибки следует разделять на overload rejection, timeout, OOM, model/runtime failure и client cancellation. Такой набор позволяет связать симптом пользователя с bottleneck: высокий TTFT при нормальном GPU может быть очередью; высокий TPOT при длинном context — KV bandwidth.

## Вопрос 302. Почему histogram TTFT/TPOT нужно строить по классам input/output length?

## Вопрос 302.1. Почему общий p99 latency без нормализации по token lengths может вводить в заблуждение?

**Ответ**

Latency сильно зависит от размера работы. Общий p99 смешивает 50-token chat и 100K document request, поэтому изменение traffic mix может выглядеть как regression runtime. Стратифицируйте TTFT по input-token buckets/cache hit и TPOT по active context/concurrency. Тогда можно сравнивать apples-to-apples и видеть, что, например, p95 short-chat не изменился, а выросла доля long-doc. Но слишком много labels создаёт high-cardinality telemetry. Обычно используют bounded buckets и exemplars/traces для деталей. SLO можно задавать по product classes, если они действительно имеют разные expectations.

## Вопрос 303. Как trace одного LLM request должен связывать frontend, scheduler и GPU execution?

## Вопрос 303.1. Какие spans нужны, чтобы end-to-end trace объяснял, где именно потерялись секунды TTFT?

**Ответ**

Distributed trace (распределённая трассировка) должен иметь request ID и spans: ingress/auth, chat rendering, tokenization, queue, prefill scheduling/execution, first token, decode lifetime, serialization/network. Для disaggregation добавляются KV transfer и worker routing; для tool agent — отдельные model calls. Невозможно создавать span на каждый token для всего traffic без огромной стоимости, поэтому detailed per-iteration traces sampling-ятся. В span attributes полезны input/output length, model/version, cache-hit tokens, worker/rank, priority — с осторожностью к privacy. Такой trace позволяет отличить 3 s TTFT из queue от 3 s GPU prefill.

## Вопрос 304. Как мониторить prefix cache так, чтобы видеть его экономическую ценность?

## Вопрос 304.1. Какие cache metrics нужны, чтобы понять не только hit rate, но и сколько GPU работы действительно сэкономлено?

**Ответ**

Кроме request hit ratio отслеживайте queried tokens, reused/cached tokens, evicted blocks, occupancy, lookup latency и saved prefill estimate. Полезна метрика `reused_tokens / eligible_prefix_tokens`, а также saved GPU prefill milliseconds по length bucket. Разделяйте tenant/model namespaces и routing hits. Высокий occupancy при низком saved compute означает pollution. При hierarchical cache нужны tier hit ratios и transfer bytes/latency. Финальная бизнес-метрика — уменьшение TTFT/cost per request relative to comparable misses. Cache dashboard должен отвечать не «он заполнен?», а «какую работу он реально устраняет и какой ценой?».

## Вопрос 305. Какие показатели scheduler нужны для объяснения latency LLM server?

## Вопрос 305.1. Какие внутренние scheduler counters нужны, чтобы расследовать очередь и preemption без чтения исходного кода?

**Ответ**

Минимум: waiting/running request counts, queued tokens, token budget utilization, prefill/decode tokens per iteration, iteration duration, admission/rejection, preemptions и priority/fairness queues. Для chunked prefill — chunks/request и wait между chunks. Для async scheduling — scheduler CPU time и lag. Эти metrics связывают high-level latency с конкретным decision process. Например, высокий queue depth при свободном KV может означать `max_num_seqs`/priority limit; постоянные preemptions — memory overcommit. Без scheduler telemetry GPU profiler показывает только то, что было запущено, но не объясняет, почему другие requests не получили запуск.

## Вопрос 306. Как мониторить Model FLOPs Utilization для inference и в чём ограничение MFU?

## Вопрос 306.1. Почему низкий MFU может быть совершенно нормальным для быстрых autoregressive decode steps?

**Ответ**

MFU (эм-эф-ю; Model FLOPs Utilization — доля теоретической вычислительной производительности, использованная полезными model FLOPs) сравнивает estimated model operations с hardware peak. Высокий MFU полезен для compute-bound prefill, но decode может быть memory-bound и иметь низкий MFU при отличной эффективности. Для MoE FLOPs estimate зависит от active experts; для quantized formats hardware peak другой. Поэтому MFU дополняют memory bandwidth utilization и bytes/token. Нельзя ставить universal target «MFU>50%» для всех фаз. Метрика отвечает, насколько используется compute roof, но не показывает близость к memory roof или SLO.

## Вопрос 307. Как bytes per output token использовать как diagnostic metric decode efficiency?

## Вопрос 307.1. Как memory-traffic-per-token помогает понять, действительно ли quantization и batching уменьшают HBM работу?

**Ответ**

Memory-bound decode часто приблизительно читает значительную часть weights плюс KV state на каждый iteration. Если измерить DRAM read bytes и разделить на полезные output tokens, можно сравнить configurations. Quantization должна уменьшить weight bytes/token; GQA/KV FP8 — context-dependent cache bytes/token; batching — amortize weight reads между tokens. Если bytes/token внезапно растёт, ищите padding, redundant copies или cache layout. Метрика hardware-specific и включает traffic, не различимый HBM counters идеально, но хорошо дополняет TPOT. Сопоставление с theoretical minimum помогает оценить, насколько runtime близок к bandwidth-efficient path.

## Вопрос 308. Как измерить cost per million output tokens для self-hosted inference?

## Вопрос 308.1. Как честно посчитать self-hosted $/1M tokens, не используя недостижимый peak benchmark?

**Ответ**

Возьмите полную hourly cost allocated infrastructure — GPU, CPU/RAM, network/storage и platform overhead — и разделите на устойчивый production output throughput, но отдельно учитывайте input work. Простой `GPU$/hour / output tokens/hour` полезен для homogeneous workload; для смешанного traffic лучше модель `cost = a·input_tokens + b·output_tokens + fixed/request`, fitted по utilization/capacity. Считайте goodput under SLO, а не benchmark peak. Включите idle headroom и replicas для availability: 70% average utilization означает реальную цену выше theoretical full-use. Для capex hardware используйте amortization, power и operations, а не нулевую стоимость GPU.

## Вопрос 309. Почему input и output tokens имеют разную себестоимость на одном LLM server?

## Вопрос 309.1. Почему один миллион generated tokens и один миллион prompt tokens — не одинаковая GPU работа?

**Ответ**

Input tokens обрабатываются prefill параллельно и крупные batches хорошо используют compute; повторяемый prefix может вообще cache-hit. Output tokens требуют sequential decode iterations, долго удерживают KV и часто memory-bandwidth-bound. Поэтому marginal cost одного output token обычно не равен input token cost и зависит от concurrency/context. Это объясняет разные provider tariffs и важно для internal chargeback. Cost model можно калибровать benchmark-ами varying input/output lengths. Если считать все tokens одинаковыми, продукт с длинными reasoning answers субсидируется короткими RAG queries и capacity planning становится неточным.

## Вопрос 310. Как оценить break-even между более дорогим GPU и большим числом дешёвых GPU?

## Вопрос 310.1. Как сравнить H100/B200-подобный дорогой accelerator с кластером более дешёвых GPU на уровне полной экономики?

**Ответ**

Сравнивайте не purchase/hourly price отдельно, а cost per SLO-compliant workload unit. Более дорогой GPU может иметь больше HBM, bandwidth и low-precision throughput, позволяя меньший TP, выше batch и меньше replicas. Дешёвые GPUs могут потребовать cross-node communication и больше power/ops. Постройте для каждого option минимальную topology, затем benchmark realistic trace и рассчитайте required replica count с HA/headroom. Добавьте network, host, licensing и utilization. Break-even меняется с workload: memory-heavy decode, long-context и compute-heavy prefill предпочитают разные characteristics. Решение должно пережить sensitivity analysis по QPS и model sizes.

## Вопрос 311. Как reserved headroom влияет на unit economics inference platform?

## Вопрос 311.1. Почему экономическая модель LLM serving должна оплачивать незанятую GPU capacity?

**Ответ**

Headroom (резерв мощности) снижает utilization и увеличивает номинальную цену токена, но защищает p99 от bursts, failures и slow autoscaling. Если cluster работает в 95–100% steady utilization, потеря одной replica или небольшой traffic spike немедленно создаёт queue collapse. Оптимальный reserve зависит от cold-start time, traffic variance и failover target. Можно держать меньше idle capacity при быстром scale-out и batch traffic, которое легко preempt. Cost model должен явно включать N+1/N+2 redundancy и target utilization, иначе финансовый forecast основан на недостижимой идеальной загрузке. SLO — часть себестоимости.

## Вопрос 312. Как прогнозировать GPU capacity из token traffic, а не только QPS?

## Вопрос 312.1. Как превратить прогноз `100 RPS` в число GPU, если prompts и ответы сильно различаются по длине?

**Ответ**

Разбейте workload на classes с distributions input length, output length, cache hit и SLO. Из benchmark получите service capacity каждого class или simulation parameters prefill/decode. Прогноз traffic переводится в input/output token rates, concurrent lifetime и KV demand. Затем используйте trace replay/scheduler simulation, потому что простое сложение tokens/s игнорирует batching interference и tails. QPS остаётся полезен для frontend, но GPU capacity определяется work per request. Для новых продуктов задайте сценарии short/medium/long и sensitivity. После запуска калибруйте model фактическим telemetry, особенно output-length distribution.

## Вопрос 313. Почему peak tokens/s из vendor benchmark нельзя напрямую использовать для capacity planning?

## Вопрос 313.1. Почему benchmark `10 000 tok/s` почти никогда не означает, что production endpoint можно загрузить ровно до этой цифры?

**Ответ**

Peak benchmark обычно использует фиксированные lengths, optimal batch, warm cache, конкретную precision и не обязательно ваш latency SLO. Production имеет stochastic arrivals, tail lengths, network/frontend overhead, headroom и failures. Кроме того, aggregate throughput при огромном batch может нарушать interactive TPOT. Используйте vendor result как upper-bound/sanity check, затем измерьте собственный engine на целевой model revision и trace. Если внешние данные основаны на MLPerf, внимательно смотрите scenario и latency constraints — они стандартизируют workload, но всё равно не идентичны вашему API. Capacity рассчитывают по sustainable goodput, а не marketing maximum.

## Вопрос 314. Как MLPerf Inference полезен при выборе LLM hardware и чего он не отвечает?

## Вопрос 314.1. Как правильно использовать MLPerf LLM results, не превращая их в готовый sizing calculator?

**Ответ**

MLPerf Inference задаёт стандартизированные models/scenarios, accuracy targets и latency constraints, позволяя сравнивать submitted hardware/software stacks более честно, чем несвязанные vendor demos. В актуальных 2026 suites присутствуют большие LLM и interactive metrics, включая TTFT/TPOT constraints. Но benchmark не моделирует ваш tokenizer, prompt distribution, cache locality, adapters, agent loops или cloud price. Submission также отражает сильно tuned stack. Поэтому MLPerf полезен как evidence аппаратно-программного потенциала и relative comparison, но production decision требует own workload benchmark и TCO.

## Вопрос 315. Как построить SLO для streaming LLM API?

## Вопрос 315.1. Какие latency objectives нужны LLM stream помимо обычного `response time < X`?

**Ответ**

SLO (эс-эл-оу; Service Level Objective — целевой уровень сервиса) обычно разделяет availability и latency. Для streaming полезны TTFT percentile, TPOT/ITL percentile или minimum output rate, а также total latency для bounded outputs. Условия нужно стратифицировать по допустимому input/output size; иначе один 128K request делает SLO нечестным. Например, 99% eligible short-chat requests получают первый token ≤X и 99% inter-token intervals ≤Y. Определите exclusions — client disconnect, invalid request — и не исключайте overload, если это ответственность сервиса. SLO должен быть измерим end-to-end и связан с error budget.

## Вопрос 316. Как error budget применять к inference platform с несколькими классами ошибок?

## Вопрос 316.1. Как error budget помогает решить, стоит ли оставлять более быстрый, но менее стабильный inference runtime?

**Ответ**

Error budget (бюджет допустимых нарушений SLO) объединяет unavailable responses и latency violations согласно service contract. OOM, 5xx, overload rejection и timeout могут считаться по-разному, но rules фиксируются заранее. Quality/model-answer errors обычно требуют отдельного quality SLO: нельзя смешивать hallucination и infrastructure availability в один процент. Burn-rate alerts показывают, насколько быстро расходуется budget в коротком/длинном окне. Если новый runtime даёт +10% throughput, но резко увеличивает tail violations, экономия может не оправдать budget burn. Это связывает performance optimization с reliability decision, а не только benchmark.

## Вопрос 317. Какие SLI нужны для disaggregated prefill/decode architecture?

## Вопрос 317.1. Какие дополнительные метрики нужны после разделения prefill и decode на разные worker pools?

**Ответ**

Помимо обычных TTFT/TPOT нужны queue time каждого pool, prefill duration, KV transfer bytes/latency/failures, time waiting for decode admission и decode iteration latency. Также track orphaned KV blocks/retries и connector saturation. End-to-end TTFT включает prefill + handoff + first decode, поэтому агрегат без phase metrics не объясняет regression. Capacity dashboard должен показывать utilization separately: prefill pool может быть saturated, decode idle или наоборот. Это позволяет independently scale pools — главный operational benefit disaggregation. Для distributed traces handoff ID связывает spans двух worker groups.

## Вопрос 318. Как определить, какой pool масштабировать в disaggregated serving?

## Вопрос 318.1. Как по telemetry понять, нужны ли дополнительные prefill GPUs, decode GPUs или network bandwidth?

**Ответ**

Если prefill queue/TTFT растут, а decode queue и TPOT стабильны, bottleneck в prefill capacity; добавление decode GPUs не поможет. Если first-token handoff быстрый, но active decode count/TPOT растут — масштабируйте decode. KV-transfer saturation может выглядеть как обе фазы свободны при высоком TTFT, тогда нужен fabric/connectors, а не GPUs. Используйте phase-specific utilization и queueing. При heterogeneous hardware сравнивайте marginal capacity per dollar каждого pool. Autoscaler также учитывает time-to-warm и transfer topology. Независимое scaling — преимущество P/D split только при корректной observability.

## Вопрос 319. Как cost attribution организовать в multi-tenant inference platform?

## Вопрос 319.1. Как распределять общую стоимость GPU-кластера между tenants с разной длиной контекста и SLA?

**Ответ**

Tenant chargeback можно строить по logical input/output tokens, model class, cache reuse и reserved SLA. Но фактическая cost неоднородна: long context, low batch, adapters и priority влияют на GPU time. Для простоты продукт может тарифицировать tokens, а internal FinOps — распределять infrastructure cost по weighted work units и dedicated reservations. Не стоит «штрафовать» tenant за platform inefficiency вроде плохого routing; cache savings можно делить между provider и customer согласно product policy. Dashboard должен показывать allocated GPU cost, logical usage, effective cost/token и idle/HA overhead. Это позволяет увидеть убыточные workload classes.

## Вопрос 320. Как capacity model учитывать model switching или несколько checkpoints на одном GPU pool?

## Вопрос 320.1. Почему serverless multi-model inference нельзя sizing-ить так, будто нужный checkpoint всегда уже resident?

**Ответ**

Если GPU worker периодически выгружает одну model и загружает другую, switching cost включает storage read, H2D transfer, graph warmup и потерю KV/prefix cache. При высокой частоте throughput рушится. Поэтому multi-model platform либо выделяет resident replicas популярным models, либо использует memory multiplexing/weight cache и batching requests по model с controlled wait. Capacity model должен учитывать residency probability и cold-switch latency, а не только inference tokens/s. Rare models можно обслуживать separate elastic pool с более высоким TTFT SLO. Model popularity distribution часто Zipf-like, поэтому hot set strategy существенно экономит memory.

## Вопрос 321. Как оценить стоимость cold start для autoscaling LLM replicas?

## Вопрос 321.1. Как решить, дешевле ли держать тёплую запасную LLM replica или терпеть минуты cold start?

**Ответ**

Cold start cost имеет две части: latency до ready и временную избыточную capacity, которую нужно держать заранее, чтобы скрыть это время. Разложите startup на image/container, checkpoint download/read, GPU copy, distributed init, compile/graph capture и health warmup. Затем сопоставьте с burst growth rate. Если replica готовится 4 минуты, reactive autoscaling не спасёт минутный burst — нужен warm pool или predictive scaling. Local NVMe/model cache может снизить startup. Финансово сравнивают стоимость idle warm replicas с SLO/error-budget cost cold starts. Это типичный reliability–cost trade-off.

## Вопрос 322. Как storage bandwidth влияет на масштабирование большого числа replicas одновременно?

## Вопрос 322.1. Почему двадцать одновременно запускаемых LLM replicas могут грузиться намного дольше одной, даже при свободных GPU?

**Ответ**

Scale-out 20 workers может параллельно читать один 200–500 GB checkpoint из object/network storage. Даже если одна replica загружается быстро, aggregate read насыщает storage/NIC и startup time нелинейно растёт — thundering herd. Решения: node-local cache, peer-to-peer distribution, staggered startup, pre-baked local images или storage provisioning под burst. Измеряйте bytes/s per source и cache hit, а не только model load timer. Disaster recovery/rolling rollout должен тестировать массовый cold start, потому что обычное поочерёдное deployment не выявляет shared-storage bottleneck.

## Вопрос 323. Как определить, стоит ли включать speculative decoding для конкретного SLO tier?

## Вопрос 323.1. Как превратить speculative decoding из глобальной настройки в policy для разных latency tiers?

**Ответ**

Постройте per-tier workload curves. Для premium low-concurrency/low-TPOT class speculation может уменьшить streaming latency; для throughput batch tier она может снижать aggregate capacity. Учитывайте VRAM draft model, что влияет на concurrency остальных tenants. Adaptive policy может reserve speculative-capable replicas для latency tier или включать method только ниже active-batch threshold. Сравнивайте cost per SLO-compliant output token, а не raw single-request speedup. Если target quantization/runtime меняется, decision пересматривают: baseline decode cost и acceptance тоже изменятся. Feature становится scheduler/business policy, а не глобальным model flag.

## Вопрос 324. Как оценить пользу KV quantization на уровне cluster economics?

## Вопрос 324.1. Почему KV FP8 может быть экономически выгоден даже без заметного ускорения одного запроса?

**Ответ**

KV quantization может дать три вида эффекта: больше concurrent sequences на GPU, меньший HBM bandwidth per decode и меньше bytes при KV transfer/offload. Даже если TPOT почти не меняется, удвоение cache capacity может сократить число replicas для long-context workload. Но quality regression и conversion overhead ограничивают benefit. Сначала найдите baseline fraction memory, занятую KV; если weights доминируют и context короткий, saving мало влияет. Затем benchmark max goodput/SLO и quality. Переведите результат в GPU count при forecast traffic. Экономический выигрыш — avoided capacity cost минус engineering/quality risk.

## Вопрос 325. Как observability cardinality контролировать при model/tenant/request-level метриках?

## Вопрос 325.1. Как получить подробную диагностику LLM requests, не взорвав time-series систему миллионами label combinations?

**Ответ**

Prometheus-подобные metrics плохо переносят labels с request ID, prompt hash или тысячами tenant/model-adapter combinations. Такие детали отправляют в sampled traces/logs, а metrics используют bounded dimensions: model family, pool, size bucket, priority tier. Top-N tenant analysis можно строить в analytics pipeline, не в realtime label set. Иначе observability сама потребляет CPU/memory и становится incident. Exemplars связывают histogram outlier с trace ID без превращения каждого request в series. Privacy также требует не помещать prompt text/cache keys в labels. High-cardinality telemetry — частая скрытая цена multi-tenant AI platform.

## Вопрос 326. Какие security boundaries должен учитывать multi-tenant LLM inference server?

## Вопрос 326.1. Какие общие ресурсы inference engine создают риск утечки данных между tenants?

**Ответ**

Multi-tenant serving делит GPU, host memory, prefix/KV caches, model weights, logs и network между клиентами. Основные boundaries: request content не должен попадать в чужой response/cache; tenant quotas предотвращают resource exhaustion; adapters/models должны быть авторизованы; telemetry не должна раскрывать prompts. Shared cache особенно чувствителен к cross-tenant reuse и timing side channels. GPU isolation через process/container не автоматически гарантирует отсутствие data remnants в application-managed pools — allocator должен инициализировать/правильно адресовать blocks. Threat model также включает malicious oversized prompts, grammar schemas и model artifacts. Security controls проектируют вместе с scheduler/cache, а не поверх API gateway.

## Вопрос 327. Как prefix cache может создавать timing side channel и как его уменьшить?

## Вопрос 327.1. Как разница cache hit/miss latency потенциально раскрывает факт наличия чужого prompt?

**Ответ**

Если запрос с ранее встречавшимся prefix получает существенно меньший TTFT, атакующий может многократно измерять latency и предполагать, что кто-то уже использовал определённый content. Это timing side channel (побочный канал по времени). Риск зависит от возможности угадать sensitive prefix, noise и shared cache policy. Mitigations: tenant-scoped cache namespace/salt, отключение cross-tenant reuse, coarse timing normalization для особо чувствительных endpoints или dedicated pools. Полностью скрыть timing сложнее и обычно дороже. Решение принимают по data classification: общественный system prompt можно разделять, пользовательские документы — часто нет.

## Вопрос 328. Почему освобождённые KV blocks должны иметь строгую ownership semantics даже без явного zero-fill?

## Вопрос 328.1. Нужно ли обязательно обнулять каждую переиспользованную KV page и от чего зависит ответ?

**Ответ**

Если block allocator гарантирует, что attention kernel читает только positions, принадлежащие текущей sequence и описанные valid lengths/block tables, старые байты вне valid region не должны влиять на computation. Однако bug в length/indexing способен превратить stale data в cross-request leak. Zero-fill каждого блока улучшает defense-in-depth, но добавляет bandwidth cost; некоторые runtimes полагаются на correct metadata/lifetime. Для high-assurance environment стоит оценить threat model, memory initialization cost и GPU/process isolation. Главное — тестировать allocator boundaries adversarially и никогда не позволять uninitialized tokens считаться valid cache positions.

## Вопрос 329. Как malicious long prompts используются для resource-exhaustion атаки на LLM endpoint?

## Вопрос 329.1. Почему для защиты LLM API от DoS лимита requests/min недостаточно?

**Ответ**

Атакующий может отправлять requests близко к max context и большим `max_tokens`, заставляя сервер выполнять дорогой prefill, резервировать KV и долго держать decode slot. Даже при умеренном RPS это эффективнее обычного HTTP flood. Защита — authentication/rate limits, token-based quotas, maximum input/output, admission control и pricing/cost controls. Полезно считать queued/served tokens, не только requests. Для public endpoints нужно ограничивать concurrent long requests per principal. Truncation без уведомления опасна semantic-wise; явный reject лучше. Resource exhaustion — application-layer DoS, который WAF по пакетам может не увидеть.

## Вопрос 330. Какие риски возникают при загрузке untrusted model checkpoint или custom model code?

## Вопрос 330.1. Почему безопасный tensor format не отменяет supply-chain controls вокруг model repository?

**Ответ**

Model artifact — supply-chain input. Pickle-based checkpoints и `trust_remote_code` способны исполнять Python при загрузке; custom CUDA extensions и tokenizer code расширяют attack surface. Используйте safe tensor formats, pinned revisions/hashes, artifact scanning, isolated build/conversion pipeline и review remote code. Даже safetensors не гарантирует, что модель безопасна семантически или что surrounding repository code доверенный. Runtime process должен иметь минимальные filesystem/network privileges. Для production не следует автоматически подтягивать `latest` revision из внешнего hub: reproducibility и incident rollback требуют immutable artifacts.

## Вопрос 331. Как model artifact integrity обеспечить между registry и GPU worker?

## Вопрос 331.1. Как доказать, какой именно набор model shards реально был загружен на production GPU?

**Ответ**

Используйте immutable version identifiers, cryptographic hashes/signatures и controlled registry. Worker должен сверить expected digest до загрузки; deployment manifest связывает model, tokenizer, quantization, chat template и runtime-compatible metadata. Local/node caches также проверяются, иначе corrupted/stale shard может пережить rollout. Для огромных checkpoints checksum verification имеет I/O cost, но его можно интегрировать в artifact ingestion и content-addressed storage. Audit log фиксирует, какой digest обслуживал request. Это превращает rollback и forensic analysis из предположений в воспроизводимую процедуру.

## Вопрос 332. Какие риски у custom CUDA/Triton kernels в inference runtime?

## Вопрос 332.1. Почему custom Triton/CUDA optimization требует security/correctness review, а не только performance benchmark?

**Ответ**

Custom kernel выполняется с прямым доступом к GPU memory; ошибки indexing, races или unsupported shapes могут вызвать corruption, illegal accesses и потенциальную cross-request data exposure внутри процесса. Performance-oriented code часто имеет меньше bounds checks. Поэтому upgrades требуют test matrix по shapes/dtypes/architectures, fuzz/stress и pinned compiler/CUDA versions. Kernel source/dependencies — supply-chain surface. Crash isolation на replica ограничивает blast radius, но silent numerical corruption сложнее обнаружить, поэтому нужны differential correctness tests против reference implementation. «Kernel быстрее benchmark» — недостаточный production acceptance criterion.

## Вопрос 333. Как structured-output grammar, regex или schema могут использоваться для computational abuse?

## Вопрос 333.1. Как защитить guided-decoding backend от pathological пользовательских schemas?

**Ответ**

Пользовательская grammar может компилироваться в large automaton или вызывать expensive state transitions, особенно при pathological regex/schema nesting. Если constraint engine работает на CPU per token, один запрос способен потреблять disproportionate resources. Защита: ограничения размера/complexity schema, compile timeout, cache только validated grammars и безопасный regex/automata engine без catastrophic backtracking. Стоимость constraint compilation включают в rate accounting. Нельзя считать JSON Schema «обычным маленьким metadata»: untrusted grammar — исполняемая в широком смысле computational specification.

## Вопрос 334. Как multi-LoRA serving изолировать по авторизации и данным?

## Вопрос 334.1. Почему `adapter=/some/path` из пользовательского request — опасный интерфейс для multi-LoRA platform?

**Ответ**

Adapter ID должен быть server-resolved authorized resource, а не произвольный filesystem path/URL из request. Tenant получает доступ только к разрешённым adapters; adapter cache namespace и artifact registry контролируются. При dynamic loading проверяют hash/format и запрещают unsafe code. Shared base безопасно общая, но adapter weights могут быть proprietary. Telemetry не должна раскрывать список чужих adapters через detailed errors. Resource quotas нужны и здесь: злоумышленник может thrash adapter cache тысячами valid IDs. Load balancer должен учитывать locality, но security authorization выполняется до routing.

## Вопрос 335. Как prompt logging организовать, чтобы observability не стала каналом утечки данных?

## Вопрос 335.1. Какие LLM observability данные можно хранить постоянно, а какие требуют отдельного privacy режима?

**Ответ**

По умолчанию metrics не должны содержать prompt text. Detailed logs/traces используют redaction, sampling, access control, encryption и retention policy в соответствии с data classification. Tool results, system prompts и generated outputs тоже могут содержать secrets/PII. Для debugging часто достаточно token counts, hashes/fingerprints и request IDs; content capture включают только на approved cohorts. Hash sensitive prompt не всегда анонимен: короткие/угадываемые строки можно dictionary-attack, поэтому salt/tenant scoping важны. Production incident process должен иметь контролируемый способ получить content, а не постоянное безлимитное логирование.

## Вопрос 336. Как защитить inference endpoint от oversized tool schemas и repeated system prompts?

## Вопрос 336.1. Почему размер описаний tools должен входить в token quota так же, как пользовательский текст?

**Ответ**

Tool schemas входят в prompt и могут занимать десятки тысяч tokens, увеличивая prefill, KV и cost на каждый agent step. Platform ставит token budget на schemas, validates count/depth и предоставляет server-side registered tools, чтобы клиент передавал IDs вместо огромного повторения там, где protocol допускает. Stable schemas полезно prefix-cache-ить. Для untrusted clients billing/quota учитывает фактические rendered tokens, а не только user message. Это одновременно performance и abuse control. Если schema превышает limit, лучше явная ошибка или reduced toolset, чем silent truncation system instructions.

## Вопрос 337. Как network-level isolation влияет на disaggregated KV transport?

## Вопрос 337.1. Почему внутренний KV-transfer network нельзя автоматически считать безопасным только потому, что он не публичный?

**Ответ**

KV transfer содержит derived representations пользовательского context и должен считаться чувствительными данными. Prefill/decode fabric требует authentication/authorization endpoints, network segmentation и при необходимости encryption in transit согласно threat model. RDMA/GPUDirect optimizations могут обходить обычные application proxies, поэтому security controls должны существовать на fabric/host level. Tenant ID и request ID нельзя доверять только payload без authenticated channel. Также важно исключить accidental cross-routing KV к другой model/version. Performance cost encryption оценивают benchmark-ом; нельзя молча отключать security ради throughput.

## Вопрос 338. Как secure deletion интерпретировать для GPU memory и model-serving caches?

## Вопрос 338.1. Чем логическое освобождение KV cache отличается от физической zeroization данных?

**Ответ**

Logical deletion означает, что allocator/cache index больше не делает data доступными новому request; physical bits могут оставаться в VRAM до overwrite. Для большинства threat models process isolation + correct bounds достаточны, но regulated/high-assurance требования могут требовать explicit zeroization при tenant teardown или device release. Prefix/KV caches на CPU/NVMe имеют отдельные retention semantics и должны удаляться согласно policy. Cryptographic isolation через per-tenant encrypted external cache может быть практичнее полного постоянного zero-fill HBM. Требования следует формулировать по data lifecycle и adversary capabilities, а не использовать слово «удалено» неоднозначно.

## Вопрос 339. Как rate limiting учитывать cache hits, чтобы не создать бесплатный abuse path?

## Вопрос 339.1. Почему prefix-cache hit не должен автоматически освобождать запрос от token-based rate limits?

**Ответ**

Если quota списывает только фактический prefill compute, атакующий с cache-hot prompt может генерировать огромное число outputs почти без input charge, всё равно занимая decode capacity. Если списывать logical input tokens всегда, billing/fairness проще, но пользователь не получает benefit cache optimization. Обычно отделяют product billing от resource protection: rate limiter учитывает requests, logical input/output token budgets и concurrency независимо от internal cache savings; FinOps может учитывать actual compute. Cache — implementation detail, который не должен обходить abuse controls. Для trusted internal tenants возможны более точные quotas.

## Вопрос 340. Как sandboxing model server process ограничивает blast radius runtime vulnerability?

## Вопрос 340.1. Какие host privileges GPU inference worker можно убрать без ущерба model execution?

**Ответ**

Inference worker обычно не нуждается в полном host filesystem, cloud metadata credentials или произвольном outbound internet. Container/seccomp/capability restrictions, read-only model mounts, dedicated service account и network policy уменьшают последствия RCE в tokenizer/custom code/runtime. GPU device access остаётся мощной capability, поэтому node sharing с unrelated trust domains требует отдельной оценки. Frontend можно отделить от privileged GPU worker через narrow internal protocol. Sandboxing не исправляет data leaks внутри одного multi-tenant process, но ограничивает переход от application vulnerability к cluster compromise.

## Вопрос 341. Почему deterministic reproducibility может быть security/reliability feature, а не только удобством debugging?

## Вопрос 341.1. Как воспроизводимость помогает расследовать спорный или подозрительный production response?

**Ответ**

Reproducible inference помогает forensic analysis: можно повторить подозрительный request, сравнить model/runtime revisions и доказать, где появился regression. Для policy-critical outputs deterministic mode снижает variability тестов. Но полная batch-invariant determinism имеет performance cost и не гарантируется одним seed. Security-wise нельзя использовать deterministic text как cryptographic proof: floating-point/runtime differences остаются. Практичный подход — сохранять immutable deployment metadata, sampling params и request fingerprint; при необходимости запускать controlled deterministic replay. Это повышает auditability, даже если production sampling остаётся stochastic.

## Вопрос 342. Как side-channel risk меняется при cache-aware routing?

## Вопрос 342.1. Почему умный router может усилить информационный side channel shared prefix cache?

**Ответ**

Cache-aware router использует информацию о наличии prefix на конкретных replicas. Если клиент может наблюдать не только latency, но и worker-specific behavior, repeated probes могут дать больше signal о cache residency. Кроме того, routing metadata становится sensitive: она косвенно отражает workload history. Mitigation — tenant-scoped cache/routing, скрытие backend identity, rate limits на probes и неэкспортирование cache-match details наружу. В trusted single-tenant cluster риск минимален; в public multi-tenant service performance optimization пересекает security. Threat model должен включать routing layer, а не только cache storage.

## Вопрос 343. Как isolation pool использовать для tenants с особыми compliance требованиями?

## Вопрос 343.1. Когда dedicated GPU pool оправдан не производительностью, а trust/compliance boundary?

**Ответ**

Dedicated or isolated pool (выделенный пул) отделяет GPU processes, caches, network paths и иногда nodes для определённого tenant/data class. Это снижает cross-tenant leakage surface и упрощает data residency/audit, но ухудшает statistical multiplexing и utilization. Компромисс — shared fleet для обычных workloads и smaller reserved pools для regulated class, с explicit routing policy. Capacity такого pool должна иметь собственный HA/headroom; нельзя рассчитывать на мгновенный borrowing shared GPU, если trust boundary запрещает. Cost allocation отражает premium isolation. Security requirement таким образом напрямую влияет на inference unit economics.

## Вопрос 344. Как API-level model alias может создать risk при незаметном переключении backend checkpoint?

## Вопрос 344.1. Почему model alias должен разрешаться в конкретную immutable revision для audit и cache correctness?

**Ответ**

Alias вроде `best-model` удобен для routing, но если его target меняется без versioned deployment metadata, один и тот же API request в разные дни обслуживается разными models. Это осложняет reproducibility, cache invalidation, quality governance и incident rollback. Для regulated/product-critical use alias resolution нужно логировать как immutable model revision в response/internal trace. Prefix/KV cache namespace привязывают к resolved revision, не alias string. Rollout policy может менять alias постепенно, но должен иметь audit trail. Клиенту при необходимости предоставляют pinned version option.

## Вопрос 345. Как dependency/CUDA-driver patching организовать без риска массового inference outage?

## Вопрос 345.1. Как безопасно выкатывать новый NVIDIA driver/NCCL на большой LLM fleet?

**Ответ**

GPU stack тесно связан: driver, CUDA, NCCL, PyTorch/Triton/runtime и kernels. Security patch может изменить performance или compatibility. Используйте immutable image, compatibility matrix, staging benchmark и small canary nodes; не обновляйте driver in-place на всём fleet. Canary должен проверять multi-GPU collectives, long context, quantization и custom kernels, не только health endpoint. Затем rolling replacement с draining active generations. Сохраняйте быстрый rollback image/driver path. Для critical CVE риск delayed patch сравнивают с rollout risk, но процесс должен позволять безопасно двигаться быстро, а не выбирать между «не патчить» и «обновить всё сразу».

## Вопрос 346. Как секреты в system prompt защищать, если сам model должен их видеть?

## Вопрос 346.1. Почему API key нельзя безопасно спрятать в system prompt даже при приватном inference server?

**Ответ**

System prompt, доступный model, принципиально может быть частично выведен через prompt-injection/jailbreak; infrastructure isolation не превращает его в vault. Поэтому настоящие credentials/API keys не помещают в prompt. Model получает opaque tool capability или policy description, а секрет хранится в tool execution service и используется после authorization. Prefix cache system prompt также рассматривается как sensitive content и tenant/application scoped. Логи/redaction закрывают operational leakage, но не semantic extraction самой моделью. Правило: то, что model видит как tokens, нельзя считать гарантированно нераскрываемым пользователю.

## Вопрос 347. Как tool-call side effects влияют на retry semantics inference request?

## Вопрос 347.1. Почему обычный retry policy LLM API опасен, когда generated tool call уже был исполнен?

**Ответ**

Если model только генерирует text, retry обычно вычислительно дорог, но side-effect-free. В agent system generation может привести к payment, email, database write. Network timeout после tool call не означает, что действие не произошло. Поэтому tool execution использует idempotency keys, transaction state и separates model retry от action retry. Shadow traffic не исполняет tools. Model server response ID связывают с orchestration state. Инфраструктурный automatic retry всего agent turn без awareness side effects способен выполнить действие дважды. Reliability boundary проходит уже не только через inference engine, но и через workflow coordinator.

## Вопрос 348. Какие данные из KV cache можно считать производными от исходного prompt и почему это важно для compliance?

## Вопрос 348.1. Почему KV cache не стоит считать безобидными техническими байтами без требований к хранению?

**Ответ**

KV cache содержит hidden projections keys/values, вычисленные из tokens и model weights. Хотя это не исходный plaintext, нельзя автоматически считать его анонимизированным: representations могут сохранять информацию и используются для точного продолжения model computation. Поэтому retention, tenant isolation и transfer обычно следует применять как к чувствительным derived data, особенно если source prompt регулируемый. Это важно для CPU/NVMe hierarchical cache и disaggregation, где state покидает GPU process. Удаление plaintext log не решает retention KV. Data-classification policy должна явно включать embeddings, KV и cached multimodal features.

## Вопрос 349. Как защититься от tenant-driven cache eviction attack?

## Вопрос 349.1. Как один клиент может ухудшить cache hit rate всего shared LLM сервиса, не превышая обычный RPS limit?

**Ответ**

Злоумышленник может отправлять множество уникальных длинных prefixes и заполнять shared cache, вытесняя hot entries других tenants, ухудшая TTFT и увеличивая compute cost. Это cache pollution/eviction attack. Защита — per-tenant cache quotas, admission based on expected reuse, maximum cacheable prefix length, priority partitions и cost-aware eviction. Token rate limits уменьшают объём атаки, но cache quota даёт более прямую isolation. Мониторьте evicted bytes/tokens по tenant и cache-hit degradation соседей. Не каждое вычисленное KV обязано становиться reusable prefix entry.

## Вопрос 350. Как безопасность взаимодействует с hierarchical KV cache на SSD или remote storage?

## Вопрос 350.1. Почему перенос KV с GPU на SSD меняет не только latency, но и требования к data governance?

**Ответ**

Внешний cache долговечнее GPU HBM и может переживать worker/process lifecycle, поэтому нужны encryption at rest, access control, tenant namespace, TTL/retention и secure deletion semantics. Cache key не должен позволять одному tenant запросить чужой block. Remote service аутентифицирует workers и проверяет model/version metadata. Performance optimization вроде shared deduplication across tenants требует explicit security decision. Incident response должен уметь перечислить/очистить tenant entries. Чем ниже tier, тем больше вероятность backup/replication, поэтому data-governance surface растёт. Hierarchical cache превращает ephemeral inference state в storage system.

## Вопрос 351. Как fuzz testing применить к LLM serving API и runtime boundaries?

## Вопрос 351.1. Какие части LLM serving stack разумно fuzz-ить, если сам текстовый output недетерминирован?

**Ответ**

Fuzzing полезен не для «качества ответа», а для parsers/state machines: malformed JSON/SSE, extreme token IDs, Unicode, stop sequences, nested schemas, cancellation timing, adapter IDs, multimodal metadata. Для internal kernel boundaries генерируют adversarial shapes/lengths и сравнивают с reference implementation, включая block boundaries. Цель — crashes, hangs, OOM amplification, invalid memory access и inconsistent cleanup. Resource limits нужны, чтобы fuzzer сам не стал DoS. Найденный case превращают в regression test. Особенно ценны stateful fuzz sequences: start→stream→cancel→reuse block, потому что редкие lifetime bugs не видны обычными unit tests.

Перед масштабированием такого подхода стоит сопоставить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и убедиться, что оптимизация не переносит bottleneck в соседний слой системы.

## Вопрос 352. Как определить blast radius security или correctness bug в shared inference runtime?

## Вопрос 352.1. Как оценивать масштаб инцидента, если LLM runtime возвращал ответы без ошибок, но мог неверно reuse-ить чужой KV state?

**Ответ**

Начните с resource scope: один request, один process/replica, model revision, tenant cache namespace, node или весь fleet. Затем временной window deployment и affected feature — prefix caching, adapter, quantization, specific kernel. Используйте immutable version telemetry и routing logs, чтобы перечислить потенциально затронутые requests без чтения prompt content. Если bug способен cross-tenant reuse, assume broader exposure до доказательства обратного. Mitigation обычно отключает feature/isolates version, затем проводится forensic replay. Blast radius нельзя оценивать только числом 5xx: silent corruption/data leak может иметь нулевой error rate.

Отдельный нагрузочный эксперимент должен связать compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и зафиксировать владельца решения, способ обнаружения регресса и безопасный путь отмены.

## Вопрос 353. Вы проектируете inference-платформу одновременно для интерактивного чата и offline batch. Делить ли их на разные GPU pools?

## Вопрос 353.1. Как AI-платформе совместить высокую загрузку GPU с гарантией latency для интерактивных пользователей?

**Ответ**

Решение зависит от того, насколько различаются SLO и насколько batch можно preempt. Интерактивный чат требует headroom, низких TTFT/TPOT и устойчивости к burst; batch оптимизируется под высокий throughput и терпит очередь. Полностью отдельные pools дают сильную isolation и простую эксплуатацию, но теряют statistical multiplexing: ночью interactive GPU простаивают. Общий pool эффективнее по cost, если scheduler умеет priority quotas, batch preemption и backpressure без разрушения KV state. Практичный компромисс — reserved minimum interactive capacity плюс elastic shared capacity, которую batch использует при наличии headroom. Решение нужно подтвердить trace replay: p99 interactive при worst-case batch и batch completion time при обычном traffic.

В production-like тесте я бы одновременно контролировал goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 354. Как выбрать между colocated prefill/decode и disaggregated architecture для нового сервиса?

## Вопрос 354.1. Когда P/D disaggregation — зрелое архитектурное решение, а когда преждевременное усложнение?

**Ответ**

Начинайте не с моды, а с workload. Colocation проще: нет KV transport, меньше failure modes, легче deploy/debug, и для коротких prompts или умеренной нагрузки часто даёт лучший cost. Disaggregation оправдана, когда prefill и decode имеют выраженно разные resource profiles, длинные prompts портят tail ITL, требуется независимое scaling фаз или heterogeneous hardware. Постройте baseline colocated с chunked prefill; затем измерьте p99 interference и goodput. Для split добавьте в TCO network fabric, KV connector reliability, extra pools и operational skill. Если benefit проявляется только в synthetic 128K case, который составляет 0.1% traffic, complexity может не окупиться. Architecture gate — measured SLO/cost improvement.

## Вопрос 355. Как определить, нужен ли компании собственный inference platform или достаточно managed API?

## Вопрос 355.1. По каким критериям AI Lead должен принимать build-vs-buy решение для LLM inference?

**Ответ**

Сравните стратегические требования по data residency, model control, latency, cost at scale, custom runtimes/quantization, availability и engineering ownership. Managed API сокращает time-to-market, staffing и hardware lifecycle, но даёт меньше контроля над model revisions, cache behavior, pricing и deep observability. Self-hosting имеет смысл при устойчивом объёме, который амортизирует GPU fleet, либо при constraints, которые provider не закрывает. В TCO включите не только GPU, но SRE, security, capacity headroom, upgrades, incident response и opportunity cost. Часто рациональна hybrid strategy: managed API для long-tail/experimental models, self-hosted hot predictable workloads. Решение пересматривают при изменении traffic и provider economics.

Перед окончательным выбором полезно построить сравнительную кривую по compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback на пиковом трафике и после потери одной replica, а не только в steady state.

## Вопрос 356. Как спроектировать SLO tiers для одной inference-платформы без создания отдельного кластера на каждый продукт?

## Вопрос 356.1. Как дать разным продуктам разные latency guarantees, не превратив fleet в десятки изолированных островов?

**Ответ**

Определите ограниченное число resource/SLO classes, например interactive-premium, interactive-standard и batch, вместо десятков product-specific tiers. Каждый класс получает admission policy, queue weight, max context/output, target TTFT/TPOT и возможно reserved capacity. Scheduler и load balancer должны реализовывать эти различия измеримо; просто label `priority=high` без reserved headroom не создаёт SLA. Shared fleet сохраняет multiplexing, а самые строгие compliance/latency workloads можно вынести в dedicated pool. Chargeback должен отражать стоимость reservation. Перед запуском проведите adversarial load test: premium burst плюс long batch и failure одной replica, чтобы проверить isolation, а не только normal average.

Для production-acceptance здесь особенно важны joint TTFT/TPOT SLO, queueing, tail latency и количество запросов, реально обслуженных в пределах цели при реальном distribution запросов, а не на одном удобном фиксированном shape.

## Вопрос 357. Как выбрать стратегию graceful degradation при перегрузке enterprise LLM platform?

## Вопрос 357.1. Какие функции можно деградировать при overload, а какие должны оставаться жёсткими инвариантами?

**Ответ**

Сначала ранжируйте invariants: security/correctness нельзя ухудшать скрыто, availability/quality/latency могут иметь допустимые компромиссы. Возможный порядок: остановить/замедлить batch, reject low-priority requests, ограничить optional long outputs, route на approved smaller model, и только затем более жёсткие меры. Нельзя silently truncate system context или отключать safety/authorization. Для каждого fallback заранее определяют compatibility и response metadata, а не импровизируют во время incident. Policy тестируют load-shedding game day. Финансовый эффект также важен: fallback model может быть дешевле, но если quality падает ниже product floor, честный 429 лучше. Graceful degradation — продуктовый контракт, а не только scheduler feature.

Чтобы решение не осталось теоретическим, нужен контрольный прогон по joint TTFT/TPOT SLO, queueing, tail latency и количество запросов, реально обслуженных в пределах цели с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 358. Как решить, нужен ли отдельный long-context service tier?

## Вопрос 358.1. Когда 128K/256K запросы стоит физически отделить от обычного chat-serving?

**Ответ**

Long-context requests создают непропорциональный prefill, KV lifetime и tail interference, поэтому смешивание с коротким chat может быть дорого. Отдельный tier оправдан, если доля long prompts значима, у них другой SLO/цена или нужны context-parallel/disaggregated topology. Если они редки, отдельный fleet будет простаивать; лучше token-aware admission, chunked prefill и lower concurrency в общем pool. Анализируйте не threshold «>32K», а cost distribution и blast radius на short traffic. Product tier также может стимулировать retrieval/compaction вместо необязательного stuffing. Решение должно учитывать model quality на long context: платить за 256K capacity бессмысленно, если модель практически не использует его качественно.

Перед масштабированием такого подхода стоит сопоставить качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации вместе с operational метриками, которые определяют стоимость дежурства и сопровождения.

## Вопрос 359. Как спроектировать multi-model platform, если продукты требуют десятки моделей с разной популярностью?

## Вопрос 359.1. Как обслуживать long tail из десятков LLM, не держа каждую модель постоянно в VRAM?

**Ответ**

Разделите hot, warm и cold models по traffic. Hot checkpoints держите resident с dedicated/autoscaled replicas; warm — в shared pool с controlled weight cache и bounded switch rate; cold — serverless/managed fallback с более высоким startup SLO. Routing учитывает model locality и queue, но не позволяет cold model churn вытеснять hot capacity. Artifact formats и runtime compatibility стандартизируйте, иначе каждый model становится уникальным deployment. Для популярных models допускайте specialized runtime/quantization, для long tail — более универсальный backend. Финансово измеряйте GPU-hours lost on idle residency против cold-start latency. Platform API должен скрывать infrastructure, но version resolution оставлять auditable.

При canary-проверке важно увидеть ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать после полного прогрева и отдельно в cold-cache/cold-start режиме.

## Вопрос 360. Как определить, нужна ли единая serving technology для всех моделей или несколько runtimes?

## Вопрос 360.1. Должен ли AI platform стандартизироваться на одном vLLM/SGLang/TensorRT-подобном runtime или поддерживать несколько?

**Ответ**

Один runtime уменьшает cognitive load, CI matrix и on-call complexity, но model architectures развиваются быстрее, чем любой engine. Несколько runtimes дают лучший support/performance для отдельных families, но требуют unified gateway, metrics, rollout и security standards. Используйте «paved road»: основной runtime для большинства workloads, exception process для models, где доказан существенный gap по features/quality/cost. Exception должна иметь owner и exit plan. Не создавайте runtime diversity ради 5% benchmark gain, если команда не может безопасно обновлять и дежурить по нему. Но и не блокируйте стратегическую модель из-за стандартизации. Решение — portfolio management по measured value и operational burden.

В качестве последнего gate полезно проверить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и проверить, не покупается ли локальный performance gain ценой худшей fairness или isolation.

## Вопрос 361. Как выбрать основной serving runtime в 2026 году для NVIDIA GPU fleet?

## Вопрос 361.1. Как принимать решение между vLLM, SGLang и TensorRT-LLM без сравнения по одному tokens/s benchmark?

**Ответ**

Сначала составьте must-have matrix: model families, dense/MoE/MLA, quantization formats, speculative methods, structured outputs, LoRA, TP/EP/DP, disaggregation, observability и API compatibility. Затем benchmark vLLM, SGLang и TensorRT-LLM-подобные candidates на ваших 2–3 ключевых workloads и hardware, включая p99 under load и upgrade process. Учтите ecosystem velocity и staffing: fastest engine, который команда не умеет debug-ить, повышает incident risk. TGI для нового optimized serving в 2026 уже находится в maintenance mode, поэтому его разумнее оценивать как legacy/migration case. Выбирайте primary runtime плюс documented escape hatch, а не «вечного победителя».

Перед окончательным выбором полезно построить сравнительную кривую по compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 362. Как определить, стоит ли внедрять aggressive 4-bit quantization в production platform?

## Вопрос 362.1. Когда экономия VRAM от W4 оправдывает дополнительный quality-risk и validation burden?

**Ответ**

Установите quality floor по критическим tasks, затем измерьте memory/cost benefit. Если W4 позволяет сократить TP, удвоить concurrency или перейти на дешевле hardware, value может быть крупным. Но если текущий workload compute-bound prefill и W4 kernel слабый, выигрыш только в storage не оправдывает quality risk. Включите long-context, structured output, multilingual/code и safety-relevant regression tests. Rollout делайте по model-specific policy, а не глобально: часть checkpoints хорошо переносит W4, часть — нет. Сохраните BF16/FP8 fallback для high-quality tier. Quantization — продуктовый quality/cost trade-off, поэтому acceptance подписывают и model owners, и platform owners.

На практике перед rollout я бы отдельно измерил quality regressions, реальную экономию памяти, kernel throughput и итоговую стоимость при фиксированном SLO в разрезе workload classes, чтобы одна выгодная когорта не скрывала регресс другой.

## Вопрос 363. Как выбрать между weight quantization и KV-cache quantization, если VRAM не хватает?

## Вопрос 363.1. Как по memory breakdown решить, какие именно данные квантовать первыми — model weights или KV state?

**Ответ**

Сначала разложите peak VRAM на static weights и dynamic KV. Если weights занимают 80% и context короткий, W4/W8 даст больше; если model уже FP8/W4, а hundreds concurrent long sessions заполняют KV, сжимать cache логичнее. Weight quantization может изменить quality независимо от context; KV quantization особенно проверяют на long sequences. Оба метода способны ускорить bandwidth-bound decode, но hardware kernels различаются. Иногда weight quantization позволяет уменьшить TP и тем самым высвобождает ещё больше memory; KV quantization увеличивает per-replica concurrency без reshaping topology. Выберите минимально рискованный вариант, который устраняет конкретный measured memory bottleneck, затем рассмотрите комбинацию.

Реальный выбор подтверждается только после сравнения cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 364. Как решить, стоит ли делать prefix cache общим между tenants?

## Вопрос 364.1. Где провести границу между безопасным global prefix reuse и tenant-isolated KV cache?

**Ответ**

Cross-tenant sharing максимизирует reuse для общего system prompt, public documents и identical templates, но создаёт privacy/timing side-channel и quota fairness вопросы. Tenant-scoped cache безопаснее, но дублирует popular public prefixes. Разумный design классифицирует cacheable content: provider-owned immutable public prefixes можно помещать в global trusted namespace; customer content — tenant/application namespace с salt и access control. Не делайте automatic cross-tenant dedupe всего prompt ради нескольких процентов hit rate. Security team должна утвердить boundary, а performance team измерить потерянную экономию. Shared cache — data-sharing mechanism по сути, даже если хранит не plaintext.

При повторной оценке конфигурации первым делом сравниваются cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes в разрезе workload classes, чтобы одна выгодная когорта не скрывала регресс другой.

## Вопрос 365. Как спроектировать cache-aware load balancing без жёсткой session affinity?

## Вопрос 365.1. Как сохранить benefit session locality и одновременно не привязать пользователя к перегруженной replica?

**Ответ**

Router должен оценивать пользу locality и текущую очередь. Жёсткая affinity сохраняет KV, но при slow/hot worker session получает плохую latency и не использует spare capacity. Лучше soft affinity: cache hit даёт negative cost, queue delay — positive; при превышении threshold request уходит на другую replica и делает recompute/remote cache fetch. Для multi-turn sessions можно реплицировать/выносить valuable prefixes в hierarchical cache. Routing algorithm нуждается в global-enough telemetry, но не должен становиться central bottleneck. Failure worker должен автоматически разрывать affinity. Оцените p99, load skew и saved prefill tokens на trace replay, включая scale-out/cold-cache scenarios.

Для доказательства системной пользы нужно измерить cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes при реальном distribution запросов, а не на одном удобном фиксированном shape.

## Вопрос 366. Как определить, когда hierarchical KV cache окупает operational complexity?

## Вопрос 366.1. По каким traffic traces понять, что GPU-only prefix cache уже недостаточен и нужен внешний KV tier?

**Ответ**

Он оправдан, если GPU cache miss регулярно приводит к очень дорогому recompute длинных reusable prefixes, а reuse interval длиннее GPU residency. Тогда CPU/NVMe tier может хранить working set значительно больше HBM. Сначала измерьте distribution reused-prefix length и time-between-reuse, затем сравните recompute time с measured tier→GPU transfer. Если большинство prefixes короткие или одноразовые, внешний cache лишь добавит storage, security и invalidation complexity. Учитывайте data governance и failure recovery. Начните с CPU tier для clear hot/warm reuse, прежде чем строить remote distributed KV store. Success metric — saved GPU compute/cost и TTFT under SLO, не cache capacity в терабайтах.

## Вопрос 367. Как выбрать hardware для prefill-heavy RAG и decode-heavy reasoning workloads?

## Вопрос 367.1. Почему лучший GPU для long-prompt RAG не обязательно лучший для long-output reasoning?

**Ответ**

RAG с большим retrieved context и коротким ответом имеет высокую долю prefill compute; reasoning с коротким prompt и тысячами output tokens — много sequential decode и KV lifetime. Prefill ценит Tensor Core throughput и efficient long-attention kernels; decode — HBM bandwidth/capacity, low-latency kernels и batching opportunities. Поэтому один GPU ranking не универсален. Постройте weighted workload portfolio и benchmark $/request under SLO. Если fleets можно разделить, heterogeneous pools иногда дешевле; если operational simplicity важнее, выберите hardware с лучшим blended TCO. Не сравнивайте только peak FLOPS: memory bandwidth и low-precision support могут определять decode economics.

До закрепления этой архитектуры нужно получить данные по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 368. Как определить, выгодно ли держать draft model для speculative decoding в общей production topology?

## Вопрос 368.1. Когда speculative draft стоит держать на каждом сервере, а когда лучше создать отдельный latency-optimized pool?

**Ответ**

Оцените долю traffic, где speculation реально ускоряет SLO: обычно low-concurrency latency-sensitive workloads. Draft weights занимают VRAM на каждой replica, уменьшая KV capacity даже для requests, где speculation бесполезна. Если benefit нужен только premium tier, выделите specialized replicas или используйте lightweight n-gram/native MTP methods. При high QPS adaptive disable может вернуть throughput, но memory всё равно занята draft. Сравните cluster-wide GPU count с/без speculation при forecast mix, а не single-request benchmark. Также учтите operational compatibility target revisions с draft checkpoints. Если target часто обновляется, поддержка paired drafts становится recurring cost.

Чтобы trade-off был управляемым, заранее фиксируются границы по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации в одном и том же deployment bundle, чтобы не смешать эффект нескольких изменений.

## Вопрос 369. Как AI Lead должен выбирать уровень overprovisioning для high-availability inference?

## Вопрос 369.1. Как вывести резерв GPU из failure target, а не выбрать условные `20% запаса`?

**Ответ**

Определите failure scenario, который сервис обязан пережить: потеря одной replica, одного node, rack/AZ или planned rollout. Затем посчитайте capacity after failure при target SLO, а не просто replica count. Если N replicas загружены на 80%, потеря 1 из 5 оставляет 100% — без burst headroom. Autoscaling cold start определяет, сколько резервировать заранее. Multi-AZ повышает resilience, но cross-zone networking и model distribution стоят денег. Batch capacity можно preempt и использовать как резерв, если это доказано game day. Overprovisioning — страховая премия; её размер связывают с availability SLO/error budget и стоимостью downtime.

Отдельный нагрузочный эксперимент должен связать качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 370. Как спроектировать inference platform для нескольких регионов: active-active или active-passive?

## Вопрос 370.1. Когда multi-region LLM serving должен быть active-active, а когда достаточно тёплого standby?

**Ответ**

Active-active уменьшает user latency и постоянно проверяет оба региона, но требует достаточной capacity в каждом, replicated model artifacts/config и routing, а cache locality остаётся региональной. При regional failure surviving regions должны иметь headroom или shed load. Active-passive дешевле steady-state, но cold standby model loading и untested capacity могут сделать failover медленным. Data residency может запрещать перенос prompts между regions. Решение зависит от RTO/RPO-like requirements для stateless inference, traffic geography и artifact startup. Проведите regional failover exercise с реальным load, включая loss of prefix cache, а не только DNS health check.

На canary я бы проверил не среднее значение, а ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 371. Как versioning model, tokenizer, template и runtime объединить в один deployment contract?

## Вопрос 371.1. Что именно нужно version-ить вместе с checkpoint, чтобы production inference был воспроизводимым?

**Ответ**

Пользователь видит «модель», но результат определяется checkpoint revision, tokenizer, chat template, quantization, RoPE/context config, runtime/kernel versions и decoding defaults. Platform должна создавать immutable deployment revision, которая ссылается на весь этот bundle. Routing alias разрешается в revision; telemetry и responses внутренне фиксируют его. Cache namespace также привязывается к совместимому state fingerprint. Это делает rollback атомарным: нельзя откатить weights, оставив новый template/KV cache. CI тестирует bundle целиком. Такой contract снижает класс инцидентов, где «модель не менялась», но поведение или latency изменились из-за скрытого компонента.

До закрепления этой архитектуры нужно получить данные по compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback после полного прогрева и отдельно в cold-cache/cold-start режиме.

## Вопрос 372. Как определить, когда performance optimization требует отдельного platform team ownership?

## Вопрос 372.1. Когда LLM inference перестаёт быть библиотекой внутри продукта и становится самостоятельной платформенной функцией?

**Ответ**

Если serving cost/latency становятся существенной частью economics и несколько product teams независимо настраивают quantization, batching, GPU topology и incidents, централизованная platform capability окупается. Команда владеет runtime lifecycle, benchmarking, capacity, observability, security baseline и paved road; product teams — quality/use-case requirements. Если компания имеет один небольшой endpoint, отдельная команда создаст organizational overhead. Сигналы зрелости: multi-model fleet, значительные GPU spend, on-call incidents, repeated optimization work и need for SLO tiers. Ownership boundaries должны быть явными: кто решает model upgrade, кто quality sign-off, кто может менять scheduler policy во время incident.

В production-like тесте я бы одновременно контролировал ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать на пиковом трафике и после потери одной replica, а не только в steady state.

## Вопрос 373. Как сформировать performance acceptance gate для нового model deployment?

## Вопрос 373.1. Какие критерии должны блокировать rollout новой модели даже при лучшем benchmark quality?

**Ответ**

Gate должен включать quality floor и системные metrics на reference workload: cold start, memory footprint, max context, p50/p95/p99 TTFT/TPOT, sustainable goodput, OOM/preemption, distributed stability и cost estimate. Отдельно проверяются critical features — structured output, LoRA, long context, speculation. Сравнение идёт с текущим production baseline при одинаковом trace и hardware. Допустимые regressions могут быть разными: +5% cost допустим при существенном quality gain, но p99 SLO breach — нет. Решение фиксируется как explicit trade-off, а не автоматически по «в среднем быстрее». Gate versioned, чтобы новые platform capabilities добавлялись без ручного heroics.

В финальном decision record должны быть числа по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и повторить измерение после изменения модели или hardware, если исходные assumptions перестали выполняться.

## Вопрос 374. Как решить, нужно ли поддерживать on-demand context length до максимума модели или фиксированные tiers?

## Вопрос 374.1. Почему context window полезно превращать в несколько platform classes вместо одного универсального лимита?

**Ответ**

Полностью динамический 1K–256K endpoint удобен API-wise, но scheduler, memory reservation и SLO становятся непредсказуемыми; rare huge requests влияют на всех. Fixed/bucketed tiers — например ≤16K, ≤64K, ≤256K — позволяют разные pools, limits, pricing и performance expectations. Даже в одном fleet admission может учитывать bucket. Если long-context demand мал, отдельный max tier можно route на specialized capacity. Product должен ясно объяснять, что capability и guaranteed latency различаются. Tiers также помогают cost attribution и prevent abuse. Недостаток — routing complexity и потенциальная фрагментация capacity; поэтому количество классов держат небольшим.

Чтобы решение не осталось теоретическим, нужен контрольный прогон по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и заранее определить условие rollback при выходе за допустимые границы.

## Вопрос 375. Как выбрать default sampling parameters на platform level, не вмешиваясь в product semantics?

## Вопрос 375.1. Где проходит граница ответственности между platform guardrails и продуктовым выбором temperature/top-p?

**Ответ**

Platform может задавать safe technical defaults — max output, supported temperature range, deterministic option — но task-specific temperature/top-p определяют product quality. Нельзя менять sampling ради throughput без согласования: это model behavior. Однако decoding parameters влияют на output length, speculative acceptance и reproducibility, поэтому platform должна их наблюдать и включать в workload modeling. Хороший contract разделяет semantic knobs, которыми владеет product/model team, и resource guardrails, которыми владеет platform. Изменение default у существующего model alias — versioned behavior change с quality rollout, а не незаметная performance настройка.

Вместо ещё одного microbenchmark стоит проверить ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 376. Как оценить миграцию с legacy TGI на современный runtime без ненужного риска?

## Вопрос 376.1. Как безопасно уйти с serving runtime в maintenance mode, не превращая migration в большой bang?

**Ответ**

Сначала inventory features: model architectures, quantization, adapters, streaming/API semantics, metrics и custom extensions. Создайте compatibility tests OpenAI/TGI API behavior, затем paired performance/quality benchmark новой платформы. Shadow traffic выявит hidden prompt distributions, а canary — integration. Не переписывайте application одновременно: gateway adapter снижает blast radius. План rollback сохраняет TGI capacity до завершения soak. Поскольку TGI в 2026 maintenance mode, стратегический мотив миграции — future feature/security/support velocity, но бизнес-кейс всё равно должен учитывать engineering effort. Миграция успешна, когда downstream behavior и SLO подтверждены, а legacy operational dependency можно удалить.

При повторной оценке конфигурации первым делом сравниваются compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback после полного прогрева и отдельно в cold-cache/cold-start режиме.

## Вопрос 377. Как сравнивать open-source serving runtime и proprietary optimized stack?

## Вопрос 377.1. Как AI Lead оценит vendor lock-in против performance преимущества закрытого inference stack?

**Ответ**

Сравнивайте по жизненному циклу, а не только benchmark. Open-source runtime даёт прозрачность, возможность patch/debug, широкую model velocity и меньший vendor lock-in, но platform team сама отвечает за integration, upgrades и support. Proprietary stack может дать лучшую hardware-specific optimization, enterprise support и predictable roadmap, но ограничивает portability и может иметь licensing/runtime constraints. Проведите benchmark critical workloads и operational proof: upgrade, failure recovery, observability, model onboarding. В контракте vendor важны support SLA и доступ к fixes. Решение может быть двухуровневым: open primary path и proprietary accelerator path для workloads с доказанным существенным TCO benefit.

Решение становится обоснованным, когда trace replay показывает compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback на пиковом трафике и после потери одной replica, а не только в steady state.

## Вопрос 378. Как определить, стоит ли писать собственные CUDA/Triton kernels вместо использования runtime ecosystem?

## Вопрос 378.1. Когда собственный Triton kernel — стратегическая оптимизация, а когда дорогая локальная микроправка?

**Ответ**

Собственный kernel оправдан, если profiler показывает устойчивый крупный hotspot, существующие backends его не закрывают, а savings значимы на масштабе fleet. Нужно оценить total ownership: GPU generations, compiler/runtime upgrades, correctness matrix, on-call и security review. 10% ускорение kernel, занимающего 5% request time, даёт максимум около 0.5% end-to-end и почти никогда не оправдывает отдельный код. Напротив, specialized MLA/MoE operation, занимающая 40% GPU spend, может окупить инвестицию. Сначала upstream issue/contribution или FlashInfer/CUTLASS primitives; fork — последний вариант. Performance engineering руководствуется Amdahl’s Law и recurring maintenance cost.

При повторной оценке конфигурации первым делом сравниваются compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback при обычной нагрузке, burst и контролируемом failure scenario.

## Вопрос 379. Как применять Amdahl’s Law к roadmap inference optimization?

## Вопрос 379.1. Как математически доказать, что ускорять небольшой kernel на 3× почти бессмысленно для end-to-end latency?

**Ответ**

Amdahl’s Law показывает, что ускорение ограничено долей времени оптимизируемого компонента: общий speedup `1/((1-p)+p/s)`, где p — доля baseline времени, s — ускорение компонента. Если attention занимает 20%, даже бесконечное его ускорение даст максимум 1.25×. Для roadmap соберите phase profile на representative workload и ранжируйте hotspots с учётом engineering effort. Но доли меняются после оптимизации и с traffic: quantization weights может сделать KV attention новым bottleneck. Поэтому profile повторяют итеративно. Закон помогает отсекать инициативы с эффектными microbenchmarks, но низким fleet-level value.

Перед широким rollout следует количественно проверить ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать и убедиться, что оптимизация не переносит bottleneck в соседний слой системы.

## Вопрос 380. Как использовать Pareto frontier при выборе model/runtime/quantization configuration?

## Вопрос 380.1. Как выбирать inference configuration, когда нет одной системы, лучшей одновременно по качеству, latency и цене?

**Ответ**

Каждая конфигурация имеет вектор quality, TTFT, TPOT, throughput, memory и cost. Dominated option хуже другой по всем важным dimensions и его можно убрать. Оставшиеся точки образуют Pareto frontier: улучшить одну цель можно только ухудшив другую. AI Lead затем накладывает constraints — например quality≥Q, p99 TPOT≤T — и среди допустимых выбирает минимальную cost/operational risk. Это лучше «общего рейтинга моделей». Frontier строят по реальным workloads; если добавить long-context class, ranking может измениться. Решение документирует, какой trade-off выбран и что должно измениться, чтобы его пересмотреть.

Реальный выбор подтверждается только после сравнения quality regressions, реальную экономию памяти, kernel throughput и итоговую стоимость при фиксированном SLO в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 381. Как избежать vendor benchmark bias при выборе accelerator/runtime?

## Вопрос 381.1. Какие проверки защищают procurement от выбора GPU по несопоставимым marketing tokens/s?

**Ответ**

Требуйте reproducible configuration: model revision, precision, batch, prompt/output lengths, SLO, software versions и power/topology. Vendor benchmark закономерно показывает stack в выгодном режиме, что полезно как верхняя граница, но может не совпадать с вашим workload. Используйте standardized MLPerf там, где подходит, и собственный trace benchmark на shortlisted hardware. Не сравнивайте разные quality levels или quantizations как равные. Cost normalization включает server/NIC/power, а не только GPU MSRP. Если доступ к hardware ограничен, проводите sensitivity analysis и пилот у нескольких providers. Decision memo должен отделять measured internal results от vendor claims.

Перед широким rollout следует количественно проверить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 382. Как оценить зрелость нового inference runtime до production adoption?

## Вопрос 382.1. Как отличить перспективный benchmark-проект от runtime, который команда готова поставить на дежурство?

**Ответ**

Смотрите не только GitHub stars/benchmark: model coverage ваших checkpoints, release cadence, backward compatibility, issue response, test suite, observability, security process и реальные production users. Выполните failure drills: OOM, cancellation, worker death, long-context, upgrade/rollback. Проверьте documentation versioning и ability pin dependencies. Новый runtime может быть fastest, но frequent breaking APIs удорожают platform. Введите maturity tiers: experimental shadow, limited canary, production approved. Adoption criteria включают owner внутри компании и fallback path. Не ждите «идеальной зрелости», если business value высок, но ограничьте blast radius ранней версии dedicated pool.

Перед масштабированием такого подхода стоит сопоставить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 383. Как принимать решение о fork open-source serving runtime?

## Вопрос 383.1. Когда внутренний fork vLLM/SGLang-подобного проекта оправдан, а когда нужно добиваться upstream решения?

**Ответ**

Fork даёт контроль над critical patch/feature, но создаёт divergence tax: каждое upstream release нужно merge/port, security fixes могут конфликтовать, а internal expertise становится обязательной. Сначала попытайтесь configuration/plugin, upstream PR или small maintained extension. Fork оправдан, если изменение стратегически важно, upstream не принимает его и экономический эффект превосходит постоянную командную стоимость. Установите owner, automated rebase/test cadence и критерий выхода обратно upstream. Чем глубже patch в scheduler/memory/kernel internals, тем дороже divergence. Нельзя заводить fork как временный hotfix без плана — через год он часто становится неявной платформой.

Вместо ещё одного microbenchmark стоит проверить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 384. Как выбрать release cadence runtime и CUDA stack для стабильной production платформы?

## Вопрос 384.1. Как балансировать быстрый доступ к новым LLM features и стабильность CUDA/runtime production stack?

**Ответ**

Слишком частые upgrades дают новые optimizations/model support, но увеличивают regression surface; слишком редкие оставляют security fixes и hardware capabilities. Разделите fast-moving validation branch и production channel с регулярным, например monthly/quarterly, upgrade train плюс emergency path. Каждая версия проходит automated quality/performance/failure suite и canary. Model onboarding не должен автоматически требовать latest entire stack, если можно backport support. Сохраняйте несколько tested compatibility bundles driver/CUDA/runtime. Decision зависит от model velocity бизнеса: research platform терпит быстрее cadence, regulated serving — медленнее. Главное — предсказуемый процесс, а не конкретное число недель.

Перед широким rollout следует количественно проверить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и повторить измерение после изменения модели или hardware, если исходные assumptions перестали выполняться.

## Вопрос 385. Как организовать model onboarding, чтобы каждая новая architecture не становилась отдельным проектом?

## Вопрос 385.1. Какие стандарты превращают добавление новой LLM в повторяемый pipeline вместо ручной интеграции?

**Ответ**

Создайте standardized contract: immutable artifacts, tokenizer/template, supported context, precision candidates, quality suite, resource estimate и serving features. Automated pipeline проверяет загрузку, reference outputs, memory, short/long perf, API semantics и security. Models, поддерживаемые paved-road runtime, проходят self-service; исключения с custom code/kernels требуют platform review. Quantization — отдельный derived artifact с lineage. В результате product team приносит model package и acceptance criteria, platform возвращает approved deployment classes. Это уменьшает heroics и позволяет параллельно поддерживать десятки checkpoints. Metrics onboarding time и exception rate показывают, где platform contract слишком узок.

Чтобы trade-off был управляемым, заранее фиксируются границы по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 386. Как управлять model-specific performance tuning без explosion конфигураций?

## Вопрос 386.1. Как получить model-specific tuning, не поддерживая вручную сотни уникальных server command lines?

**Ответ**

Полностью общие defaults оставляют performance на столе, но сотни ручных knobs создают unreproducible fleet. Используйте небольшое число profiles по architecture/hardware/workload class: dense-GQA interactive, MoE-EP, long-context, batch. Autotuning pipeline может подобрать batch/token budget/graphs и сохранить versioned profile. Ручные overrides допускаются через code review и expiration/owner. Не оптимизируйте каждый endpoint независимо: копите benchmark knowledge centrally. При runtime upgrade profiles revalidate автоматически. Конфигурация должна быть declarative и observable в request metadata, чтобы incident мог связать regression с tuning revision.

Перед окончательным выбором полезно построить сравнительную кривую по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации для short, median и tail-size запросов, потому что среднее скрывает главный риск.

## Вопрос 387. Как оценить portability между NVIDIA, AMD и Apple/CPU inference ecosystems?

## Вопрос 387.1. Как избежать hardware lock-in, не отказываясь от vendor-specific low-precision optimizations?

**Ответ**

Portability имеет уровни: model artifact, functional runtime support и competitive performance. GGUF/portable frameworks могут запускаться на разных backends, но specialized FP8/FP4 kernels и distributed features часто vendor-specific. Если multi-vendor strategy важна, выбирайте canonical checkpoints и API contracts независимо от hardware, а optimized derived artifacts генерируйте per backend. Не требуйте bit-identical outputs; требуйте quality/SLO equivalence. TCO включает engineering duplication и smaller ecosystem risk. Multi-vendor может быть стратегической страховкой supply/cost, но если 95% fleet NVIDIA и команда мала, premature portability может замедлить core platform. Решение основывается на procurement risk horizon.

В финальном decision record должны быть числа по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 388. Как выбрать между cloud GPU instances и собственным bare-metal fleet для inference?

## Вопрос 388.1. Когда стабильный LLM traffic стоит переносить с облачных GPU на собственное железо?

**Ответ**

Cloud даёт быстрый capacity acquisition, regions, managed networking и эластичность, но hourly premium и availability конкретных GPU shapes могут быть высокими. Bare metal выгоднее при устойчивой высокой utilization и даёт контроль topology/storage, но требует capex, procurement lead time, datacenter/ops и запас spare hardware. Постройте 2–3-летний TCO с realistic utilization, headroom, power, staff и depreciation; отдельно цените flexibility при смене model/hardware generation. Hybrid часто разумен: owned/base reserved capacity под predictable traffic, cloud burst/new hardware для peaks и экспериментов. Data residency и inter-region egress могут изменить решение сильнее GPU price.

Для этой архитектуры главным validation-набором будут goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 389. Как оценить риск hardware generation transition для inference platform?

## Вопрос 389.1. Как безопасно переходить на Blackwell-подобное новое поколение, не строя production на незрелых kernels?

**Ответ**

Новое поколение обещает higher throughput/precision, но early software ecosystem может иметь kernel gaps, driver bugs и дефицит capacity. Не мигрируйте fleet по peak specs. Создайте compatibility lab, benchmark representative dense/MoE/long-context workloads, проверьте quantization quality и operational stack. Начните с workloads, где new hardware имеет явный advantage; держите old generation как rollback capacity. Artifact strategy должна поддерживать разные quantizations одновременно. Procurement учитывает learning curve и resale/depreciation. Переход считается успешным, когда cost per good token улучшился с учётом utilization и stability, а не когда microbenchmark достиг marketing TOPS.

В production-like тесте я бы одновременно контролировал goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 390. Как решить, поддерживать ли несколько quantized variants одной модели?

## Вопрос 390.1. Когда стоит иметь BF16, FP8 и W4 версии одной LLM одновременно, а когда это лишняя сложность?

**Ответ**

Variants имеют смысл, если разные tiers получают реальную ценность: FP8/BF16 quality-premium, W4 cost-efficient, возможно platform-specific FP4. Но каждый variant умножает artifacts, validation, cache namespaces, routing и incident surface. Не храните 7 schemes «на всякий случай». Выберите минимальный набор точек Pareto frontier и автоматизируйте regression suite. Model alias должен явно или политикой выбирать tier; нельзя случайно смешивать качество. Если hardware fleet heterogeneous, variants могут соответствовать native formats. Удаляйте вариант, когда он dominated после runtime/hardware upgrade. Portfolio quantization — управляемый product/platform contract, а не коллекция файлов.

На практике перед rollout я бы отдельно измерил quality regressions, реальную экономию памяти, kernel throughput и итоговую стоимость при фиксированном SLO и зафиксировать владельца решения, способ обнаружения регресса и безопасный путь отмены.

## Вопрос 391. Как принимать решение о native FP4 adoption, если hardware поддерживает формат, но quality data ограничены?

## Вопрос 391.1. Как внедрять новый 4-bit hardware format, когда performance benefit ясен раньше quality confidence?

**Ответ**

Разделите hardware opportunity и model risk. Сначала benchmark memory/throughput native FP4 path на representative models; затем расширьте quality suite на sensitive tasks, long context, multilingual, structured output и safety. Используйте canary только там, где fallback BF16/FP8 доступен и outputs не irreversible. Не делайте fleet-wide conversion из-за theoretical 2× bytes saving. Если FP4 позволяет halve TP или server count, business upside велик и оправдывает больше evaluation effort. Сохраните artifact lineage и reproducible quantization recipe. Решение можно начать с batch/non-critical tier, собирая evidence до premium workloads.

В финальном decision record должны быть числа по quality regressions, реальную экономию памяти, kernel throughput и итоговую стоимость при фиксированном SLO с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 392. Как оценить licensing risk model/runtime в долгосрочной platform strategy?

## Вопрос 392.1. Почему лицензия model checkpoint должна входить в architecture decision record так же, как performance?

**Ответ**

Проверяйте отдельно model license, runtime/library licenses и redistribution/hosting restrictions. Юридический риск может зависеть от customer-facing serving, fine-tuned derivatives и scale. Open-source runtime под permissive license обычно проще, но dependencies/custom kernels могут иметь иные условия. Model license способен измениться между revisions — immutable artifact registry хранит license metadata. Procurement/vendor contracts должны обеспечить право использования и support. Не строите core platform на component, который legal team не может однозначно разрешить для целевого geography/use. Licensing — архитектурный constraint наряду с VRAM и latency, потому что вынужденная миграция позже очень дорога.

Вместо ещё одного microbenchmark стоит проверить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 393. Как оценить provider lock-in у managed LLM API, если приложение использует OpenAI-compatible interface?

## Вопрос 393.1. Почему одинаковый `/v1/chat/completions` не делает двух LLM providers взаимозаменяемыми?

**Ответ**

API shape снижает syntactic lock-in, но semantic lock-in остаётся: model behavior, tool calling, structured outputs, tokenization, prompt caching, rate limits, fine-tuning и latency profile различаются. Даже одинаковые endpoint fields не гарантируют interchangeable responses. Для portability держите application abstractions вокруг capabilities, golden behavior tests и provider-neutral conversation/tool state. Не ограничивайте product features lowest common denominator без нужды; вместо этого классифицируйте portable core и provider-specific enhancements. Регулярный failover drill на secondary provider показывает реальную migration cost. OpenAI-compatible JSON — только первый слой portability.

В production-like тесте я бы одновременно контролировал compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 394. Как deciding factor между vLLM/SGLang и TensorRT-LLM зависит от team capability?

## Вопрос 394.1. Почему самый быстрый inference engine может быть неправильным выбором для команды без соответствующей эксплуатационной экспертизы?

**Ответ**

TensorRT-LLM может раскрыть глубоко оптимизированные NVIDIA paths и cutting-edge low precision, но более specialized build/runtime workflow требует expertise. vLLM/SGLang часто быстрее дают новый model support и Python-oriented extensibility. Если команда не умеет профилировать engines/NCCL/CUDA и зависит от rapid model experimentation, theoretical performance gain специализированного stack может потеряться в delivery/incident cost. Если GPU spend огромен и models стабильны, dedicated performance team способна окупить specialization. Оцените expected annual savings от 10–20% efficiency против FTE/on-call/migration cost. Organization architecture и software architecture связаны напрямую.

Вместо ещё одного microbenchmark стоит проверить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback с тем же workload до и после изменения, сохраняя неизменным quality floor именно для этого workload.

## Вопрос 395. Как определить, нужно ли abstraction layer над несколькими inference backends?

## Вопрос 395.1. Когда единый LLM gateway снижает lock-in, а когда просто добавляет ещё один latency/complexity слой?

**Ответ**

Abstraction полезен, если реально есть несколько backends/providers и products не должны знать их routing/versioning details. Он стандартизирует auth, streaming, telemetry, quotas и common request schema. Но чрезмерный lowest-common-denominator слой скрывает backend-specific capabilities и затрудняет performance tuning. Проектируйте capability negotiation: common core плюс explicit extensions, а не pretend uniformity. Gateway не должен перепарсивать/буферизовать streams так, что портит latency. Ownership включает compatibility tests. Если backend один и migration не планируется, сложный abstraction premature. Value возникает из fleet governance, а не из эстетики интерфейса.

Перед масштабированием такого подхода стоит сопоставить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и проверить, остаётся ли выигрыш после включения обычной production observability именно для этого workload.

## Вопрос 396. Как выбрать стратегию API compatibility при миграции serving backend?

## Вопрос 396.1. Какие детали нужно тестировать помимо HTTP schema при замене одного OpenAI-compatible LLM backend на другой?

**Ответ**

Сначала зафиксируйте externally relied semantics: streaming chunk format, finish reasons, errors, token usage, tool calls, seed, logprobs, stop handling. Новый backend может формально реализовывать OpenAI-compatible API, но отличаться в edge cases. Создайте contract tests и golden client integrations. Gateway adapter может нормализовать differences, но не должен скрывать semantic model changes. Новые capabilities вводите versioned, не меняя старый contract молча. Migration waves: shadow, canary, percent rollout, rollback. API compatibility — отдельная axis от output quality; оба должны быть подписаны до cutover.

Чтобы решение не осталось теоретическим, нужен контрольный прогон по compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback вместе с operational метриками, которые определяют стоимость дежурства и сопровождения.

## Вопрос 397. Как решить, стоит ли standardize на one-model-per-GPU-pool или смешивать модели?

## Вопрос 397.1. Когда sharing одного GPU между несколькими LLM повышает utilization, а когда уничтожает batching и locality?

**Ответ**

Однородный pool упрощает batching, cache, autoscaling и capacity prediction; model-specific traffic эффективно объединяется. Mixed pool повышает utilization long tail, но weight residency/switching и fragmenting memory complicate scheduling. Если несколько небольших models одновременно помещаются и runtime поддерживает isolation, mixing может быть выгоден; для 70B+ checkpoints обычно model itself занимает большую часть GPU и switching дорог. Hot models получают dedicated pools, cold tail — shared multi-model service. Решение основано на popularity distribution, model sizes, switch time и SLO. Не смешивайте unrelated models только ради nominal VRAM fill, если scheduler не может эффективно управлять residency.

Для этой архитектуры главным validation-набором будут goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic в одном и том же deployment bundle, чтобы не смешать эффект нескольких изменений.

## Вопрос 398. Как evaluate third-party inference optimization vendor, который обещает 3× speedup?

## Вопрос 398.1. Какие вопросы задать vendor, прежде чем поверить обещанию `3x faster LLM inference`?

**Ответ**

Попросите exact baseline и метод: model/precision, output quality, batch, context, hardware, SLO. Часто 3× достигается quantization/speculation или сравнению с untuned baseline. Запустите independent benchmark на вашем traffic и quality suite. Проверьте integration surface, supported models, security, observability, failure handling, lock-in и pricing. Рассчитайте net annual GPU savings после vendor fee и engineering integration. Требуйте reproducibility/contractual performance only where reasonable. Пилот должен включать saturated throughput и p99, а не demo prompt. Если optimization закрыта, подумайте о diagnosability incidents: black box, экономящий 20% GPU, может быть плох при critical outage.

При повторной оценке конфигурации первым делом сравниваются compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 399. Как создать exit strategy для критического inference vendor dependency?

## Вопрос 399.1. Как уменьшить стратегический риск, если fastest inference stack принадлежит одному vendor?

**Ответ**

Определите минимальный portable artifact/API set, secondary backend и data/config export. Не обязательно держать fully hot duplicate stack — важно регулярно подтверждать migration path: quarterly replay on alternative, compatible model artifacts, documented differences и capacity procurement lead time. Vendor-specific features классифицируйте по replaceability; critical business flow не должен зависеть от undocumented behavior. Контракт включает notice/support и access to logs/artifacts. Exit strategy имеет стоимость, поэтому её глубина пропорциональна dependency risk. Она полезна не только при конфликте с vendor: outage, price increase или hardware scarcity также требуют альтернативы.

В финальном decision record должны быть числа по compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback с отдельным анализом p95/p99, потому что средний выигрыш для такого решения недостаточен.

## Вопрос 400. Как спланировать миграцию крупного inference fleet на новую модель без удвоения GPU capacity на весь период?

## Вопрос 400.1. Как провести model cutover, если бюджет не позволяет одновременно держать два полных production fleet?

**Ответ**

Полное blue-green duplication безопасно, но дорого. Используйте staged capacity: сначала shadow на небольшой выборке, затем canary с ограниченным share, после подтверждения постепенно переводите replicas old→new, сохраняя rollback reserve. Учитывайте, что новая model может иметь другой memory/throughput, поэтому percentage traffic не равен percentage GPU. Cache/compile cold-start требует временного headroom. Batch traffic можно приостановить и использовать его capacity как migration reserve. Перед каждой wave проверяйте surviving old capacity на случай rollback. План выражается в GPU groups и goodput, а не только «10/50/100% requests». Для irreversible API/quality changes нужен более длинный coexistence window.

Отдельный нагрузочный эксперимент должен связать goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и зафиксировать владельца решения, способ обнаружения регресса и безопасный путь отмены.

## Вопрос 401. Как мигрировать с одной quantization scheme на другую без смешения cache state?

## Вопрос 401.1. Почему при переходе BF16→FP8/W4 нельзя просто оставить старый prefix cache?

**Ответ**

Новая quantization меняет weights/activations и, если KV format тоже меняется, cache layout. Создайте новую immutable deployment revision и отдельный cache namespace; не reuse-ите KV/prefix state между variants без доказанной совместимости. Canary сравнивает quality и latency на paired traffic. При rolling replacement session turns могут попадать на разные variants: это допустимо только с fresh prefill или version-aware affinity. Если response behavior заметно различается, product может требовать session stickiness до завершения conversation. Rollback сохраняет старые artifacts и cache не считается источником истины. Миграция — deployment change, а не inplace conversion live memory.

На canary я бы проверил не среднее значение, а cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 402. Как менять TP size production model без длинного downtime?

## Вопрос 402.1. Как безопасно перейти с TP=8 на TP=4 или наоборот, не прерывая текущие streams?

**Ответ**

TP size определяет process group, weight sharding и часто KV/cache layout, поэтому existing replica нельзя обычно «расширить» на лету. Поднимите новый replica group с новой topology, прогрейте, затем route часть новых requests; старые active generations drain на старой группе. Model artifacts желательно иметь sharded variant под новую topology, иначе startup reshard увеличит окно. Prefix cache не переносите автоматически, если layout/namespace несовместим. Capacity plan учитывает временное соседство двух groups. Если hardware topology меняется cross-node, отдельно benchmark NCCL. Cutover считается успешным после soak, затем old group освобождается.

Решение становится обоснованным, когда trace replay показывает communication overhead, failure-domain size, load imbalance и эффективность при реальном batch/context distribution и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 403. Как проводить rolling update, если один request может генерироваться несколько минут?

## Вопрос 403.1. Как обновлять inference replicas, если p99 lifetime одного streaming request — минуты?

**Ответ**

Обычный Kubernetes rollout может застрять на long-lived streams или прервать их по короткому grace period. Введите draining: replica перестаёт получать новые requests, завершает active до deadline; scheduler/exporter сообщает `active_sequences` и estimated drain. Для очень длинных jobs допускается checkpoint/resume только если runtime поддерживает перенос state, иначе лучше заранее route long class в separate pool. Deployment controller ограничивает число одновременно draining replicas, чтобы не потерять capacity. После deadline политика explicit: cancel/retry или wait longer по service tier. Rollout duration становится функцией output-length tail, поэтому планируется заранее.

На canary я бы проверил не среднее значение, а совместимость состояний, cold-start penalty, rollback time и поведение незавершённых пользовательских сессий и заранее определить условие rollback при выходе за допустимые границы.

## Вопрос 404. Как избежать cache cold-start storm после массового restart fleet?

## Вопрос 404.1. Почему restart всех LLM workers одновременно может вызвать повторный перегруз даже после восстановления GPU?

**Ответ**

Одновременный restart стирает prefix caches и запускает лавину повторных prefill популярных prompts именно в момент, когда capacity ещё восстанавливается. Используйте staggered restart, minimum available warm replicas и постепенный traffic ramp на новые workers. Hottest provider-owned prefixes можно prewarm или восстановить из hierarchical cache. Cache-aware router должен не перегружать оставшиеся hot workers, иначе они становятся bottleneck. Monitoring после wave: hit rate, prefill tokens/s, queue TTFT. Disaster recovery exercise должен моделировать cold-cache state всего региона, потому что normal rolling update скрывает проблему. Prefix cache фактически является performance state, потеря которого влияет на recovery capacity.

В production-like тесте я бы одновременно контролировал cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes с отдельным анализом p95/p99, потому что средний выигрыш для такого решения недостаточен.

## Вопрос 405. Как мигрировать prefix-cache strategy с hash blocks на radix-tree-like cache?

## Вопрос 405.1. Как безопасно заменить сам механизм automatic prefix caching, если он находится в hot path каждого request?

**Ответ**

Считайте это scheduler/cache subsystem migration, а не internal refactor. Создайте new runtime pool, потому что live metadata formats и eviction semantics различаются. Replay production traces offline, сравните reusable token ratio, CPU lookup cost, memory overhead и p99. Особенно тестируйте branching/multi-turn, partial blocks, cancellations и tenant isolation. На canary не переносите raw old cache unless explicit converter proven; cold start ожидаем. Если new policy повышает hit rate, убедитесь, что не создаёт routing hotspots или security sharing. Rollback прост, если old pool остаётся независим. Data correctness differential tests обязательны.

Решение становится обоснованным, когда trace replay показывает cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 406. Как обновлять chat template без разрушения всех active sessions?

## Вопрос 406.1. Почему изменение chat template посреди диалога требует либо session pinning, либо полного пересчёта KV?

**Ответ**

Template change меняет rendered token history. Для новых conversations можно сразу использовать new revision; existing sessions либо закрепляются на old template/model bundle до завершения, либо мигрируются через explicit re-render всей history и fresh prefill. Нельзя продолжать old KV cache, добавив suffix в новом format: position/token sequence уже другая. Product должен решить, допустимо ли изменение behavior mid-session. Version хранится в conversation metadata. Для stateless clients, которые присылают всю history, server resolution alias должен быть deterministic. Transition может временно держать две cache namespaces. Quality tests сравнивают role/tool semantics, а performance — token count/cache hit.

На canary я бы проверил не среднее значение, а качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации на пиковом трафике и после потери одной replica, а не только в steady state.

## Вопрос 407. Как model rollback выполнять, если schema/tool-call поведение новой версии уже попало в downstream state?

## Вопрос 407.1. Почему `вернуть старый checkpoint` не всегда достаточно для отката agentic model rollout?

**Ответ**

Infrastructure rollback weights недостаточен, если новая model создала tool calls, JSON fields или conversation state, которые старая version не понимает. Перед rollout определите backward compatibility contract и version state externally. Tool orchestrator может normalise schemas или pin session to model revision. При rollback новые sessions идут old model, а affected existing sessions либо остаются на new pool до completion, либо проходят migration transform. Это похоже на database schema rollback: model behavior — часть distributed protocol. Поэтому canary критических agent flows проверяет downstream side effects, не только text quality. Rollback plan создаётся до deployment.

В production-like тесте я бы одновременно контролировал совместимость состояний, cold-start penalty, rollback time и поведение незавершённых пользовательских сессий и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 408. Как переходить с colocated serving на P/D disaggregation поэтапно?

## Вопрос 408.1. Как внедрять disaggregated serving без большого архитектурного cutover?

**Ответ**

Сначала стабилизируйте baseline и измерьте prefill/decode interference. Затем внедрите KV transfer path в shadow/experimental pool, сохранив colocated fallback. Route только long-context class, где expected benefit максимален; не мигрируйте весь fleet. Отдельно построите observability/health для prefill pool, decode pool и connector. После доказанного goodput/SLO benefit расширяйте workload classes. Capacity controller учится независимо scale pools. Failure drills включают lost transfer, pool saturation и fallback recompute. Если architecture не даёт value, возможность вернуть request на colocated path ограничивает sunk cost. Такой migration снижает blast radius самой сложной distributed-state части.

Для production-acceptance здесь особенно важны качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и проверить, не покупается ли локальный performance gain ценой худшей fairness или isolation.

## Вопрос 409. Как мигрировать model artifacts в новый quantized format при hundreds-of-GB checkpoints?

## Вопрос 409.1. Как организовать reproducible fleet-wide переход на новый FP8/FP4/W4 checkpoint format?

**Ответ**

Conversion pipeline должен быть reproducible и content-addressed: source revision + quantization recipe/calibration + tool versions → immutable artifact digest. Не конвертируйте вручную на production nodes. Сначала создайте artifact, validate quality/checksums, затем распределите в registry/local caches до rollout. Храните lineage, чтобы можно было regenerate и audit. Storage planning учитывает временное сосуществование source и derived formats; dedupe where possible. Массовое distribution выполняется до peak rollout, иначе network storage станет bottleneck. Удаление old variant только после rollback window. Artifact lifecycle — часть release engineering, не runtime improvisation.

В качестве последнего gate полезно проверить quality regressions, реальную экономию памяти, kernel throughput и итоговую стоимость при фиксированном SLO с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 410. Как перейти на новое поколение GPU при смешанном fleet без двух отдельных платформ?

## Вопрос 410.1. Как несколько поколений GPU могут сосуществовать за одним inference API без ручного хаоса?

**Ответ**

Сохраняйте единый control plane/API, но допускайте hardware-specific deployment profiles и quantized artifacts. Scheduler route models/workloads только на compatible pools, а metrics нормализуются по SLO/cost. Не пытайтесь добиться одинаковой config: Blackwell-class GPU может использовать FP4, старый — FP8/BF16. Rolling capacity migration переводит hot workloads, где economics лучше, затем освобождает old nodes или оставляет их для compatible batch/long-tail. CI matrix проверяет оба backends до окончания transition. Это «heterogeneous data plane, homogeneous platform contract». Главный риск — configuration explosion, поэтому поддерживаемые combinations ограничивают Pareto-optimal набором.

Перед широким rollout следует количественно проверить goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic вместе с operational метриками, которые определяют стоимость дежурства и сопровождения.

## Вопрос 411. Как планировать deprecation старого model endpoint для внутренних команд?

## Вопрос 411.1. Как вывести старую LLM из эксплуатации, если неизвестно, какие внутренние workflows зависят от её поведения?

**Ответ**

Сначала соберите usage owners и dependencies по telemetry, объявите replacement, semantic differences и deadline. Предоставьте compatibility/shadow test и migration guide. Rate of adoption измеряется по calls/tokens, а не списку команд. Перед deadline отправляйте targeted alerts owners remaining traffic. Если old model дорог или небезопасен, используйте quotas/price signal, но не silently remap alias, если behavior materially меняется. После deadline сохраните краткий emergency rollback window и удалите capacity/artifacts только по policy. Platform deprecation — change management; технически простой redirect может создавать скрытые quality regressions в десятках products.

Для доказательства системной пользы нужно измерить совместимость состояний, cold-start penalty, rollback time и поведение незавершённых пользовательских сессий и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 412. Как определить, когда migration должна быть session-aware, а не request-by-request?

## Вопрос 412.1. Когда model rollout должен закреплять целый диалог за одной revision?

**Ответ**

Если state полностью передаётся каждым request и output semantics versions compatible, percentage routing per request проще. Session-aware migration нужна, когда KV cache/session state resident, chat template/model revision меняет behavior, tool protocol stateful или stochastic style consistency важна. Тогда conversation ID pin-ится к deployment until safe boundary; new sessions распределяются по new version. Это замедляет cutover на long-lived sessions и требует capacity old pool, но предотвращает mid-conversation inconsistency. Не используйте stickiness автоматически: она ухудшает load balancing. Решение основано на semantic/state compatibility, не только cache benefit.

До закрепления этой архитектуры нужно получить данные по совместимость состояний, cold-start penalty, rollback time и поведение незавершённых пользовательских сессий в одном и том же deployment bundle, чтобы не смешать эффект нескольких изменений.

## Вопрос 413. Как убедиться, что новый runtime не изменил billing token counts?

## Вопрос 413.1. Какие тесты нужны, чтобы смена serving engine не изменила количество тарифицируемых токенов?

**Ответ**

Billing зависит от tokenizer/template и правил подсчёта cached/input/output tokens. Перед migration выполните paired request corpus и сравните exact token IDs/counts, usage fields, stop handling и tool schemas. Если tokenizer тот же, counts должны совпадать по contract; runtime может различать cached tokens в telemetry, но logical billing policy должна оставаться стабильной. Любое изменение нужно versioned/documented, иначе клиенты увидят неожиданные счета. Audit test покрывает Unicode, multimodal placeholders, special tokens и streaming completion. Performance optimization не должна silently менять billable unit. Финансовая correctness проверяется отдельно от model answer correctness.

Чтобы trade-off был управляемым, заранее фиксируются границы по compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и повторить измерение после изменения модели или hardware, если исходные assumptions перестали выполняться.

## Вопрос 414. Как миграция load balancer может повлиять на inference performance даже без изменения backend?

## Вопрос 414.1. Почему замена reverse proxy/load balancer может дать 30% regression LLM latency при тех же GPU?

**Ответ**

Новый balancer может потерять cache/session affinity, изменить connection pooling, queueing или streaming buffering. Round-robin вместо cache-aware routing резко снизит prefix hits; least-connections может неверно оценивать long-running streams; proxy buffering ухудшит perceived TPOT. Поэтому LB rollout тестируют LLM-specific metrics: per-replica load, reused tokens, TTFT, stream chunk arrival и cancellations. Shadow route logic можно replay offline, но network behavior нужен live canary. Rollback должен быть independent от model/runtime. Control-plane «не AI компонент» всё равно входит в critical inference path и способен уничтожить преимущества оптимизированного engine.

Решение становится обоснованным, когда trace replay показывает compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback в одном и том же deployment bundle, чтобы не смешать эффект нескольких изменений.

## Вопрос 415. Как migration с managed API на self-hosted выполнять без потери product quality?

## Вопрос 415.1. Как доказать, что self-hosted replacement действительно эквивалентен managed model для продукта, а не только дешевле?

**Ответ**

Сначала отделите provider-specific semantics: system/tool behavior, context limits, tokenizer, structured outputs. Выберите self-hosted model не только по benchmark, а по representative golden conversations и task evaluation. Создайте gateway abstraction и shadow requests, если policy разрешает отправку данных обоим. Затем canary low-risk workflows; high-risk остаются provider до confidence. Capacity self-hosted должна иметь headroom и failover — на старте можно оставить managed API как fallback, но privacy/data constraints должны это разрешать. Cost savings считаются после achieving same quality/SLO. Миграция — model behavior change плюс infrastructure change, поэтому не смешивайте их без paired evaluation.

Реальный выбор подтверждается только после сравнения compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback с отдельным анализом p95/p99, потому что средний выигрыш для такого решения недостаточен.

## Вопрос 416. Как мигрировать с self-hosted модели на managed API при аварийной нехватке GPU?

## Вопрос 416.1. Как использовать внешний LLM API как disaster-recovery capacity для собственного GPU fleet?

**Ответ**

Emergency fallback должен быть подготовлен заранее: provider credentials/quotas, compatible gateway schema, approved data policy и model quality baseline. При shortage route только workloads, которым разрешён external processing; sensitive tenants остаются self-hosted/rejected. Sampling/tool semantics normalise where possible, а response metadata фиксирует fallback. Не ждите incident для procurement/rate-limit increase: managed provider тоже может не дать мгновенную capacity. Cost circuit breaker предотвращает бесконтрольный spend. После recovery sessions можно pin до logical boundary, чтобы не менять model mid-conversation. Такая стратегия превращает cloud API в resilience option, а не случайную ручную меру.

В качестве последнего gate полезно проверить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback для short, median и tail-size запросов, потому что среднее скрывает главный риск.

## Вопрос 417. Как подготовиться к снятию с поддержки GPU architecture в CUDA/runtime ecosystem?

## Вопрос 417.1. Как не оказаться привязанным к старой CUDA версии из-за нескольких поколений legacy GPU?

**Ответ**

Отслеживайте vendor roadmap и минимальные compute capability versions libraries. Inventory показывает, какие models/pools зависят от старых GPUs и какой annual spend/value они дают. До hard deprecation benchmark migration на поддерживаемый runtime/hardware; возможно старый fleet можно оставить с frozen software, но security patches и new model support ухудшатся. Frozen stack изолируют и ограничивают срок жизни. Procurement replacement планируют с lead time, а не после того, как новый runtime перестал собираться. Technical debt старого hardware должен иметь owner и retirement date. Иначе platform fork-ит dependencies навсегда ради небольшого остаточного fleet.

На практике перед rollout я бы отдельно измерил compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и проверить, не покупается ли локальный performance gain ценой худшей fairness или isolation.

## Вопрос 418. Как rollback performance optimization, если она изменила cache layout и state?

## Вопрос 418.1. Почему аварийный rollback inference engine должен предпочесть потерю кэша риску чтения несовместимого KV state?

**Ответ**

Rollback должен считать cache disposable derived state. Старый runtime поднимается со своим namespace и fresh cache; нельзя пытаться интерпретировать pages нового layout. Это временно повышает prefill load, поэтому rollback capacity должна учитывать cold-cache penalty. Active requests на новой version либо drain, либо fail/retry согласно incident severity; migration live KV требует отдельного protocol и редко оправдана для emergency rollback. Immutable old artifacts/config и automation сокращают время. Runbook явно пишет, какие caches/graphs/adapters invalidated. Иначе команда во время incident пытается «сохранить производительность» ценой correctness risk.

В финальном decision record должны быть числа по cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 419. Как определять success criteria после migration, если новая система имеет другую trade-off curve?

## Вопрос 419.1. Как оценивать миграцию, если новая архитектура дешевле и масштабируемее, но не быстрее в каждом отдельном сценарии?

**Ответ**

Не требуйте, чтобы каждая метрика была лучше. Заранее формализуйте constraints и objective: quality≥baseline−ε, p99 SLO met, availability same, cost/request −20%, например. Новая architecture может дать хуже TTFT short prompts, но значительно лучше long-context goodput; weighted product mix решает, приемлемо ли это. Сравните before/after на same trace и real live cohorts, включая operational metrics incidents/on-call. Success window должен быть достаточно длинным для cache warm, traffic cycles и rare failures. Decision memo фиксирует intentional regressions, чтобы через месяц их не приняли за баг.

Для доказательства системной пользы нужно измерить совместимость состояний, cold-start penalty, rollback time и поведение незавершённых пользовательских сессий вместе с operational метриками, которые определяют стоимость дежурства и сопровождения.

## Вопрос 420. Как управлять rollback window, если хранение старого fleet дорого?

## Вопрос 420.1. Как не платить за двойной GPU fleet неделями только ради возможности отката?

**Ответ**

Полный old fleet не обязательно держать долго. После каждой rollout stage уменьшайте rollback reserve пропорционально доказанной confidence и времени восстановления. Old artifacts остаются, а hardware можно вернуть shared pool, если redeploy old runtime укладывается в RTO. Для model behavior risks оставьте небольшой canary old endpoint для paired diagnostics. Если cold load занимает минуты, minimal warm reserve может быть оправдан first hours/day. Решение основано на incident probability × recovery cost, а не традиции «две недели blue-green». Batch capacity может служить reconstitution reserve. Документируйте point of no easy rollback и approvals.

На canary я бы проверил не среднее значение, а goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 421. Как мигрировать tenants между regions без переноса sensitive prefix cache?

## Вопрос 421.1. Как multi-region failover строить, если KV cache нельзя реплицировать между географиями?

**Ответ**

При failover/migration route новые requests в target region и выполняйте fresh prefill из request/session history, если policy разрешает сам исходный content там. KV cache как derived data не переносите автоматически через residency boundary. Если session history также region-bound, failover может быть запрещён и сервис должен честно деградировать availability. Для allowed data можно держать encrypted application state globally, а inference cache остаётся ephemeral local optimization. Это разделяет source-of-truth conversation state и performance cache. Architecture review должен заранее решить, какие data classes могут пересекать regions, иначе emergency team легко нарушит compliance ради восстановления latency.

Чтобы решение не осталось теоретическим, нужен контрольный прогон по cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes при обычной нагрузке, burst и контролируемом failure scenario.

## Вопрос 422. Как проверить disaster recovery, если резервный регион обычно почти пуст?

## Вопрос 422.1. Как доказать, что standby inference region реально способен принять production load?

**Ответ**

Tabletop недостаточно: регулярно выполняйте controlled failover доли traffic или synthetic production-scale trace. Проверьте model artifacts availability, quotas, cold load, DNS/routing, secrets, network, cache-cold performance и SLO under N−1 region capacity. Standby может иметь configuration drift, который health endpoint не выявляет. Если full-scale game day слишком дорог, поочерёдно тестируйте components и периодически complete exercise. Измеряйте RTO фактически. После failover не забывайте failback plan: возвращение traffic создаёт ещё один cold-cache transition. DR readiness — измеряемая способность, не наличие Terraform.

До закрепления этой архитектуры нужно получить данные по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и заранее определить условие rollback при выходе за допустимые границы.

## Вопрос 423. Как управлять compatibility matrix model×runtime×GPU без ручной таблицы?

## Вопрос 423.1. Как масштабировать знание о совместимости десятков models, runtimes и GPU generations?

**Ответ**

Сделайте machine-readable manifest: model architecture/revision, required features, supported precisions, runtime versions, GPU capability/topology и test status. CI автоматически запускает smoke/perf/quality suite на candidate combinations и публикует approved profiles. Deployment controller разрешает только approved tuple либо explicit exception. Это предотвращает «работало на H100 v0.9, попробуем B200 v0.12 в production». Matrix хранит deprecation dates и owner. Полную декартову комбинацию тестировать невозможно, поэтому prioritise used profiles; unsupported combinations не считаются багом автоматически. Такой registry становится source of truth platform capability.

Перед широким rollout следует количественно проверить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback и зафиксировать владельца решения, способ обнаружения регресса и безопасный путь отмены.

## Вопрос 424. Как migration plan учитывать изменение operational ownership команды?

## Вопрос 424.1. Почему готовность on-call команды должна быть формальным gate архитектурной миграции?

**Ответ**

Новая architecture может потребовать skills, которых у текущего on-call нет: NCCL, RDMA, Triton, distributed KV. До rollout определите owner, training, runbooks и escalation. Если system строит external team/vendor, transfer knowledge проходит до cutover. Operational readiness review включает dashboards, alerts, common failure drills и rollback permissions. Стоимость staffing входит в architecture TCO. Технологически успешная миграция, после которой incidents понимает один автор, создаёт bus-factor risk. Иногда менее эффективный runtime с сильным internal ownership лучше 10% дешевле stack, который некому поддерживать ночью.

Перед окончательным выбором полезно построить сравнительную кривую по совместимость состояний, cold-start penalty, rollback time и поведение незавершённых пользовательских сессий и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 425. Как миграция inference stack может изменить security posture даже при том же API?

## Вопрос 425.1. Какие новые угрозы может внести чисто performance-oriented замена serving runtime?

**Ответ**

Новый runtime приносит dependencies, custom kernels, model-loading mechanisms, network ports, cache semantics и logging. Disaggregation добавляет internal KV network; multi-LoRA — dynamic artifacts; hierarchical cache — persistent sensitive state. Поэтому security review сравнивает data flows и privileges old/new, не ограничивается public API. Threat model и SBOM обновляются, penetration/fuzz tests target новые parsers/interfaces. Defaults вроде `trust_remote_code` или unauthenticated metrics port могут быть regression. Rollout security gate идёт параллельно performance/quality. «Backend internal» не значит, что change не меняет attack surface.

Чтобы trade-off был управляемым, заранее фиксируются границы по compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback вместе с operational метриками, которые определяют стоимость дежурства и сопровождения.

## Вопрос 426. Как решить, когда пора завершать migration и удалить legacy path?

## Вопрос 426.1. Почему завершение миграции включает удаление старой системы, а не просто перевод 99% трафика?

**Ответ**

Legacy удаляют, когда new path стабильно выполняет agreed SLO/quality, traffic остаток нулевой или approved, rollback RTO может быть обеспечен без live legacy, и downstream owners подтвердили migration. Долгое сосуществование удваивает patches, on-call runbooks и тестовую matrix, превращая временный safety net в permanent tax. Задайте exit criteria и дату до начала проекта. Если часть tenants блокирует removal, либо formalize legacy as paid/supported tier с owner, либо устраните blockers; не оставляйте «на всякий случай». Cleanup включает artifacts, caches, credentials, dashboards и code, чтобы фактически сократить complexity.

До закрепления этой архитектуры нужно получить данные по совместимость состояний, cold-start penalty, rollback time и поведение незавершённых пользовательских сессий при N−1 capacity, поскольку именно этот режим часто определяет настоящий запас платформы.

## Вопрос 427. Как выбрать минимальный tensor-parallel degree с учётом не только weights, но и KV headroom?

## Вопрос 427.1. Почему модель, которая технически помещается на TP=2, может практически требовать TP=4 из-за KV capacity?

**Ответ**

Начните с фактического memory budget каждого GPU: weights после quantization, runtime/graph/NCCL workspace, safety reserve и оставшийся KV pool. Минимальный TP, при котором weights едва помещаются, может быть плохим: concurrency длинных requests будет почти нулевой и preemptions постоянными. Рассчитайте KV bytes на representative context и требуемое число active sequences, затем выберите smallest TP, который удовлетворяет этому capacity target. После этого benchmark latency: больший TP увеличивает communication, но меньший может требовать больше DP replicas. Оптимум — минимальная topology, обеспечивающая model fit + SLO concurrency с headroom, а не просто `weights/VRAM` округлённое вверх.

Чтобы решение не осталось теоретическим, нужен контрольный прогон по cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 428. Как решить, купить GPU с большей HBM или больше GPU с меньшей памятью?

## Вопрос 428.1. Когда одна 192-GB GPU экономически лучше двух 96-GB GPU, а когда наоборот?

**Ответ**

Большая HBM позволяет держать model/KV на меньшем числе devices, сокращает TP communication и может увеличить long-context concurrency. Больше небольших GPUs дают aggregate compute/bandwidth и redundancy, но крупная model требует sharding, interconnect и больше hosts. Сравните complete topology: сколько GPUs на replica, сколько replicas для throughput, network, power и failure domains. Если workload memory-capacity-bound, дорогая HBM может снизить total GPU count. Если model легко помещается, дополнительные devices как DP дают лучший throughput. Procurement decision должен учитывать следующую модель/контекстный рост, но не переплачивать за speculative future без sensitivity analysis.

На canary я бы проверил не среднее значение, а goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и проверить, не покупается ли локальный performance gain ценой худшей fairness или isolation.

## Вопрос 429. Как memory bandwidth и compute throughput взвешивать при выборе accelerator для LLM?

## Вопрос 429.1. Как понять, покупать ли accelerator с большим TOPS или с большей HBM bandwidth?

**Ответ**

Профиль workload определяет вес. Large prefill и высокие batches чаще приближаются к compute roof, поэтому важны low-precision Tensor Core throughput и attention kernels. Batch=1/low-batch decode чаще ограничен reading weights/KV, поэтому HBM bandwidth и capacity критичнее. Смешанный production traffic требует weighted benchmark. Roofline analysis предварительно объясняет, какой hardware spec должен влиять, но финальное решение — measured goodput under SLO. Peak TOPS без native kernel/software бесполезны, а peak bandwidth не гарантирует achieved bandwidth. Также interconnect может стать третьим axis для TP/EP, особенно large models.

До закрепления этой архитектуры нужно получить данные по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации при обычной нагрузке, burst и контролируемом failure scenario.

## Вопрос 430. Как interconnect topology включить в TCO model multi-GPU inference?

## Вопрос 430.1. Почему цена GPU не позволяет сравнить стоимость двух inference architectures без цены и эффективности fabric?

**Ответ**

Дешёвые GPU могут потребовать TP/EP через более медленный fabric, снижая useful throughput настолько, что нужно больше nodes. Поэтому TCO считает не GPU поштучно, а complete server topology: NVLink/NVSwitch, NIC bandwidth, PCIe layout, host RAM/CPU и switch ports. Benchmark distributed efficiency преобразует hardware count в effective goodput. Network также потребляет power и capital, а cross-node failures расширяют operational surface. Если модель помещается на одном high-memory GPU, можно избежать дорогой fabric. Для MoE wide-EP, наоборот, network может быть core accelerator component. Сравнение без interconnect — неполное.

Перед окончательным выбором полезно построить сравнительную кривую по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и зафиксировать владельца решения, способ обнаружения регресса и безопасный путь отмены.

## Вопрос 431. Как оценить power efficiency LLM inference и когда она становится архитектурным constraint?

## Вопрос 431.1. Как сравнивать GPU по энергии на полезный токен, а не по максимальному потреблению в ваттах?

**Ответ**

Измеряйте joules per useful token/request при production-like utilization, а не TDP из datasheet. Power включает GPU, host, NIC и cooling overhead через PUE (Power Usage Effectiveness — коэффициент инфраструктурных энергозатрат), если считаете datacenter TCO. Более быстрый GPU с higher watts может быть энергоэффективнее, если завершает больше good tokens. Power становится constraint при ограничении rack capacity, стоимости электричества или sustainability target. Quantization/batching часто улучшают tokens/J, но aggressive batching может нарушить latency. Decision должно учитывать energy alongside cost/SLO, особенно self-hosted fleet с высокой utilization.

Отдельный нагрузочный эксперимент должен связать качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации после полного прогрева и отдельно в cold-cache/cold-start режиме.

## Вопрос 432. Как рассчитать экономический эффект уменьшения TP с 8 до 4 после quantization?

## Вопрос 432.1. Как перевести `quantization позволила TP8→TP4` в реальную годовую экономию?

**Ответ**

Сравните не «вдвое меньше GPU на replica», а cluster capacity. TP4 quantized replica может иметь другой throughput, quality и KV headroom. Измерьте goodput обеих configs, затем вычислите replicas, необходимые для forecast + HA. Например, если TP8 даёт G8 goodput на 8 GPU, а TP4 — G4 на 4, стоимость на единицу примерно 8/G8 против 4/G4, с учётом host/network. Добавьте quality validation и engineering cost quantization. Дополнительный benefit — меньше collective latency и более мелкие failure domains; downside — возможно меньше aggregate HBM. Финальный результат выражают annual GPU-hours saved при том же SLO.

Для production-acceptance здесь особенно важны quality regressions, реальную экономию памяти, kernel throughput и итоговую стоимость при фиксированном SLO в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 433. Как выбирать между scale-up и scale-out inference capacity?

## Вопрос 433.1. Когда следующий GPU лучше добавить в существующую replica, а когда создать ещё одну replica?

**Ответ**

Scale-up — более мощные GPUs/больше devices в одной tightly connected replica — полезен для model fit, low single-request latency и huge contexts. Scale-out — больше independent replicas — обычно лучше aggregate throughput и fault isolation, если model уже помещается в минимальную topology. Увеличение TP после model fit часто даёт diminishing returns; тогда DP replicas выгоднее. Но scale-out требует load balancing и cache locality. Для MoE/very large model minimum replica уже может быть большим. Capacity architecture сначала определяет smallest efficient replica, затем масштабирует её горизонтально, если нет причины расширять intra-replica parallelism.

Для доказательства системной пользы нужно измерить goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и убедиться, что оптимизация не переносит bottleneck в соседний слой системы.

## Вопрос 434. Как hardware utilization target должен различаться между online и batch pools?

## Вопрос 434.1. Почему одинаковый KPI GPU utilization для batch и interactive teams создаёт неправильные incentives?

**Ответ**

Online pool нуждается в queueing headroom: target 100% steady utilization превращает burst/failure в p99 collapse. Конкретный target выводят из arrival variance и autoscaling latency. Batch pool, напротив, можно держать близко к saturation, потому что completion time обычно важнее per-request tail. Если pools shared, batch заполняет spare online capacity, но должен быстро уступать её. Финансовая модель должна сравнивать average utilization separately: низкая online utilization может быть осознанной стоимостью SLO, а не inefficiency. KPI «все GPU >90%» способен стимулировать архитектурно вредный batching.

Чтобы trade-off был управляемым, заранее фиксируются границы по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic вместе с operational метриками, которые определяют стоимость дежурства и сопровождения.

## Вопрос 435. Как spot/preemptible GPU capacity использовать для inference?

## Вопрос 435.1. Какие LLM workloads безопасно размещать на spot GPU и какие лучше оставить на гарантированной capacity?

**Ответ**

Preemptible capacity подходит для resumable batch, warm standby build jobs и возможно low-priority stateless requests, но плохо для long streaming sessions без state migration. Для online можно использовать spot как burst supplement, сохраняя on-demand/reserved baseline; при notice workers drain и перестают принимать long jobs. Prefix cache на spot считается disposable. Scheduler должен знать reliability class и не размещать premium request, если interruption нарушит SLO. Экономию сравнивают с wasted compute/retries и operational complexity. Если provider interruption correlated во время дефицита — именно когда burst capacity нужна — нельзя считать spot полноценным HA reserve.

На canary я бы проверил не среднее значение, а goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic с отдельным анализом p95/p99, потому что средний выигрыш для такого решения недостаточен.

## Вопрос 436. Как определить срок окупаемости покупки собственного GPU fleet против аренды?

## Вопрос 436.1. Почему формула `цена сервера / цена облачного часа` недостаточна для решения купить GPU?

**Ответ**

Постройте monthly cash/TCO model: capex amortization, financing, power/cooling, rack/network, hardware support, staff, spare parts и expected utilization. Cloud side включает instance rates/commit discounts, egress/storage и idle reserved capacity. Break-even depends on utilization: owned GPU дорог, если продукт растёт/меняется и железо простаивает; при стабильной 70–80%+ долгосрочной загрузке economics могут быть сильнее. Добавьте technology obsolescence: через 2 года новый accelerator может резко снизить $/token. Поэтому сравнивайте NPV scenarios по traffic growth и hardware resale, а не простое `purchase_price / hourly_rate`.

При повторной оценке конфигурации первым делом сравниваются goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и заранее определить условие rollback при выходе за допустимые границы.

## Вопрос 437. Как выбирать между reserved cloud instances и on-demand для predictable inference traffic?

## Вопрос 437.1. Как выбрать долю reserved GPU, если inference traffic стабилен, но модели и hardware быстро меняются?

**Ответ**

Reserved/committed pricing снижает unit cost, но фиксирует provider/hardware/term. Сначала определите baseline load, который с высокой уверенностью нужен весь commitment period; его покрывают reservation, peaks — on-demand. Не резервируйте forecast maximum: model optimization или new GPU generation может снизить required count. Commitment risk сравнивают с discount. Multi-region/HA capacity также должна быть учтена: резерв в одном region не всегда переносим. Для fast-changing AI stack лучше короче commitments, даже дороже, если option value сменить hardware велик. FinOps и platform roadmap должны синхронизироваться.

При повторной оценке конфигурации первым делом сравниваются goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 438. Как pricing internal inference API может управлять нежелательными workload patterns?

## Вопрос 438.1. Как внутреннее ценообразование может мотивировать команды не использовать 200K context без необходимости?

**Ответ**

Цена/chargeback может отражать дорогие dimensions: input/output tokens, long-context premium, dedicated SLA, model tier. Если 256K context стоит продукту столько же, сколько 8K, команды будут использовать stuffing вместо retrieval/compaction даже без необходимости. Однако pricing не должен быть слишком сложным или привязанным к случайной internal implementation. Хорошая схема даёт правильный directional incentive и показывает cache/quality tier separately. Для shared internal platform можно сначала использовать showback без реальных денег. Cost transparency часто уменьшает waste лучше, чем жёсткие технические limits, но security/availability guardrails всё равно обязательны.

Для доказательства системной пользы нужно измерить compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback при обычной нагрузке, burst и контролируемом failure scenario.

## Вопрос 439. Как оценить стоимость engineering optimization против покупки дополнительной capacity?

## Вопрос 439.1. Когда рациональнее купить ещё 20 GPU, чем полгода оптимизировать serving на 5%?

**Ответ**

Переведите optimization в ожидаемые GPU-hours saved/year или SLO benefit и умножьте на realistic utilization/cost. Сравните с FTE-months разработки, validation, ongoing maintenance и opportunity cost. Если два инженера тратят квартал ради 2% fleet saving на 20 GPU, hardware может быть дешевле. На 10 000 GPU тот же 2% огромен. Учтите recurring nature: custom kernel нужно поддерживать каждое поколение. Альтернатива capacity также имеет procurement limits и power. Такой ROI discipline не отменяет performance craft, а направляет её на hotspots, где software improvement масштабируется.

Для этой архитектуры главным validation-набором будут goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic при N−1 capacity, поскольку именно этот режим часто определяет настоящий запас платформы.

## Вопрос 440. Как hardware scarcity меняет architecture decisions?

## Вопрос 440.1. Как дефицит H100/B200-подобных GPU должен влиять на выбор модели и serving topology?

**Ответ**

Если preferred GPU недоступен месяцами, theoretical optimal TCO не помогает product launch. Architecture может поддержать secondary hardware/provider, более aggressive quantization для меньшего device count или managed API bridge. Scarcity повышает value portability и long-term reservations, но multi-backend support тоже стоит инженерных ресурсов. При procurement uncertainty capacity plan использует scenarios: guaranteed, likely, stretch. Feature roadmap привязывается к minimum guaranteed capacity, а не optimistic order. Не снижайте quality/security silently ради дефицита; продуктовые trade-offs должны быть явными. Supply risk — такой же constraint, как network bandwidth.

Решение становится обоснованным, когда trace replay показывает goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 441. Как учитывать depreciation hardware, если inference software быстро улучшает эффективность?

## Вопрос 441.1. Почему экономический срок жизни GPU для LLM может быть короче физического?

**Ответ**

Физический GPU может работать 4–5 лет, но economic value падает быстрее, если новое поколение или quantization удваивает tokens/$ и old stack теряет support. Поэтому TCO model использует technology obsolescence scenario, не только бухгалтерскую амортизацию. Старые GPUs можно переместить в batch/smaller models, продать или использовать dev capacity, продлевая value. Покупка с минимальным break-even только при 100% 5-летней эксплуатации рискованна. Software efficiency тоже снижает required fleet и может оставить capex stranded. Procurement cadence должен быть портфельным, избегая одномоментной покупки всего forecast на годы.

Вместо ещё одного microbenchmark стоит проверить goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и повторить измерение после изменения модели или hardware, если исходные assumptions перестали выполняться.

## Вопрос 442. Как модель размера 70B против MoE 600B сравнивать по hardware cost?

## Вопрос 442.1. Почему sparse 600B model может быть одновременно дороже по памяти и дешевле по compute, чем dense 70B?

**Ответ**

Нельзя сравнивать total parameters. Dense 70B читает/вычисляет почти все weights каждый token; MoE 600B хранит огромные weights, но активирует subset, зато платит router/EP communication. Посчитайте minimum residency/topology, active FLOPs, HBM bytes, interconnect и achieved throughput на целевой batch. MoE может требовать больше GPU из-за storage, но давать high throughput; dense — проще/ниже latency. Quality target также различается. Финальный metric — cost per SLO-compliant request/token при одинаковой task quality, не `$/parameter`. Для low-concurrency MoE network overhead может ухудшить economics относительно high-throughput batch.

Чтобы решение не осталось теоретическим, нужен контрольный прогон по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic после полного прогрева и отдельно в cold-cache/cold-start режиме.

## Вопрос 443. Как учитывать context growth в трёхлетнем hardware plan?

## Вопрос 443.1. Как не недооценить VRAM fleet, если число пользователей стабильно, но средний контекст растёт каждый квартал?

**Ответ**

Forecast должен включать не только QPS/model size, но trend input/output lengths и agent steps. Переход продуктов от 8K chat к 64K RAG способен съесть KV capacity без роста requests. Постройте scenarios context percentiles × concurrency и memory bytes/token для candidate architectures. Hardware с большей HBM может иметь strategic value, но retrieval/compaction и KV quantization могут снизить need. Не закупайте memory под marketing max context всех requests; используйте workload tiers. Ежеквартально recalibrate forecast telemetry. Context growth — отдельный capacity driver, который традиционный RPS planning пропускает.

Перед окончательным выбором полезно построить сравнительную кривую по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic в одном и том же deployment bundle, чтобы не смешать эффект нескольких изменений.

## Вопрос 444. Как оценить network cost disaggregated inference в облаке?

## Вопрос 444.1. Когда стоимость и bandwidth KV transfer делают P/D disaggregation невыгодной в cloud?

**Ответ**

KV transfer может быть огромным: bytes пропорциональны cached tokens, layers, KV heads и precision. В cloud architecture важно, оплачивается ли cross-zone/region traffic и какой effective bandwidth instance fabric. P/D workers желательно colocate внутри high-speed domain; cross-AZ disaggregation ради elasticity может оказаться и медленной, и дорогой. Рассчитайте transfer GB/request × requests × network tariff плюс extra NIC-capable instances. Сравните с GPU compute saved/SLO benefit. Даже бесплатный intra-zone traffic имеет opportunity cost bandwidth. Architecture diagram должен показывать data-plane location, а не абстрактную стрелку «KV transfer».

На canary я бы проверил не среднее значение, а goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и проверить, остаётся ли выигрыш после включения обычной production observability именно для этого workload.

## Вопрос 445. Как стоимость availability учитывать при выборе количества replicas?

## Вопрос 445.1. Как перевести требование пережить отказ одной replica в реальную надбавку к цене токена?

**Ответ**

N+1 replica — не просто idle cost: при loss одной она должна принять traffic без нарушения SLO. Если обычные replicas работают near saturation, N+1 физически есть, но effective redundancy отсутствует. Рассчитайте goodput after failure и required headroom. Для multi-node TP одна logical replica состоит из нескольких GPUs; failure probability group выше, а spare group нужен целиком. Cost per token then includes redundancy fraction. Premium SLA может финансировать dedicated reserve; standard tier — accept load shedding. Availability architecture становится финансово прозрачной: дополнительный девятый GPU не «лишний», если без него SLO не переживает отказ восьмого.

Перед масштабированием такого подхода стоит сопоставить качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 446. Как решать, какой workload первым переносить на новое более дорогое GPU поколение?

## Вопрос 446.1. Какие модели разумно мигрировать на новое поколение GPU первыми?

**Ответ**

Ранжируйте workloads по marginal benefit: те, где новая precision/memory/interconnect даёт largest cost/SLO gain, а migration risk manageable. Например, FP4-friendly large model или long-context workload, который сокращает TP благодаря большей HBM. Не переносите автоматически самый критичный product первым — early software stack ещё может быть нестабилен. Batch/non-critical hot workload даст много telemetry с меньшим blast radius. После maturity move premium. Такой sequencing максимизирует learning/$ и сохраняет old hardware utilization. Procurement и software rollout должны быть coordinated portfolio, а не fleet-wide replacement.

В финальном decision record должны быть числа по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 447. Как решить, когда списать старый GPU fleet, даже если он ещё работает?

## Вопрос 447.1. Почему исправный accelerator иногда рационально вывести из production раньше физического конца жизни?

**Ответ**

Сравните marginal value old fleet с альтернативой: power, rack/network, maintenance, software support и opportunity cost места против useful tokens/$ на newer hardware. Если old GPU требует frozen runtime, отдельный on-call knowledge и не поддерживает current models, operational tax может превышать compute value. Но полностью амортизированное железо может быть выгодно для batch/small models, если power efficient enough. Установите retirement threshold по cost/goodput и security support, а не возрасту. Перед списанием проверьте secondary market и use as dev/DR. Решение — портфельная оптимизация, не техническое самолюбие.

Для этой архитектуры главным validation-набором будут goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 448. Как распределить ownership между model team, inference platform и SRE для production LLM?

## Вопрос 448.1. Какие решения должны принадлежать model team, platform team и SRE, чтобы LLM serving не оказался ничейной зоной?

**Ответ**

Model team должна владеть task quality, tokenizer/template semantics, sampling recommendations и model-specific acceptance. Inference platform — runtime, GPU topology, quantization implementation, serving API, scheduler/cache и capacity efficiency. SRE/production engineering — availability practices, fleet health, incident process и shared infrastructure, хотя границы могут пересекаться. Ключевое — decision rights: кто может включить W4, изменить max context, rollout runtime или объявить quality rollback. Shared SLO связывает команды, но одна метрика не заменяет ownership. Для incidents нужен единый commander и escalation by symptom. Без явной RACI performance regression превращается в спор «модель или инфраструктура», пока пользователи ждут.

Реальный выбор подтверждается только после сравнения ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать на пиковом трафике и после потери одной replica, а не только в steady state.

## Вопрос 449. Как governance новых inference optimizations построить без торможения экспериментов?

## Вопрос 449.1. Как разрешить быстро пробовать новые serving tricks и одновременно не превращать production в лабораторию?

**Ответ**

Разделите experimental и production-approved tracks. В sandbox команда свободно тестирует новый kernel/quantization/speculator; переход в production требует reproducible artifact, quality/perf suite, security review по risk tier, observability и rollback. Не каждая настройка нуждается в committee: classify changes по blast radius. Scheduler parameter в canary — low/medium risk; custom CUDA code или cross-tenant cache — high. Создайте standardized evidence template и automated gates, чтобы governance была pipeline, а не встреча. Exceptions time-bound и имеют owner. Такая модель сохраняет скорость research, но production не становится набором непроверенных flags.

До закрепления этой архитектуры нужно получить данные по ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать после полного прогрева и отдельно в cold-cache/cold-start режиме.

## Вопрос 450. Как определить минимальный набор benchmark suites, который команда обязана поддерживать постоянно?

## Вопрос 450.1. Какие тесты должны стать постоянным release gate inference platform, а не разовым benchmark проектом?

**Ответ**

Нужны три слоя: micro/system performance, representative end-to-end traffic и task quality. Performance suite покрывает short/long prefill, batch=1/high concurrency decode, memory/cold start и distributed topology. Trace replay моделирует реальные arrival/length/cache patterns и SLO. Quality suite включает критические domains, structured output, multilingual/code и long context. Добавьте failure/stress cases для cancellation/OOM/worker death. Не пытайтесь включить все public benchmarks: suite должна ловить regressions вашего бизнеса и выполняться достаточно быстро для release cadence. Периодически пересматривайте её по incidents и traffic drift. Каждый серьёзный incident должен добавить regression scenario, если возможно.

Отдельный нагрузочный эксперимент должен связать качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации после полного прогрева и отдельно в cold-cache/cold-start режиме именно для этого workload.

## Вопрос 451. Как model/runtime performance regressions включать в CI, если GPU tests дорогие?

## Вопрос 451.1. Как автоматизировать performance regression testing, если полноценный benchmark требует дорогого GPU-кластера?

**Ответ**

Используйте tiered CI. На каждый commit — CPU/unit/reference correctness и маленький GPU smoke; nightly — kernel/perf fixed-shape; release candidate — полный trace/goodput на representative multi-GPU hardware. Thresholds учитывают natural variance, поэтому сравнивайте repeated runs и control baseline на том же fleet. Не блокируйте commit из-за 1% noise; severe regression bisect автоматизируйте. Hardware lab reservation — platform resource. Для open-source upgrades сначала run compatibility/perf before merge. Такая пирамидальная стратегия ловит ранние bugs дёшево, а дорогие distributed regressions — до production, не требуя H100 cluster для каждого pull request.

Перед окончательным выбором полезно построить сравнительную кривую по compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 452. Как quality ownership организовать при platform-level quantization?

## Вопрос 452.1. Кто должен подписывать переход модели на 4-bit — infrastructure team или владельцы качества?

**Ответ**

Platform может технически сгенерировать W4/FP8 artifact, но не должна единолично объявлять качество приемлемым. Model/product owner задаёт critical evaluation and tolerance; platform обеспечивает reproducible quantization recipe и system metrics. Approval — совместный contract: конкретный artifact разрешён для определённых workload tiers. Если одна модель используется десятками teams, central evaluation покрывает common benchmarks, а product-specific owners проводят targeted checks. Telemetry после rollout ищет format/validity/business regressions. Это предотвращает две крайности: platform боится любой quantization или, наоборот, экономит GPU за счёт незаметного quality degradation.

В качестве последнего gate полезно проверить quality regressions, реальную экономию памяти, kernel throughput и итоговую стоимость при фиксированном SLO и повторить измерение после изменения модели или hardware, если исходные assumptions перестали выполняться.

## Вопрос 453. Как incident severity определять для inference service, если ошибки могут быть silent quality corruption?

## Вопрос 453.1. Почему массовые 200 OK с неправильным KV reuse могут быть серьёзнее обычного 5xx outage?

**Ответ**

Severity model должна учитывать не только availability. Класс A — widespread unavailable/latency outage; класс B — silent incorrect/cross-tenant responses, потенциально выше по риску даже при 200 OK; класс C — quality degradation ограниченного model/tier; cost runaway также может быть incident. Оценивайте scope, customer impact, security/compliance и reversibility. Silent cache corruption требует rapid disable/rollback, forensic scope и возможно customer notification, хотя error dashboard зелёный. Runbooks должны иметь quality/security triggers from evaluation/complaints, не только 5xx alerts. Это адаптирует traditional incident management к probabilistic AI system.

Чтобы trade-off был управляемым, заранее фиксируются границы по качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации при реальном distribution запросов, а не на одном удобном фиксированном shape.

## Вопрос 454. Как on-call runbooks писать для performance incidents, где root cause заранее неизвестен?

## Вопрос 454.1. Как сделать runbook полезным инженеру ночью, если он не знает заранее, что именно сломалось в LLM serving?

**Ответ**

Runbook должен вести по evidence tree, а не перечислять «перезапустите сервер». Начните с пользовательского симптома TTFT/TPOT/errors, затем phase decomposition: gateway→queue→prefill→decode→network. Для каждого branch укажите dashboards, expected ranges, safe mitigations и rollback. Например high queue + saturated GPU → shed/scale; high TPOT + NCCL → isolate group; OOM/preemptions → reduce admission. Опасные действия помечаются: cache clear вызывает cold storm, restart TP group прерывает streams. После mitigation собираются artifacts для root-cause analysis. Runbook регулярно проверяют game days и обновляют после incidents.

До закрепления этой архитектуры нужно получить данные по ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать и зафиксировать владельца решения, способ обнаружения регресса и безопасный путь отмены.

## Вопрос 455. Как game day для inference platform должен отличаться от обычного web-service chaos test?

## Вопрос 455.1. Какие failure injections действительно проверяют зрелость LLM inference platform?

**Ответ**

Помимо kill pod/node проверяйте LLM-specific state: потеря TP rank, cold cache region restart, 100K-prompt burst, KV exhaustion/preemption, NCCL degradation, slow client, model artifact unavailable, disaggregated KV-transfer failure. Наблюдайте TTFT/TPOT and quality/correctness, не только HTTP availability. Verify load shedding and batch preemption, rollback runtime, cache recovery. Tool-using shadow/test agents не должны создавать real side effects. Game day считается успешным, если команда обнаружила проблему по alerts, mitigation уложилось в target и capacity survived. Findings превращаются в engineering actions, иначе chaos — театр.

В production-like тесте я бы одновременно контролировал ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать и проверить, остаётся ли выигрыш после включения обычной production observability.

## Вопрос 456. Как определить, когда оптимизация стала technical debt и её пора удалить?

## Вопрос 456.1. Как понять, что когда-то полезный custom serving optimization теперь мешает платформе больше, чем помогает?

**Ответ**

Каждая specialization должна иметь owner, measured benefit и supported scope. Со временем upstream runtime может реализовать эквивалент быстрее, model mix меняется, hardware generation делает workaround ненужным. Если custom patch экономит <1% fleet, но блокирует upgrades и требует tests, он стал negative value. Периодически rebenchmark against vanilla/current upstream и оцените incidents/maintenance hours. Удаление optimization тоже проходит correctness/perf gate. Technical debt register должен содержать exit condition, например «удалить custom W4 kernel, когда upstream path within 5%». Это предотвращает накопление музейных флагов, которые никто не понимает.

Реальный выбор подтверждается только после сравнения качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 457. Как roadmap inference team приоритизировать между latency, cost и model enablement?

## Вопрос 457.1. Как выбрать между `ускорить текущую модель на 20%` и `поддержать новую архитектуру для важного продукта`?

**Ответ**

Свяжите инициативы с business outcomes: сколько revenue/SLO risk/GPU spend затрагивается. Model enablement может unlock product и быть важнее 15% cost saving; severe p99 issue — выше roadmap optimization. Используйте portfolio: reliability floor, committed model launches и efficiency investments. Для performance projects требуйте expected fleet savings с confidence; для model support — product deadline/value; для debt — avoided risk. Не превращайте roadmap в список benchmark ideas. Quarterly пересматривайте по traffic/model/hardware changes. Platform KPI может включать cost per good token, SLO attainment, model onboarding lead time и incident rate — несколько dimensions, чтобы команда не оптимизировала одну цифру.

Для production-acceptance здесь особенно важны goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 458. Как устанавливать change freeze для inference platform и когда его нарушать?

## Вопрос 458.1. Какие изменения LLM serving считать достаточно рискованными, чтобы включать в production freeze?

**Ответ**

Перед критическим business period freeze снижает риск runtime/model/hardware изменений, но security fix или severe incident может требовать exception. Freeze scope включает hidden dependencies — driver, CUDA, templates, routing, not just model weights. Exception process оценивает severity change vs risk staying; обязательны canary and rollback. Performance optimization без urgent SLO issue обычно ждёт. Model quality hotfix может иметь другой approval. Важно не копить гигантский release сразу после freeze: changes staged. Такой governance особенно полезен fast-moving AI stack, где «minor library upgrade» способен изменить kernels и latency.

Для production-acceptance здесь особенно важны ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 459. Как сохранять institutional knowledge performance tuning, чтобы она не жила в головах двух инженеров?

## Вопрос 459.1. Как сделать так, чтобы через год команда знала, почему текущие inference настройки вообще такие?

**Ответ**

Храните versioned benchmark reports/ADRs с workload, hardware, runtime и rationale; автоматизируйте approved profiles; dashboards показывают current config and expected ranges. Runbooks объясняют diagnostic reasoning, а не только команды. Significant optimization включает before/after trace и reason why chosen over alternatives. Регулярные reviews и incident postmortems пополняют knowledge base. Не сохраняйте тысячи устаревающих ручных notes без version/date — они опасны. Цель: новый engineer может ответить, почему TP=4, chunk size X и FP8 KV используются именно на этом pool, и каким experiment пересмотреть решение.

В production-like тесте я бы одновременно контролировал качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации в разрезе workload classes, чтобы одна выгодная когорта не скрывала регресс другой.

## Вопрос 460. Как определить, какие inference метрики должны быть customer-visible?

## Вопрос 460.1. Какие детали LLM serving стоит экспортировать клиентам, а какие оставить внутренней реализацией?

**Ответ**

Внешнему клиенту полезны stable contract metrics: status, documented rate/context limits, usage tokens, finish reason, возможно request ID и service latency. Внутренние cache hits, GPU IDs, scheduler queues и exact topology могут меняться и раскрывать security/implementation details. Enterprise customers могут получать SLO dashboard aggregated by endpoint/tier. Если prompt caching влияет на billing, cached token accounting может быть customer-facing по product contract. Не обещайте internal TPOT definition, которую gateway/client network не контролирует, без ясного scope. Customer observability должна помогать troubleshoot и cost manage, но не связывать API с конкретной backend architecture.

При повторной оценке конфигурации первым делом сравниваются качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации в разрезе workload classes, чтобы одна выгодная когорта не скрывала регресс другой.

## Вопрос 461. Как проводить capacity review перед крупным продуктовым запуском на LLM?

## Вопрос 461.1. Что AI platform должна проверить за неделю до запуска продукта, который может резко увеличить LLM трафик?

**Ответ**

Соберите forecast arrival rate и distributions input/output/context/tool steps, target regions/SLO и expected cache locality. Переведите в trace scenarios base/peak/launch burst и прогоните на production-like fleet. Проверьте N−1 capacity, autoscaling cold start, provider quotas/storage scale-out и load shedding. Quality/model size может измениться непосредственно перед launch — freeze artifact заранее или иметь revised sizing. Зарезервируйте headroom и наблюдение war room metrics. План includes what to shed first and external fallback. После запуска compare actual to forecast and recalibrate. Одна цифра QPS без token lengths не является capacity review.

Для этой архитектуры главным validation-набором будут goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic при обычной нагрузке, burst и контролируемом failure scenario.

## Вопрос 462. Как performance SLO менять при переходе на более качественную, но более тяжёлую модель?

## Вопрос 462.1. Как согласовать model quality upgrade с latency contract, если новая модель физически медленнее?

**Ответ**

Есть три lever: купить capacity/optimize, изменить SLO или изменить product behavior. Нельзя автоматически требовать старый latency от модели вдвое дороже без бюджета. Product owner оценивает quality value; platform строит frontier: old model vs new with quantization/TP/speculation at various cost. Если сохранить SLO возможно с +40% spend, business решает value. Если нет, возможно streaming UX допускает TTFT +200 ms, либо route only complex requests to heavy model. SLO change должен быть intentional and customer-compatible. Это избегает скрытого overload после «чисто model quality upgrade».

Чтобы решение не осталось теоретическим, нужен контрольный прогон по joint TTFT/TPOT SLO, queueing, tail latency и количество запросов, реально обслуженных в пределах цели для short, median и tail-size запросов, потому что среднее скрывает главный риск.

## Вопрос 463. Как routing между small и large models использовать для cost control без непредсказуемого качества?

## Вопрос 463.1. Как использовать model cascade, чтобы снизить GPU spend и не превратить качество в случайность?

**Ответ**

Model routing может отправлять простые requests дешёвой модели, сложные — дорогой, но classifier/router ошибается и сам создаёт latency. Определите tasks, где small model validated, и conservative escalation policy. Можно начать rule-based by product intent/context, а не opaque complexity model. Measure end-to-end quality conditional on route and false-cheap errors. Premium/security-critical flows могут always use large. Cache and batching pools separate. Cost savings считаются после escalation rate. Routing decision versioned/observable; пользовательский contract не должен обещать конкретную model, если backend динамичен, либо response раскрывает resolved tier.

На практике перед rollout я бы отдельно измерил goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic в одном и том же deployment bundle, чтобы не смешать эффект нескольких изменений.

## Вопрос 464. Как governance benchmark contamination учитывать при выборе модели для inference?

## Вопрос 464.1. Почему сомнительный benchmark quality advantage может привести к неправильному hardware/inference решению?

**Ответ**

Public benchmark score может быть завышен training contamination или prompt-specific tuning и не гарантирует production quality. Model selection использует internal held-out tasks, fresh data and operational outputs, а public benchmarks — supplementary evidence. Это влияет на inference architecture: нет смысла покупать вдвое больше GPU ради модели, whose apparent quality advantage disappears internally. Evaluation owner документирует provenance/test leakage risk. Для vendor closed model дополнительно нужны blind A/B/human/task metrics. Cost-quality frontier строится по trusted evaluation, иначе infrastructure spend оптимизирует маркетинговую метрику.

При повторной оценке конфигурации первым делом сравниваются ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать после полного прогрева и отдельно в cold-cache/cold-start режиме.

## Вопрос 465. Как выбирать default context limit для новой модели, если vendor заявляет очень большой максимум?

## Вопрос 465.1. Почему `модель поддерживает 1M context` не означает, что production API должен сразу разрешить миллион токенов?

**Ответ**

Начните с product need и validated quality, затем performance capacity. Vendor max — capability ceiling, не обязанный быть endpoint default. Если 256K dramatically снижает concurrency или увеличивает abuse surface, установите 32K/64K default и opt-in long tier. Проверьте RoPE/config and long-context evaluation на actual revision. Cost/limit должен быть отражён в pricing/quota. Повышать limit позже проще, чем обещать SLO на максимуме и потом урезать. Отдельный batch/long-doc endpoint может иметь weaker TTFT. Default — platform product decision, соединяющее user value, quality и resource economics.

Решение становится обоснованным, когда trace replay показывает compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback в одном и том же deployment bundle, чтобы не смешать эффект нескольких изменений именно для этого workload.

## Вопрос 466. Как security review приоритизировать для performance features?

## Вопрос 466.1. Какие inference optimizations требуют полноценного threat model, а какие достаточно покрыть correctness tests?

**Ответ**

Классифицируйте по data/control surface. Kernel fusion внутри одного trusted tensor path — в основном correctness/memory safety. Cross-tenant prefix caching меняет data sharing — high security. Hierarchical KV создаёт persistent sensitive storage; disaggregation — new network; dynamic model/LoRA loading — supply chain. Review depth следует risk, а не количеству строк code. Threat model template спрашивает: какие новые data copies, trust boundaries, untrusted inputs, persistent state и privileges появились. Это позволяет быстро approve low-risk optimizations и глубоко проверять high-risk, вместо одинакового бюрократического процесса.

В финальном decision record должны быть числа по границы доверия, возможный blast radius, auditability и сохранение isolation при пиковом трафике после полного прогрева и отдельно в cold-cache/cold-start режиме.

## Вопрос 467. Как определить, нужна ли compliance-specific inference architecture или достаточно policy поверх общей платформы?

## Вопрос 467.1. Когда regulated workload действительно нужно выносить на отдельный inference pool?

**Ответ**

Если requirements ограничиваются retention/logging/access, общий data plane с tenant-scoped controls может быть достаточен. Если запрещён shared hardware/cache, требуется specific region, encryption path или certified environment, physical/logical isolated pool становится проще доказать. Не создавайте отдельную stack для каждого regulation без необходимости: common control plane и standardized isolated profiles уменьшают drift. Compliance team должна формулировать technical constraints, а platform — доказательства через architecture/data-flow and audits. Cost premium isolated tier прозрачно аллоцируется. Решение основывается на actual requirement, не мифе «регуляция всегда требует dedicated GPU».

Для production-acceptance здесь особенно важны границы доверия, возможный blast radius, auditability и сохранение isolation при пиковом трафике с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 468. Как platform team должна реагировать, если product просит отключить guardrail resource limits ради demo/launch?

## Вопрос 468.1. Как дать важному запуску больше LLM capacity, не превращая исключение в риск для всего shared fleet?

**Ответ**

Разделите negotiable limit и safety invariant. Можно временно выделить dedicated capacity, повысить max context или concurrency для конкретного authenticated tenant, если load test доказывает отсутствие blast radius. Нельзя снимать global admission/backpressure так, чтобы один launch мог обрушить всех. Exception имеет scope, expiry, owner, monitoring и rollback. Если business value высок, лучший ответ — купить/зарезервировать capacity или isolated launch pool, а не отключить protection. После события usage review решает, сделать ли tier permanent. Platform guardrails существуют именно для peak moments, поэтому «сейчас особенно важно» не является техническим основанием убрать их.

До закрепления этой архитектуры нужно получить данные по ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать и проверить, не покупается ли локальный performance gain ценой худшей fairness или isolation.

## Вопрос 469. Как планировать обучение команды при переходе от single-GPU serving к distributed MoE?

## Вопрос 469.1. Какая организационная подготовка нужна перед запуском large MoE inference, кроме покупки GPU?

**Ответ**

Новая компетенция включает NCCL/fabric, TP/EP topology, expert imbalance, distributed failures и MoE kernels. До production выделите lab cluster, hands-on profiling, runbooks and game days; pair application/platform engineers with infra/network specialists. Ownership не должен зависеть от одного external consultant. Rollout initial scope ограничьте, пока on-call не умеет диагностировать common incidents. Training cost входит в migration TCO и schedule. Документация должна связывать model architecture с operational signals — например why all-to-all spikes matter. Organization must scale complexity вместе с software; иначе nominal performance gain превращается в longer MTTR.

При повторной оценке конфигурации первым делом сравниваются goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 470. Как принимать решение о feature freeze model support ради стабилизации platform?

## Вопрос 470.1. Когда AI platform должна сказать продуктам `новые модели временно не онбордим`, чтобы не потерять надёжность?

**Ответ**

Если incident rate, regression backlog и runtime divergence растут быстрее команды, временный freeze новых model families может восстановить reliability. Но он имеет product opportunity cost. Используйте objective signals: SLO/error-budget burn, failed upgrade cadence, on-call load, exception count. Freeze должен иметь scope/time and exit criteria — например закрыть top reliability gaps, обновить CI and remove forks. Critical business model может получить exception with dedicated owner. Не превращайте «стабильность» в бесконечную остановку innovation. Platform maturity требует периодических investment cycles, особенно в быстро меняющемся inference ecosystem.

Для доказательства системной пользы нужно измерить ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать и повторить измерение после изменения модели или hardware, если исходные assumptions перестали выполняться.

## Вопрос 471. Как оценивать успешность inference platform как внутреннего продукта?

## Вопрос 471.1. Какие KPI показывают зрелость inference platform лучше, чем `GPU загружены на 90%`?

**Ответ**

Не ограничивайтесь GPU utilization. Balanced scorecard: SLO attainment/incident rate, cost per good token, model onboarding lead time, supported capability coverage, utilization/headroom, developer adoption and exception rate. Quality остаётся responsibility model/product, но platform должна не вносить regressions. Также измеряйте upgrade lead time/security patch latency и percentage workloads on paved road. Если cost падает, но команды массово обходят platform ради missing features, success сомнителен. Метрики связываются с company goals и пересматриваются. Platform — продукт, чьи пользователи engineering teams, а результат — безопасная и экономичная delivery model capability.

На canary я бы проверил не среднее значение, а ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 472. У платформы p99 TTFT нарушен, но GPU fleet уже загружен на 85%, бюджет запрещает новые GPU на квартал. Какой план действий вы предложите?

## Вопрос 472.1. Как улучшить tail TTFT без покупки capacity, если GPU уже близки к насыщению?

**Ответ**

Сначала определю, из чего состоит p99: queue, tokenization, prefill или cache miss. Без этого «оптимизировать GPU» бессмысленно. Если queue доминирует, сегментирую traffic по length/SLO и уберу batch/low-priority из critical pool; введу admission/load shedding, чтобы saturation не разрушал всех. Если prefill — проверю prefix reuse, prompt/template waste, chunking и quantization; long prompts можно route в отдельную очередь или уменьшить через retrieval/compaction. Если decode держит capacity, ограничу необязательные long outputs и рассмотрю speculation только для low-concurrency tier. Цель квартала — увеличить goodput existing hardware и снизить wasted work, а не raw utilization. Любое quality-affecting изменение требует product approval.

Чтобы решение не осталось теоретическим, нужен контрольный прогон по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и убедиться, что оптимизация не переносит bottleneck в соседний слой системы.

## Вопрос 473. После запуска нового RAG-продукта средний input вырос с 2K до 30K токенов, GPU cost утроился. Как вы будете разбирать проблему на уровне платформы и продукта?

## Вопрос 473.1. Как решить, является ли трёхкратный рост inference cost после RAG полезной ценой качества или плохим context engineering?

**Ответ**

Сначала подтвержу unit economics: input token distribution, retrieved chunk count, duplicate/context boilerplate, prefix-cache reuse и prefill share GPU time. Затем разделю неизбежный рост — действительно нужный evidence — и waste. Product/RAG team проверяет retrieval precision, chunk sizes, reranking и whether 30K реально улучшает quality; platform показывает cost/TTFT curve. Stable system/tool prefix располагаем для cache reuse; repeated documents можно cache. Возможно создать context tiers и pricing/showback, чтобы длинный prompt был осознанным выбором. Не буду просто aggressive truncate: это может удалить evidence. Success — сохранение target answer quality при lower effective input work или доказанный business value новой стоимости.

При повторной оценке конфигурации первым делом сравниваются goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic с тем же workload до и после изменения, сохраняя неизменным quality floor.

## Вопрос 474. В peak hours cache-aware routing создаёт hotspot: одна replica имеет 90% нужных prefixes, остальные простаивают. Как изменить архитектуру?

## Вопрос 474.1. Что делать, если сохранение prefix locality стало хуже для latency, чем повторный prefill?

**Ответ**

Уберу hard locality и введу cost-based soft routing: estimate queue delay cache-hot replica против recompute/remote-cache cost на свободной. Если wait превышает saved prefill, request идёт на другую replica. Для самых дорогих популярных prefixes рассмотрю proactive replication или hierarchical/shared cache, но только в разрешённом security namespace. Scale-out router должен специально прогревать новые workers, иначе hot replica никогда не разгрузится. Метрики — per-replica queue, reused tokens, load skew и p99 hit/miss cohorts. Не буду оптимизировать hit rate как самоцель: лучший system-wide result может иметь меньше cache hits, но выше goodput и ниже tail latency.

Чтобы trade-off был управляемым, заранее фиксируются границы по cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 475. Команда предлагает включить FP4 на весь fleet, потому что на Blackwell benchmark throughput вырос на 70%. Как принять решение?

## Вопрос 475.1. Как превратить впечатляющий FP4 microbenchmark в безопасное production решение?

**Ответ**

Сначала проверю, какой workload и quality были в benchmark и совпадают ли они с production. Запущу current BF16/FP8 baseline и FP4 на representative short/long, batch/concurrency regimes, включая structured output, multilingual/code and critical tasks. Рассчитаю не только throughput, но max concurrency, p99, power/cost и возможность уменьшить TP/server count. Quality gate должен быть model-specific; некоторые workloads можно перевести раньше. Затем staged rollout: batch/standard tier → canary → premium, с FP8 fallback. Если 70% speedup получен на prefill batch, а production decode-heavy, claim не переносится. Native hardware support — сильный аргумент, но не заменяет acceptance evidence.

В качестве последнего gate полезно проверить quality regressions, реальную экономию памяти, kernel throughput и итоговую стоимость при фиксированном SLO с тем же workload до и после изменения, сохраняя неизменным quality floor именно для этого workload.

## Вопрос 476. Новая MoE-модель заметно качественнее, но для неё требуется 64 GPU на одну replica. Как оценить, приемлема ли такая архитектура?

## Вопрос 476.1. Когда huge MoE с превосходным качеством всё равно является плохим default production model?

**Ответ**

Сначала проверю, действительно ли минимальная topology 64 GPU: quantization, expert placement, TP/EP decomposition и model variants могут уменьшить footprint. Затем benchmark quality-adjusted goodput: сколько business-success requests даёт replica, какой p99 и network sensitivity. 64-GPU failure domain означает expensive redundancy: для HA нужны как минимум дополнительные complete groups или допустимый degraded mode. Оценю procurement/network topology, blast radius, startup and MTTR. Если quality advantage применим только сложным запросам, model routing может использовать эту модель как premium/escalation tier, а не default. Архитектура приемлема, когда incremental quality value превосходит GPU/network/operational cost и есть реалистичная HA strategy.

На практике перед rollout я бы отдельно измерил goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic в разрезе workload classes, чтобы одна выгодная когорта не скрывала регресс другой.

## Вопрос 477. В одном регионе авария, оставшийся регион имеет только 60% суммарной обычной capacity. Какой degradation plan должен сработать автоматически?

## Вопрос 477.1. Как пережить regional failover при заведомо недостаточной GPU capacity без полного latency collapse?

**Ответ**

Failover policy заранее ранжирует traffic. Сначала остановится batch/low-priority, затем admission ограничит standard tier, сохраняя reserved premium/critical capacity. Optional model routes могут переключиться на approved smaller model или managed fallback только для data classes, которым это разрешено. Long-context/output caps могут стать строже, если product contract предусматривает emergency tier; security/safety controls не отключаются. Autoscaler поднимет максимум доступной capacity, но не полагается на мгновенный cold start. Customer-visible status и retry guidance предотвращают storm. Цель — controlled partial availability в пределах error budget, а не попытка принять 100% трафика и получить queue collapse для всех.

На практике перед rollout я бы отдельно измерил goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic на пиковом трафике и после потери одной replica, а не только в steady state.

## Вопрос 478. После включения speculative decoding single-user TPOT улучшился на 40%, но GPU cost на миллион токенов вырос на 15%. Оставлять ли оптимизацию?

## Вопрос 478.1. Что важнее: 40% быстрее stream или 15% дороже inference, и как избежать ложного бинарного выбора?

**Ответ**

Ответ зависит от product tier. Если интерактивный latency имеет высокую бизнес-ценность, 15% premium может быть оправдан для premium/chat traffic. Но включать speculation глобально неразумно: под high concurrency target уже хорошо batched, а draft уменьшает KV capacity. Разделю cohorts и построю cost–latency frontier. Возможны adaptive enable при low active batch или dedicated latency pool, тогда batch/throughput workloads не платят overhead. Проверю, можно ли использовать native MTP/n-gram с меньшей memory cost. Решение формулируется как policy: «используем speculation там, где marginal TTFT/TPOT value превышает capacity cost», а не бинарное on/off для модели.

Отдельный нагрузочный эксперимент должен связать goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic в разрезе workload classes, чтобы одна выгодная когорта не скрывала регресс другой.

## Вопрос 479. Production использует одну большую модель для всех задач, но 80% запросов — простые классификации/извлечение. Как бы вы снизили inference cost?

## Вопрос 479.1. Как построить model cascade, если большая LLM явно overkill для большинства production запросов?

**Ответ**

Сначала измерю quality floor и идентифицируемые task classes. Для детерминированных простых задач small model или специализированный classifier может быть на порядок дешевле; large LLM останется escalation path. Router лучше начать с explicit endpoint/task intent, а не сложной learned complexity classifier. Shadow evaluation докажет, на каких requests small model equivalent; false-cheap errors имеют product cost. Capacity pools и pricing разделяются, batching улучшается из-за homogeneous workloads. Можно также batch offline tasks. Goal — not «использовать маленькую модель чаще», а минимизировать cost при fixed outcome quality. Если routing overhead/complexity превосходит savings на низком объёме, оставлю uniform architecture.

Чтобы trade-off был управляемым, заранее фиксируются границы по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 480. Команда хочет общий cross-tenant prefix cache ради 25% экономии GPU. Security не согласна. Как найти решение?

## Вопрос 480.1. Как сохранить часть выгоды cross-tenant caching, не разделяя пользовательские prompts между клиентами?

**Ответ**

Разложу источники reuse. Если 25% даёт provider-owned system prompt или public immutable corpus, их можно поместить в explicit global trusted namespace без sharing customer content. Остальное оставлю tenant-scoped/salted. Посчитаю, какая доля savings сохраняется. Если большая экономия требует customer-to-customer cache reuse, security risk timing/data isolation нужно оценивать формально, а не давить benchmark. Альтернатива — hierarchical cache внутри tenant, better prompt layout или larger shared compute capacity. Product economics не отменяет trust boundary. Архитектурный компромисс должен сделать sharing явным по data classification, а не побочным эффектом automatic prefix cache.

При повторной оценке конфигурации первым делом сравниваются cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes с учётом стоимости дополнительной сложности и времени восстановления после сбоя.

## Вопрос 481. В fleet три serving runtime, каждый лучший для своей модели, но on-call не справляется с инцидентами. Что вы измените?

## Вопрос 481.1. Когда стоит пожертвовать частью performance ради сокращения количества inference technologies?

**Ответ**

Сначала измерю реальную ценность diversity: какие runtimes дают material feature/cost advantage и какие merely historical. Выберу primary paved-road runtime, перенесу туда dominated workloads и оставлю exceptions только с quantified benefit/owner. Unified gateway, observability, deployment contract и runbooks должны скрыть common operations, но не маскировать backend-specific failure. Для оставшихся runtimes назначу dedicated expertise/escalation и aligned upgrade cadence. Возможно потеряем несколько процентов tokens/$ на части models, зато снизим MTTR and regression surface. Platform optimization включает human system: если технологическое разнообразие превышает способность команды его безопасно эксплуатировать, оно стало отрицательной архитектурной ценностью.

Реальный выбор подтверждается только после сравнения compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 482. После роста agentic workloads число model calls на user task увеличилось в 8 раз. Как изменить capacity и optimization strategy?

## Вопрос 482.1. Как меняется unit economics, если одна пользовательская операция превращается в десяток LLM вызовов?

**Ответ**

Перестану планировать по user requests и перейду к task trace: model calls/step, token growth, tool payloads, cache reuse и concurrency между agents. Agent context часто повторяется, поэтому stable prefix/session KV reuse и compaction становятся ключевыми. Tool outputs ограничиваем/структурируем, иначе каждый следующий prefill растёт. Capacity forecast использует calls and input/output tokens per completed task; product metric — cost/latency per successful task, не per completion. Parallel agent branches могут создавать bursts, поэтому admission should be task-aware. Для quality можно уменьшить model on routine intermediate steps и оставить large model для planning/final. Agentic scaling — workflow optimization плюс inference, не просто «добавить 8× GPU».

## Вопрос 483. Long-context premium tier приносит мало выручки, но потребляет 35% GPU memory fleet. Закрывать ли его?

## Вопрос 483.1. Как решить судьбу дорогого 256K context tier, которым пользуются мало клиентов?

**Ответ**

Сначала отделю allocated memory from incremental compute and strategic value. Возможно tier memory-heavy из-за poor pooling: dedicated long-context replicas простаивают, тогда shared/specialized scheduling или KV quantization улучшит economics. Посчитаю gross margin, customer importance, growth and alternative architecture: retrieval, lower max context, premium pricing. Если tier нужен нескольким strategic customers, dedicated priced capacity может быть лучше cross-subsidy shared fleet. Если quality на extreme context сомнительна и demand слаб, deprecation рациональна. Решение продуктово-платформенное: GPU memory share сам по себе не основание закрывать feature, но должен быть отражён в цене и opportunity cost.

Перед масштабированием такого подхода стоит сопоставить goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и связать результат с конкретным SLO, а не с максимальным synthetic throughput.

## Вопрос 484. Вы выбираете между двумя моделями: A на 20% качественнее, B в 3 раза дешевле. Как принять архитектурное решение без абстрактного спора о качестве?

## Вопрос 484.1. Как сравнить `+20% качества` и `3× дешевле` в единицах, пригодных для инженерного решения?

**Ответ**

Переведу quality в task/business outcome. На каких request classes +20% проявляется и сколько ошибок B стоят? Проведу paired evaluation и сегментацию: возможно A нужна только сложным 15% запросов, а B покрывает остальное. Построю frontier cost per successful task under SLO, включая routing/escalation. Если quality metric не коррелирует с business success, сначала исправим evaluation. Также учту latency, context and operational topology: A может потребовать complex multi-node replica. Возможные решения — A premium/default for high-risk, B bulk/default, cascade B→A on uncertainty. Архитектура не обязана выбрать одну модель навсегда; она должна оптимизировать value across workload.

В production-like тесте я бы одновременно контролировал качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и заранее определить условие rollback при выходе за допустимые границы.

## Вопрос 485. После масштабного runtime upgrade p50 улучшился, p99 ухудшился на 60%. Выпускать ли версию?

## Вопрос 485.1. Может ли более быстрый в среднем inference runtime быть неприемлемым из-за хвостовых задержек?

**Ответ**

Для latency-sensitive service p99 regression обычно blocker, даже если average better, пока не понятна причина. Стратифицирую tail по request size/cache/rank and trace: возможно новый scheduler deliberately trades p99 long prompts for better median, либо есть rare fallback/recompile/deadlock precursor. Если p99 относится к explicitly excluded huge tier и joint SLO всё ещё met, release может быть valid. Если нарушается existing SLO, rollout откладываю или ограничиваю config/cohort. Нельзя усреднить tail problem p50 benefit. Decision gate заранее фиксирует acceptable percentiles; иначе каждая команда будет выбирать метрику, которая поддерживает желаемый релиз.

На canary я бы проверил не среднее значение, а compatibility, p99 latency, operational failure modes, стоимость владения и возможность безопасного rollback для short, median и tail-size запросов, потому что среднее скрывает главный риск.

## Вопрос 486. GPU utilization 45%, но p99 latency плохой и autoscaler уже добавил вдвое больше replicas. Почему scale-out мог не помочь?

## Вопрос 486.1. Почему добавить GPU недостаточно, если кластер медленный при низком среднем GPU utilization?

**Ответ**

Низкий aggregate utilization не означает свободный critical resource. Возможен hotspot cache-aware routing, CPU tokenizer/scheduler bottleneck, shared network/storage, lock contention или requests stuck in one priority queue. Scale-out cold replicas может даже снизить cache locality. Сначала per-replica utilization/queue and phase traces, затем shared dependencies. Если one hot worker 100%, average 45% скрывает imbalance. Если CPU gateway saturated, GPUs irrelevant. Autoscaler, реагирующий только на p99, может усилить проблему. Fix — правильный routing/backpressure/host capacity, не endless GPU. Этот сценарий показывает, почему scaling decision должен опираться на bottleneck-specific leading signals.

В финальном decision record должны быть числа по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic и зафиксировать владельца решения, способ обнаружения регресса и безопасный путь отмены.

## Вопрос 487. Компания хочет SLA на TTFT 500 мс для всех запросов до 128K context. Как оценить реалистичность требования?

## Вопрос 487.1. Как объяснить бизнесу, что один latency SLA для 1K и 128K prompts может быть физически и экономически бессмысленным?

**Ответ**

Сначала benchmark lower bound на target model/hardware: pure prefill 128K без queue/network. Если он уже >500 ms, SLA физически невозможен без cache hit, smaller model или different semantics. Затем учту stochastic traffic/headroom and p99. Можно пересформулировать contract: ≤500 ms для cached/≤8K, separate SLO for long context, или asynchronous document pre-processing/prefix warm cache. Обещать одну цифру на диапазон стоимости 100× — плохой service design. Architecture может use precomputed document KV, but only for repeatable content. Требование должно стать workload-conditioned SLO, основанным на measured feasibility and cost. Иначе платформа будет либо постоянно нарушать SLA, либо держать абсурдный reserve.

## Вопрос 488. В inference cluster каждые несколько дней один NCCL hang выводит из строя большую TP replica. Снижать TP или чинить инфраструктуру?

## Вопрос 488.1. Как решить, лечить ли нестабильный interconnect или перепроектировать model replica так, чтобы меньше от него зависеть?

**Ответ**

Сделаю оба анализа: reliability root cause and topology alternative. Hang нельзя считать нормальной ценой TP — проверю faulty nodes/NICs, timeouts, driver/NCCL and collective divergence. Одновременно оценю, позволяет ли quantization/high-memory hardware уменьшить TP group, тем самым shrinking failure domain and communication. Если TP8→TP4 снижает efficiency cost little и halves exposure, это durable architectural mitigation даже после bug fix. Но «уменьшить TP» без исправления flaky fabric может лишь снизить частоту. Решение основывается на MTBF×blast radius×cost: reliability value меньшей group плюс performance. Hardware fault quarantine и fast group recreation нужны независимо.

До закрепления этой архитектуры нужно получить данные по communication overhead, failure-domain size, load imbalance и эффективность при реальном batch/context distribution на пиковом трафике и после потери одной replica, а не только в steady state.

## Вопрос 489. После внедрения hierarchical KV cache CPU RAM стала bottleneck, а GPU utilization снизился. Что делать?

## Вопрос 489.1. Как исправить ситуацию, когда внешний KV cache экономит VRAM, но делает весь сервер медленнее?

**Ответ**

Проверю admission/eviction policy: возможно system offload-ит слишком много active/low-value cache и saturates memory bandwidth/PCIe, тогда GPUs ждут restores. Разделю hits по tier и сравню transfer time с recompute cost. Короткие prefixes выгоднее пересчитать; cold entries вообще не должны попадать в RAM. Ограничу CPU tier, добавлю cost-aware admission/prefetch, NUMA locality and async transfers. Если valuable working set действительно огромен, scale memory bandwidth/hosts or use SSD tier for colder data, но не blindly add RAM capacity. Hierarchical cache успешен только когда saved GPU compute exceeds data-movement tax. При необходимости временно disable offload for latency tier.

На canary я бы проверил не среднее значение, а cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes с отдельным анализом p95/p99, потому что средний выигрыш для такого решения недостаточен.

## Вопрос 490. Product просит 10 вариантов ответа (`n=10`) на каждый длинный prompt. Как объяснить и оптимизировать стоимость?

## Вопрос 490.1. Почему десять completions одного prompt дешевле десяти независимых запросов, но всё равно могут быть очень дорогими?

**Ответ**

Prefill общего prompt можно выполнить один раз и разделить KV prefix между 10 branches, поэтому request не стоит ровно 10× полного inference. Но decode tokens почти умножаются на 10, branches занимают KV suffix and scheduler slots, поэтому cost всё равно велик. Покажу breakdown prompt vs generation and output-length. Если use case — выбрать лучший candidate, можно уменьшить n, использовать cheap draft/ranker или sequential adaptive sampling stop after confidence. Parallel branches batch nicely but increase peak memory. Pricing/quotas должны учитывать all generated tokens, включая discarded candidates. Product decision зависит от quality gain n=10 vs n=3, измеренного на task, а не от эстетического желания diversity.

## Вопрос 491. Команда хочет хранить session KV cache часами, чтобы ускорить возврат пользователя. Как оценить идею?

## Вопрос 491.1. Когда сохранять KV между пользовательскими сессиями выгоднее, чем просто заново выполнить prefill истории?

**Ответ**

Посчитаю reuse probability versus cache bytes×retention. GPU HBM для часовой inactivity почти наверняка слишком дорог; CPU/NVMe tier может быть разумным, если long history expensive to recompute and user return rate high. Compare transfer/recompute and source-of-truth history availability. Security/retention policy treats KV as sensitive derived data. Admission should retain only sessions with expected value, not every chat. On return, if model/template revision changed, cache invalid and history must re-prefill. Cost-aware TTL can depend on prefix length and observed revisit distribution. Goal — minimize expected future TTFT/cost per byte, not maximize number of cached sessions.

Вместо ещё одного microbenchmark стоит проверить cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes в одном и том же deployment bundle, чтобы не смешать эффект нескольких изменений.

## Вопрос 492. После введения strict premium priority standard users начали ждать минутами. Как исправить fairness, не нарушив premium SLA?

## Вопрос 492.1. Как дать premium пользователям приоритет, не превращая standard queue в starvation?

**Ответ**

Strict priority replaced capacity problem with starvation. Сохраню reserved premium capacity/priority, но введу weighted fair scheduling или minimum token quota standard class плюс aging. Premium burst может временно borrow more, но standard получает bounded maximum wait unless emergency shedding policy. Рассчитаю premium workload worst case and reserve enough so SLA не зависит от полного вытеснения других. Если capacity physically insufficient, pricing/admission/scale rather than starvation. Metrics per-tier queue wait and SLO make trade-off visible. Priority should define service differentiation, not infinite latency lower tier. Contract for standard can be weaker, но всё равно конечный and measurable.

Отдельный нагрузочный эксперимент должен связать joint TTFT/TPOT SLO, queueing, tail latency и количество запросов, реально обслуженных в пределах цели при реальном distribution запросов, а не на одном удобном фиксированном shape.

## Вопрос 493. В новой версии модели output length в среднем вырос на 70%, хотя per-token speed тот же. Почему это platform issue и что делать?

## Вопрос 493.1. Почему модель с тем же tokens/s может потребовать почти вдвое больше GPU после обновления?

**Ответ**

Total GPU work, KV lifetime and user latency выросли, поэтому capacity падает даже при неизменном TPOT. Сначала подтвердим, что это model behavior, а не stop/EOS/template bug. Model team оценивает, улучшает ли более длинный ответ quality; product может уменьшить verbosity via prompting or max_tokens. Platform пересчитывает capacity forecast and costs, потому что old QPS sizing invalid. Prefix caching не спасает output decode. Возможно route verbose reasoning only where needed or use reasoning budget. Rollout acceptance должен включать generated-length distribution — per-token benchmark скрывает этот regression. Если quality gain стоит extra tokens, бюджет/SLO меняются осознанно.

Для этой архитектуры главным validation-набором будут ownership, время восстановления, release velocity и то, сколько исключений от paved-road архитектуры придётся поддерживать и проверить, не покупается ли локальный performance gain ценой худшей fairness или isolation.

## Вопрос 494. В одном tenant внезапно выросло использование 256K prompts и он вытесняет остальных по KV memory. Что делать без ручного блокирования клиента?

## Вопрос 494.1. Как автоматически защитить shared KV pool от одного законного, но внезапно очень тяжёлого клиента?

**Ответ**

Использую policy, уже заложенную платформой: token/context-based quota, per-tenant concurrent long-request cap and cache budget. Admission returns explicit quota signal или routes to long-context tier with appropriate pricing/SLO. Scheduler fairness charged by resource work, not request count. Если traffic legitimate business growth, tenant can purchase/reserve capacity; platform scales planned. Не делаю ad-hoc blacklist или global max-context reduction, который накажет всех. Мониторинг показывает tenant KV share and impact. Это пример, почему multi-tenancy requires resource isolation dimensions beyond RPS: one request can be orders of magnitude heavier than another.

На практике перед rollout я бы отдельно измерил cache hit/miss cohorts, memory pressure, saved prefill work и влияние на соседние workload classes в течение достаточно долгого soak-теста, чтобы увидеть редкие хвостовые эффекты.

## Вопрос 495. Management требует сократить GPU spend на 30% за полгода без заметного падения качества. Как построить программу оптимизации?

## Вопрос 495.1. Как превратить цель `-30% GPU cost` в инженерную программу, а не набор случайных оптимизаций?

**Ответ**

Сначала baseline spend by model/workload and cost per successful task. Затем rank opportunities: remove waste/prompt inflation, increase cache reuse/batching/utilization, quantize where quality passes, reduce TP through better formats, route simple tasks to smaller models, schedule batch on spare capacity, negotiate hardware/cloud pricing. Каждая initiative имеет expected savings, quality/SLO guardrail and owner; избегаем overlapping claims, чтобы не посчитать одни GPU дважды. Проводим pilots and monthly realized savings, not benchmark estimates. 30% может потребовать portfolio model changes, а не один kernel. Security/reliability headroom не режем как «неиспользуемую capacity» без изменения SLA.

Для доказательства системной пользы нужно измерить goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic на пиковом трафике и после потери одной replica, а не только в steady state.

## Вопрос 496. Нужно выбрать архитектуру для 1M-token context, которым пользуются 0.2% запросов. Как не сделать весь fleet заложником редкого case?

## Вопрос 496.1. Как поддержать экстремальный context window, не ухудшая performance 99.8% обычных запросов?

**Ответ**

Не буду конфигурировать every replica под worst-case, если это ухудшает memory/graphs/concurrency. Создам specialized long-context tier/pool с model/runtime validated at 1M, context parallelism or sufficient HBM, chunked prefill and separate SLO/pricing. Main fleet остаётся optimized for common 8–32K. Router based on token count sends rare requests to specialized capacity; queue допустима, если contract. Explore retrieval/preprocessing to avoid full 1M where not necessary. Capacity pool may be small and elastic/batch-like. Такой architecture isolates extreme tail cost while preserving capability. Если 0.2% strategic and latency-critical, reserve dedicated capacity explicitly and price it accordingly.

В финальном decision record должны быть числа по goodput на доллар, headroom после отказа, hardware utilization и чувствительность результата к росту traffic вместе с operational метриками, которые определяют стоимость дежурства и сопровождения.

## Вопрос 497. После обновления модели quality вырос, но prefix-cache hit rate упал с 70% до 20%. Как понять причину и выбрать реакцию?

## Вопрос 497.1. Как реагировать, если более качественная модель хуже подходит под прежнюю prefix-cache architecture?

**Ответ**

Сначала проверю template/tokenizer/system prompt changes and cache namespace. Возможно new model requires dynamic reasoning/tool metadata earlier in prompt, breaking shared prefix; это semantic change, не cache bug. Сравню rendered token streams and reused lengths old/new. Если performance loss вызван avoidable placement dynamic fields, redesign template с model team и verify quality. Если новая semantics inherently reduces prefix locality, capacity/cost model должна принять lower cache benefit or use alternative hierarchical/document caching. Не откатываю quality только ради hit rate, пока не посчитан business trade-off. Cache is optimization, not product correctness; goal — cost per successful request with SLO.

## Вопрос 498. Вы строите платформу с нуля на три года. Какие решения стоит сделать обратимыми, а какие стандартизировать жёстко?

## Вопрос 498.1. Что в inference platform нужно считать долгосрочным интерфейсом, а что — заменяемой реализацией?

**Ответ**

Жёстко стандартизирую contracts, которые уменьшают хаос: immutable model bundle/versioning, unified auth/telemetry, token-aware quotas, quality/performance gates, artifact lineage and SLO taxonomy. Обратимыми оставлю быстро меняющиеся implementation choices: primary runtime, quantization scheme, GPU generation, speculative method, cache backend. Gateway/capability layer и declarative deployment profiles дают swap без rewriting products. Не абстрагирую всё до lowest common denominator; backend extensions remain explicit. Strategic principle — lock in operational invariants, not today’s fastest engine. Через три года model architectures изменятся, но потребность в auditable versions, isolation, observability and controlled rollout останется.

На практике перед rollout я бы отдельно измерил качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации для short, median и tail-size запросов, потому что среднее скрывает главный риск.

## Вопрос 499. После всех оптимизаций сервер стал на 45% дешевле, но MTTR инцидентов вырос вдвое. Считать ли проект успешным?

## Вопрос 499.1. Как оценить performance проект, который сильно экономит GPU, но делает систему заметно сложнее в эксплуатации?

**Ответ**

Не автоматически. Нужно сравнить total value: GPU savings против availability loss, on-call cost and business impact incidents. Если complexity — custom kernels, three runtimes, disaggregated cache — делает failures редкими, но очень долгими, risk-adjusted TCO может ухудшиться. Посчитаю incident minutes/customer impact and engineering hours, затем identify which optimizations contribute little savings but much complexity. Возможно оставить high-value quantization/batching и удалить marginal custom layers. Success criterion platform должен включать reliability/operability, а не только $/token. 45% savings может оправдать investment in tooling/training, но пока MTTR violates SLO, optimization program не завершён.

Перед масштабированием такого подхода стоит сопоставить качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и заранее определить условие rollback при выходе за допустимые границы.

## Вопрос 500. Какой финальный принцип вы используете при выборе LLM inference optimization для production?

## Вопрос 500.1. Какой decision framework не даёт inference optimization превратиться в гонку за красивым microbenchmark?

**Ответ**

Оптимизируется не отдельный kernel и не tokens/s, а полезный workload под явными constraints. Сначала фиксируются quality, correctness/security and latency SLO; затем измеряется bottleneck на реальном traffic. Выбирается минимально сложное изменение, которое улучшает cost/goodput, и проверяется на соседние effects: memory, batching, cache, distributed communication, failure domain and team ownership. Каждая optimization versioned, observable and rollbackable. Если выигрыш существует только в synthetic regime или требует скрытого quality trade-off, он не считается production value. И поскольку bottleneck перемещается после каждого улучшения, процесс циклический: profile → hypothesis → controlled experiment → quality gate → canary → measure fleet economics → simplify obsolete optimizations.

Решение становится обоснованным, когда trace replay показывает качество результата, p99 latency, стоимость, отказоустойчивость и сложность дальнейшей эксплуатации и зафиксировать владельца решения, способ обнаружения регресса и безопасный путь отмены.
