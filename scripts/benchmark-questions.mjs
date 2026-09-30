/** Fixed questions shared by every embedding and LLM benchmark run. */
export const BENCHMARK_QUESTIONS = [
  { id: 'rag-01', module: 'rag', question: 'Как использовать RAG внутри помощника для разработки D365 и не превращать его в самостоятельного исполнителя?' },
  { id: 'rag-02', module: 'rag', question: 'Как совместить точный поиск идентификаторов и семантический поиск в технической базе знаний?' },
  { id: 'agent-01', module: 'ai-agent-orchestration', question: 'Чем агент с инструментами отличается от обычного чат-бота, который один раз отвечает через RAG?' },
  { id: 'agent-02', module: 'ai-agent-orchestration', question: 'Как сделать повтор вызова внешнего инструмента безопасным после сетевого сбоя?' },
  { id: 'security-01', module: 'ai-security-safety-governance', question: 'Как защитить агента от prompt injection в документах и результатах retrieval?' },
  { id: 'security-02', module: 'ai-security-safety-governance', question: 'Когда действие AI-агента должно остановиться до подтверждения человека?' },
  { id: 'design-01', module: 'ai-system-design', question: 'Какие границы нужно определить между клиентом, оркестратором, моделью, tools и хранилищем состояния?' },
  { id: 'design-02', module: 'ai-system-design', question: 'Что предусмотреть, если модель или downstream-сервис временно недоступны?' },
  { id: 'eval-01', module: 'evaluation-observability', question: 'Как оценивать качество ответов AI до запуска в production?' },
  { id: 'eval-02', module: 'evaluation-observability', question: 'Как понять по trace и метрикам, на каком этапе pipeline появился неправильный результат?' },
  { id: 'production-01', module: 'production-ai-architecture', question: 'Что нужно доказать перед переводом AI-сервиса из пилота в промышленную эксплуатацию?' },
  { id: 'production-02', module: 'production-ai-architecture', question: 'Как распределить latency budget между API, retrieval, инструментами и генерацией?' },
  { id: 'code-01', module: 'ai-system-design', question: 'Напиши Python-метод, который равномерно распределяет яблоки по корзинам.' },
]
