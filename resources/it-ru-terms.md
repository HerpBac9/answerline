# IT terminology: Russian STT aliases

This is the initial, user-editable terminology seed for Wisper. It is not a claim to contain every term in IT: new rows can be added without changing TypeScript. The resolver preserves the original transcript and emits replacement provenance; only the canonical form is supplied to classification, retrieval, and the LLM.

Format: one canonical term and its Russian STT aliases separated by `;`. Aliases are exact whole words or phrases, case-insensitive. Put the most likely aliases first.

Aliases may be Latin as well as Cyrillic: Whisper sometimes transliterates a
misheard term rather than writing it in Russian. Observed in a real session: "RAG"
came out as "RAC", which the Cyrillic-only list did not catch.

CAUTION on ambiguous aliases. `RAC` is also Oracle Real Application Clusters, and
`рак` is an ordinary Russian word. Mapping them to RAG is right for interview
conversations about retrieval and wrong elsewhere - the resolver rewrites
unconditionally, so remove such rows if you discuss Oracle clustering or oncology.
The displayed transcript always keeps the original wording; only the copy sent to
the model is canonicalised.

| Canonical | Russian STT aliases |
| --- | --- |
| RAG | раг; рак; раак; ракк; RAC; RAQ; рэг; рег |
| AI | ии; а и; эй ай; ыы |
| LLM | ллм; эл эл эм; лл эм; эл-эл-эм |
| latency | латенси; латенсити; латеннси; латенсия |
| token | токен; токины; токенов; токины |
| context window | контекст виндоу; контекстное окно; окно контекста; контекст уиндоу |
| prompt | промпт; промт; промпты; промтов |
| prompt engineering | промпт инженеринг; промт инженеринг; промпт инжиниринг; промт инжиниринг |
| embedding | эмбеддинг; имбеддинг; эмбеддинги; имбединг |
| embedding dimension | размерность вектора; размерность эмбеддинга; размерность embedding; embedding dimension; размерность вектора embedding; количество измерений вектора; число измерений embedding; число измерений вектора |
| vector database | векторная база; векторная база данных; вектор дб; вектор диби |
| fine-tuning | файнтюнинг; файн тюнинг; файнтюнинг; файн тюнинг |
| inference | инференс; инференсинг; вывод модели; инференц |
| transformer | трансформер; трансформеры; трансформерная модель; трансформерная сеть |
| attention | аттеншн; атеншн; внимание; механизм внимания |
| agent | агент; эйджент; аи агент; ai агент |
| MCP | эм си пи; мцп; эмсипи; мси пи |
| function calling | функшен коллинг; function calling; вызов функций; вызовы функций |
| structured output | структурированный вывод; структурный аутпут; структуред аутпут; structured output |
| quantization | квантизация; квантование; квантизейшен; квантизацию |
| LoRA | лора; ло ра; лоран; low rank adaptation |
| GPU | гпу; джи пи ю; видеокарта; графический процессор |
| CUDA | куда; кьюда; cuda; кода |
| VRAM | врам; ви рам; видеопамять; v ram |
| PyTorch | пайторч; пай торч; pytorch; питорч |
| TensorFlow | тензорфлоу; тензор флоу; tensorflow; тенсорфлоу |
| ONNX | оникс; оннкс; он икс; onnx |
| API | апи; эй пи ай; api; а пи |
| SDK | сдк; эс ди кей; sdk; эсдека |
| HTTP | http; хттп; аш ти ти пи; хттпи |
| HTTPS | https; хттпс; аш ти ти пи эс; хттп эс |
| REST | рест; rest; рест апи; rest api |
| GraphQL | граф кью эл; графкл; graphql; граф кьюль |
| JSON | джейсон; json; джсон; джи сон |
| YAML | ямл; ямл файл; yaml; ямель |
| XML | икс эм эл; xml; эксэмэл; хмл |
| WebSocket | вебсокет; веб сокет; websocket; веб сокеты |
| gRPC | джи ар пи си; grpc; жрпс; грипси |
| OAuth | о аут; оас; oauth; о аут два |
| JWT | джей ви ти; jwt; жвт; джи дабл ю ти |
| C# | си шарп; c sharp; сишарп; си-шарп |
| .NET | дотнет; дот нет; точка нет; .нет |
| ASP.NET | асп нет; asp net; асп дот нет; эй эс пи нет |
| Entity Framework | энтити фреймворк; entity framework; эф кор; ef core |
| LINQ | линк; линкью; linq; линк запрос |
| CLR | си эл эр; clr; цлр; с л р |
| SQL | сиквел; эс кью эл; sql; скл |
| PostgreSQL | постгрес; постгрескьюэл; postgresql; постгре |
| MySQL | майскл; май эс кью эл; mysql; мускул |
| SQLite | сиквелайт; эс кью эл лайт; sqlite; склайт |
| NoSQL | ноу сиквел; носиквел; nosql; но скл |
| MongoDB | монго; монго диби; mongodb; монгодб |
| Redis | редис; redis; редис кэш; редис сервер |
| Elasticsearch | эластик; эластиксерч; elasticsearch; эластик сёрч |
| Kafka | кафка; apache kafka; апач кафка; кафка брокер |
| RabbitMQ | рэббит эм кью; раббит мкью; rabbitmq; кролик мкью |
| JavaScript | джаваскрипт; java script; javascript; жаваскрипт |
| TypeScript | тайпскрипт; type script; typescript; типскрипт |
| Node.js | нода; node js; node.js; нод джейс |
| npm | эн пи эм; npm; нпм; npm пакет |
| pnpm | пи эн пи эм; пнпм; pnpm; п эн пи эм |
| React | реакт; react; реактовый; риакт |
| Angular | ангуляр; angular; ангулар; ангулярный |
| Vue | вью; vue; вью джс; vue js |
| Vite | вит; вайт; vite; вите |
| Electron | электрон; electron; электроника; электорон |
| Webpack | вебпак; веб пак; webpack; вебпэк |
| HTML | аш ти эм эл; html; хтмл; эйч ти эм эл |
| CSS | си эс эс; css; ссс; цсс |
| Tailwind | тейлвинд; tailwind; тейл винд; tail винд |
| Python | пайтон; питон; python; пайтен |
| FastAPI | фаст апи; fastapi; фастапи; фаст эй пи ай |
| Django | джанго; django; джангоу; джангո |
| Flask | фласк; flask; фляск; флэск |
| Java | джава; java; жава; джава язык |
| Kotlin | котлин; kotlin; катлин; котлен |
| C++ | си плюс плюс; c plus plus; с плюс плюс; сиплюсплюс |
| Go | го ланг; golang; го язык; гоу ланг |
| Rust | раст; rust; раст язык; руст |
| Git | гит; git; гитх; гит система |
| GitHub | гитхаб; git hub; github; гит хаб |
| GitLab | гитлаб; git lab; gitlab; гит лаб |
| CI/CD | си ай си ди; cicd; сиай сиди; ci cd |
| Docker | докер; docker; докеры; докер контейнер |
| Kubernetes | кубернетес; кубер; k8s; кубернетис |
| Linux | линукс; linux; линекс; линукс сервер |
| Windows | виндовс; windows; винда; виндоус |
| WSL | всл; дабл ю эс эл; wsl; виндоус сабсистем |
| Bash | баш; bash; баш скрипт; башелл |
| PowerShell | павершел; power shell; powershell; пауэршелл |
| SSH | эс эс аш; ssh; ссаш; эш эш |
| DNS | ди эн эс; dns; днс; доменная система |
| TCP | ти си пи; tcp; тцп; tcp ip |
| UDP | ю ди пи; udp; удп; юдп |
| IP | ай пи; ip; ип адрес; айпи адрес |
| AWS | эй дабл ю эс; aws; авс; амазон веб сервис |
| Azure | ажур; azure; азур; майкрософт ажур |
| GCP | джи си пи; gcp; гугл клауд; google cloud |
| Azure DevOps | ажур девопс; azure devops; азур девопс; devops ажур |
| microservices | микросервисы; микро сервисы; microservices; микросервисная архитектура |
| monolith | монолит; монолитная архитектура; monolith; монолит приложение |
| serverless | серверлесс; бессерверный; serverless; сервер лес |
| ORM | орм; о эр эм; orm; объектно реляционный маппинг |
| DTO | дэ то; dto; ди ти о; дто |
| SOLID | солид; solid; принципы солид; солид принципы |
| OOP | ооп; о о п; oop; объектно ориентированное |
| TDD | тдд; ти ди ди; tdd; тест драйвен |
| DDD | ддд; ди ди ди; ddd; домен драйвен |
| CQRS | си кью ар эс; cqrs; цукрс; сикуэрэс |
| Agile | аджайл; agile; эджайл; аджаил |
| Scrum | скрам; scrum; скрум; скрам процесс |
| Kanban | канбан; kanban; кан бан; канбан доска |
| Jira | джира; jira; жира; jira задача |
| Confluence | конфлюенс; confluence; конфлюенс вики; конфлюенс страница |
| Figma | фигма; figma; фиґма; фигма макет |
| Axapta | аксапта; axapta; аксапта разработка |
| Dynamics 365 | динамикс триста шестьдесят пять; dynamics 365; dynamics365; d365 |
| D365 Finance and Operations | д365 файненс энд оперейшнс; d365 finance and operations; d365 f&o; finance and operations |
| metadata | метадата; метаданные; metadata; мета дата |
| X++ | икс плюс плюс; x++; x плюс плюс; икс плюс |
| label | лейбл; label; label id; метка |
| FTS5 | эф ти эс файв; fts5; fts 5; полнотекстовый поиск |
| Qdrant | кьюдрант; qdrant; кудрант; кью дрант |
| InventTable | инвент тейбл; inventtable; invent table; таблица инвент |
| EDT | и ди ти; edt; расширенный тип данных; extended data type |
| CoC | си оу си; coc; chain of command; чейн оф команд |
| MetadataHost | метадата хост; metadatahost; metadata host |
| Microsoft.Dynamics.AX.Metadata | майкрософт динамикс акс метадата; microsoft dynamics ax metadata; microsoft.dynamics.ax.metadata; metadata dll |
| MCP server | эм си пи сервер; mcp server; mcp-сервер; сервер эм си пи |
| LM Studio | эл эм студио; lm studio; lmstudio; студио эмбеддингов |
| Qwen3 | квен три; qwen3; qwen 3; квен |
| CLI | си эл ай; cli; командная строка; cli команда |
| workflow | воркфлоу; workflow; рабочий процесс; ворк флоу |
| orchestration | оркестрация; orchestration; оркестрирование; слой оркестрации |
| tool | тул; tool; инструмент агента; тулз |
| payload | пэйлоад; payload; полезная нагрузка; данные запроса |
| schema | схема; schema; схема payload; контракт данных |
| validation | валидация; validation; проверка payload; проверка данных |
| preflight | префлайт; preflight; предварительная проверка; пробный запуск |
| approval | апрув; approval; подтверждение плана; согласование |
| rollback | роллбэк; rollback; откат; ролл бек |
| diff | дифф; diff; разница файлов; сравнение файлов |
| commit | коммит; commit; коммит git; версия в git |
| snapshot | снапшот; snapshot; срез данных; снимок базы |
| manifest | манифест; manifest; manifest файл; файл манифеста |
| receipt | ресит; receipt; квитанция операции; результат операции |
| knowledge base | база знаний; knowledge base; knowledge база; база knowledge |
| source of truth | сорс оф трус; source of truth; источник истины; источник правды |
| semantic retrieval | семантический поиск; semantic retrieval; семантик ретривал; поиск по смыслу |
| exact search | точный поиск; exact search; экзакт поиск; поиск по точному совпадению |
| hybrid retrieval | гибридный поиск; hybrid retrieval; hybrid search; гибридный ретривал |
| reranker | реранкер; reranker; rerank; повторное ранжирование |
| cosine similarity | косинусное сходство; cosine similarity; косинус симилэрити; косинусная близость |
| Recall@5 | риколл пять; recall at 5; recall@5; recall пять |
| MRR | эм ар ар; mrr; mean reciprocal rank; среднее обратное ранжирование |
| top-k | топ кей; top-k; top k; топ пять |
| prompt injection | промпт инжекшн; prompt injection; инъекция промпта; промпт инъекция |
| hallucination | галлюцинация; hallucination; галлюцинации; выдуманный ответ модели |
| LangChain | лэнгчейн; langchain; lang chain; лангчейн |
| LangGraph | лэнгграф; langgraph; lang graph; лангграф |
| BM25 | би эм двадцать пять; bm25; bm 25; бэм двадцать пять |
| ANN | эй эн эн; ann; approximate nearest neighbor; приближённый поиск соседей |
| HNSW | аш эн эс дабл ю; hnsw; hnsw индекс; граф ближайших соседей |
| NDCG | эн ди си джи; ndcg; normalized discounted cumulative gain; нормализованный ndcg |
| MAP | эм эй пи; map; mean average precision; средняя точность |
| MMR | эм эм ар; mmr; maximal marginal relevance; максимальная маржинальная релевантность |
| MTEB | эм ти и би; mteb; benchmark эмбеддингов; бенчмарк эмбеддингов |
| GraphRAG | граф раг; graphrag; graph rag; графовый раг |
| HyDE | хайд; hyde; hypothetical document embeddings; гипотетический документ |
| CRAG | си раг; crag; corrective rag; корректирующий раг |
| RAGAS | рагас; ragas; оценка rag; метрики rag |
| FAISS | файс; faiss; фейс; библиотека faiss |
| Pydantic | пайдантик; pydantic; пайдэнтик; pydantic модель |
| PydanticAI | пайдантик ай; pydanticai; pydantic ai; пайдантик аи |
| LlamaIndex | лама индекс; llamaindex; llama index; ллама индекс |
| CrewAI | кру ай; crewai; crew ai; кру аи |
| AutoGen | оутоген; autogen; auto gen; авто ген |
| ReAct | риэкт; react agent; re-act; reasoning acting |
| LangSmith | лэнгсмит; langsmith; lang smith; лангсмит |
| OpenTelemetry | оупентелеметри; opentelemetry; open telemetry; открытая телеметрия |
| JSON-RPC | джейсон ар пи си; json-rpc; json rpc; джейсон рпс |
| OpenAPI | оупен апи; openapi; open api; спецификация openapi |
| RBAC | ар бэ эй си; rbac; ролевая модель доступа; role based access |
| ABAC | эй бэ эй си; abac; атрибутная модель доступа; attribute based access |
| IAM | ай эм; iam; identity and access management; управление доступом |
| HITL | хи ит эл; hitl; human in the loop; человек в контуре |
| SLI | эс эл ай; sli; service level indicator; индикатор сервиса |
| SLO | эс эл оу; slo; service level objective; цель уровня сервиса |
| TTFT | ти ти эф ти; ttft; time to first token; время до первого токена |
| p95 | пи девяносто пять; p95; перцентиль девяносто пять; девяносто пятый перцентиль |
| p99 | пи девяносто девять; p99; перцентиль девяносто девять; девяносто девятый перцентиль |
| LLMOps | эл эл эм опс; llmops; llm ops; эксплуатация llm |
| MLOps | эм эл опс; mlops; ml ops; эксплуатация ml |
| VLM | ви эл эм; vlm; vision language model; визуально языковая модель |
| OCR | о си ар; ocr; optical character recognition; распознавание текста |
