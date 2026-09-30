# Python Backend Engineering для AI/LLM/Agent систем — 500 вопросов и ответов

Банк для подготовки к техническим собеседованиям. Вопросы отсортированы по уровням Junior → Middle → Senior → Lead.

## 1. Чем mutable и immutable объекты отличаются в Python и что именно передаётся в функцию?

**Уровень:** Junior

**Ответ:**
Python использует object references: параметр получает ссылку на тот же объект. Mutable (мьютабл — изменяемый) объект можно изменить in-place, immutable создаёт новый объект при «изменении». Поэтому корректнее говорить call-by-sharing, а не pass-by-reference/value.

## 2. Production debugging: какие failure modes характерны для темы «mutable и immutable объекты отличаются в Python и что именно передаётся в функцию» и как их локализовать?

**Уровень:** Junior

**Ответ:**
Типичная ошибка — изменять list/dict, полученный как аргумент, и неожиданно менять состояние вызывающего кода. Диагностика: проверять identity через id(), mutation sites и тесты на aliasing.

## 3. В чём разница между `is` и `==`?

**Уровень:** Junior

**Ответ:**
`==` вызывает equality protocol и сравнивает значения; `is` проверяет object identity — один ли это объект. Для `None` используют `is None`; сравнивать строки или числа через `is` нельзя полагаться из-за interning/implementation details.

## 4. Представьте production-инцидент вокруг темы «В чём разница между is и ==». Что вы проверите первым и почему?

**Уровень:** Junior

**Ответ:**
Баг проявляется «иногда»: маленькие числа или interned strings случайно дают True при `is`. Лечится статическим анализом и использованием `==` для значений. При разборе смотрите aliasing, identity, mutation sites и lifetime объектов; минимальный reproducer должен отделить семантику Python от поведения framework.

## 5. Когда вычисляются default arguments функции и почему `def f(x=[])` опасен?

**Уровень:** Junior

**Ответ:**
Default arguments вычисляются один раз при определении функции, а не на каждый вызов. Поэтому mutable default сохраняет состояние между вызовами. Обычно используют `None` sentinel и создают list внутри.

```python
def append_safe(value: int, items: list[int] | None = None) -> list[int]:
    if items is None:
        items = []
    items.append(value)
    return items

assert append_safe(1) == [1]
assert append_safe(2) == [2]
```

Код является минимальным рабочим примером; production-версия дополнительно учитывает logging, timeouts, validation и tests.

## 6. Production debugging: какие failure modes характерны для темы «вычисляются default arguments функции и почему def f(x=[]) опасен» и как их локализовать?

**Уровень:** Junior

**Ответ:**
Баг — данные предыдущего request внезапно появляются в следующем. Особенно опасно в web service, где функция вызывается много раз. Проверяйте lifetime захваченных объектов, late binding, сохранение metadata через functools.wraps и скрытое mutable state в closure/decorator.

## 7. Чем `staticmethod`, `classmethod` и instance method отличаются?

**Уровень:** Junior

**Ответ:**
Instance method получает `self`; classmethod — `cls` и удобен для alternative constructors/polymorphic factories; staticmethod не получает implicit receiver и лишь namespaced utility. Если функция не использует class state, module-level function часто ещё проще.

## 8. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «staticmethod, classmethod и instance method отличаются»?

**Уровень:** Junior

**Ответ:**
Злоупотребление staticmethod превращает class в namespace и скрывает зависимости. Classmethod, создающий конкретный базовый класс вместо `cls`, ломает наследование. Проверяйте lifetime захваченных объектов, late binding, сохранение metadata через functools.wraps и скрытое mutable state в closure/decorator.

## 9. Что дают type hints в динамическом Python?

**Уровень:** Junior

**Ответ:**
Type hints — metadata для static analysis, IDE, документации и schema generation; CPython обычно не применяет их как runtime enforcement. `mypy`/pyright ловят множество ошибок до запуска.

## 10. Production debugging: какие failure modes характерны для темы «Что дают type hints в динамическом Python» и как их локализовать?

**Уровень:** Junior

**Ответ:**
Ложное чувство безопасности: внешний JSON остаётся untrusted и требует runtime validation. `Any` может незаметно выключить проверку на большом участке. Разделяйте static typing и runtime validation: mypy/pyright не защищают JSON на сетевой границе, а validation не доказывает корректность внутренней логики.

## 11. Чем iterable отличается от iterator?

**Уровень:** Junior

**Ответ:**
Iterable предоставляет `__iter__`, из него можно получить iterator. Iterator дополнительно имеет `__next__` и хранит состояние прохода. Многие containers можно обходить многократно; generator iterator обычно одноразовый.

## 12. Production debugging: какие failure modes характерны для темы «iterable отличается от iterator» и как их локализовать?

**Уровень:** Junior

**Ответ:**
Передать один iterator двум consumers — значит разделить состояние и получить пропуски. Частая ошибка — повторно использовать исчерпанный generator. Ищите утечки ресурсов при раннем выходе, повторное потребление одноразового iterator и накопление данных, которое уничтожает преимущество lazy processing.

## 13. Почему `asyncio` ускоряет I/O-bound workload, но не CPU-bound Python code?

**Уровень:** Junior

**Ответ:**
`asyncio` использует cooperative concurrency: задача отдаёт event loop управление на `await`, пока ждёт I/O. Это скрывает waiting time. CPU-bound coroutine без await блокирует loop и не становится быстрее.

## 14. Production debugging: какие failure modes характерны для темы «asyncio ускоряет I/O-bound workload, но не CPU-bound Python code» и как их локализовать?

**Уровень:** Junior

**Ответ:**
Частая ошибка — вызвать тяжёлый parsing/embedding preprocessing прямо в async endpoint и заморозить все requests одного worker. Первым делом ищите blocking code в event loop, unbounded task creation, потерянные exceptions и отсутствие concurrency limits.

## 15. Что такое GIL в CPython и на какие workloads он влияет?

**Уровень:** Junior

**Ответ:**
GIL, Global Interpreter Lock (джи-ай-эл — блокировка, позволяющая одному thread исполнять Python bytecode в интерпретаторе одновременно) ограничивает CPU-bound parallelism обычных threads. I/O releases/waits не делает threads бесполезными.

## 16. Production debugging: какие failure modes характерны для темы «GIL в CPython и на какие workloads он влияет» и как их локализовать?

**Уровень:** Junior

**Ответ:**
Фраза «Python threads всегда медленные» неверна: для blocking I/O они полезны. C extensions также могут отпускать GIL. Профилируйте CPU vs I/O, saturation executor, serialization/IPC и race conditions; наличие или отсутствие GIL не отменяет synchronization shared state.

## 17. Что такое ASGI и чем он отличается от WSGI?

**Уровень:** Junior

**Ответ:**
ASGI, Asynchronous Server Gateway Interface (эй-эс-джи-ай — интерфейс async web apps), поддерживает long-lived connections и concurrent async events; WSGI — синхронный request/response contract. ASGI подходит WebSocket/SSE и async I/O.

## 18. Представьте production-инцидент вокруг темы «ASGI и чем он отличается от WSGI». Что вы проверите первым и почему?

**Уровень:** Junior

**Ответ:**
ASGI не делает blocking code неблокирующим. Один `time.sleep` или sync HTTP call в async endpoint может заморозить event loop worker. Проверяйте blocking dependencies, неверный lifespan ресурсов, connection-pool exhaustion, middleware ordering и работу cancellation при disconnect.

## 19. Чем PUT отличается от PATCH и почему это важно для idempotency?

**Уровень:** Junior

**Ответ:**
PUT семантически заменяет representation целиком и должен быть idempotent; PATCH применяет partial modification, но конкретный patch format может быть idempotent или нет. HTTP method не гарантирует внутреннюю реализацию автоматически.

## 20. Представьте production-инцидент вокруг темы «PUT отличается от PATCH и почему это важно для idempotency». Что вы проверите первым и почему?

**Уровень:** Junior

**Ответ:**
PATCH вида «increment balance by 10» повторно изменит состояние. Retry клиента может создать двойной side effect. Проверяйте semantics status codes, validation, idempotency, pagination boundaries, retries и backward compatibility.

## 21. Какие HTTP status codes важны для backend API и где часто ошибаются?

**Уровень:** Junior

**Ответ:**
200/201/202/204 разделяют success semantics; 400 — malformed generic request, 401 — нет/невалидная authentication, 403 — authenticated, но запрещено, 404 — not found, 409 — conflict, 422 — semantic validation, 429 — rate limit, 5xx — server/upstream failure.

## 22. Code review: какие скрытые дефекты вы бы искали в реализации темы «HTTP status codes важны для backend API и где часто ошибаются»?

**Уровень:** Junior

**Ответ:**
Возвращать 200 с `{error:...}` ломает clients/monitoring. 401 и 403 часто путают; internal stack trace нельзя выдавать как 500 body. Проверяйте semantics status codes, validation, idempotency, pagination boundaries, retries и backward compatibility.

## 23. Authentication и authorization — в чём разница?

**Уровень:** Junior

**Ответ:**
Authentication (аутентифика́ция — кто субъект) подтверждает identity; authorization (авториза́ция — что ему разрешено) проверяет действие над ресурсом. Успешный login не даёт автоматически право на любой tenant/tool.

## 24. Представьте production-инцидент вокруг темы «Authentication и authorization — в чём разница». Что вы проверите первым и почему?

**Уровень:** Junior

**Ответ:**
Проверять role только в UI или prompt — security bug. IDOR возникает, когда endpoint принимает чужой resource ID без object-level authorization. Проверяйте token validation, issuer/audience, privilege checks на каждом resource, secret leakage, SSRF и обход rate limits.

## 25. Как хранить пароли и API secrets?

**Уровень:** Junior

**Ответ:**
Пароли хранят как slow salted password hash через современный KDF, а не encryption. API secrets/keys требуют secret manager/KMS, rotation, least privilege и не должны попадать в code/log/prompt.

## 26. Какая типичная ошибка возникает при работе с темой «хранить пароли и API secrets» и как она проявится под нагрузкой?

**Уровень:** Junior

**Ответ:**
SHA-256(password) без salt/KDF уязвим к brute force/rainbow tables. `.env` в git — утечка. Base64 — не encryption. Проверяйте token validation, issuer/audience, privilege checks на каждом resource, secret leakage, SSRF и обход rate limits.

## 27. Чем INNER JOIN отличается от LEFT JOIN и где типичная ошибка с фильтром?

**Уровень:** Junior

**Ответ:**
INNER JOIN оставляет только совпавшие строки; LEFT JOIN сохраняет все строки слева и заполняет правую сторону NULL. Условие на правую таблицу в `WHERE` может превратить LEFT JOIN фактически в INNER; если нужно сохранить отсутствующие строки, условие часто переносится в `ON`.

## 28. Production debugging: какие failure modes характерны для темы «INNER JOIN отличается от LEFT JOIN и где типичная ошибка с фильтром» и как их локализовать?

**Уровень:** Junior

**Ответ:**
Отчёт внезапно теряет entities без children. Проверка row counts и тесты на «нет связанной строки» быстро выявляют ошибку. Смотрите execution plan, row cardinality, missing/unused indexes, N+1, lock waits и semantic ошибки JOIN/NULL, а не только время одного query.

## 29. Как избежать SQL injection?

**Уровень:** Junior

**Ответ:**
Используйте parameterized queries/bind parameters; значения не конкатенируются в SQL. Имена таблиц/columns нельзя безопасно parameterize как values — их выбирают из allowlist или query builder.

## 30. Какая типичная ошибка возникает при работе с темой «избежать SQL injection» и как она проявится под нагрузкой?

**Уровень:** Junior

**Ответ:**
f-string SQL с пользовательским input уязвим даже если «экранировать кавычки». ORM тоже уязвим при raw text interpolation. Смотрите execution plan, row cardinality, missing/unused indexes, N+1, lock waits и semantic ошибки JOIN/NULL, а не только время одного query.

## 31. Что такое ACID на практическом backend-примере?

**Уровень:** Junior

**Ответ:**
Atomicity — все изменения транзакции или ни одного; Consistency — invariants сохраняются; Isolation — concurrent transactions взаимодействуют по заданным правилам; Durability — committed data переживает crash согласно guarantees. ACID не означает «никаких гонок» без правильной isolation/schema.

## 32. Production debugging: какие failure modes характерны для темы «ACID на практическом backend-примере» и как их локализовать?

**Уровень:** Junior

**Ответ:**
Разнести debit и ledger insert по разным transactions ломает atomicity. Application-level invariant без unique/check constraint может нарушиться при race. Диагностика включает lock graph, transaction age, deadlocks, isolation anomalies, version conflicts и index bloat/write amplification.

## 33. Чем unit, integration и end-to-end tests отличаются для backend?

**Уровень:** Junior

**Ответ:**
Unit test изолирует небольшую логику; integration проверяет реальные границы — DB, Redis, HTTP adapter; end-to-end проходит полный deployed/user flow. Хорошая пирамида быстро локализует bugs и имеет небольшое число дорогих E2E.

## 34. Представьте production-инцидент вокруг темы «unit, integration и end-to-end tests отличаются для backend». Что вы проверите первым и почему?

**Уровень:** Junior

**Ответ:**
Только mocks дают зелёные tests при несовместимом SQL/API. Только E2E медленны и flaky. Проверяйте, не замоканы ли именно те boundaries, где чаще всего ломается contract: SQL, HTTP, queue, serialization и timeouts.

## 35. Какой главный trade-off у темы «mutable и immutable объекты отличаются в Python и что именно передаётся в функцию» и когда вы выберете альтернативный подход?

**Уровень:** Middle

**Ответ:**
Mutable структуры экономят копирования, но увеличивают риск shared-state bugs. Immutable значения проще reasoning/кэшировать, но частые изменения создают новые объекты. Оценивайте не только скорость, но и понятность ownership, объём копирований, hashability и риск shared mutable state.

## 36. Как применить тему «mutable и immutable объекты отличаются в Python и что именно передаётся в функцию» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
В AI backend request/state objects лучше отделять immutable configuration от mutable per-request state; shared mutable defaults запрещены. В AI-сервисе особенно важно не смешивать process-wide configuration с mutable per-request/per-run state.

```python
def mutate(xs: list[int]) -> None:
    xs.append(3)

a=[1,2]
mutate(a)
assert a == [1,2,3]

def pure_add(xs: tuple[int,...], x:int) -> tuple[int,...]:
    return xs + (x,)
assert pure_add((1,2),3) == (1,2,3)
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 37. Сравните основной подход в теме «В чём разница между is и ==» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Middle

**Ответ:**
Identity быстрее по смыслу, но применим только когда identity является контрактом: sentinel, singleton, None. Оценивайте не только скорость, но и понятность ownership, объём копирований, hashability и риск shared mutable state.

## 38. Спроектируйте практическое применение темы «В чём разница между is и ==» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
В agent runtime sentinel для «нет результата» можно сравнивать через `is`, а payload/model IDs — через `==`. В AI-сервисе особенно важно не смешивать process-wide configuration с mutable per-request/per-run state.

```python
SENTINEL = object()
value = SENTINEL
assert value is SENTINEL
assert "abc" == "abc"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 39. Как работает hashing в Python и какие объекты могут быть ключами `dict`?

**Уровень:** Middle

**Ответ:**
Hashable (хэ́шабл — объект со стабильным hash и согласованным equality) может быть ключом dict/set. Если `a == b`, их hash обязан совпадать. Mutable containers обычно unhashable, потому что изменение разрушило бы bucket placement.

## 40. Какая типичная ошибка возникает при работе с темой «работает hashing в Python и какие объекты могут быть ключами dict» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Опасно реализовать `__eq__` без согласованного `__hash__` или менять поля, участвующие в hash. Симптом — потерянный ключ/непредсказуемое membership. При разборе смотрите aliasing, identity, mutation sites и lifetime объектов; минимальный reproducer должен отделить семантику Python от поведения framework.

## 41. Как встроить решение по теме «работает hashing в Python и какие объекты могут быть ключами dict» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Для cache key AI-запроса лучше строить immutable tuple/frozen dataclass из model, prompt version и нормализованных параметров. В AI-сервисе особенно важно не смешивать process-wide configuration с mutable per-request/per-run state.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class CacheKey:
    tenant: str
    model: str
    prompt_version: int

k = CacheKey("t1","m1",3)
d = {k: "cached"}
assert d[k] == "cached"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 42. Напишите решение задачи Longest Substring Without Repeating Characters и объясните сложность.

**Уровень:** Middle

**Ответ:**
Оптимальное решение использует sliding window (слайдинг-виндоу — скользящее окно) и хранит последнюю позицию каждого символа. Левую границу двигают только вперёд, поэтому каждый индекс обрабатывается O(1) раз, итог O(n) времени и O(min(n, alphabet)) памяти.

```python
def longest_unique(s: str) -> int:
    left = best = 0
    last: dict[str, int] = {}
    for right, ch in enumerate(s):
        if ch in last:
            left = max(left, last[ch] + 1)
        last[ch] = right
        best = max(best, right - left + 1)
    return best

assert longest_unique("abcabcbb") == 3
assert longest_unique("bbbbb") == 1
```

Код является минимальным рабочим примером; production-версия дополнительно учитывает logging, timeouts, validation и tests.

## 43. Code review: какие скрытые дефекты вы бы искали в реализации темы «Longest Substring Without Repeating Characters и объясните сложность.»?

**Уровень:** Middle

**Ответ:**
Частая ошибка — сдвинуть left назад при встрече символа, который повторялся до текущего окна. Нужно брать `max(left, last[ch] + 1)`. При разборе смотрите aliasing, identity, mutation sites и lifetime объектов; минимальный reproducer должен отделить семантику Python от поведения framework.

## 44. Как вы реализуете и будете наблюдать тему «Longest Substring Without Repeating Characters и объясните сложность.» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Паттерн встречается в streaming validation/dedup задачах: поддерживаем ограниченное состояние вместо повторного сканирования всей истории. В AI-сервисе особенно важно не смешивать process-wide configuration с mutable per-request/per-run state.

## 45. Какой главный trade-off у темы «вычисляются default arguments функции и почему def f(x=[]) опасен» и когда вы выберете альтернативный подход?

**Уровень:** Middle

**Ответ:**
Mutable default иногда намеренно используют как cache, но это неявно и хуже явного cache/state object. Функциональный wrapper дешевле класса, пока не появляются сложный lifecycle, несколько зависимостей и необходимость явного state.

## 46. Как применить тему «вычисляются default arguments функции и почему def f(x=[]) опасен» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
В FastAPI/service helpers defaults должны быть immutable; request-specific collections создаются внутри вызова. Для LLM backend такие механизмы разумны вокруг cross-cutting concerns: tracing, retry, auth и metrics, но не должны скрывать сетевые side effects.

## 47. Объясните LEGB и различия `global` и `nonlocal`.

**Уровень:** Middle

**Ответ:**
LEGB — Local, Enclosing, Global, Builtins: порядок поиска имени. `global` связывает assignment с module namespace; `nonlocal` — с ближайшим enclosing function scope. Оба увеличивают скрытую связанность и редко нужны в backend code.

## 48. Представьте production-инцидент вокруг темы «LEGB и различия global и nonlocal.». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Замыкание может читать внешнюю переменную, но assignment без `nonlocal` создаст локальную и вызовет UnboundLocalError при чтении до присваивания. Проверяйте lifetime захваченных объектов, late binding, сохранение metadata через functools.wraps и скрытое mutable state в closure/decorator.

## 49. Спроектируйте практическое применение темы «LEGB и различия global и nonlocal.» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Для request middleware counters используйте metrics backend, а не module globals: несколько worker processes не разделяют память. Для LLM backend такие механизмы разумны вокруг cross-cutting concerns: tracing, retry, auth и metrics, но не должны скрывать сетевые side effects.

```python
def outer():
    count = 0
    def inc():
        nonlocal count
        count += 1
        return count
    return inc

f=outer()
assert (f(), f()) == (1,2)
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 50. Что такое closure и где его разумно использовать?

**Уровень:** Middle

**Ответ:**
Closure (кло́ужер — функция, сохраняющая ссылки на переменные enclosing scope) позволяет создавать parameterized callbacks/decorators без класса. Захваченные объекты живут, пока живёт closure.

## 51. Какая типичная ошибка возникает при работе с темой «closure и где его разумно использовать» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Late binding в цикле приводит к тому, что lambdas видят финальное значение переменной. Исправляют default binding или factory. Проверяйте lifetime захваченных объектов, late binding, сохранение metadata через functools.wraps и скрытое mutable state в closure/decorator.

## 52. Как встроить решение по теме «closure и где его разумно использовать» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Можно сделать factory для retry policy или request validator, но connection pools лучше оформлять lifecycle-managed объектами. Для LLM backend такие механизмы разумны вокруг cross-cutting concerns: tracing, retry, auth и metrics, но не должны скрывать сетевые side effects.

```python
funcs = [lambda i=i: i for i in range(3)]
assert [f() for f in funcs] == [0,1,2]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 53. Как добавить общее поведение к нескольким функциям, не меняя их код?

**Уровень:** Middle

**Ответ:**
Классический ответ — decorator (декора́тор — callable, оборачивающий функцию/класс). Для logging, timing, auth и retries wrapper должен сохранять metadata через `functools.wraps` и корректно работать с async functions.

```python
from functools import wraps
import asyncio

def timed_async(fn):
    @wraps(fn)
    async def wrapper(*args, **kwargs):
        return await fn(*args, **kwargs)
    return wrapper

@timed_async
async def f(x: int) -> int:
    await asyncio.sleep(0)
    return x * 2

assert asyncio.run(f(3)) == 6
```

Код является минимальным рабочим примером; production-версия дополнительно учитывает logging, timeouts, validation и tests.

## 54. Code review: какие скрытые дефекты вы бы искали в реализации темы «добавить общее поведение к нескольким функциям, не меняя их код»?

**Уровень:** Middle

**Ответ:**
Синхронный wrapper вокруг async function легко вернёт coroutine вместо результата или заблокирует event loop. Также плохо ловить слишком широкий Exception. Проверяйте lifetime захваченных объектов, late binding, сохранение metadata через functools.wraps и скрытое mutable state в closure/decorator.

## 55. Как вы реализуете и будете наблюдать тему «добавить общее поведение к нескольким функциям, не меняя их код» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
В AI API decorator уместен для telemetry/retry чистого client call; authorization чаще лучше dependency/middleware, чтобы policy была централизована. Для LLM backend такие механизмы разумны вокруг cross-cutting concerns: tracing, retry, auth и metrics, но не должны скрывать сетевые side effects.

## 56. Как изменится ваше решение по теме «staticmethod, classmethod и instance method отличаются» при росте нагрузки в 100 раз?

**Уровень:** Middle

**Ответ:**
Method привязывает behavior к object lifecycle; pure function легче тестируется. Выбирают по реальной ответственности. Функциональный wrapper дешевле класса, пока не появляются сложный lifecycle, несколько зависимостей и необходимость явного state.

## 57. Какие production controls добавите вокруг темы «staticmethod, classmethod и instance method отличаются» в автономном AI-agent сервисе?

**Уровень:** Middle

**Ответ:**
Pydantic/domain models могут иметь classmethod factory из provider payload; сетевые вызовы внутрь model class лучше не помещать. Для LLM backend такие механизмы разумны вокруг cross-cutting concerns: tracing, retry, auth и metrics, но не должны скрывать сетевые side effects.

```python
class User:
    def __init__(self, name:str): self.name=name
    @classmethod
    def from_email(cls, email:str):
        return cls(email.split("@",1)[0])

assert User.from_email("ann@example.com").name == "ann"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 58. Что делает `__slots__` и когда он полезен?

**Уровень:** Middle

**Ответ:**
`__slots__` объявляет фиксированные instance attributes и обычно убирает per-instance `__dict__`, уменьшая память при миллионах маленьких объектов. Это также ограничивает динамические attributes.

## 59. Какая типичная ошибка возникает при работе с темой «Что делает __slots__ и когда он полезен» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Наследование, weakrefs и dataclasses требуют учитывать slots semantics. Использовать `__slots__` как security control нельзя. Ищите скрытое coupling через inheritance, неправильный MRO/super, magic methods с неожиданными side effects и слишком широкие interfaces.

## 60. Как встроить решение по теме «Что делает __slots__ и когда он полезен» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Для миллионов lightweight telemetry/event objects slots/dataclass(slots=True) может снизить RSS; сначала измерьте profiler. Provider adapters, repositories и tool ports удобнее задавать маленькими protocols, чтобы тестировать без реальных внешних SDK.

```python
from dataclasses import dataclass
@dataclass(slots=True)
class Event:
    kind: str
    value: int
e=Event("token",1)
assert e.value == 1
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 61. Когда использовать composition вместо inheritance?

**Уровень:** Middle

**Ответ:**
Composition (компози́шн — объект содержит зависимые компоненты) предпочтительна, когда поведение меняется независимо: repository, LLM client, policy, cache. Inheritance хорош для настоящего is-a контракта и framework hooks.

## 62. Code review: какие скрытые дефекты вы бы искали в реализации темы «использовать composition вместо inheritance»?

**Уровень:** Middle

**Ответ:**
Глубокая hierarchy создаёт fragile base class и скрытый coupling. Изменение базового класса затрагивает далёких наследников. Ищите скрытое coupling через inheritance, неправильный MRO/super, magic methods с неожиданными side effects и слишком широкие interfaces.

## 63. Как вы реализуете и будете наблюдать тему «использовать composition вместо inheritance» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Agent service обычно композирует ModelClient, ToolRegistry, MemoryStore и PolicyEngine, а не наследует «SuperAgentBase». Provider adapters, repositories и tool ports удобнее задавать маленькими protocols, чтобы тестировать без реальных внешних SDK.

## 64. Какой главный trade-off у темы «Что дают type hints в динамическом Python» и когда вы выберете альтернативный подход?

**Уровень:** Middle

**Ответ:**
Больше точности улучшает refactoring, но слишком сложные generic types ухудшают читаемость. Типизируют прежде всего публичные границы. Более строгие schemas повышают safety и evolvability API, но требуют versioning и аккуратной совместимости клиентов.

## 65. Как применить тему «Что дают type hints в динамическом Python» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
AI backend особенно выигрывает от typed tool contracts, provider responses и state models; внешний payload валидирует Pydantic. На границе model/tool/API используйте строгую validation schema, а внутри domain layer не тащите provider-specific DTO.

```python
from typing import TypedDict
class ToolCall(TypedDict):
    name: str
    args: dict[str, object]

def tool_name(call: ToolCall) -> str:
    return call["name"]
assert tool_name({"name":"search","args":{}}) == "search"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 66. Когда `dataclass` лучше обычного класса?

**Уровень:** Middle

**Ответ:**
`dataclass` генерирует init/repr/eq и хорошо подходит для data carriers/value objects. `frozen=True` помогает выразить immutability, `slots=True` — уменьшить overhead. Для сложного behavior обычный класс ничем не хуже.

## 67. Какая типичная ошибка возникает при работе с темой «dataclass лучше обычного класса» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Mutable defaults всё равно требуют `default_factory`; frozen не делает вложенные mutable объекты immutable. Разделяйте static typing и runtime validation: mypy/pyright не защищают JSON на сетевой границе, а validation не доказывает корректность внутренней логики.

## 68. Как встроить решение по теме «dataclass лучше обычного класса» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Внутренний domain event можно сделать frozen dataclass, а HTTP request/tool schema — Pydantic model. На границе model/tool/API используйте строгую validation schema, а внутри domain layer не тащите provider-specific DTO.

```python
from dataclasses import dataclass, field
@dataclass
class Batch:
    ids: list[int] = field(default_factory=list)

a,b=Batch(),Batch(); a.ids.append(1)
assert b.ids == []
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 69. Чем Pydantic model отличается от dataclass?

**Уровень:** Middle

**Ответ:**
Pydantic (пайдэ́нтик — runtime validation/serialization library) валидирует и преобразует входные данные, строит JSON Schema и удобен на API boundaries. Dataclass в первую очередь генерирует boilerplate и не валидирует внешний payload автоматически.

## 70. Code review: какие скрытые дефекты вы бы искали в реализации темы «Pydantic model отличается от dataclass»?

**Уровень:** Middle

**Ответ:**
Избыточная coercion может скрыть плохие данные; в критичных полях используют strict types/config. Не следует смешивать persistence ORM model и API schema без причины. Разделяйте static typing и runtime validation: mypy/pyright не защищают JSON на сетевой границе, а validation не доказывает корректность внутренней логики.

## 71. Как вы реализуете и будете наблюдать тему «Pydantic model отличается от dataclass» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
FastAPI request/response и tool arguments удобно моделировать Pydantic, а internal execution records — dataclass/TypedDict. На границе model/tool/API используйте строгую validation schema, а внутри domain layer не тащите provider-specific DTO.

## 72. Какой главный trade-off у темы «iterable отличается от iterator» и когда вы выберете альтернативный подход?

**Уровень:** Middle

**Ответ:**
Iterator экономит память и поддерживает streaming, но требует осторожного lifecycle и обработки ошибок в середине потока. Lazy pipeline снижает peak memory, но усложняет lifecycle, error handling и повторный проход по данным.

## 73. Как применить тему «iterable отличается от iterator» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
Для больших LLM event streams используйте async iterator вместо накопления всех chunks в list. Полезно для token/document streams и больших tool results, если cancellation корректно закрывает network/file resources.

```python
class Count:
    def __init__(self,n:int): self.n=n; self.i=0
    def __iter__(self): return self
    def __next__(self):
        if self.i >= self.n: raise StopIteration
        self.i += 1; return self.i
assert list(Count(3)) == [1,2,3]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 74. Как работает `yield` и чем generator отличается от обычной функции?

**Уровень:** Middle

**Ответ:**
Функция с `yield` при вызове возвращает generator, а тело начинает выполняться при iteration. `yield` приостанавливает frame и сохраняет local state. Это позволяет lazy processing с O(1) дополнительной памятью на элемент.

## 75. Представьте production-инцидент вокруг темы «работает yield и чем generator отличается от обычной функции». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Side effects происходят не при создании generator, а при consumption; если никто не итерирует, работа не выполнится. Ошибки тоже возникают позже. Ищите утечки ресурсов при раннем выходе, повторное потребление одноразового iterator и накопление данных, которое уничтожает преимущество lazy processing.

## 76. Спроектируйте практическое применение темы «работает yield и чем generator отличается от обычной функции» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Document ingestion pipeline может лениво читать/парсить chunks и передавать дальше без загрузки всего corpus в RAM. Полезно для token/document streams и больших tool results, если cancellation корректно закрывает network/file resources.

```python
def chunks(xs, size):
    for i in range(0, len(xs), size):
        yield xs[i:i+size]
assert list(chunks([1,2,3,4,5],2)) == [[1,2],[3,4],[5]]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 77. Как написать собственный context manager и зачем он нужен?

**Уровень:** Middle

**Ответ:**
Context manager (ко́нтекст-менеджер — протокол enter/exit) гарантирует setup/cleanup даже при exception. Реализуют `__enter__/__exit__` либо `contextlib.contextmanager`; async ресурсы — `__aenter__/__aexit__`.

```python
from contextlib import contextmanager

@contextmanager
def managed_flag(state: dict):
    state["open"] = True
    try:
        yield state
    finally:
        state["open"] = False

s = {}
with managed_flag(s):
    assert s["open"]
assert not s["open"]
```

Код является минимальным рабочим примером; production-версия дополнительно учитывает logging, timeouts, validation и tests.

## 78. Code review: какие скрытые дефекты вы бы искали в реализации темы «написать собственный context manager и зачем он нужен»?

**Уровень:** Middle

**Ответ:**
Если cleanup спрятан после `yield` без `finally`, exception может оставить ресурс. Возвращать True из `__exit__` случайно подавляет исключение. Ищите утечки ресурсов при раннем выходе, повторное потребление одноразового iterator и накопление данных, которое уничтожает преимущество lazy processing.

## 79. Как вы реализуете и будете наблюдать тему «написать собственный context manager и зачем он нужен» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
DB transaction, trace span и temporary file — хорошие context managers; LLM HTTP client pool — lifespan resource. Полезно для token/document streams и больших tool results, если cancellation корректно закрывает network/file resources.

## 80. Чем async generator полезен для streaming API?

**Уровень:** Middle

**Ответ:**
Async generator сочетает `async def` и `yield`: может await I/O между выдачей элементов и поддерживает backpressure со стороны consumer. Он естественно моделирует SSE/token stream.

## 81. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «async generator полезен для streaming API»?

**Уровень:** Middle

**Ответ:**
Нужно корректно реагировать на cancellation/disconnect и закрывать upstream connection в `finally`, иначе появятся утечки sockets/tasks. Ищите утечки ресурсов при раннем выходе, повторное потребление одноразового iterator и накопление данных, которое уничтожает преимущество lazy processing.

## 82. Какие production controls добавите вокруг темы «async generator полезен для streaming API» в автономном AI-agent сервисе?

**Уровень:** Middle

**Ответ:**
LLM provider stream удобно адаптировать в async generator, нормализующий provider events в собственный typed event protocol. Полезно для token/document streams и больших tool results, если cancellation корректно закрывает network/file resources.

```python
import asyncio
async def stream():
    for x in range(3):
        await asyncio.sleep(0)
        yield x
async def collect():
    return [x async for x in stream()]
assert asyncio.run(collect()) == [0,1,2]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 83. Как правильно строить exception hierarchy в backend-сервисе?

**Уровень:** Middle

**Ответ:**
Разделяйте domain errors, integration errors и programmer bugs. Domain exception должен выражать бизнес-смысл, а boundary layer переводит его в HTTP/status или queue outcome. Не используйте один `AppError` для всего.

## 84. Production debugging: какие failure modes характерны для темы «правильно строить exception hierarchy в backend-сервисе» и как их локализовать?

**Уровень:** Middle

**Ответ:**
Ловить `Exception` слишком высоко и продолжать работу опасно: можно скрыть corruption. Другой антипаттерн — пробрасывать raw SDK/database exceptions прямо в API. Проверяйте swallowed exceptions, потерю causal chain, retry по permanent error, logging secrets и config drift между environments.

## 85. Как применить тему «правильно строить exception hierarchy в backend-сервисе» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
Для AI backend отдельно полезны `ProviderRateLimit`, `ProviderTimeout`, `InvalidModelOutput`, `PolicyDenied` и `ToolExecutionError`. Ошибки provider/tool нужно нормализовать в retryable/permanent/policy категории и сохранять request IDs без утечки prompt secrets.

```python
class DomainError(Exception): pass
class NotAllowed(DomainError): pass
def action(ok:bool):
    if not ok: raise NotAllowed("denied")
    return "done"
try:
    action(False)
except NotAllowed as e:
    assert str(e) == "denied"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 86. Когда использовать `raise`, `raise e` и `raise ... from ...`?

**Уровень:** Middle

**Ответ:**
`raise` внутри except сохраняет исходный traceback; `raise e` меняет точку traceback; `raise NewError(...) from e` явно строит exception chaining. На boundary обычно полезно оборачивать низкоуровневую ошибку в доменную с `from`.

## 87. Представьте production-инцидент вокруг темы «использовать raise, raise e и raise ... from ...». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Потеря original cause делает production debugging почти невозможным. Но возвращать stack trace клиенту тоже нельзя. Проверяйте swallowed exceptions, потерю causal chain, retry по permanent error, logging secrets и config drift между environments.

## 88. Спроектируйте практическое применение темы «использовать raise, raise e и raise ... from ...» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
SDK timeout можно завернуть в `ModelUnavailable` с cause для tracing, а клиенту вернуть безопасный 503/error code. Ошибки provider/tool нужно нормализовать в retryable/permanent/policy категории и сохранять request IDs без утечки prompt secrets.

```python
class ProviderError(Exception): pass
class ServiceUnavailable(Exception): pass
try:
    raise ProviderError("timeout")
except ProviderError as e:
    try:
        raise ServiceUnavailable("model unavailable") from e
    except ServiceUnavailable as wrapped:
        assert isinstance(wrapped.__cause__, ProviderError)
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 89. Как организовать structured logging в Python backend?

**Уровень:** Middle

**Ответ:**
Structured logging (стра́кчерд логгинг — события как поля, а не свободный текст) хранит event name, request/trace ID, component, latency, error code и safe metadata. JSON удобен для aggregation и поиска.

## 90. Code review: какие скрытые дефекты вы бы искали в реализации темы «организовать structured logging в Python backend»?

**Уровень:** Middle

**Ответ:**
f-string с full request/model output может утечь PII/secrets и создаёт несогласованные поля. High-cardinality payload не должен становиться metric labels. Проверяйте swallowed exceptions, потерю causal chain, retry по permanent error, logging secrets и config drift между environments.

## 91. Как вы реализуете и будете наблюдать тему «организовать structured logging в Python backend» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Логируйте model/provider, prompt version, tool name и token counts, но content — только по redaction policy. Ошибки provider/tool нужно нормализовать в retryable/permanent/policy категории и сохранять request IDs без утечки prompt secrets.

```python
import logging, json
class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({"event":record.getMessage(),"level":record.levelname})
r=logging.LogRecord("svc",logging.INFO,"",0,"started",(),None)
assert '"event": "started"' in JsonFormatter().format(r)
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 92. Как управлять конфигурацией dev/qa/prod без hardcode?

**Уровень:** Middle

**Ответ:**
Используйте typed settings layer: environment variables/secret manager → validation → immutable config object. Конфигурация отделена от кода, а startup должен fail fast при отсутствующих обязательных значениях.

## 93. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «управлять конфигурацией dev/qa/prod без hardcode»?

**Уровень:** Middle

**Ответ:**
Опасно silently подставлять dev default в production или читать env по всему коду. Secrets нельзя коммитить в `.env` репозитория. Проверяйте swallowed exceptions, потерю causal chain, retry по permanent error, logging secrets и config drift между environments.

## 94. Какие production controls добавите вокруг темы «управлять конфигурацией dev/qa/prod без hardcode» в автономном AI-agent сервисе?

**Уровень:** Middle

**Ответ:**
Model endpoints, timeouts, feature flags и budgets валидируются при lifespan startup; API keys приходят из secret store. Ошибки provider/tool нужно нормализовать в retryable/permanent/policy категории и сохранять request IDs без утечки prompt secrets.

## 95. Какой главный trade-off у темы «asyncio ускоряет I/O-bound workload, но не CPU-bound Python code» и когда вы выберете альтернативный подход?

**Уровень:** Middle

**Ответ:**
Async снижает число threads и хорошо масштабирует I/O, но требует async-compatible libraries. CPU work выносят в process/interpreter pool или отдельный service. Async даёт высокий I/O concurrency при малом числе threads, но требует async-compatible drivers и дисциплины cancellation.

## 96. Как применить тему «asyncio ускоряет I/O-bound workload, но не CPU-bound Python code» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
LLM API, DB и Redis calls — async candidates; локальный OCR/CPU reranker — отдельный executor/service. Для LLM/provider/DB/tool I/O ограничивайте fan-out semaphore-ами и измеряйте queueing, а CPU work выносите из event loop.

```python
import asyncio
async def io_task(x:int)->int:
    await asyncio.sleep(0.01)
    return x
async def main():
    return await asyncio.gather(*(io_task(i) for i in range(3)))
assert asyncio.run(main()) == [0,1,2]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 97. Что такое coroutine, Task и Future в asyncio?

**Уровень:** Middle

**Ответ:**
Coroutine — объект async computation; Task планирует coroutine на event loop и хранит её состояние/result; Future — низкоуровневый awaitable-плейсхолдер результата, часто создаваемый library/loop. Application code чаще создаёт Task, а не Future.

## 98. Представьте production-инцидент вокруг темы «coroutine, Task и Future в asyncio». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Создать coroutine и забыть await — работа не выполнится и появится warning. Fire-and-forget Task без strong reference/lifecycle легко потерять или оставить после shutdown. Первым делом ищите blocking code в event loop, unbounded task creation, потерянные exceptions и отсутствие concurrency limits.

## 99. Спроектируйте практическое применение темы «coroutine, Task и Future в asyncio» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Для параллельных provider/tool calls используйте TaskGroup; вручную Future обычно не нужен. Для LLM/provider/DB/tool I/O ограничивайте fan-out semaphore-ами и измеряйте queueing, а CPU work выносите из event loop.

```python
import asyncio
async def work(): return 42
async def main():
    task=asyncio.create_task(work())
    return await task
assert asyncio.run(main()) == 42
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 100. Чем `asyncio.gather()` отличается от `asyncio.as_completed()`?

**Уровень:** Middle

**Ответ:**
`gather` возвращает результаты в порядке inputs и удобно, когда нужно дождаться набора целиком. `as_completed` позволяет обрабатывать tasks по мере завершения, снижая perceived latency и memory pressure для heterogeneous durations.

## 101. Какая типичная ошибка возникает при работе с темой «asyncio.gather() отличается от asyncio.as_completed()» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
`gather(return_exceptions=True)` превращает failures в values и их легко забыть проверить. `as_completed` усложняет связь результата с исходным request, если не хранить metadata. Первым делом ищите blocking code в event loop, unbounded task creation, потерянные exceptions и отсутствие concurrency limits.

## 102. Как встроить решение по теме «asyncio.gather() отличается от asyncio.as_completed()» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Поиск по нескольким data sources можно стримить по мере готовности, а независимые обязательные tool calls — собрать `gather`/TaskGroup. Для LLM/provider/DB/tool I/O ограничивайте fan-out semaphore-ами и измеряйте queueing, а CPU work выносите из event loop.

```python
import asyncio
async def work(x,delay):
    await asyncio.sleep(delay); return x
async def main():
    tasks=[asyncio.create_task(work(1,.01)),asyncio.create_task(work(2,0))]
    out=[]
    for fut in asyncio.as_completed(tasks): out.append(await fut)
    return out
assert asyncio.run(main()) == [2,1]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 103. Зачем `asyncio.Semaphore` в высококонкурентном сервисе?

**Уровень:** Middle

**Ответ:**
Semaphore ограничивает число одновременно выполняемых секций и создаёт backpressure к downstream. Он защищает connection pool, provider quota и memory от unbounded fan-out.

```python
import asyncio

async def bounded_map(values: list[int], limit: int) -> list[int]:
    sem = asyncio.Semaphore(limit)
    async def one(x: int) -> int:
        async with sem:
            await asyncio.sleep(0)
            return x * 2
    return await asyncio.gather(*(one(x) for x in values))

assert asyncio.run(bounded_map([1,2,3], 2)) == [2,4,6]
```

Код является минимальным рабочим примером; production-версия дополнительно учитывает logging, timeouts, validation и tests.

## 104. Code review: какие скрытые дефекты вы бы искали в реализации темы «asyncio.Semaphore в высококонкурентном сервисе»?

**Уровень:** Middle

**Ответ:**
Semaphore внутри каждого worker не даёт глобальный cluster-wide rate limit. Слишком маленький limit искусственно режет throughput; слишком большой переносит overload вниз. Первым делом ищите blocking code в event loop, unbounded task creation, потерянные exceptions и отсутствие concurrency limits.

## 105. Как вы реализуете и будете наблюдать тему «asyncio.Semaphore в высококонкурентном сервисе» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Ограничивайте параллельные LLM calls per process и отдельно применяйте provider/global quota policy. Для LLM/provider/DB/tool I/O ограничивайте fan-out semaphore-ами и измеряйте queueing, а CPU work выносите из event loop.

## 106. Чем `asyncio.timeout()` отличается от timeout внутри HTTP client?

**Уровень:** Middle

**Ответ:**
Application timeout ограничивает весь logical scope; client timeout может отдельно ограничивать connect/read/write/pool phases. End-to-end deadline должен быть не меньше суммы/политики downstream budgets и передаваться по цепочке.

## 107. Какая типичная ошибка возникает при работе с темой «asyncio.timeout() отличается от timeout внутри HTTP client» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Если каждый downstream имеет 30s timeout, последовательная цепочка из четырёх calls может занять 120s при API SLO 20s. Ищите orphan tasks, swallowed CancelledError, timeout только на нижнем call без общего deadline и side effects после cancellation.

## 108. Как встроить решение по теме «asyncio.timeout() отличается от timeout внутри HTTP client» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Agent run имеет общий 30s budget, а model/tool calls получают remaining deadline и меньшие connect/read limits. Agent run должен иметь общий deadline/budget, который передаётся model, retrieval и tool calls, а не независимые бесконечные timeouts.

```python
import asyncio
async def main():
    try:
        async with asyncio.timeout(0.001):
            await asyncio.sleep(1)
    except TimeoutError:
        return "timeout"
assert asyncio.run(main()) == "timeout"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 109. Какой главный trade-off у темы «GIL в CPython и на какие workloads он влияет» и когда вы выберете альтернативный подход?

**Уровень:** Middle

**Ответ:**
Threads дешевле processes и разделяют память; processes дают CPU parallelism ценой IPC/memory. Threads дешевле и разделяют память, processes/interpreters дают CPU parallelism ценой IPC, startup и memory overhead.

## 110. Как применить тему «GIL в CPython и на какие workloads он влияет» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
В AI backend network SDK можно вызывать threadpool, если он sync; CPU-heavy tokenization/OCR лучше process/interpreter service после profiling. Выбор executor для OCR, parsing, local inference или sync SDK должен делаться по измеренному workload, а не по правилу «async всегда лучше».

## 111. Когда выбрать ThreadPoolExecutor, ProcessPoolExecutor или asyncio?

**Уровень:** Middle

**Ответ:**
Asyncio — много cooperative async I/O; ThreadPool — blocking I/O/legacy sync API; ProcessPool — CPU-bound pure Python и isolation. Выбор определяется waiting vs compute, serialization cost и library thread-safety.

## 112. Представьте production-инцидент вокруг темы «выбрать ThreadPoolExecutor, ProcessPoolExecutor или asyncio». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Отправлять каждый маленький CPU task в process pool может быть медленнее из-за pickle/IPC. Threadpool overload способен исчерпать threads и connections. Профилируйте CPU vs I/O, saturation executor, serialization/IPC и race conditions; наличие или отсутствие GIL не отменяет synchronization shared state.

## 113. Спроектируйте практическое применение темы «выбрать ThreadPoolExecutor, ProcessPoolExecutor или asyncio» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
FastAPI sync DB legacy call — threadpool; batch OCR — process workers; LLM HTTP — native async client. Выбор executor для OCR, parsing, local inference или sync SDK должен делаться по измеренному workload, а не по правилу «async всегда лучше».

```python
from concurrent.futures import ThreadPoolExecutor
def blocking(x): return x*x
with ThreadPoolExecutor(max_workers=2) as ex:
    assert list(ex.map(blocking,[2,3])) == [4,9]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 114. Почему вы выбрали FastAPI вместо Flask или Django?

**Уровень:** Middle

**Ответ:**
FastAPI строится на ASGI/Starlette и Pydantic, даёт async request handling, type-driven validation и OpenAPI. Flask проще/minimal, Django включает ORM/admin/batteries. Выбор зависит от продукта, команды и ecosystem, а не benchmark headline.

## 115. Production debugging: какие failure modes характерны для темы «вы выбрали FastAPI вместо Flask или Django» и как их локализовать?

**Уровень:** Middle

**Ответ:**
Антипаттерн — выбрать FastAPI только «потому что быстрее», а затем использовать blocking SDK в async endpoints. Framework не исправляет architecture. Проверяйте blocking dependencies, неверный lifespan ресурсов, connection-pool exhaustion, middleware ordering и работу cancellation при disconnect.

## 116. Как применить тему «вы выбрали FastAPI вместо Flask или Django» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
Для LLM gateway с streaming и множеством I/O FastAPI естественен; для backoffice CRUD с admin Django может быть дешевле. LLM gateway обычно держит shared HTTP/DB clients в lifespan и разделяет request path, streaming и durable execution.

## 117. Сравните основной подход в теме «ASGI и чем он отличается от WSGI» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Middle

**Ответ:**
WSGI проще и зрел для sync workloads; ASGI гибче для streaming/concurrency, но требует async discipline. FastAPI удобен для typed async API, но framework не заменяет отдельный durable worker и не делает blocking SDK асинхронным.

## 118. Спроектируйте практическое применение темы «ASGI и чем он отличается от WSGI» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
LLM token streaming/WebSocket почти всегда удобнее через ASGI stack. LLM gateway обычно держит shared HTTP/DB clients в lifespan и разделяет request path, streaming и durable execution.

## 119. Что происходит с `def` endpoint в FastAPI по сравнению с `async def`?

**Уровень:** Middle

**Ответ:**
Обычная `def` path operation, вызываемая FastAPI, выполняется во внешнем threadpool и await-ится; `async def` работает в event loop. Если библиотека предоставляет awaitable API, endpoint обычно async; blocking I/O можно оставить sync/explicit executor.

## 120. Какая типичная ошибка возникает при работе с темой «Что происходит с def endpoint в FastAPI по сравнению с async def» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Спрятанный blocking вызов внутри `async def` блокирует event loop. Обратная ошибка — тысячи CPU-heavy sync endpoints перегружают threadpool. Проверяйте blocking dependencies, неверный lifespan ресурсов, connection-pool exhaustion, middleware ordering и работу cancellation при disconnect.

## 121. Как встроить решение по теме «Что происходит с def endpoint в FastAPI по сравнению с async def» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Если LLM SDK async — await его; если старый PDF parser CPU/sync — worker/process pool, а не прямой вызов в async route. LLM gateway обычно держит shared HTTP/DB clients в lifespan и разделяет request path, streaming и durable execution.

## 122. Как FastAPI dependency injection помогает production-коду?

**Уровень:** Middle

**Ответ:**
Dependency Injection, DI (ди-ай — передача зависимостей извне), позволяет декларативно получать auth context, DB session, settings и services, переиспользовать sub-dependencies и подменять их в tests. Это уменьшает глобальное состояние.

## 123. Code review: какие скрытые дефекты вы бы искали в реализации темы «FastAPI dependency injection помогает production-коду»?

**Уровень:** Middle

**Ответ:**
Слишком тяжёлая dependency на каждый request может создавать новый HTTP client/DB engine. Lifecycle shared resources должен быть отделён от per-request session/context. Проверяйте blocking dependencies, неверный lifespan ресурсов, connection-pool exhaustion, middleware ordering и работу cancellation при disconnect.

## 124. Как вы реализуете и будете наблюдать тему «FastAPI dependency injection помогает production-коду» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Provider client pool создаётся в lifespan, dependency выдаёт typed facade/request context; DB session — per-request. LLM gateway обычно держит shared HTTP/DB clients в lifespan и разделяет request path, streaming и durable execution.

## 125. Как обрабатывать PATCH для частичного обновления ресурса?

**Уровень:** Middle

**Ответ:**
PATCH должен различать «поле не передано» и «поле передано как null». В Pydantic v2 обычно используют `model_fields_set`/`model_dump(exclude_unset=True)` и whitelist mutable fields. Update выполняют атомарно с authorization/version check.

## 126. Представьте production-инцидент вокруг темы «обрабатывать PATCH для частичного обновления ресурса». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Слепой `model_dump()` может затереть отсутствующие поля defaults/null. Mass assignment позволяет изменить роль/owner, если модель слишком широкая. Проверяйте lifetime clients/pools, schema drift, expensive validation, background work после response и корректный shutdown.

## 127. Спроектируйте практическое применение темы «обрабатывать PATCH для частичного обновления ресурса» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Для agent configuration PATCH нельзя позволять менять system policy/tenant_id обычному пользователю; API schema отделяют от DB model. Для tool schemas и structured LLM outputs extra fields и invalid enum лучше отклонять на boundary до исполнения side effect.

```python
from pydantic import BaseModel
class PatchUser(BaseModel):
    name: str | None = None
    title: str | None = None

def changed(patch: PatchUser) -> dict:
    return patch.model_dump(exclude_unset=True)
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 128. Как Pydantic validators использовать без переноса бизнес-логики в schema layer?

**Уровень:** Middle

**Ответ:**
Field/model validators проверяют форму и локальные invariants входа: диапазон, совместимость полей, нормализацию. Проверка «имеет ли user право вызвать tool» зависит от внешнего state и должна жить в application/policy layer.

## 129. Какая типичная ошибка возникает при работе с темой «Pydantic validators использовать без переноса бизнес-логики в schema layer» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Validator, который ходит в DB/HTTP, делает validation медленной, скрытой и трудно тестируемой. Также side effects могут выполниться несколько раз при повторной валидации. Проверяйте lifetime clients/pools, schema drift, expensive validation, background work после response и корректный shutdown.

## 130. Как встроить решение по теме «Pydantic validators использовать без переноса бизнес-логики в schema layer» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Pydantic проверяет JSON tool arguments, затем ToolPolicy проверяет tenant/user/resource permissions. Для tool schemas и structured LLM outputs extra fields и invalid enum лучше отклонять на boundary до исполнения side effect.

```python
from pydantic import BaseModel, field_validator
class ToolArgs(BaseModel):
    count: int
    @field_validator("count")
    @classmethod
    def positive(cls, v:int)->int:
        if v <= 0: raise ValueError("must be positive")
        return v
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 131. Как проектировать response models и почему не стоит возвращать ORM object напрямую?

**Уровень:** Middle

**Ответ:**
Response model задаёт публичный контракт, фильтрует поля и стабилизирует API независимо от persistence model. ORM entity может содержать internal IDs, secrets, lazy relationships и поля, которые нельзя экспонировать.

## 132. Code review: какие скрытые дефекты вы бы искали в реализации темы «проектировать response models и почему не стоит возвращать ORM object напрямую»?

**Уровень:** Middle

**Ответ:**
Прямой serializer ORM способен случайно вызвать lazy-load после закрытия session или утечь sensitive column. Проверяйте lifetime clients/pools, schema drift, expensive validation, background work после response и корректный shutdown.

## 133. Как вы реализуете и будете наблюдать тему «проектировать response models и почему не стоит возвращать ORM object напрямую» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Для AI runs наружу отдавайте run_id/status/cost summary, а internal provider request IDs и raw prompts держите отдельно. Для tool schemas и structured LLM outputs extra fields и invalid enum лучше отклонять на boundary до исполнения side effect.

## 134. Спроектируйте API для обновления данных сотрудника. Какие method, URL, status codes и concurrency semantics выберете?

**Уровень:** Middle

**Ответ:**
Например `PATCH /employees/{id}` с typed partial body, 200/204 при успехе, 404 если ресурс скрыто/не найден, 409/412 при version conflict. Authorization проверяется до mutation; optimistic version/ETag защищает lost update.

## 135. Production debugging: какие failure modes характерны для темы «API для обновления данных сотрудника. Какие method, URL, status codes и concurrency semantics выберете» и как их локализовать?

**Уровень:** Middle

**Ответ:**
Без concurrency control два клиента могут затереть изменения. Возвращать 200 даже при rejected fields создаёт ложный success. Проверяйте semantics status codes, validation, idempotency, pagination boundaries, retries и backward compatibility.

## 136. Как применить тему «API для обновления данных сотрудника. Какие method, URL, status codes и concurrency semantics выберете» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
Тот же паттерн подходит для agent config/tool policy, где lost update особенно опасен. Agent-facing API должен явно моделировать run/task IDs, cancellation, streaming и повтор запросов, а не прятать всё в одном POST.

## 137. Сравните основной подход в теме «PUT отличается от PATCH и почему это важно для idempotency» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Middle

**Ответ:**
PUT проще retry, но требует полной representation; PATCH экономит payload и уменьшает конфликт поверхностей, но сложнее semantics. Удобство API нужно балансировать с стабильным contract: слишком общий endpoint быстро превращается в невалидируемый RPC.

## 138. Спроектируйте практическое применение темы «PUT отличается от PATCH и почему это важно для idempotency» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Для tool configuration используйте replace-by-version или idempotency key для non-idempotent operations. Agent-facing API должен явно моделировать run/task IDs, cancellation, streaming и повтор запросов, а не прятать всё в одном POST.

## 139. Как проектировать pagination: offset/limit или cursor?

**Уровень:** Middle

**Ответ:**
Offset pagination проста и позволяет прыгать по страницам, но на больших offset дорогая и нестабильна при inserts/deletes. Cursor/keyset pagination использует stable ordered key и лучше масштабируется, но сложнее для arbitrary navigation.

## 140. Какая типичная ошибка возникает при работе с темой «проектировать pagination: offset/limit или cursor» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Cursor без уникального tie-breaker даёт duplicates/skips. Нельзя кодировать чувствительный state в unsigned прозрачный cursor. Проверяйте semantics status codes, validation, idempotency, pagination boundaries, retries и backward compatibility.

## 141. Как встроить решение по теме «проектировать pagination: offset/limit или cursor» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Историю agent runs лучше отдавать cursor по `(created_at,id)`, а не OFFSET 100000. Agent-facing API должен явно моделировать run/task IDs, cancellation, streaming и повтор запросов, а не прятать всё в одном POST.

```python
import base64, json
def encode_cursor(created_at:str, ident:int)->str:
    raw=json.dumps([created_at,ident],separators=(",",":")).encode()
    return base64.urlsafe_b64encode(raw).decode()
def decode_cursor(token:str):
    return json.loads(base64.urlsafe_b64decode(token.encode()))
t=encode_cursor("2026-08-09T00:00:00Z",7)
assert decode_cursor(t)[1] == 7
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 142. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «HTTP status codes важны для backend API и где часто ошибаются»?

**Уровень:** Middle

**Ответ:**
Точные codes улучшают clients/retries/observability, но не стоит создавать уникальный code на каждую бизнес-деталь — body error code может быть стабильнее. Удобство API нужно балансировать с стабильным contract: слишком общий endpoint быстро превращается в невалидируемый RPC.

## 143. Как вы реализуете и будете наблюдать тему «HTTP status codes важны для backend API и где часто ошибаются» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Provider 429 не всегда надо пробрасывать как 429 пользователю: gateway может retry/fallback и вернуть собственную rate policy. Agent-facing API должен явно моделировать run/task IDs, cancellation, streaming и повтор запросов, а не прятать всё в одном POST.

## 144. Как защитить REST API без server-side sessions?

**Уровень:** Middle

**Ответ:**
Обычно используют bearer access token/JWT или opaque token, проверяемый каждым request. Stateless означает, что application instance не хранит login session, но revocation/rate-limit/permissions могут использовать shared store.

## 145. Production debugging: какие failure modes характерны для темы «защитить REST API без server-side sessions» и как их локализовать?

**Уровень:** Middle

**Ответ:**
JWT не шифрует payload и не должен содержать secrets. Длинный expiry без revocation увеличивает blast radius; signature validation без issuer/audience — слабая проверка. Проверяйте token validation, issuer/audience, privilege checks на каждом resource, secret leakage, SSRF и обход rate limits.

## 146. Как применить тему «защитить REST API без server-side sessions» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
AI API часто использует short-lived OAuth access token, а provider keys остаются только server-side. Для AI tools authorization должен применяться после выбора tool и до side effect; решение LLM не является security boundary.

## 147. Сравните основной подход в теме «Authentication и authorization — в чём разница» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Middle

**Ответ:**
RBAC проще управлять, ABAC точнее учитывает tenant/resource/context. Часто используют комбинацию. Stateless JWT масштабируется проще, но revocation и fine-grained policy сложнее; server-side/session state даёт больший контроль ценой stateful infrastructure.

## 148. Спроектируйте практическое применение темы «Authentication и authorization — в чём разница» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Перед tool call policy проверяет user, tenant, tool risk и конкретный resource; LLM не принимает решение о permission самостоятельно. Для AI tools authorization должен применяться после выбора tool и до side effect; решение LLM не является security boundary.

## 149. Когда решение из темы «хранить пароли и API secrets» перестаёт быть хорошим и почему?

**Уровень:** Middle

**Ответ:**
Secret manager добавляет latency/dependency, но даёт audit/rotation. Часто секрет получают на startup/short cache с rotation strategy. Stateless JWT масштабируется проще, но revocation и fine-grained policy сложнее; server-side/session state даёт больший контроль ценой stateful infrastructure.

## 150. Как встроить решение по теме «хранить пароли и API secrets» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Provider API key inject-ится в HTTP client из secret store и никогда не передаётся модели как часть context. Для AI tools authorization должен применяться после выбора tool и до side effect; решение LLM не является security boundary.

## 151. Какой главный trade-off у темы «INNER JOIN отличается от LEFT JOIN и где типичная ошибка с фильтром» и когда вы выберете альтернативный подход?

**Уровень:** Middle

**Ответ:**
JOIN в SQL обычно эффективнее N+1 сетевых запросов, но слишком широкие joins могут размножать строки. SQL pushdown уменьшает сетевые round trips, но сложный запрос может стать трудно поддерживаемым; иногда materialization или precomputation дешевле.

## 152. Как применить тему «INNER JOIN отличается от LEFT JOIN и где типичная ошибка с фильтром» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
При выборке agent + optional last_run фильтр статуса последнего запуска должен не исключить agents без runs. История runs, tool calls и usage обычно требует явных indexes по tenant/run/time и pagination без дорогостоящего OFFSET на больших таблицах.

## 153. Что такое normalization и когда denormalization оправдана?

**Уровень:** Middle

**Ответ:**
Normalization уменьшает дублирование и update anomalies через разделение сущностей/отношений. Denormalization намеренно дублирует/предвычисляет данные для read performance или аналитики и требует стратегии consistency.

## 154. Представьте production-инцидент вокруг темы «normalization и когда denormalization оправдана». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Преждевременная denormalization создаёт несколько источников истины. С другой стороны, гигантский join на hot read path может стать bottleneck. Смотрите execution plan, row cardinality, missing/unused indexes, N+1, lock waits и semantic ошибки JOIN/NULL, а не только время одного query.

## 155. Спроектируйте практическое применение темы «normalization и когда denormalization оправдана» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Metadata документов храните нормализованно, а агрегированные usage/cost dashboards — в read model. История runs, tool calls и usage обычно требует явных indexes по tenant/run/time и pagination без дорогостоящего OFFSET на больших таблицах.

## 156. Когда решение из темы «избежать SQL injection» перестаёт быть хорошим и почему?

**Уровень:** Middle

**Ответ:**
Parameterized query почти всегда достаточно для values; dynamic query composition требует ограниченного DSL/allowlist. SQL pushdown уменьшает сетевые round trips, но сложный запрос может стать трудно поддерживаемым; иногда materialization или precomputation дешевле.

## 157. Как встроить решение по теме «избежать SQL injection» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
NLP-to-SQL нельзя исполнять напрямую: read-only role, parser/policy, allowlist schemas, row limits и timeout. История runs, tool calls и usage обычно требует явных indexes по tenant/run/time и pagination без дорогостоящего OFFSET на больших таблицах.

```python
import sqlite3
con=sqlite3.connect(":memory:"); con.execute("create table users(id int, name text)"); con.execute("insert into users values (?,?)",(1,"Ann"))
name=con.execute("select name from users where id=?",(1,)).fetchone()[0]
assert name == "Ann"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 158. Что такое N+1 query problem?

**Уровень:** Middle

**Ответ:**
N+1 — один query загружает N parent rows, затем ORM лениво выполняет отдельный query для каждого child. Latency и DB load растут O(N) round trips. Решают eager/select-in loading, join или batching.

## 159. Code review: какие скрытые дефекты вы бы искали в реализации темы «N+1 query problem»?

**Уровень:** Middle

**Ответ:**
Локально с 5 строками проблема незаметна, production list endpoint с 1000 rows становится медленным. SQL tracing/query count tests помогают. Смотрите execution plan, row cardinality, missing/unused indexes, N+1, lock waits и semantic ошибки JOIN/NULL, а не только время одного query.

## 160. Как вы реализуете и будете наблюдать тему «N+1 query problem» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
List agent runs с tool summaries лучше загрузить batch, а не делать query на каждый run. История runs, tool calls и usage обычно требует явных indexes по tenant/run/time и pagination без дорогостоящего OFFSET на больших таблицах.

## 161. Какой главный trade-off у темы «ACID на практическом backend-примере» и когда вы выберете альтернативный подход?

**Уровень:** Middle

**Ответ:**
Сильная транзакционность упрощает correctness, но distributed side effects уже требуют outbox/saga. Более сильная consistency упрощает invariants, но снижает concurrency; optimistic control хорош при редких конфликтах, pessimistic — при дорогих race.

## 162. Как применить тему «ACID на практическом backend-примере» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
Создание tool execution record и idempotency key делайте одной DB transaction; внешний provider call координируйте отдельно. State transitions и destructive tool operations должны иметь транзакционный invariant и idempotency, особенно при retries workers.

```python
import sqlite3
con=sqlite3.connect(":memory:"); con.execute("create table t(id int primary key, v int)")
with con:
    con.execute("insert into t values (?,?)",(1,10))
assert con.execute("select v from t").fetchone()[0] == 10
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 163. Что такое optimistic locking и как version column предотвращает lost update?

**Уровень:** Middle

**Ответ:**
Row хранит version. Update выполняется `WHERE id=? AND version=?` и одновременно увеличивает version; если affected rows=0, кто-то изменил объект и клиент получает conflict/retry. Это не держит lock во время user think time.

## 164. Production debugging: какие failure modes характерны для темы «optimistic locking и как version column предотвращает lost update» и как их локализовать?

**Уровень:** Middle

**Ответ:**
Если application игнорирует rowcount и считает update успешным, защита исчезает. Retry должен перечитать state и повторно проверить бизнес-решение. Диагностика включает lock graph, transaction age, deadlocks, isolation anomalies, version conflicts и index bloat/write amplification.

## 165. Как применить тему «optimistic locking и как version column предотвращает lost update» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
Редактирование agent policy/config через UI удобно защищать version/ETag, чтобы два администратора не затёрли изменения. State transitions и destructive tool operations должны иметь транзакционный invariant и idempotency, особенно при retries workers.

```python
def optimistic_update(row:dict, expected:int, value:str)->bool:
    if row["version"] != expected: return False
    row["value"] = value; row["version"] += 1; return True
r={"version":1,"value":"a"}
assert optimistic_update(r,1,"b")
assert not optimistic_update(r,1,"c")
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 166. Что такое SQLAlchemy Session и почему её не стоит делать глобальной?

**Уровень:** Middle

**Ответ:**
Session — unit of work и identity map, связанная с transaction lifecycle. Она хранит ORM state и не является глобальным connection. Обычно session создают на request/job и закрывают после commit/rollback.

## 167. Представьте production-инцидент вокруг темы «SQLAlchemy Session и почему её не стоит делать глобальной». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Глобальная session смешивает transactions разных requests, держит stale entities и может стать concurrency bug. Ищите shared Session/AsyncSession между concurrent tasks, implicit lazy I/O, pool exhaustion и transaction scope, растянутый на внешний API call.

## 168. Спроектируйте практическое применение темы «SQLAlchemy Session и почему её не стоит делать глобальной» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
FastAPI dependency создаёт AsyncSession на request; engine живёт в lifespan. Agent state persistence должна иметь короткие DB transactions; медленный LLM/tool call не следует держать внутри открытой транзакции.

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
engine = create_async_engine("sqlite+aiosqlite:///:memory:")
Session = async_sessionmaker(engine, expire_on_commit=False)
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 169. Какие cache patterns вы знаете: cache-aside, write-through, write-behind?

**Уровень:** Middle

**Ответ:**
Cache-aside: приложение читает cache, при miss — DB и заполняет; write-through пишет cache вместе с source; write-behind откладывает source write. Для большинства API cache-aside проще, но invalidation остаётся главной задачей.

## 170. Представьте production-инцидент вокруг темы «cache patterns вы знаете: cache-aside, write-through, write-behind». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Stale cache после update и cache stampede на массовом miss — типичные проблемы. Write-behind рискует потерять данные при crash. Проверяйте stale cache, stampede, hot keys, unbounded values, неверные TTL и assumption, что Redis — durable source of truth.

## 171. Спроектируйте практическое применение темы «cache patterns вы знаете: cache-aside, write-through, write-behind» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Кэшировать model metadata/prompt templates можно cache-aside; финансовый usage ledger нельзя делать source of truth в Redis. Prompt/model metadata и rate limits хорошо подходят Redis, а authoritative agent state/financial usage лучше хранить в durable DB.

```python
def cache_aside(cache:dict, key:str, loader):
    if key in cache: return cache[key]
    value=loader(); cache[key]=value; return value
c={}; calls={"n":0}
def load(): calls["n"]+=1; return 42
assert cache_aside(c,"x",load)==42 and cache_aside(c,"x",load)==42 and calls["n"]==1
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 172. Чем Redis pipeline отличается от transaction?

**Уровень:** Middle

**Ответ:**
Pipeline batching уменьшает network round trips; transaction MULTI/EXEC гарантирует непрерывное выполнение queued commands относительно других clients. В redis-py pipeline по умолчанию может быть transactional, но концепции различны.

## 173. Code review: какие скрытые дефекты вы бы искали в реализации темы «Redis pipeline отличается от transaction»?

**Уровень:** Middle

**Ответ:**
Путать batching с atomicity опасно: pipeline(transaction=False) ускоряет команды, но не делает их единым invariant. Проверяйте stale cache, stampede, hot keys, unbounded values, неверные TTL и assumption, что Redis — durable source of truth.

## 174. Как вы реализуете и будете наблюдать тему «Redis pipeline отличается от transaction» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Batch read/write telemetry counters pipeline-ят; quota reservation с read-modify-write требует atomic command/Lua/WATCH. Prompt/model metadata и rate limits хорошо подходят Redis, а authoritative agent state/financial usage лучше хранить в durable DB.

## 175. Зачем выносить долгую задачу из HTTP request в очередь?

**Уровень:** Middle

**Ответ:**
Queue decouples request latency от долгой работы, даёт buffering/backpressure, retries и независимое масштабирование workers. API возвращает 202 + job_id, а клиент получает status/webhook/stream.

## 176. Представьте production-инцидент вокруг темы «выносить долгую задачу из HTTP request в очередь». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Queue не делает задачу автоматически exactly-once. Пользователь может отправить duplicate, broker может redeliver, worker crash — повторить execution. Ищите duplicate execution, poison messages, stuck retries, queue lag, visibility/ack semantics и задачи без idempotency.

## 177. Спроектируйте практическое применение темы «выносить долгую задачу из HTTP request в очередь» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Document ingestion, embeddings и long agent runs — durable jobs; короткий model call можно оставить request-response. Long-running agent jobs должны жить в durable worker plane с checkpoint, idempotency и DLQ/reconciliation, а не в create_task web-процесса.

```python
import asyncio
async def worker(q: asyncio.Queue):
    item=await q.get(); q.task_done(); return item
async def main():
    q=asyncio.Queue(); await q.put("job"); t=asyncio.create_task(worker(q)); await q.join(); return await t
assert asyncio.run(main()) == "job"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 178. Чем Kafka topic/partition/consumer group отличаются?

**Уровень:** Middle

**Ответ:**
Topic — логический stream; partition — ordered append log и единица parallelism; consumer group распределяет partitions между consumers так, что partition обрабатывает один member группы одновременно. Ordering гарантируется внутри partition.

## 179. Представьте production-инцидент вокруг темы «Kafka topic/partition/consumer group отличаются». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Ожидать global ordering across partitions — ошибка. Слишком мало partitions ограничит parallelism, слишком много увеличит overhead/rebalance. Проверяйте partition skew, rebalance, duplicate processing, consumer lag, schema incompatibility и неверные ожидания global ordering.

## 180. Спроектируйте практическое применение темы «Kafka topic/partition/consumer group отличаются» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Events одного agent run можно key-ить run_id, сохраняя порядок state transitions. Agent lifecycle events можно partition по run_id, а side effects всё равно требуют idempotent consumer и transactional boundary.

```python
def partition(key:str, partitions:int)->int:
    import hashlib
    h=int.from_bytes(hashlib.sha256(key.encode()).digest()[:8],"big")
    return h % partitions
assert 0 <= partition("run-1",8) < 8
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 181. Какие ошибки можно retry, а какие нельзя?

**Уровень:** Middle

**Ответ:**
Retry transient failures: timeout, connection reset, часть 5xx, 429 с policy. Validation/auth/most 4xx и deterministic business errors обычно permanent. Классификация зависит от operation semantics и provider contract.

## 182. Представьте production-инцидент вокруг темы «ошибки можно retry, а какие нельзя». Что вы проверите первым и почему?

**Уровень:** Middle

**Ответ:**
Blind retry усиливает outage и может повторить side effect. Retry POST без idempotency key опасен. Главные риски — retry storm, повтор non-idempotent side effect, вложенные retries и отсутствие общего deadline.

## 183. Спроектируйте практическое применение темы «ошибки можно retry, а какие нельзя» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
LLM 429 можно retry/fallback; invalid tool schema не retry, а исправить/вернуть model feedback. LLM/tool gateway должен иметь error taxonomy, exponential backoff с jitter, retry budget, idempotency keys и circuit breaking.

## 184. Почему exponential backoff нужен jitter?

**Уровень:** Middle

**Ответ:**
Без jitter клиенты после общего outage повторяют в одинаковые моменты и создают thundering herd. Jitter размазывает attempts во времени. Популярны full/equal/decorrelated jitter policies.

```python
import random

def full_jitter(base: float, attempt: int, cap: float) -> float:
    return random.uniform(0.0, min(cap, base * (2 ** attempt)))

for i in range(5):
    assert 0 <= full_jitter(0.1, i, 2.0) <= 2.0
```

Код является минимальным рабочим примером; production-версия дополнительно учитывает logging, timeouts, validation и tests.

## 185. Какая типичная ошибка возникает при работе с темой «exponential backoff нужен jitter» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Фиксированная задержка 1s для тысяч pods создаёт периодическую нагрузку. Слишком большой backoff нарушает user deadline. Главные риски — retry storm, повтор non-idempotent side effect, вложенные retries и отсутствие общего deadline.

## 186. Как встроить решение по теме «exponential backoff нужен jitter» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Provider outage: attempts ограничены общим request deadline, а shared circuit breaker предотвращает лавину retries. LLM/tool gateway должен иметь error taxonomy, exponential backoff с jitter, retry budget, idempotency keys и circuit breaking.

## 187. Когда выбрать SSE, WebSocket или обычный streaming HTTP?

**Уровень:** Middle

**Ответ:**
SSE, Server-Sent Events (эс-эс-и — односторонний server→client event stream поверх HTTP), удобен для token/status streams и reconnect; WebSocket — двунаправленный persistent channel; chunked/streaming HTTP подходит для простого ответа без event protocol.

## 188. Какая типичная ошибка возникает при работе с темой «выбрать SSE, WebSocket или обычный streaming HTTP» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
WebSocket часто выбирают «на всякий случай» и получают сложнее proxy/auth/reconnect. SSE не подходит, если клиент должен постоянно слать low-latency messages по тому же connection.

## 189. Как встроить решение по теме «выбрать SSE, WebSocket или обычный streaming HTTP» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
LLM token streaming обычно SSE/streaming HTTP; voice/realtime agent с двусторонними audio events — WebSocket. Streaming ответа не должен означать streaming side effects: tool actions и durable state фиксируются отдельно от transport connection.

```python
def sse(event:str, data:str, ident:int)->str:
    return f"id: {ident}\nevent: {event}\ndata: {data}\n\n"
assert sse("token","hi",1).endswith("\n\n")
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 190. Сравните основной подход в теме «unit, integration и end-to-end tests отличаются для backend» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Middle

**Ответ:**
Unit быстры, integration реалистичнее, E2E ближе к пользователю. Каждому риску нужен подходящий уровень. Unit tests дают быстрый feedback, integration ловят реальные contracts, E2E проверяют путь пользователя, но дороже и flaky.

## 191. Спроектируйте практическое применение темы «unit, integration и end-to-end tests отличаются для backend» в сервисе AI-агентов.

**Уровень:** Middle

**Ответ:**
Tool argument validator — unit; repository с PostgreSQL container — integration; agent request→tool→result — E2E. Для AI backend отдельно фиксируйте provider/tool fakes и contract tests, а quality evals не подменяйте обычными backend tests.

## 192. Как использовать pytest fixtures без скрытого shared state?

**Уровень:** Middle

**Ответ:**
Fixture задаёт setup/teardown и scope. Mutable resource должен иметь scope, соответствующий isolation: DB transaction per test, shared engine per session. Factory fixtures лучше одного глобального изменяемого объекта.

## 193. Какая типичная ошибка возникает при работе с темой «использовать pytest fixtures без скрытого shared state» и как она проявится под нагрузкой?

**Уровень:** Middle

**Ответ:**
Session-scoped mutable fake может сделать tests order-dependent. Autouse fixtures скрывают важные dependencies. Проверяйте, не замоканы ли именно те boundaries, где чаще всего ломается contract: SQL, HTTP, queue, serialization и timeouts.

## 194. Как встроить решение по теме «использовать pytest fixtures без скрытого shared state» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Middle

**Ответ:**
Поднимите DB once, но каждый test выполняйте в отдельной schema/transaction и очищайте Redis namespace. Для AI backend отдельно фиксируйте provider/tool fakes и contract tests, а quality evals не подменяйте обычными backend tests.

## 195. Что и как mock-ать в Python backend tests?

**Уровень:** Middle

**Ответ:**
Mock-айте external boundary или nondeterminism через interface, а не внутренние private methods. Patch нужно делать там, где name используется/imported, а не обязательно где определён. Проверяйте observable outcome, не количество внутренних calls без причины.

## 196. Code review: какие скрытые дефекты вы бы искали в реализации темы «Что и как mock-ать в Python backend tests»?

**Уровень:** Middle

**Ответ:**
Over-mocking привязывает test к реализации и пропускает contract drift SDK. MagicMock без spec принимает несуществующие методы. Проверяйте, не замоканы ли именно те boundaries, где чаще всего ломается contract: SQL, HTTP, queue, serialization и timeouts.

## 197. Как вы реализуете и будете наблюдать тему «Что и как mock-ать в Python backend tests» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
LLM client mock возвращает deterministic provider response, но serialization/auth/retry adapter дополнительно тестируется через fake HTTP server. Для AI backend отдельно фиксируйте provider/tool fakes и contract tests, а quality evals не подменяйте обычными backend tests.

```python
from unittest.mock import Mock
client=Mock(spec=["generate"]); client.generate.return_value="ok"
assert client.generate("hi") == "ok"
client.generate.assert_called_once_with("hi")
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 198. С чего начать оптимизацию медленного Python backend?

**Уровень:** Middle

**Ответ:**
Сначала измерить end-to-end и breakdown: DB, network, serialization, Python CPU, locks. Для CPU используйте profiler, для I/O tracing, для DB EXPLAIN. Оптимизируйте dominating bottleneck, а не синтаксис.

## 199. Production debugging: какие failure modes характерны для темы «С чего начать оптимизацию медленного Python backend» и как их локализовать?

**Уровень:** Middle

**Ответ:**
Micro-optimize list comprehension, когда 90% latency — LLM/SQL, бессмысленно. Benchmark без production-like input вводит в заблуждение. Сначала измеряйте CPU, allocation, blocking I/O, event-loop lag и external latency; оптимизация без профиля часто чинит не тот bottleneck.

## 200. Как применить тему «С чего начать оптимизацию медленного Python backend» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
У AI API чаще сначала уменьшайте лишние model/tool calls и context, затем CPU JSON/validation. В AI backend cost/latency часто доминируют model calls и context, поэтому Python micro-optimization имеет смысл только после end-to-end profiling.

```python
import cProfile, io, pstats
def work(): return sum(i*i for i in range(1000))
prof=cProfile.Profile(); prof.enable(); work(); prof.disable(); s=io.StringIO(); pstats.Stats(prof,stream=s).sort_stats("cumtime").print_stats(3)
assert "function calls" in s.getvalue()
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 201. Когда generator/streaming реально уменьшает memory footprint?

**Уровень:** Middle

**Ответ:**
Когда pipeline может обработать element/chunk и освободить его, не требуя всего dataset. Generator заменяет O(n) materialization на O(window/state), но downstream операция `list(...)`, sort или global aggregation снова материализует данные.

## 202. Code review: какие скрытые дефекты вы бы искали в реализации темы «generator/streaming реально уменьшает memory footprint»?

**Уровень:** Middle

**Ответ:**
«Используем generator» бесполезно, если потом собираем весь результат. Также lazy errors возникают позднее. Сначала измеряйте CPU, allocation, blocking I/O, event-loop lag и external latency; оптимизация без профиля часто чинит не тот bottleneck.

## 203. Как вы реализуете и будете наблюдать тему «generator/streaming реально уменьшает memory footprint» в multi-tenant AI backend?

**Уровень:** Middle

**Ответ:**
Большой PDF читается pages/chunks и сразу индексируется batch-ами, а не загружается в один гигантский list. В AI backend cost/latency часто доминируют model calls и context, поэтому Python micro-optimization имеет смысл только после end-to-end profiling.

## 204. Как безопасно реализовать structured output от LLM в backend pipeline?

**Уровень:** Middle

**Ответ:**
Используйте provider structured output/tool schema, затем локальную runtime validation Pydantic/JSON Schema и semantic business validation. Parse failure — контролируемая ошибка/retry с budget, а не raw exception вниз по pipeline.

## 205. Production debugging: какие failure modes характерны для темы «безопасно реализовать structured output от LLM в backend pipeline» и как их локализовать?

**Уровень:** Middle

**Ответ:**
Valid JSON может содержать неправильный tenant_id, amount или enum semantics. Prompt-only JSON без schema менее надёжен. Проверяйте provider quotas, model/tool retries, structured-output validation, cost explosion, prompt injection boundary и duplicate side effects.

## 206. Как применить тему «безопасно реализовать structured output от LLM в backend pipeline» в production AI/LLM/agent backend?

**Уровень:** Middle

**Ответ:**
Tool arguments проходят syntactic validation, затем authorization/policy; LLM никогда не получает право писать DB только потому, что JSON валиден. Core backend должен моделировать runs, model/tool budgets, tracing, policy и durable state независимо от конкретного LLM SDK.

```python
from pydantic import BaseModel, ConfigDict
class ToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str
    value: int
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 207. Когда решение из темы «работает hashing в Python и какие объекты могут быть ключами dict» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Custom hash позволяет value objects быть ключами, но требует фактической неизменяемости полей equality/hash. Оценивайте не только скорость, но и понятность ownership, объём копирований, hashability и риск shared mutable state.

## 208. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «Longest Substring Without Repeating Characters и объясните сложность.»?

**Уровень:** Senior

**Ответ:**
Set-window проще, но может делать дополнительные удаления; map последних индексов короче и гарантирует линейный проход. Оценивайте не только скорость, но и понятность ownership, объём копирований, hashability и риск shared mutable state.

## 209. Как решить 4Sum без дубликатов и какова сложность?

**Уровень:** Senior

**Ответ:**
После сортировки фиксируют два индекса и решают остаток двумя указателями. Дубликаты пропускают на каждом уровне. Время O(n^3), дополнительная память O(1) без учёта результата; это существенно лучше полного O(n^4) перебора.

## 210. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «решить 4Sum без дубликатов и какова сложность»?

**Уровень:** Senior

**Ответ:**
Ошибки: не пропускать duplicates, неправильно двигать указатели после найденной суммы, забывать early pruning по минимально/максимально возможной сумме. При разборе смотрите aliasing, identity, mutation sites и lifetime объектов; минимальный reproducer должен отделить семантику Python от поведения framework.

## 211. Какие production controls добавите вокруг темы «решить 4Sum без дубликатов и какова сложность» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Для backend interview важен не сам 4Sum, а умение объяснить complexity, pruning и почему выбран конкретный data structure. В AI-сервисе особенно важно не смешивать process-wide configuration с mutable per-request/per-run state.

## 212. Сравните основной подход в теме «LEGB и различия global и nonlocal.» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Closures удобны для небольших factories, но явный object/dependency проще тестировать, если состояние сложное. Функциональный wrapper дешевле класса, пока не появляются сложный lifecycle, несколько зависимостей и необходимость явного state.

## 213. Когда решение из темы «closure и где его разумно использовать» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Closure компактнее class для маленького поведения; class лучше, когда нужны lifecycle, несколько методов и явное состояние. Функциональный wrapper дешевле класса, пока не появляются сложный lifecycle, несколько зависимостей и необходимость явного state.

## 214. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «добавить общее поведение к нескольким функциям, не меняя их код»?

**Уровень:** Senior

**Ответ:**
Decorator даёт локальную композицию, middleware — поведение на весь HTTP pipeline, dependency injection — переиспользуемую зависимость. Выбирают по области действия. Функциональный wrapper дешевле класса, пока не появляются сложный lifecycle, несколько зависимостей и необходимость явного state.

## 215. Как работает MRO и `super()` при множественном наследовании?

**Уровень:** Senior

**Ответ:**
MRO, Method Resolution Order (эм-ар-оу — порядок поиска методов), в Python строится C3 linearization. `super()` означает «следующий класс в MRO», а не буквально parent. Cooperative inheritance требует, чтобы участники совместимо вызывали `super()`.

## 216. Production debugging: какие failure modes характерны для темы «работает MRO и super() при множественном наследовании» и как их локализовать?

**Уровень:** Senior

**Ответ:**
Явный вызов Base.method(self) ломает cooperative chain и может вызвать/пропустить метод дважды в diamond hierarchy. Ищите скрытое coupling через inheritance, неправильный MRO/super, magic methods с неожиданными side effects и слишком широкие interfaces.

## 217. Как применить тему «работает MRO и super() при множественном наследовании» в production AI/LLM/agent backend?

**Уровень:** Senior

**Ответ:**
В backend framework mixin может добавлять сериализацию, но clients/repositories лучше передавать композиционно через DI. Provider adapters, repositories и tool ports удобнее задавать маленькими protocols, чтобы тестировать без реальных внешних SDK.

```python
class A:
    def f(self): return ["A"]
class B(A):
    def f(self): return ["B"] + super().f()
class C(A):
    def f(self): return ["C"] + super().f()
class D(B,C):
    def f(self): return ["D"] + super().f()
assert D().f() == ["D","B","C","A"]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 218. Чем `__getattr__` отличается от `__getattribute__`?

**Уровень:** Senior

**Ответ:**
`__getattribute__` перехватывает любой доступ к attribute и должен осторожно делегировать `object.__getattribute__`; `__getattr__` вызывается только если обычный lookup не нашёл имя. Второй вариант безопаснее для fallback/proxy.

## 219. Представьте production-инцидент вокруг темы «__getattr__ отличается от __getattribute__». Что вы проверите первым и почему?

**Уровень:** Senior

**Ответ:**
Неправильный `__getattribute__` легко вызывает бесконечную рекурсию. Dynamic fallback также прячет опечатки до runtime. Ищите скрытое coupling через inheritance, неправильный MRO/super, magic methods с неожиданными side effects и слишком широкие interfaces.

## 220. Спроектируйте практическое применение темы «__getattr__ отличается от __getattribute__» в сервисе AI-агентов.

**Уровень:** Senior

**Ответ:**
Не стоит строить LLM provider abstraction через магический forwarding всех методов: лучше typed Protocol/adapter и явный compatibility layer. Provider adapters, repositories и tool ports удобнее задавать маленькими protocols, чтобы тестировать без реальных внешних SDK.

## 221. Когда решение из темы «Что делает __slots__ и когда он полезен» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Экономия памяти ценна для огромного числа объектов; для обычных request models выигрыш часто не стоит дополнительной сложности. Composition/Protocol обычно делают зависимости явнее; inheritance оправдан, когда есть стабильное is-a отношение и общий lifecycle.

## 222. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «использовать composition вместо inheritance»?

**Уровень:** Senior

**Ответ:**
Composition требует больше wiring, зато делает dependencies явными и легко заменяемыми в tests. Composition/Protocol обычно делают зависимости явнее; inheritance оправдан, когда есть стабильное is-a отношение и общий lifecycle.

## 223. Как SOLID применять в Python без Java-style overengineering?

**Уровень:** Senior

**Ответ:**
SOLID — набор принципов изменения/coupling, а не требование создавать interface на каждый класс. В Python Protocol, callable и small modules часто заменяют тяжёлые abstractions. Особенно важны SRP и dependency inversion на границах I/O.

## 224. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «SOLID применять в Python без Java-style overengineering»?

**Уровень:** Senior

**Ответ:**
Антипаттерн — десятки ABC/Factory ради двух реализаций. Это увеличивает cognitive load без реального variation point. Ищите скрытое coupling через inheritance, неправильный MRO/super, magic methods с неожиданными side effects и слишком широкие interfaces.

## 225. Какие production controls добавите вокруг темы «SOLID применять в Python без Java-style overengineering» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Для multi-provider LLM layer Protocol оправдан; для единственной функции форматирования достаточно pure function. Provider adapters, repositories и tool ports удобнее задавать маленькими protocols, чтобы тестировать без реальных внешних SDK.

## 226. Что нового дала type parameter syntax Python 3.12+?

**Уровень:** Senior

**Ответ:**
PEP 695 добавил компактный синтаксис generics: `class Box[T]`, `def first[T](...)`, `type Alias[T] = ...`. Он делает generic APIs понятнее и позволяет type parameters объявлять рядом с сущностью.

## 227. Представьте production-инцидент вокруг темы «Что нового дала type parameter syntax Python 3.12+». Что вы проверите первым и почему?

**Уровень:** Senior

**Ответ:**
Не стоит мигрировать библиотеку, если поддерживается Python <3.12. Также runtime introspection generic metadata отличается от старых TypeVar patterns. Разделяйте static typing и runtime validation: mypy/pyright не защищают JSON на сетевой границе, а validation не доказывает корректность внутренней логики.

## 228. Спроектируйте практическое применение темы «Что нового дала type parameter syntax Python 3.12+» в сервисе AI-агентов.

**Уровень:** Senior

**Ответ:**
Во внутреннем AI platform на Python 3.12+ новый синтаксис полезен для typed Result/Repository/Tool adapters. На границе model/tool/API используйте строгую validation schema, а внутри domain layer не тащите provider-specific DTO.

## 229. Когда решение из темы «dataclass лучше обычного класса» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Dataclass минимизирует boilerplate, но Pydantic лучше на untrusted external data, где нужна validation/coercion/schema. Более строгие schemas повышают safety и evolvability API, но требуют versioning и аккуратной совместимости клиентов.

## 230. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «Pydantic model отличается от dataclass»?

**Уровень:** Senior

**Ответ:**
Pydantic дороже по CPU, но снижает boundary bugs. Внутри hot loop можно использовать простые typed structures. Более строгие schemas повышают safety и evolvability API, но требуют versioning и аккуратной совместимости клиентов.

## 231. Что такое `Protocol` и когда он лучше ABC?

**Уровень:** Senior

**Ответ:**
`typing.Protocol` даёт structural typing (стра́кчурал тайпинг — совместимость по набору методов), без обязательного наследования. ABC задаёт nominal/runtime hierarchy. Protocol удобен для ports/adapters и тестовых doubles.

## 232. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «Protocol и когда он лучше ABC»?

**Уровень:** Senior

**Ответ:**
Слишком широкий Protocol становится неявным interface-монстром. `runtime_checkable` даёт ограниченную runtime-проверку и не заменяет validation поведения. Разделяйте static typing и runtime validation: mypy/pyright не защищают JSON на сетевой границе, а validation не доказывает корректность внутренней логики.

## 233. Какие production controls добавите вокруг темы «Protocol и когда он лучше ABC» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
ModelClient Protocol позволяет адаптировать OpenAI/Anthropic/local provider без наследования от общей SDK-базы. На границе model/tool/API используйте строгую validation schema, а внутри domain layer не тащите provider-specific DTO.

```python
from typing import Protocol
class ModelClient(Protocol):
    def generate(self, prompt:str) -> str: ...
class Fake:
    def generate(self, prompt:str)->str: return "ok"
def run(c:ModelClient)->str: return c.generate("hi")
assert run(Fake()) == "ok"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 234. Сравните основной подход в теме «работает yield и чем generator отличается от обычной функции» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Generator снижает memory peak, но random access и повторный проход требуют материализации. Lazy pipeline снижает peak memory, но усложняет lifecycle, error handling и повторный проход по данным.

## 235. Что делают `send`, `throw` и `close` у generator?

**Уровень:** Senior

**Ответ:**
`send(value)` возобновляет generator и подставляет value в выражение yield; `throw` внедряет exception; `close` вызывает GeneratorExit. До async/await такие generators использовались как coroutines, сейчас чаще полезны для advanced streaming/protocol code.

## 236. Какая типичная ошибка возникает при работе с темой «Что делают send, throw и close у generator» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Сложный bidirectional generator трудно читать и тестировать; забытый cleanup может удерживать resources. Ищите утечки ресурсов при раннем выходе, повторное потребление одноразового iterator и накопление данных, которое уничтожает преимущество lazy processing.

## 237. Как встроить решение по теме «Что делают send, throw и close у generator» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
В AI backend предпочитайте `async for`/Queue для токенов; low-level generator control нужен редко. Полезно для token/document streams и больших tool results, если cancellation корректно закрывает network/file resources.

## 238. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «написать собственный context manager и зачем он нужен»?

**Уровень:** Senior

**Ответ:**
Context manager делает lifecycle локальным и надёжным, но long-lived pools лучше создавать на application lifespan. Lazy pipeline снижает peak memory, но усложняет lifecycle, error handling и повторный проход по данным.

## 239. Как изменится ваше решение по теме «async generator полезен для streaming API» при росте нагрузки в 100 раз?

**Уровень:** Senior

**Ответ:**
Streaming уменьшает time-to-first-byte и память, но усложняет retry: после отправки части ответа нельзя прозрачно начать HTTP response заново. Lazy pipeline снижает peak memory, но усложняет lifecycle, error handling и повторный проход по данным.

## 240. Какой главный trade-off у темы «правильно строить exception hierarchy в backend-сервисе» и когда вы выберете альтернативный подход?

**Уровень:** Senior

**Ответ:**
Более богатая hierarchy улучшает routing/retry, но слишком много классов усложняют код. Создавайте тип только если поведение обработки реально различается. Богатая typed error model улучшает recovery и observability, но слишком глубокая иерархия усложняет boundary mapping.

## 241. Сравните основной подход в теме «использовать raise, raise e и raise ... from ...» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Exception chaining улучшает диагностику, но наружный API должен видеть стабильный error contract, а не внутренние детали. Богатая typed error model улучшает recovery и observability, но слишком глубокая иерархия усложняет boundary mapping.

## 242. Что такое `ExceptionGroup` и `except*`?

**Уровень:** Senior

**Ответ:**
ExceptionGroup (эксэ́пшн-груп — контейнер нескольких исключений) появился для concurrent workloads, где несколько child tasks могут упасть. `except*` обрабатывает подгруппы по типу, не теряя остальные ошибки.

## 243. Какая типичная ошибка возникает при работе с темой «ExceptionGroup и except*» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Если код ожидает ровно одно исключение после TaskGroup, он может неправильно обработать несколько одновременных failures. Проверяйте swallowed exceptions, потерю causal chain, retry по permanent error, logging secrets и config drift между environments.

## 244. Как встроить решение по теме «ExceptionGroup и except*» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
Параллельные retrieval/tool calls могут вернуть несколько failures; trace должен сохранить каждый, а orchestrator решить partial-success policy. Ошибки provider/tool нужно нормализовать в retryable/permanent/policy категории и сохранять request IDs без утечки prompt secrets.

```python
def handle_group():
    try:
        raise ExceptionGroup("many", [ValueError("v"), TypeError("t")])
    except* ValueError as eg:
        assert len(eg.exceptions) == 1
    except* TypeError as eg:
        assert len(eg.exceptions) == 1
handle_group()
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 245. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «организовать structured logging в Python backend»?

**Уровень:** Senior

**Ответ:**
Structured logs требуют schema discipline, зато дают надёжный поиск и dashboards. Свободный текст оставляют для human message field. Богатая typed error model улучшает recovery и observability, но слишком глубокая иерархия усложняет boundary mapping.

## 246. Как изменится ваше решение по теме «управлять конфигурацией dev/qa/prod без hardcode» при росте нагрузки в 100 раз?

**Уровень:** Senior

**Ответ:**
Environment variables просты, secret manager даёт rotation/audit. Обычно non-secret config и secrets имеют разные источники, но единый typed facade. Богатая typed error model улучшает recovery и observability, но слишком глубокая иерархия усложняет boundary mapping.

## 247. Сравните основной подход в теме «coroutine, Task и Future в asyncio» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Task удобен для structured concurrent work; Future нужен при интеграции callback APIs. Чем ниже abstraction, тем больше lifecycle responsibility. Async даёт высокий I/O concurrency при малом числе threads, но требует async-compatible drivers и дисциплины cancellation.

## 248. Когда решение из темы «asyncio.gather() отличается от asyncio.as_completed()» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Gather проще для all-at-once fan-out; as_completed лучше для first-results/streaming. Важна cancellation policy. Async даёт высокий I/O concurrency при малом числе threads, но требует async-compatible drivers и дисциплины cancellation.

## 249. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «asyncio.Semaphore в высококонкурентном сервисе»?

**Уровень:** Senior

**Ответ:**
Локальная concurrency limit проста и быстра; distributed rate limit требует Redis/gateway и сложнее. Async даёт высокий I/O concurrency при малом числе threads, но требует async-compatible drivers и дисциплины cancellation.

## 250. Что такое backpressure и как реализовать его через `asyncio.Queue`?

**Уровень:** Senior

**Ответ:**
Backpressure (бэкпре́шер — замедление producers, когда consumers не успевают) возникает у bounded Queue: `await put()` блокируется при `maxsize`. Это ограничивает memory и превращает overload в ожидание вместо OOM.

## 251. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «backpressure и как реализовать его через asyncio.Queue»?

**Уровень:** Senior

**Ответ:**
Unbounded Queue во время downstream outage растёт до OOM. Нельзя забывать `task_done`, иначе `join` никогда не завершится. Первым делом ищите blocking code в event loop, unbounded task creation, потерянные exceptions и отсутствие concurrency limits.

## 252. Какие production controls добавите вокруг темы «backpressure и как реализовать его через asyncio.Queue» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Token/event ingestion или async document pipeline используют bounded queue; внешний HTTP слой может вернуть 429/503 при переполнении. Для LLM/provider/DB/tool I/O ограничивайте fan-out semaphore-ами и измеряйте queueing, а CPU work выносите из event loop.

```python
import asyncio
async def main():
    q=asyncio.Queue(maxsize=1)
    await q.put(1)
    item=await q.get(); q.task_done(); await q.join()
    return item
assert asyncio.run(main()) == 1
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 253. Почему `asyncio.TaskGroup` предпочтительнее набора `create_task` для связанной работы?

**Уровень:** Senior

**Ответ:**
TaskGroup реализует structured concurrency (стра́кчерд конка́ренси — child tasks живут внутри явного scope): выход ждёт children, а failure отменяет siblings и собирает ошибки. Это упрощает lifecycle и не оставляет orphan tasks.

## 254. Production debugging: какие failure modes характерны для темы «asyncio.TaskGroup предпочтительнее набора create_task для связанной работы» и как их локализовать?

**Уровень:** Senior

**Ответ:**
Сырые create_task без централизованного await могут пережить request, утечь и обращаться к уже закрытым resources. Ищите orphan tasks, swallowed CancelledError, timeout только на нижнем call без общего deadline и side effects после cancellation.

## 255. Как применить тему «asyncio.TaskGroup предпочтительнее набора create_task для связанной работы» в production AI/LLM/agent backend?

**Уровень:** Senior

**Ответ:**
Fan-out retrieval к нескольким обязательным источникам удобно завернуть в TaskGroup с явной partial-failure policy. Agent run должен иметь общий deadline/budget, который передаётся model, retrieval и tool calls, а не независимые бесконечные timeouts.

```python
import asyncio
async def one(x): await asyncio.sleep(0); return x
async def main():
    tasks=[]
    async with asyncio.TaskGroup() as tg:
        for x in [1,2,3]: tasks.append(tg.create_task(one(x)))
    return [t.result() for t in tasks]
assert asyncio.run(main()) == [1,2,3]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 256. Как правильно обрабатывать `CancelledError`?

**Уровень:** Senior

**Ответ:**
Cancellation в asyncio доставляется как `CancelledError`, который наследуется от BaseException. Coroutine должна делать cleanup в `finally`; если ловит cancellation, обычно обязана re-raise, иначе ломаются TaskGroup/timeout semantics.

## 257. Представьте production-инцидент вокруг темы «правильно обрабатывать CancelledError». Что вы проверите первым и почему?

**Уровень:** Senior

**Ответ:**
Swallow `CancelledError` оставляет request work жить после client disconnect/shutdown и может совершить side effect, которого пользователь уже не ждёт. Ищите orphan tasks, swallowed CancelledError, timeout только на нижнем call без общего deadline и side effects после cancellation.

## 258. Спроектируйте практическое применение темы «правильно обрабатывать CancelledError» в сервисе AI-агентов.

**Уровень:** Senior

**Ответ:**
При отмене LLM stream закройте upstream HTTP stream и освободите semaphore; irreversible tool action требует отдельной idempotency semantics. Agent run должен иметь общий deadline/budget, который передаётся model, retrieval и tool calls, а не независимые бесконечные timeouts.

```python
import asyncio
async def worker(flag):
    try:
        await asyncio.sleep(10)
    finally:
        flag.append("cleaned")
async def main():
    flag=[]; t=asyncio.create_task(worker(flag)); await asyncio.sleep(0); t.cancel()
    try: await t
    except asyncio.CancelledError: pass
    return flag
assert asyncio.run(main()) == ["cleaned"]
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 259. Когда решение из темы «asyncio.timeout() отличается от timeout внутри HTTP client» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Глобальный deadline защищает user SLO, per-phase timeouts лучше диагностируют проблему. Обычно нужны оба. Structured concurrency упрощает ownership дочерних задач, но требует продуманной политики partial failure и cancellation propagation.

## 260. Когда нужен `asyncio.shield()` и почему он опасен?

**Уровень:** Senior

**Ответ:**
`shield` защищает inner awaitable от cancellation внешнего waiter, но caller всё равно получает CancelledError. Это уместно для короткого cleanup/commit, который нельзя прервать посередине.

## 261. Code review: какие скрытые дефекты вы бы искали в реализации темы «нужен asyncio.shield() и почему он опасен»?

**Уровень:** Senior

**Ответ:**
Shield на долгой операции создаёт zombie work после disconnect и делает shutdown непредсказуемым. Ищите orphan tasks, swallowed CancelledError, timeout только на нижнем call без общего deadline и side effects после cancellation.

## 262. Как вы реализуете и будете наблюдать тему «нужен asyncio.shield() и почему он опасен» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Финальное сохранение checkpoint можно shield на миллисекунды; долгий tool execution лучше вынести в durable worker. Agent run должен иметь общий deadline/budget, который передаётся model, retrieval и tool calls, а не независимые бесконечные timeouts.

## 263. Как сделать graceful shutdown asyncio-сервиса?

**Уровень:** Senior

**Ответ:**
Прекратить принимать новую работу, выставить readiness false, остановить producers, дождаться/отменить tasks по deadline, закрыть HTTP/DB/Redis pools и flush telemetry. Cancellation cleanup должен быть тестируемым.

## 264. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «сделать graceful shutdown asyncio-сервиса»?

**Уровень:** Senior

**Ответ:**
Сразу `cancel all` может оборвать transaction/side effect; бесконечное ожидание делает deployment зависшим. Нужен bounded shutdown budget. Ищите orphan tasks, swallowed CancelledError, timeout только на нижнем call без общего deadline и side effects после cancellation.

## 265. Какие production controls добавите вокруг темы «сделать graceful shutdown asyncio-сервиса» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
FastAPI lifespan закрывает shared clients; background durable jobs не должны жить как необслуживаемые create_task внутри web worker. Agent run должен иметь общий deadline/budget, который передаётся model, retrieval и tool calls, а не независимые бесконечные timeouts.

## 266. Сравните основной подход в теме «выбрать ThreadPoolExecutor, ProcessPoolExecutor или asyncio» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Async имеет низкий per-task overhead, thread удобнее для sync libraries, process даёт parallel CPU. Нет одного универсального executor. Threads дешевле и разделяют память, processes/interpreters дают CPU parallelism ценой IPC, startup и memory overhead.

## 267. Что изменилось с free-threaded CPython 3.13+?

**Уровень:** Senior

**Ответ:**
Free-threaded build (фри-трэ́дид — CPython без GIL) позволяет Python threads выполнять код параллельно на cores. В 3.14 это всё ещё отдельный режим; некоторые C extensions могут включить GIL обратно, а shared mutable state требует реальной синхронизации.

## 268. Какая типичная ошибка возникает при работе с темой «Что изменилось с free-threaded CPython 3.13+» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Старый код мог случайно полагаться на GIL как на «защиту». В free-threaded build compound operations/races становятся заметнее; iterator sharing отдельно не гарантирован. Профилируйте CPU vs I/O, saturation executor, serialization/IPC и race conditions; наличие или отсутствие GIL не отменяет synchronization shared state.

## 269. Как встроить решение по теме «Что изменилось с free-threaded CPython 3.13+» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
AI backend с CPU post-processing может выиграть, но SDK/native extensions нужно проверить на free-threaded support; архитектуру не строят на предположении, что GIL исчез везде. Выбор executor для OCR, parsing, local inference или sync SDK должен делаться по измеренному workload, а не по правилу «async всегда лучше».

## 270. Что такое `InterpreterPoolExecutor` Python 3.14 и чем он отличается от process pool?

**Уровень:** Senior

**Ответ:**
`InterpreterPoolExecutor` запускает workers в отдельных interpreters внутри threads; каждый interpreter имеет собственный GIL и даёт multi-core parallelism. Interpreters изолируют runtime state, а передаваемые callables/data должны быть сериализуемыми.

## 271. Code review: какие скрытые дефекты вы бы искали в реализации темы «InterpreterPoolExecutor Python 3.14 и чем он отличается от process pool»?

**Уровень:** Senior

**Ответ:**
Нельзя считать interpreters общей памятью как обычные threads; modules/globals импортируются отдельно. Не все extension patterns одинаково удобны. Профилируйте CPU vs I/O, saturation executor, serialization/IPC и race conditions; наличие или отсутствие GIL не отменяет synchronization shared state.

## 272. Как вы реализуете и будете наблюдать тему «InterpreterPoolExecutor Python 3.14 и чем он отличается от process pool» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Для CPU-bound normalization можно benchmark interpreter pool против process pool; external ML services всё равно часто лучше масштабировать отдельно. Выбор executor для OCR, parsing, local inference или sync SDK должен делаться по измеренному workload, а не по правилу «async всегда лучше».

## 273. Почему shared `dict` между threads не стоит считать безопасной бизнес-транзакцией даже при GIL?

**Уровень:** Senior

**Ответ:**
Некоторые отдельные операции built-in historically atomic в конкретном CPython, но multi-step invariant «check then set» не атомарен. Free-threaded Python ещё сильнее требует явных locks. Language contract не гарантирует вашу бизнес-операцию.

## 274. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «shared dict между threads не стоит считать безопасной бизнес-транзакцией даже при GIL»?

**Уровень:** Senior

**Ответ:**
Race: два threads видят отсутствие idempotency key и оба выполняют payment. Dict не заменяет lock/DB uniqueness. Профилируйте CPU vs I/O, saturation executor, serialization/IPC и race conditions; наличие или отсутствие GIL не отменяет synchronization shared state.

## 275. Какие production controls добавите вокруг темы «shared dict между threads не стоит считать безопасной бизнес-транзакцией даже при GIL» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Agent tool side effects защищайте database unique constraint/idempotency table, а не module-level set. Выбор executor для OCR, parsing, local inference или sync SDK должен делаться по измеренному workload, а не по правилу «async всегда лучше».

```python
import threading
lock=threading.Lock(); state={"n":0}
def inc():
    for _ in range(1000):
        with lock: state["n"] += 1
ts=[threading.Thread(target=inc) for _ in range(2)]
[t.start() for t in ts]; [t.join() for t in ts]
assert state["n"] == 2000
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 276. Какой главный trade-off у темы «вы выбрали FastAPI вместо Flask или Django» и когда вы выберете альтернативный подход?

**Уровень:** Senior

**Ответ:**
FastAPI удобен для typed API/AI I/O workloads; Django выигрывает, если нужен mature full-stack ecosystem; Flask — маленький sync service. FastAPI удобен для typed async API, но framework не заменяет отдельный durable worker и не делает blocking SDK асинхронным.

## 277. Когда решение из темы «Что происходит с def endpoint в FastAPI по сравнению с async def» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Threadpool позволяет интегрировать legacy sync code, но имеет limits/overhead. Native async лучше для high-concurrency I/O. FastAPI удобен для typed async API, но framework не заменяет отдельный durable worker и не делает blocking SDK асинхронным.

## 278. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «FastAPI dependency injection помогает production-коду»?

**Уровень:** Senior

**Ответ:**
DI повышает тестируемость, но скрытые глубокие dependency chains ухудшают latency/debugging. Держите boundaries простыми. FastAPI удобен для typed async API, но framework не заменяет отдельный durable worker и не делает blocking SDK асинхронным.

## 279. Почему `lifespan` важнее старых startup/shutdown handlers в современном FastAPI?

**Уровень:** Senior

**Ответ:**
Рекомендуемый `lifespan` объединяет setup и cleanup в async context manager и делает lifecycle ресурсов явным. Если lifespan передан, альтернативные startup/shutdown handlers не используются.

## 280. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «lifespan важнее старых startup/shutdown handlers в современном FastAPI»?

**Уровень:** Senior

**Ответ:**
Инициализировать client/model при import затрудняет tests, fork workers и graceful cleanup. Создавать pool на каждый request — дорого. Проверяйте blocking dependencies, неверный lifespan ресурсов, connection-pool exhaustion, middleware ordering и работу cancellation при disconnect.

## 281. Какие production controls добавите вокруг темы «lifespan важнее старых startup/shutdown handlers в современном FastAPI» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Создавайте HTTP model clients, DB/Redis pools и telemetry exporters на lifespan и гарантированно закрывайте их после `yield`. LLM gateway обычно держит shared HTTP/DB clients в lifespan и разделяет request path, streaming и durable execution.

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = object()
    yield
    app.state.client = None

app = FastAPI(lifespan=lifespan)
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 282. Как структурировать production FastAPI project, чтобы он не превратился в набор fat routers?

**Уровень:** Senior

**Ответ:**
Router должен адаптировать HTTP к application layer: parse/authorize → вызвать use case/service → сериализовать response. Business logic, provider clients и persistence не должны жить внутри path function. Разделение обычно строят по domain/features, а не только по техническим папкам.

## 283. Production debugging: какие failure modes характерны для темы «структурировать production FastAPI project, чтобы он не превратился в набор fat routers» и как их локализовать?

**Уровень:** Senior

**Ответ:**
Fat endpoint трудно тестировать без HTTP, он создаёт транзакции и сетевые вызовы вперемешку. Другой край — десятки пустых layers, где каждый метод просто проксирует следующий. Проверяйте lifetime clients/pools, schema drift, expensive validation, background work после response и корректный shutdown.

## 284. Как применить тему «структурировать production FastAPI project, чтобы он не превратился в набор fat routers» в production AI/LLM/agent backend?

**Уровень:** Senior

**Ответ:**
В AI service router принимает prompt request, application service оркестрирует quota/model/tool policy, adapters работают с LLM/DB. Для tool schemas и structured LLM outputs extra fields и invalid enum лучше отклонять на boundary до исполнения side effect.

## 285. Сравните основной подход в теме «обрабатывать PATCH для частичного обновления ресурса» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
PUT проще как полная замена; PATCH удобнее клиенту, но требует точной semantics и concurrency control. Строгие response/input models улучшают contract, но требуют versioning и отделения persistence/provider schemas от public API.

## 286. Когда решение из темы «Pydantic validators использовать без переноса бизнес-логики в schema layer» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Schema validation должна быть детерминированной и дешёвой; бизнес-валидация может требовать I/O и transaction. Строгие response/input models улучшают contract, но требуют versioning и отделения persistence/provider schemas от public API.

## 287. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «проектировать response models и почему не стоит возвращать ORM object напрямую»?

**Уровень:** Senior

**Ответ:**
Отдельные DTO добавляют mapping code, зато decouple API schema от DB migrations и security boundaries. Строгие response/input models улучшают contract, но требуют versioning и отделения persistence/provider schemas от public API.

## 288. Когда FastAPI `BackgroundTasks` достаточно, а когда нужен Celery/queue worker?

**Уровень:** Senior

**Ответ:**
`BackgroundTasks` выполняет работу после response в том же process и подходит для коротких best-effort операций. Durable, долгие, retryable или CPU-heavy jobs требуют внешней очереди/worker, чтобы переживать restart и масштабироваться отдельно.

## 289. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «FastAPI BackgroundTasks достаточно, а когда нужен Celery/queue worker»?

**Уровень:** Senior

**Ответ:**
Background task может потеряться при crash/deploy и конкурирует за ресурсы с web traffic. Нельзя использовать его как durable job system. Проверяйте lifetime clients/pools, schema drift, expensive validation, background work после response и корректный shutdown.

## 290. Какие production controls добавите вокруг темы «FastAPI BackgroundTasks достаточно, а когда нужен Celery/queue worker» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Отправить лёгкий audit webhook можно BackgroundTasks; PDF ingestion/embedding/indexing — durable worker. Для tool schemas и structured LLM outputs extra fields и invalid enum лучше отклонять на boundary до исполнения side effect.

## 291. Какой главный trade-off у темы «API для обновления данных сотрудника. Какие method, URL, status codes и concurrency semantics выберете» и когда вы выберете альтернативный подход?

**Уровень:** Senior

**Ответ:**
ETag/If-Match даёт generic HTTP optimistic locking; DB version column проще внутри собственного клиента. Важно единообразие. Удобство API нужно балансировать с стабильным contract: слишком общий endpoint быстро превращается в невалидируемый RPC.

## 292. Когда решение из темы «проектировать pagination: offset/limit или cursor» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Offset удобен admin UI/малых таблиц; cursor — feeds/events/large datasets. Cursor должен включать sort direction/version. Удобство API нужно балансировать с стабильным contract: слишком общий endpoint быстро превращается в невалидируемый RPC.

## 293. Как версионировать публичный REST API?

**Уровень:** Senior

**Ответ:**
Versioning нужен только при breaking contract. Варианты: URL `/v1`, media type/header, отдельные endpoints. Важнее compatibility policy, deprecation window, telemetry клиентов и contract tests.

## 294. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «версионировать публичный REST API»?

**Уровень:** Senior

**Ответ:**
Создание `v2` при каждом внутреннем refactor удваивает поддержку. Незаметно удалить поле в v1 — реальный breaking change. Проверяйте semantics status codes, validation, idempotency, pagination boundaries, retries и backward compatibility.

## 295. Какие production controls добавите вокруг темы «версионировать публичный REST API» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Model/provider меняется без API version, если внешний response contract сохраняется; schema change tool-run response может потребовать v2. Agent-facing API должен явно моделировать run/task IDs, cancellation, streaming и повтор запросов, а не прятать всё в одном POST.

## 296. Какой главный trade-off у темы «защитить REST API без server-side sessions» и когда вы выберете альтернативный подход?

**Уровень:** Senior

**Ответ:**
Self-contained JWT снижает lookup latency; opaque token проще мгновенно revoke и централизованно управлять policy. Stateless JWT масштабируется проще, но revocation и fine-grained policy сложнее; server-side/session state даёт больший контроль ценой stateful infrastructure.

## 297. Как реализовать rate limiting для multi-tenant API?

**Уровень:** Senior

**Ответ:**
Нужно определить dimension: tenant/user/key/IP/model, window и burst. Token bucket/leaky bucket хорошо моделируют burst; distributed counter хранится в Redis/gateway. Ответ включает 429 и retry metadata.

## 298. Code review: какие скрытые дефекты вы бы искали в реализации темы «реализовать rate limiting для multi-tenant API»?

**Уровень:** Senior

**Ответ:**
In-memory limiter работает только на одном process/pod. IP-only несправедлив за NAT; один общий quota позволяет noisy tenant съесть capacity. Проверяйте token validation, issuer/audience, privilege checks на каждом resource, secret leakage, SSRF и обход rate limits.

## 299. Как вы реализуете и будете наблюдать тему «реализовать rate limiting для multi-tenant API» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Используйте tenant token budget + per-model concurrency semaphore + provider quota coordination. Для AI tools authorization должен применяться после выбора tool и до side effect; решение LLM не является security boundary.

```python
import time
class TokenBucket:
    def __init__(self, rate:float, capacity:float):
        self.rate=rate; self.capacity=capacity; self.tokens=capacity; self.last=time.monotonic()
    def allow(self, cost=1.0):
        now=time.monotonic(); self.tokens=min(self.capacity,self.tokens+(now-self.last)*self.rate); self.last=now
        if self.tokens < cost: return False
        self.tokens -= cost; return True
b=TokenBucket(1,2); assert b.allow() and b.allow() and not b.allow()
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 300. Что такое SSRF и почему backend AI-agent особенно подвержен ему?

**Уровень:** Senior

**Ответ:**
SSRF, Server-Side Request Forgery (эс-эс-ар-эф — заставить сервер обратиться к атакующему/внутреннему адресу), опасен, когда URL приходит от пользователя или LLM/tool. Нужно allowlist schemes/hosts, блокировать private/link-local/metadata IP и повторно проверять redirects/DNS.

## 301. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «SSRF и почему backend AI-agent особенно подвержен ему»?

**Уровень:** Senior

**Ответ:**
Простая regex по строке URL обходится redirects, IPv6, DNS rebinding. Agent может выбрать URL из untrusted document. Проверяйте token validation, issuer/audience, privilege checks на каждом resource, secret leakage, SSRF и обход rate limits.

## 302. Какие production controls добавите вокруг темы «SSRF и почему backend AI-agent особенно подвержен ему» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Web-browsing tool запускают через egress proxy/policy, а internal metadata/service networks недоступны. Для AI tools authorization должен применяться после выбора tool и до side effect; решение LLM не является security boundary.

## 303. Сравните основной подход в теме «normalization и когда denormalization оправдана» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Нормализуйте source of truth; materialized views/read models создавайте после profiling и с ясной refresh semantics. SQL pushdown уменьшает сетевые round trips, но сложный запрос может стать трудно поддерживаемым; иногда materialization или precomputation дешевле.

## 304. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «N+1 query problem»?

**Уровень:** Senior

**Ответ:**
JOIN может размножить parent rows; select-in делает несколько предсказуемых queries. Выбор зависит cardinality. SQL pushdown уменьшает сетевые round trips, но сложный запрос может стать трудно поддерживаемым; иногда materialization или precomputation дешевле.

## 305. Как читать `EXPLAIN ANALYZE` и на что смотреть в первую очередь?

**Уровень:** Senior

**Ответ:**
`EXPLAIN ANALYZE` показывает фактический execution plan, rows и timings. Сравнивайте estimated vs actual rows, scan type, loops, sorts/hash spills, buffers и самые дорогие узлы. План читают снизу вверх как pipeline.

## 306. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «читать EXPLAIN ANALYZE и на что смотреть в первую очередь»?

**Уровень:** Senior

**Ответ:**
Сам факт Seq Scan не означает проблему: для маленькой таблицы он дешевле index. `ANALYZE` реально выполняет statement, поэтому write query опасно запускать без понимания. Смотрите execution plan, row cardinality, missing/unused indexes, N+1, lock waits и semantic ошибки JOIN/NULL, а не только время одного query.

## 307. Какие production controls добавите вокруг темы «читать EXPLAIN ANALYZE и на что смотреть в первую очередь» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Медленный retrieval metadata filter диагностируйте plan + actual parameters, а не «добавим index на всё». История runs, tool calls и usage обычно требует явных indexes по tenant/run/time и pagination без дорогостоящего OFFSET на больших таблицах.

## 308. Как PostgreSQL MVCC позволяет reads не блокировать writes?

**Уровень:** Senior

**Ответ:**
MVCC, Multi-Version Concurrency Control (эм-ви-си-си — многоверсионность), хранит версии rows и даёт statement/transaction snapshot. Reader видит подходящую version, пока writer создаёт новую, поэтому обычное чтение не конфликтует с write lock как в чисто locking model.

## 309. Представьте production-инцидент вокруг темы «PostgreSQL MVCC позволяет reads не блокировать writes». Что вы проверите первым и почему?

**Уровень:** Senior

**Ответ:**
Long transaction удерживает старый snapshot, мешает cleanup dead tuples и может увеличивать bloat. MVCC не отменяет write-write conflicts. Диагностика включает lock graph, transaction age, deadlocks, isolation anomalies, version conflicts и index bloat/write amplification.

## 310. Спроектируйте практическое применение темы «PostgreSQL MVCC позволяет reads не блокировать writes» в сервисе AI-агентов.

**Уровень:** Senior

**Ответ:**
Долгий streaming request не должен держать DB transaction открытой на минуты; данные читают и transaction закрывают до LLM streaming. State transitions и destructive tool operations должны иметь транзакционный invariant и idempotency, особенно при retries workers.

## 311. Чем Read Committed, Repeatable Read и Serializable отличаются в PostgreSQL?

**Уровень:** Senior

**Ответ:**
Read Committed получает новый snapshot на statement; Repeatable Read держит стабильный snapshot transaction и в PostgreSQL основан на snapshot isolation; Serializable добавляет SSI и может abort-ить transaction при опасной dependency, требуя retry всей transaction.

## 312. Какая типичная ошибка возникает при работе с темой «Read Committed, Repeatable Read и Serializable отличаются в PostgreSQL» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Код, который не умеет retry serialization failure, ломается под нагрузкой. Repeatable Read не гарантирует произвольные бизнес-инварианты без анализа. Диагностика включает lock graph, transaction age, deadlocks, isolation anomalies, version conflicts и index bloat/write amplification.

## 313. Как встроить решение по теме «Read Committed, Repeatable Read и Serializable отличаются в PostgreSQL» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
Quota reservation можно реализовать atomic update/constraint, а сложный invariant нескольких rows — Serializable с bounded retry. State transitions и destructive tool operations должны иметь транзакционный invariant и idempotency, особенно при retries workers.

## 314. Как возникает deadlock и как с ним бороться?

**Уровень:** Senior

**Ответ:**
Deadlock — transactions захватили locks в разном порядке и ждут друг друга. PostgreSQL обнаруживает цикл и abort-ит одну transaction. Профилактика: одинаковый order ресурсов, короткие transactions, подходящие indexes и retry aborted transaction.

## 315. Code review: какие скрытые дефекты вы бы искали в реализации темы «возникает deadlock и как с ним бороться»?

**Уровень:** Senior

**Ответ:**
Увеличение lock timeout не лечит deadlock. Retry без jitter/bounds может повторять конфликт бесконечно. Диагностика включает lock graph, transaction age, deadlocks, isolation anomalies, version conflicts и index bloat/write amplification.

## 316. Как вы реализуете и будете наблюдать тему «возникает deadlock и как с ним бороться» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Если два tool workflows обновляют tenant quota и run row, оба должны брать их в одинаковом порядке. State transitions и destructive tool operations должны иметь транзакционный invariant и idempotency, особенно при retries workers.

## 317. Как выбирать порядок колонок composite B-tree index?

**Уровень:** Senior

**Ответ:**
Индекс проектируют под реальные predicates/order: leading columns определяют, насколько эффективно можно сузить range. Equality columns обычно раньше range, но cardinality и sort/order также важны. Проверяйте plan, а не применяйте одно правило механически.

## 318. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «выбирать порядок колонок composite B-tree index»?

**Уровень:** Senior

**Ответ:**
Index `(created_at, tenant_id)` может плохо обслуживать `WHERE tenant_id=? ORDER BY created_at`; reverse order часто логичнее. Каждый index замедляет writes и занимает disk/cache. Диагностика включает lock graph, transaction age, deadlocks, isolation anomalies, version conflicts и index bloat/write amplification.

## 319. Какие production controls добавите вокруг темы «выбирать порядок колонок composite B-tree index» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Для `runs WHERE tenant_id=? AND status=? ORDER BY created_at DESC` индекс проектируют под этот access path и проверяют EXPLAIN. State transitions и destructive tool operations должны иметь транзакционный invariant и idempotency, особенно при retries workers.

## 320. Какой главный trade-off у темы «optimistic locking и как version column предотвращает lost update» и когда вы выберете альтернативный подход?

**Уровень:** Senior

**Ответ:**
Optimistic locking хорош при редких conflicts; pessimistic `FOR UPDATE` лучше для короткой критической секции с высокой конкуренцией. Более сильная consistency упрощает invariants, но снижает concurrency; optimistic control хорош при редких конфликтах, pessimistic — при дорогих race.

## 321. Сравните основной подход в теме «SQLAlchemy Session и почему её не стоит делать глобальной» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Per-request session добавляет небольшой overhead, но даёт чёткие transaction boundaries. Engine/connection pool, наоборот, обычно shared. ORM ускоряет delivery и domain mapping, raw SQL даёт контроль hot paths; смешанный подход часто оптимален.

## 322. Почему один `AsyncSession` нельзя использовать одновременно в нескольких asyncio tasks?

**Уровень:** Senior

**Ответ:**
SQLAlchemy документирует AsyncSession как mutable stateful transaction object, небезопасный для concurrent tasks. Каждая параллельная task должна иметь собственную session/transaction либо работать через заранее полученные immutable data.

## 323. Какая типичная ошибка возникает при работе с темой «один AsyncSession нельзя использовать одновременно в нескольких asyncio tasks» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Если две tasks одновременно выполняют queries/flush на одной session, состояние transaction и connection use становится некорректным. Ищите shared Session/AsyncSession между concurrent tasks, implicit lazy I/O, pool exhaustion и transaction scope, растянутый на внешний API call.

## 324. Как встроить решение по теме «один AsyncSession нельзя использовать одновременно в нескольких asyncio tasks» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
Параллельные retrieval metadata queries получают отдельные sessions или один заранее выполненный batch query. Agent state persistence должна иметь короткие DB transactions; медленный LLM/tool call не следует держать внутри открытой транзакции.

```python
import asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker

async def worker(factory: async_sessionmaker):
    async with factory() as session:
        return await session.connection()
# Каждая concurrent task получает собственный AsyncSession.
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 325. Что такое lazy loading и почему оно особенно опасно в async ORM?

**Уровень:** Senior

**Ответ:**
Lazy loading запускает SQL при доступе к relationship/expired attribute. В async code implicit I/O в обычном attribute access нежелателен и может вызвать ошибки; лучше eager loading или явный awaitable access.

## 326. Code review: какие скрытые дефекты вы бы искали в реализации темы «lazy loading и почему оно особенно опасно в async ORM»?

**Уровень:** Senior

**Ответ:**
Serializer после закрытия session обращается к relationship и внезапно делает query/падает. N+1 часто маскируется lazy loading. Ищите shared Session/AsyncSession между concurrent tasks, implicit lazy I/O, pool exhaustion и transaction scope, растянутый на внешний API call.

## 327. Как вы реализуете и будете наблюдать тему «lazy loading и почему оно особенно опасно в async ORM» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Перед Pydantic serialization загрузите все нужные run/tool relationships явным selectin/join и закройте transaction. Agent state persistence должна иметь короткие DB transactions; медленный LLM/tool call не следует держать внутри открытой транзакции.

## 328. Когда ORM хуже raw SQL?

**Уровень:** Senior

**Ответ:**
ORM отлично для CRUD/domain persistence, но сложная аналитика, bulk operations, vendor-specific features и точный query plan иногда проще/быстрее raw SQL/Core. Важно сохранять parameters и tests.

## 329. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «ORM хуже raw SQL»?

**Уровень:** Senior

**Ответ:**
Антипаттерн — бороться с ORM, генерируя десятки nested abstractions, вместо одного ясного SQL. Обратный антипаттерн — raw SQL string interpolation. Ищите shared Session/AsyncSession между concurrent tasks, implicit lazy I/O, pool exhaustion и transaction scope, растянутый на внешний API call.

## 330. Какие production controls добавите вокруг темы «ORM хуже raw SQL» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Usage aggregation/token billing лучше сделать SQL aggregate, а обычные Agent/Run entities — ORM. Agent state persistence должна иметь короткие DB transactions; медленный LLM/tool call не следует держать внутри открытой транзакции.

## 331. Сравните основной подход в теме «cache patterns вы знаете: cache-aside, write-through, write-behind» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Cache-aside проще и eventual; write-through даёт свежесть ценой write latency; write-behind повышает throughput, но усложняет durability. Cache снижает latency и load, но добавляет invalidation/consistency complexity; distributed locks требуют TTL, ownership и fencing semantics.

## 332. Что такое cache stampede и как его предотвращать?

**Уровень:** Senior

**Ответ:**
Stampede — много requests одновременно видят expired/missing key и атакуют origin. Меры: single-flight/distributed lock, probabilistic early refresh, stale-while-revalidate, jittered TTL и request coalescing.

## 333. Какая типичная ошибка возникает при работе с темой «cache stampede и как его предотвращать» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Один global lock превращает cache в bottleneck; lock без expiry может застрять. Одинаковый TTL тысяч keys создаёт синхронную лавину. Проверяйте stale cache, stampede, hot keys, unbounded values, неверные TTL и assumption, что Redis — durable source of truth.

## 334. Как встроить решение по теме «cache stampede и как его предотвращать» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
Кэш списка доступных моделей можно обновлять early/stale, а permissions — только с коротким TTL/явной invalidation. Prompt/model metadata и rate limits хорошо подходят Redis, а authoritative agent state/financial usage лучше хранить в durable DB.

## 335. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «Redis pipeline отличается от transaction»?

**Уровень:** Senior

**Ответ:**
Pipeline — performance; transaction/WATCH — concurrency correctness. Иногда нужны оба. Cache снижает latency и load, но добавляет invalidation/consistency complexity; distributed locks требуют TTL, ownership и fencing semantics.

## 336. Как работает optimistic locking Redis `WATCH/MULTI/EXEC`?

**Уровень:** Senior

**Ответ:**
`WATCH` следит за keys; если до EXEC их изменил другой client, transaction abort и application повторяет read-modify-write. Это optimistic concurrency.

## 337. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «работает optimistic locking Redis WATCH/MULTI/EXEC»?

**Уровень:** Senior

**Ответ:**
Unbounded retry под contention создаёт livelock. Нельзя держать бизнес-состояние только в client между WATCH и EXEC слишком долго. Проверяйте stale cache, stampede, hot keys, unbounded values, неверные TTL и assumption, что Redis — durable source of truth.

## 338. Какие production controls добавите вокруг темы «работает optimistic locking Redis WATCH/MULTI/EXEC» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Global token quota можно обновлять atomic Lua или WATCH с bounded retry; per-process dict недостаточен. Prompt/model metadata и rate limits хорошо подходят Redis, а authoritative agent state/financial usage лучше хранить в durable DB.

## 339. Как выбирать TTL и cache key для multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Key должен включать tenant и все параметры, влияющие на результат: model/prompt/index/policy version. TTL следует freshness/risk, а не одному global числу; invalidation event полезен для критичных changes.

## 340. Production debugging: какие failure modes характерны для темы «выбирать TTL и cache key для multi-tenant AI backend» и как их локализовать?

**Уровень:** Senior

**Ответ:**
Key без tenant создаёт cross-tenant leak; без prompt/index version — stale semantic result. Слишком длинный TTL маскирует updates. Проверяйте stale cache, stampede, hot keys, unbounded values, неверные TTL и assumption, что Redis — durable source of truth.

## 341. Как применить тему «выбирать TTL и cache key для multi-tenant AI backend» в production AI/LLM/agent backend?

**Уровень:** Senior

**Ответ:**
Например `tenant:model:prompt_hash:request_hash`; PII не храните в key plaintext. Prompt/model metadata и rate limits хорошо подходят Redis, а authoritative agent state/financial usage лучше хранить в durable DB.

```python
import hashlib
def cache_key(tenant:str, model:str, prompt_version:int, payload:bytes)->str:
    digest=hashlib.sha256(payload).hexdigest()
    return f"{tenant}:{model}:p{prompt_version}:{digest}"
assert cache_key("t","m",1,b"x").startswith("t:m:p1:")
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 342. Сравните основной подход в теме «выносить долгую задачу из HTTP request в очередь» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Async job усложняет UX и consistency, зато request workers остаются responsive и work переживает рестарт. Durable queue отделяет HTTP latency от долгой работы, но добавляет eventual consistency, retries и операционный контур workers.

## 343. Почему Celery task должна быть idempotent, особенно с `acks_late`?

**Уровень:** Senior

**Ответ:**
`acks_late` подтверждает message после выполнения; при worker failure task может быть redelivered и выполниться повторно. Idempotent task делает повтор безопасным через idempotency key, unique constraint или state machine.

## 344. Какая типичная ошибка возникает при работе с темой «Celery task должна быть idempotent, особенно с acks_late» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Task `charge_card()` без dedup может списать деньги дважды. «Broker обещает один раз» — неверная assumption. Ищите duplicate execution, poison messages, stuck retries, queue lag, visibility/ack semantics и задачи без idempotency.

## 345. Как встроить решение по теме «Celery task должна быть idempotent, особенно с acks_late» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
Tool side effect worker сначала фиксирует idempotency record, затем вызывает provider и сохраняет outcome. Long-running agent jobs должны жить в durable worker plane с checkpoint, idempotency и DLQ/reconciliation, а не в create_task web-процесса.

```python
def idempotent_task(store:set[str], job_id:str)->str:
    if job_id in store: return "duplicate"
    store.add(job_id); return "done"
s=set(); assert idempotent_task(s,"j1")=="done"; assert idempotent_task(s,"j1")=="duplicate"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 346. Чем retry task отличается от redelivery broker?

**Уровень:** Senior

**Ответ:**
Application retry — осознанное повторение после классифицированной transient error с countdown/backoff; broker redelivery возникает из-за ack/worker lifecycle. Они могут наложиться, поэтому нужен общий attempt budget и idempotency.

## 347. Code review: какие скрытые дефекты вы бы искали в реализации темы «retry task отличается от redelivery broker»?

**Уровень:** Senior

**Ответ:**
Retries внутри task плюс redelivery после crash могут умножить число вызовов. Permanent validation error нельзя retry. Ищите duplicate execution, poison messages, stuck retries, queue lag, visibility/ack semantics и задачи без idempotency.

## 348. Как вы реализуете и будете наблюдать тему «retry task отличается от redelivery broker» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Provider 429 → task retry с Retry-After; worker crash → broker redelivery; оба проходят через один idempotency key. Long-running agent jobs должны жить в durable worker plane с checkpoint, idempotency и DLQ/reconciliation, а не в create_task web-процесса.

## 349. Как проектировать dead-letter queue?

**Уровень:** Senior

**Ответ:**
DLQ хранит сообщения, которые исчерпали retry или имеют poison payload, вместе с error reason, headers, attempts и original ID. Нужны alert, ownership, replay tooling и retention.

## 350. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «проектировать dead-letter queue»?

**Уровень:** Senior

**Ответ:**
DLQ без процесса разбора становится кладбищем. Автоматически replay все сообщения после fix опасно из-за устаревших side effects. Ищите duplicate execution, poison messages, stuck retries, queue lag, visibility/ack semantics и задачи без idempotency.

## 351. Какие production controls добавите вокруг темы «проектировать dead-letter queue» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Failed ingestion jobs сохраняют job status + DLQ event; replay проверяет текущую policy/version перед повтором. Long-running agent jobs должны жить в durable worker plane с checkpoint, idempotency и DLQ/reconciliation, а не в create_task web-процесса.

## 352. Как выбрать worker concurrency для I/O и CPU задач?

**Уровень:** Senior

**Ответ:**
Для CPU prefork/process concurrency обычно ограничивают cores/memory; для I/O можно выше, но downstream quotas/DB pool становятся bottleneck. Benchmark p95, queue lag, CPU, RSS и external errors.

## 353. Production debugging: какие failure modes характерны для темы «выбрать worker concurrency для I/O и CPU задач» и как их локализовать?

**Уровень:** Senior

**Ответ:**
Слишком высокая concurrency вызывает OOM, provider 429 и DB pool starvation; слишком низкая — растущий queue lag. Ищите duplicate execution, poison messages, stuck retries, queue lag, visibility/ack semantics и задачи без idempotency.

## 354. Как применить тему «выбрать worker concurrency для I/O и CPU задач» в production AI/LLM/agent backend?

**Уровень:** Senior

**Ответ:**
LLM API jobs и CPU embedding/OCR jobs разделите по worker pools и resource limits. Long-running agent jobs должны жить в durable worker plane с checkpoint, idempotency и DLQ/reconciliation, а не в create_task web-процесса.

## 355. Сравните основной подход в теме «Kafka topic/partition/consumer group отличаются» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Partition key сохраняет порядок entity, но может создать hot partition. Key выбирают по consistency boundary. Event log даёт replay и масштабирование consumers, но усложняет consistency и debugging; обычная task queue проще для command-style jobs.

## 356. Что даёт idempotent Kafka producer?

**Уровень:** Senior

**Ответ:**
Idempotent producer предотвращает дубли записи из-за producer retries в рамках Kafka guarantees; современные configs требуют совместимых acks/retries/in-flight settings. Это не делает downstream business side effect exactly-once.

## 357. Какая типичная ошибка возникает при работе с темой «Что даёт idempotent Kafka producer» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Consumer может обработать record дважды после rebalance/crash; внешний API вызов не участвует в Kafka transaction автоматически. Проверяйте partition skew, rebalance, duplicate processing, consumer lag, schema incompatibility и неверные ожидания global ordering.

## 358. Как встроить решение по теме «Что даёт idempotent Kafka producer» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
Событие tool_requested можно писать idempotently, но вызов внешнего payment tool всё равно защищают idempotency key. Agent lifecycle events можно partition по run_id, а side effects всё равно требуют idempotent consumer и transactional boundary.

## 359. At-most-once, at-least-once и exactly-once — что реально означает для backend?

**Уровень:** Senior

**Ответ:**
At-most-once допускает loss без duplicates; at-least-once допускает duplicates, но старается не терять; exactly-once обычно означает ограниченный transactional scope, а не магическую гарантию через arbitrary external systems.

## 360. Code review: какие скрытые дефекты вы бы искали в реализации темы «At-most-once, at-least-once и exactly-once — что реально означает для backend»?

**Уровень:** Senior

**Ответ:**
Маркетинговое «exactly once» часто заканчивается duplicate email/payment, потому что side effect находится вне broker transaction. Проверяйте partition skew, rebalance, duplicate processing, consumer lag, schema incompatibility и неверные ожидания global ordering.

## 361. Как вы реализуете и будете наблюдать тему «At-most-once, at-least-once и exactly-once — что реально означает для backend» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Agent workflow events доставляйте at-least-once и делайте state transition идемпотентным. Agent lifecycle events можно partition по run_id, а side effects всё равно требуют idempotent consumer и transactional boundary.

```python
def consume_once(processed:set[str], event_id:str, fn):
    if event_id in processed: return "duplicate"
    fn(); processed.add(event_id); return "ok"
s=set(); n={"x":0}
fn=lambda: n.__setitem__("x",n["x"]+1)
assert consume_once(s,"e1",fn)=="ok" and consume_once(s,"e1",fn)=="duplicate" and n["x"]==1
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 362. Что происходит при consumer group rebalance и почему это влияет на long processing?

**Уровень:** Senior

**Ответ:**
Rebalance перераспределяет partitions при membership/assignment changes. Долгая обработка без корректных heartbeats/poll может привести к revoke, duplicate processing и lag. Нужно настроить poll/processing model или отделить fetch от workers.

## 363. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «Что происходит при consumer group rebalance и почему это влияет на long processing»?

**Уровень:** Senior

**Ответ:**
Commit offset до side effect может потерять работу; после side effect — может повторить её. Это классическая граница delivery vs processing. Проверяйте partition skew, rebalance, duplicate processing, consumer lag, schema incompatibility и неверные ожидания global ordering.

## 364. Какие production controls добавите вокруг темы «Что происходит при consumer group rebalance и почему это влияет на long processing» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Не держите Kafka consumer на 10-минутном LLM job без продуманной offset/idempotency модели. Agent lifecycle events можно partition по run_id, а side effects всё равно требуют idempotent consumer и transactional boundary.

## 365. Сравните основной подход в теме «ошибки можно retry, а какие нельзя» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Senior

**Ответ:**
Retry повышает success probability ценой tail latency/load. Нужен attempts/deadline budget и exponential backoff+jitter. Повтор повышает availability только для transient failures; слишком агрессивный retry увеличивает latency и давление на уже больную dependency.

## 366. Когда решение из темы «exponential backoff нужен jitter» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Jitter снижает синхронизацию, но делает latency менее предсказуемой; upper bound и Retry-After сохраняют контроль. Повтор повышает availability только для transient failures; слишком агрессивный retry увеличивает latency и давление на уже больную dependency.

## 367. Как работает idempotency key для POST side effect?

**Уровень:** Senior

**Ответ:**
Client/оркестратор передаёт stable key для логической операции. Server атомарно сохраняет key + request fingerprint + status/result; повтор с тем же payload возвращает тот же outcome, с другим payload — conflict.

## 368. Code review: какие скрытые дефекты вы бы искали в реализации темы «работает idempotency key для POST side effect»?

**Уровень:** Senior

**Ответ:**
Просто хранить key после side effect оставляет crash window: side effect выполнен, key не записан. Нужна transaction/provider idempotency или state machine reconciliation. Главные риски — retry storm, повтор non-idempotent side effect, вложенные retries и отсутствие общего deadline.

## 369. Как вы реализуете и будете наблюдать тему «работает idempotency key для POST side effect» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Каждый destructive agent tool call получает operation_id, связанный с run/step, и не генерируется заново при retry. LLM/tool gateway должен иметь error taxonomy, exponential backoff с jitter, retry budget, idempotency keys и circuit breaking.

```python
import hashlib, json
def fingerprint(payload:dict)->str:
    raw=json.dumps(payload,sort_keys=True,separators=(",",":")).encode()
    return hashlib.sha256(raw).hexdigest()
store={}
def begin(key,payload):
    fp=fingerprint(payload)
    if key in store and store[key] != fp: raise ValueError("conflict")
    store.setdefault(key,fp); return fp
assert begin("k",{"x":1}) == begin("k",{"x":1})
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 370. Что такое circuit breaker и чем он отличается от retry?

**Уровень:** Senior

**Ответ:**
Circuit breaker (сёркит-брэ́йкер — автомат, временно прекращающий вызовы failing dependency) защищает систему от repeated doomed calls. Retry пытается восстановить отдельный request; breaker меняет поведение многих requests после failure threshold.

## 371. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «circuit breaker и чем он отличается от retry»?

**Уровень:** Senior

**Ответ:**
Breaker с global state может отключить healthy region/tenant; слишком короткий open interval вызывает flapping. Retry внутри open breaker бессмысленен. Главные риски — retry storm, повтор non-idempotent side effect, вложенные retries и отсутствие общего deadline.

## 372. Какие production controls добавите вокруг темы «circuit breaker и чем он отличается от retry» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
При падении primary LLM breaker открывает route и gateway отправляет подходящие requests на fallback model. LLM/tool gateway должен иметь error taxonomy, exponential backoff с jitter, retry budget, idempotency keys и circuit breaking.

```python
class Breaker:
    def __init__(self, threshold=2): self.failures=0; self.threshold=threshold; self.open=False
    def record_failure(self):
        self.failures += 1; self.open = self.failures >= self.threshold
b=Breaker(); b.record_failure(); assert not b.open; b.record_failure(); assert b.open
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 373. Что такое timeout budget/deadline propagation?

**Уровень:** Senior

**Ответ:**
Вместо независимых timeout каждый downstream получает remaining time от end-to-end deadline. Это предотвращает ситуацию, когда request уже просрочен, но сервис продолжает дорого работать.

## 374. Production debugging: какие failure modes характерны для темы «timeout budget/deadline propagation» и как их локализовать?

**Уровень:** Senior

**Ответ:**
Если downstream не знает remaining deadline, retries/tool calls переживают client cancellation и съедают capacity. Главные риски — retry storm, повтор non-idempotent side effect, вложенные retries и отсутствие общего deadline.

## 375. Как применить тему «timeout budget/deadline propagation» в production AI/LLM/agent backend?

**Уровень:** Senior

**Ответ:**
Agent orchestration перед каждым model/tool call вычисляет `remaining = deadline-now` и не стартует step, если budget недостаточен. LLM/tool gateway должен иметь error taxonomy, exponential backoff с jitter, retry budget, idempotency keys и circuit breaking.

## 376. Когда решение из темы «выбрать SSE, WebSocket или обычный streaming HTTP» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
SSE проще инфраструктурно и хорошо проходит HTTP proxies; WebSocket гибче, но stateful connections дороже масштабировать. SSE проще для server→client token stream; WebSocket нужен для двунаправленного realtime, но дороже по state и operations.

## 377. Что делать при client disconnect во время LLM stream?

**Уровень:** Senior

**Ответ:**
Нужно обнаружить cancellation/disconnect, отменить upstream generation если возможно, закрыть response/provider stream, освободить semaphore/connection и решить судьбу side effects. Cleanup размещают в `finally`.

## 378. Code review: какие скрытые дефекты вы бы искали в реализации темы «Что делать при client disconnect во время LLM stream»?

**Уровень:** Senior

**Ответ:**
Если продолжать generation после ухода клиента, вы платите tokens и держите capacity. Если бездумно cancel после уже начатого irreversible tool action, состояние может стать неопределённым.

## 379. Как вы реализуете и будете наблюдать тему «Что делать при client disconnect во время LLM stream» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Chat response отменяем; long agent job с persisted run продолжает worker, а WebSocket лишь перестаёт подписываться. Streaming ответа не должен означать streaming side effects: tool actions и durable state фиксируются отдельно от transport connection.

## 380. Как backpressure работает в streaming response?

**Уровень:** Senior

**Ответ:**
Producer не должен генерировать unbounded данные быстрее socket/client. Async iterator/ASGI send естественно await-ит downstream; дополнительные bounded queues ограничивают buffering. Нужно мониторить slow consumers.

## 381. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «backpressure работает в streaming response»?

**Уровень:** Senior

**Ответ:**
Unbounded buffer при медленном mobile client приводит к росту memory. Drop token chunks без protocol semantics портит ответ. Проверяйте backpressure, client disconnect, unbounded buffers, proxy timeouts, reconnect semantics и cleanup producer после cancellation.

## 382. Какие production controls добавите вокруг темы «backpressure работает в streaming response» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Между provider stream и SSE writer используйте bounded queue/await, а при долгом stall отменяйте request по policy. Streaming ответа не должен означать streaming side effects: tool actions и durable state фиксируются отдельно от transport connection.

## 383. Когда решение из темы «использовать pytest fixtures без скрытого shared state» перестаёт быть хорошим и почему?

**Уровень:** Senior

**Ответ:**
Широкий scope ускоряет suite, но повышает leakage риска. Разделяйте дорогую infrastructure и per-test state. Unit tests дают быстрый feedback, integration ловят реальные contracts, E2E проверяют путь пользователя, но дороже и flaky.

## 384. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «Что и как mock-ать в Python backend tests»?

**Уровень:** Senior

**Ответ:**
Fake часто лучше mock для stateful repository; contract/integration test нужен для real provider adapter. Unit tests дают быстрый feedback, integration ловят реальные contracts, E2E проверяют путь пользователя, но дороже и flaky.

## 385. Как тестировать async code и cancellation paths?

**Уровень:** Senior

**Ответ:**
Async test запускается event loop-aware pytest plugin или `asyncio.run` для pure unit. Тестируйте timeout/cancel, cleanup и отсутствие orphan tasks; используйте events/barriers вместо `sleep` для детерминизма.

## 386. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «тестировать async code и cancellation paths»?

**Уровень:** Senior

**Ответ:**
Tests с реальными задержками flaky и медленны. Проверка только happy path пропускает самый сложный lifecycle. Проверяйте, не замоканы ли именно те boundaries, где чаще всего ломается contract: SQL, HTTP, queue, serialization и timeouts.

## 387. Какие production controls добавите вокруг темы «тестировать async code и cancellation paths» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Создайте fake provider, который ждёт Event; отмените request и assert, что client close/semaphore release выполнены. Для AI backend отдельно фиксируйте provider/tool fakes и contract tests, а quality evals не подменяйте обычными backend tests.

## 388. Какой главный trade-off у темы «С чего начать оптимизацию медленного Python backend» и когда вы выберете альтернативный подход?

**Уровень:** Senior

**Ответ:**
Instrumentation имеет overhead, но без measurement оптимизация почти случайна. Начните с coarse profile, затем углубляйтесь. Кэширование и batching повышают throughput, но добавляют memory/latency и сложность invalidation; native extensions ускоряют CPU ценой portability.

## 389. Чем deterministic profiler отличается от sampling profiler?

**Уровень:** Senior

**Ответ:**
Deterministic profiler фиксирует события calls/returns и даёт детальную картину, но overhead выше. Sampling profiler периодически снимает stack и статистически оценивает hot paths с меньшим perturbation.

## 390. Представьте production-инцидент вокруг темы «deterministic profiler отличается от sampling profiler». Что вы проверите первым и почему?

**Уровень:** Senior

**Ответ:**
Profiler overhead способен изменить concurrency/latency. Sampling может пропустить очень короткие редкие функции. Сначала измеряйте CPU, allocation, blocking I/O, event-loop lag и external latency; оптимизация без профиля часто чинит не тот bottleneck.

## 391. Спроектируйте практическое применение темы «deterministic profiler отличается от sampling profiler» в сервисе AI-агентов.

**Уровень:** Senior

**Ответ:**
CPU spike в document parser сначала ловим sampling profiler, затем cProfile/line profiler на воспроизводимом case. В AI backend cost/latency часто доминируют model calls и context, поэтому Python micro-optimization имеет смысл только после end-to-end profiling.

## 392. Как диагностировать memory leak в long-running Python process?

**Уровень:** Senior

**Ответ:**
Смотрите RSS trend и Python allocations через tracemalloc/object counts; сравнивайте snapshots, ищите unbounded caches, retained tasks, references, queues и C-extension/native memory. GC collect не лечит удерживаемые references.

## 393. Какая типичная ошибка возникает при работе с темой «диагностировать memory leak в long-running Python process» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Рост RSS не всегда Python leak: allocator fragmentation/native libs могут не вернуть memory OS. Нельзя делать вывод только по `gc.collect()`. Сначала измеряйте CPU, allocation, blocking I/O, event-loop lag и external latency; оптимизация без профиля часто чинит не тот bottleneck.

## 394. Как встроить решение по теме «диагностировать memory leak в long-running Python process» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
Типичные AI leaks: хранить full traces/prompts в global list, не закрывать streams, unbounded embedding cache. В AI backend cost/latency часто доминируют model calls и context, поэтому Python micro-optimization имеет смысл только после end-to-end profiling.

```python
import tracemalloc
tracemalloc.start(); before=tracemalloc.take_snapshot(); data=[b"x"*1000 for _ in range(100)]; after=tracemalloc.take_snapshot(); stats=after.compare_to(before,"lineno"); assert stats; del data; tracemalloc.stop()
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 395. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «generator/streaming реально уменьшает memory footprint»?

**Уровень:** Senior

**Ответ:**
Streaming уменьшает peak memory и TTFT, но усложняет retries/transaction boundaries. Кэширование и batching повышают throughput, но добавляют memory/latency и сложность invalidation; native extensions ускоряют CPU ценой portability.

## 396. Сколько FastAPI/Uvicorn workers запускать и от чего это зависит?

**Уровень:** Senior

**Ответ:**
Нет формулы «2×CPU+1» для всех async AI services. Worker count зависит от CPU/RSS per worker, event-loop blocking, connection pools, Kubernetes replicas и external concurrency limits. Benchmark p95, throughput, CPU, RSS и provider quotas.

## 397. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «Сколько FastAPI/Uvicorn workers запускать и от чего это зависит»?

**Уровень:** Senior

**Ответ:**
Слишком много processes копируют model/cache memory и умножают DB connections. Один worker не использует multi-core для CPU hot paths и имеет меньшую fault isolation. Ищите restart storms, readiness до прогрева, незавершённые requests/jobs при deploy, неправильное worker count и connection-pool multiplication.

## 398. Какие production controls добавите вокруг темы «Сколько FastAPI/Uvicorn workers запускать и от чего это зависит» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
LLM gateway I/O-bound масштабируйте по concurrent requests/quotas; local model-heavy service имеет совсем другой process model. AI workloads стоит разделять на interactive и background pools с разными SLO, quotas и graceful-drain политиками.

## 399. Что должно происходить при startup/readiness/liveness?

**Уровень:** Senior

**Ответ:**
Startup инициализирует обязательные resources; readiness отвечает, можно ли принимать traffic; liveness — жив ли process и стоит ли его перезапускать. Временная недоступность DB не всегда означает, что liveness должна убить pod.

## 400. Production debugging: какие failure modes характерны для темы «Что должно происходить при startup/readiness/liveness» и как их локализовать?

**Уровень:** Senior

**Ответ:**
Одинаковый deep health check для liveness/readiness создаёт restart storm при outage dependency. Readiness не должна делать дорогой запрос на каждый probe. Ищите restart storms, readiness до прогрева, незавершённые requests/jobs при deploy, неправильное worker count и connection-pool multiplication.

## 401. Как применить тему «Что должно происходить при startup/readiness/liveness» в production AI/LLM/agent backend?

**Уровень:** Senior

**Ответ:**
Если model provider outage, gateway может оставаться live, readiness зависит от наличия fallback и product policy. AI workloads стоит разделять на interactive и background pools с разными SLO, quotas и graceful-drain политиками.

## 402. Как проектировать configuration/feature flags для безопасного rollout?

**Уровень:** Senior

**Ответ:**
Immutable config version фиксируется на run/request; feature flag имеет owner, targeting, default, expiry и audit. Для критичного model/tool routing нужен kill switch, который работает без redeploy.

## 403. Какая типичная ошибка возникает при работе с темой «проектировать configuration/feature flags для безопасного rollout» и как она проявится под нагрузкой?

**Уровень:** Senior

**Ответ:**
Изменение flag посреди multi-step run может дать mixed behavior. Zombie flags создают сложность и непроверенные комбинации. Ищите restart storms, readiness до прогрева, незавершённые requests/jobs при deploy, неправильное worker count и connection-pool multiplication.

## 404. Как встроить решение по теме «проектировать configuration/feature flags для безопасного rollout» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Senior

**Ответ:**
Model migration: assignment фиксируется на run, canary по tenant, а emergency flag мгновенно запрещает risky tool. AI workloads стоит разделять на interactive и background pools с разными SLO, quotas и graceful-drain политиками.

## 405. Как спроектировать backend вокруг внешнего LLM API, чтобы provider не протёк во весь код?

**Уровень:** Senior

**Ответ:**
Создайте собственный typed ModelClient port с минимальным общим contract, provider adapters и capability metadata. Application layer оперирует domain requests/results, а provider-specific fields остаются в adapter.

## 406. Code review: какие скрытые дефекты вы бы искали в реализации темы «спроектировать backend вокруг внешнего LLM API, чтобы provider не протёк во весь код»?

**Уровень:** Senior

**Ответ:**
Абстракция «унифицируем вообще все функции providers» превращается в lowest-common-denominator или гигантские if. Прямой SDK во всех services создаёт lock-in. Проверяйте provider quotas, model/tool retries, structured-output validation, cost explosion, prompt injection boundary и duplicate side effects.

## 407. Как вы реализуете и будете наблюдать тему «спроектировать backend вокруг внешнего LLM API, чтобы provider не протёк во весь код» в multi-tenant AI backend?

**Уровень:** Senior

**Ответ:**
Core `generate/stream/tool_call` contract + capability flags, а специфичный hosted tool оформляется отдельным port. Core backend должен моделировать runs, model/tool budgets, tracing, policy и durable state независимо от конкретного LLM SDK.

```python
import asyncio
from typing import Protocol
class ModelClient(Protocol):
    async def generate(self, prompt:str)->str: ...
class FakeClient:
    async def generate(self,prompt:str)->str: return "ok"
async def run(c:ModelClient): return await c.generate("hi")
assert asyncio.run(run(FakeClient())) == "ok"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 408. Как контролировать concurrency, rate limits и cost при массовых LLM calls?

**Уровень:** Senior

**Ответ:**
Нужны несколько независимых budget layers: per-request fan-out, process semaphore, tenant quota, provider token/RPM limits и global cost budget. Scheduler учитывает estimated tokens и Retry-After, а metrics дают usage attribution.

## 409. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «контролировать concurrency, rate limits и cost при массовых LLM calls»?

**Уровень:** Senior

**Ответ:**
Один semaphore защищает только process; один RPS limiter игнорирует огромные prompts. Retry storm способен удвоить cost. Проверяйте provider quotas, model/tool retries, structured-output validation, cost explosion, prompt injection boundary и duplicate side effects.

## 410. Какие production controls добавите вокруг темы «контролировать concurrency, rate limits и cost при массовых LLM calls» в автономном AI-agent сервисе?

**Уровень:** Senior

**Ответ:**
Batch evaluation jobs идут low-priority queue, interactive chat имеет reserved capacity, high-risk agent tools — отдельный concurrency pool. Core backend должен моделировать runs, model/tool budgets, tracing, policy и durable state независимо от конкретного LLM SDK.

```python
import asyncio
async def bounded_calls(n:int, limit:int):
    sem=asyncio.Semaphore(limit); active=0; peak=0
    lock=asyncio.Lock()
    async def one():
        nonlocal active, peak
        async with sem:
            async with lock: active+=1; peak=max(peak,active)
            await asyncio.sleep(0)
            async with lock: active-=1
    await asyncio.gather(*(one() for _ in range(n)))
    return peak
assert asyncio.run(bounded_calls(20,3)) <= 3
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 411. Какой главный trade-off у темы «безопасно реализовать structured output от LLM в backend pipeline» и когда вы выберете альтернативный подход?

**Уровень:** Senior

**Ответ:**
Strict schema повышает reliability, но усложняет schema evolution и может увеличить retries у слабой модели. Абстракция provider снижает lock-in, но не должна скрывать capability differences; дешёвый model routing требует quality gates.

## 412. Как изменится ваше решение по теме «решить 4Sum без дубликатов и какова сложность» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Hash-based варианты используют больше памяти и сложнее дедуплицируются. Sorted two-pointer проще объяснить и предсказуем по памяти. Оценивайте не только скорость, но и понятность ownership, объём копирований, hashability и риск shared mutable state.

## 413. Какой главный trade-off у темы «работает MRO и super() при множественном наследовании» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Multiple inheritance полезен для mixins с узким контрактом; composition обычно проще для сервисов с состоянием и I/O. Composition/Protocol обычно делают зависимости явнее; inheritance оправдан, когда есть стабильное is-a отношение и общий lifecycle.

## 414. Сравните основной подход в теме «__getattr__ отличается от __getattribute__» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Lead

**Ответ:**
Magic proxy гибок, но ухудшает typing и discoverability. Явные adapters надёжнее в больших codebases. Composition/Protocol обычно делают зависимости явнее; inheritance оправдан, когда есть стабильное is-a отношение и общий lifecycle.

## 415. Как изменится ваше решение по теме «SOLID применять в Python без Java-style overengineering» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Абстракция окупается, если есть несколько реализаций, тестовая подмена или ожидаемая миграция provider/storage. Composition/Protocol обычно делают зависимости явнее; inheritance оправдан, когда есть стабильное is-a отношение и общий lifecycle.

## 416. Сравните основной подход в теме «Что нового дала type parameter syntax Python 3.12+» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Lead

**Ответ:**
Новый синтаксис чище, старый совместим с большим диапазоном Python. Решение зависит от minimum supported version. Более строгие schemas повышают safety и evolvability API, но требуют versioning и аккуратной совместимости клиентов.

## 417. Как изменится ваше решение по теме «Protocol и когда он лучше ABC» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Protocol снижает coupling к concrete class; ABC полезен, если нужен shared implementation или runtime registration. Более строгие schemas повышают safety и evolvability API, но требуют versioning и аккуратной совместимости клиентов.

## 418. Когда решение из темы «Что делают send, throw и close у generator» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Generator protocol мощный, но async generators/queues обычно яснее для современного I/O pipeline. Lazy pipeline снижает peak memory, но усложняет lifecycle, error handling и повторный проход по данным.

## 419. Когда решение из темы «ExceptionGroup и except*» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Group preserves full failure information, но требует осознанной aggregation policy. Для user-facing response всё равно нужен один итоговый outcome. Богатая typed error model улучшает recovery и observability, но слишком глубокая иерархия усложняет boundary mapping.

## 420. Как изменится ваше решение по теме «backpressure и как реализовать его через asyncio.Queue» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Blocking backpressure сохраняет работу, но увеличивает latency; иногда лучше reject/drop по SLO. Политика зависит от ценности сообщения. Async даёт высокий I/O concurrency при малом числе threads, но требует async-compatible drivers и дисциплины cancellation.

## 421. Какой главный trade-off у темы «asyncio.TaskGroup предпочтительнее набора create_task для связанной работы» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
TaskGroup хорош для logically related all-or-fail work; независимые background jobs лучше отправлять в durable queue. Structured concurrency упрощает ownership дочерних задач, но требует продуманной политики partial failure и cancellation propagation.

## 422. Сравните основной подход в теме «правильно обрабатывать CancelledError» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Lead

**Ответ:**
Иногда cancellation shield нужна для короткого critical cleanup/commit, но это увеличивает shutdown latency и должно быть ограничено. Structured concurrency упрощает ownership дочерних задач, но требует продуманной политики partial failure и cancellation propagation.

## 423. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «нужен asyncio.shield() и почему он опасен»?

**Уровень:** Lead

**Ответ:**
Надёжнее проектировать idempotent/resumable operation, чем широко shield. Shield — локальный exception to cancellation policy. Structured concurrency упрощает ownership дочерних задач, но требует продуманной политики partial failure и cancellation propagation.

## 424. Как изменится ваше решение по теме «сделать graceful shutdown asyncio-сервиса» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Drain повышает корректность, но замедляет rollout. Для long jobs нужны queue visibility/checkpoint, чтобы не держать pod бесконечно. Structured concurrency упрощает ownership дочерних задач, но требует продуманной политики partial failure и cancellation propagation.

## 425. Когда решение из темы «Что изменилось с free-threaded CPython 3.13+» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Можно получить CPU scaling threads, но есть memory/single-thread overhead и ecosystem compatibility. Production migration требует benchmarks и race tests. Threads дешевле и разделяют память, processes/interpreters дают CPU parallelism ценой IPC, startup и memory overhead.

## 426. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «InterpreterPoolExecutor Python 3.14 и чем он отличается от process pool»?

**Уровень:** Lead

**Ответ:**
ProcessPool имеет сильнее OS isolation и зрелый operational model; interpreters потенциально дешевле, но требуют нового mental model. Threads дешевле и разделяют память, processes/interpreters дают CPU parallelism ценой IPC, startup и memory overhead.

## 427. Как изменится ваше решение по теме «shared dict между threads не стоит считать безопасной бизнес-транзакцией даже при GIL» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
In-process Lock прост, но не работает между processes/pods. Distributed invariant должен жить в DB/Redis/queue transactional boundary. Threads дешевле и разделяют память, processes/interpreters дают CPU parallelism ценой IPC, startup и memory overhead.

## 428. Как изменится ваше решение по теме «lifespan важнее старых startup/shutdown handlers в современном FastAPI» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Lifespan централизует lifecycle, но long initialization увеличивает startup/readiness time. Тяжёлые assets иногда прогревают отдельно. FastAPI удобен для typed async API, но framework не заменяет отдельный durable worker и не делает blocking SDK асинхронным.

## 429. Какой главный trade-off у темы «структурировать production FastAPI project, чтобы он не превратился в набор fat routers» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Чистые boundaries дают тестируемость и заменяемость, но добавляют wiring. Архитектура должна соответствовать размеру команды и variation points. Строгие response/input models улучшают contract, но требуют versioning и отделения persistence/provider schemas от public API.

## 430. Как изменится ваше решение по теме «FastAPI BackgroundTasks достаточно, а когда нужен Celery/queue worker» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
In-process проще и быстрее; queue добавляет broker, serialization и eventual consistency, но даёт durability/backpressure/retry. Строгие response/input models улучшают contract, но требуют versioning и отделения persistence/provider schemas от public API.

## 431. Как изменится ваше решение по теме «версионировать публичный REST API» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
URL version прост и видим; header чище URI, но хуже tooling/discovery. Выберите один стандарт. Удобство API нужно балансировать с стабильным contract: слишком общий endpoint быстро превращается в невалидируемый RPC.

## 432. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «реализовать rate limiting для multi-tenant API»?

**Уровень:** Lead

**Ответ:**
Gateway limiter централизован, application limiter знает бизнес-cost. Для LLM полезно лимитировать не только RPS, но tokens/cost/concurrency. Stateless JWT масштабируется проще, но revocation и fine-grained policy сложнее; server-side/session state даёт больший контроль ценой stateful infrastructure.

## 433. Как изменится ваше решение по теме «SSRF и почему backend AI-agent особенно подвержен ему» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Строгий allowlist ограничивает flexibility, но tools с network access должны иметь минимальный egress. Generic fetcher — высокий риск. Stateless JWT масштабируется проще, но revocation и fine-grained policy сложнее; server-side/session state даёт больший контроль ценой stateful infrastructure.

## 434. Как изменится ваше решение по теме «читать EXPLAIN ANALYZE и на что смотреть в первую очередь» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Planner выбирает global cheapest plan по statistics; index hint mindset из других СУБД переносить напрямую не стоит. SQL pushdown уменьшает сетевые round trips, но сложный запрос может стать трудно поддерживаемым; иногда materialization или precomputation дешевле.

## 435. Сравните основной подход в теме «PostgreSQL MVCC позволяет reads не блокировать writes» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Lead

**Ответ:**
MVCC даёт concurrency ценой хранения версий/vacuum и необходимости понимать isolation snapshots. Более сильная consistency упрощает invariants, но снижает concurrency; optimistic control хорош при редких конфликтах, pessimistic — при дорогих race.

## 436. Когда решение из темы «Read Committed, Repeatable Read и Serializable отличаются в PostgreSQL» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Более сильная isolation упрощает reasoning, но увеличивает abort/coordination cost. Часто constraints/atomic SQL достаточно Read Committed. Более сильная consistency упрощает invariants, но снижает concurrency; optimistic control хорош при редких конфликтах, pessimistic — при дорогих race.

## 437. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «возникает deadlock и как с ним бороться»?

**Уровень:** Lead

**Ответ:**
Строгий lock order требует дисциплины, optimistic approaches уменьшают blocking, но добавляют retries. Более сильная consistency упрощает invariants, но снижает concurrency; optimistic control хорош при редких конфликтах, pessimistic — при дорогих race.

## 438. Как изменится ваше решение по теме «выбирать порядок колонок composite B-tree index» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Широкий covering index ускоряет read, но дороже insert/update. Partial index полезен для hot subset. Более сильная consistency упрощает invariants, но снижает concurrency; optimistic control хорош при редких конфликтах, pessimistic — при дорогих race.

## 439. Когда решение из темы «один AsyncSession нельзя использовать одновременно в нескольких asyncio tasks» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Отдельные sessions увеличивают connections; shared session экономила бы pool, но нарушает correctness. Ограничивайте concurrency pool/semaphore. ORM ускоряет delivery и domain mapping, raw SQL даёт контроль hot paths; смешанный подход часто оптимален.

## 440. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «lazy loading и почему оно особенно опасно в async ORM»?

**Уровень:** Lead

**Ответ:**
Lazy удобно для простого interactive ORM, но production API выигрывает от explicit query shape. ORM ускоряет delivery и domain mapping, raw SQL даёт контроль hot paths; смешанный подход часто оптимален.

## 441. Как изменится ваше решение по теме «ORM хуже raw SQL» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
ORM повышает maintainability, raw SQL даёт полный контроль. Можно смешивать в одном repository layer. ORM ускоряет delivery и domain mapping, raw SQL даёт контроль hot paths; смешанный подход часто оптимален.

## 442. Как безопасно делать database migrations при zero-downtime deployment?

**Уровень:** Lead

**Ответ:**
Используйте expand-migrate-contract: сначала backward-compatible schema, затем deploy code, backfill, переключение reads/writes и только потом удаление старого. Большие DDL/backfill дробят и мониторят locks.

## 443. Production debugging: какие failure modes характерны для темы «безопасно делать database migrations при zero-downtime deployment» и как их локализовать?

**Уровень:** Lead

**Ответ:**
Одновременный rename/drop column ломает старые pods. Огромный update в одной transaction блокирует/раздувает WAL. Ищите shared Session/AsyncSession между concurrent tasks, implicit lazy I/O, pool exhaustion и transaction scope, растянутый на внешний API call.

## 444. Какой главный trade-off у темы «безопасно делать database migrations при zero-downtime deployment» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Медленная многошаговая migration сложнее операционно, но позволяет rolling deploy без остановки. ORM ускоряет delivery и domain mapping, raw SQL даёт контроль hot paths; смешанный подход часто оптимален.

## 445. Как применить тему «безопасно делать database migrations при zero-downtime deployment» в production AI/LLM/agent backend?

**Уровень:** Lead

**Ответ:**
При изменении agent state schema поддерживайте чтение старой и новой версии, затем background migrate checkpoints. Agent state persistence должна иметь короткие DB transactions; медленный LLM/tool call не следует держать внутри открытой транзакции.

## 446. Когда решение из темы «cache stampede и как его предотвращать» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Serving stale снижает origin load и latency, но допускает устаревшие данные. Выбор зависит freshness SLO. Cache снижает latency и load, но добавляет invalidation/consistency complexity; distributed locks требуют TTL, ownership и fencing semantics.

## 447. Как изменится ваше решение по теме «работает optimistic locking Redis WATCH/MULTI/EXEC» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
WATCH прост для редких conflicts; Lua/script/atomic data type часто лучше для короткой серверной операции. Cache снижает latency и load, но добавляет invalidation/consistency complexity; distributed locks требуют TTL, ownership и fencing semantics.

## 448. Какой главный trade-off у темы «выбирать TTL и cache key для multi-tenant AI backend» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Более granular key снижает hit rate, но повышает correctness/isolation. Иногда кэшируют intermediate deterministic layers, а не финальный answer. Cache снижает latency и load, но добавляет invalidation/consistency complexity; distributed locks требуют TTL, ownership и fencing semantics.

## 449. Когда решение из темы «Celery task должна быть idempotent, особенно с acks_late» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Early ack снижает duplicates, но может потерять work при crash; late ack повышает durability ценой duplicate execution risk. Durable queue отделяет HTTP latency от долгой работы, но добавляет eventual consistency, retries и операционный контур workers.

## 450. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «retry task отличается от redelivery broker»?

**Уровень:** Lead

**Ответ:**
Application retry знает domain/error semantics; broker retry защищает delivery. Настраивают совместно. Durable queue отделяет HTTP latency от долгой работы, но добавляет eventual consistency, retries и операционный контур workers.

## 451. Как изменится ваше решение по теме «проектировать dead-letter queue» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
DLQ предотвращает блокировку основной очереди, но требует операционного процесса. Иногда terminal failure лучше сразу записать в DB state. Durable queue отделяет HTTP latency от долгой работы, но добавляет eventual consistency, retries и операционный контур workers.

## 452. Какой главный trade-off у темы «выбрать worker concurrency для I/O и CPU задач» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Autoscaling по queue depth помогает, но lagging metric и cold start нужно учитывать. Отдельные queues/pools для разных workload classes лучше одного универсального. Durable queue отделяет HTTP latency от долгой работы, но добавляет eventual consistency, retries и операционный контур workers.

## 453. Когда решение из темы «Что даёт idempotent Kafka producer» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Producer idempotence улучшает log correctness; end-to-end exactly-once требует transactions/consumer design и остаётся ограниченным границами Kafka. Event log даёт replay и масштабирование consumers, но усложняет consistency и debugging; обычная task queue проще для command-style jobs.

## 454. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «At-most-once, at-least-once и exactly-once — что реально означает для backend»?

**Уровень:** Lead

**Ответ:**
At-least-once + idempotent consumer — практичный default. Exactly-once Kafka полезен для consume-transform-produce внутри Kafka. Event log даёт replay и масштабирование consumers, но усложняет consistency и debugging; обычная task queue проще для command-style jobs.

## 455. Как изменится ваше решение по теме «Что происходит при consumer group rebalance и почему это влияет на long processing» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Long processing можно делать worker pool с pause/backpressure или queue layer, но усложняется ordering/commit. Event log даёт replay и масштабирование consumers, но усложняет consistency и debugging; обычная task queue проще для command-style jobs.

## 456. Как эволюционировать event schema без остановки consumers?

**Уровень:** Lead

**Ответ:**
События — публичный контракт. Используйте backward/forward compatible changes: добавлять optional/default fields, version/schema registry, tolerant readers и staged rollout. Breaking change — новый version/topic или dual-publish период.

## 457. Production debugging: какие failure modes характерны для темы «эволюционировать event schema без остановки consumers» и как их локализовать?

**Уровень:** Lead

**Ответ:**
Удаление/переименование поля ломает старого consumer. «JSON без schema» не избавляет от compatibility, а скрывает её. Проверяйте partition skew, rebalance, duplicate processing, consumer lag, schema incompatibility и неверные ожидания global ordering.

## 458. Какой главный trade-off у темы «эволюционировать event schema без остановки consumers» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Schema registry/Avro/Protobuf повышают дисциплину, но добавляют tooling. JSON Schema тоже работает при строгом governance. Event log даёт replay и масштабирование consumers, но усложняет consistency и debugging; обычная task queue проще для command-style jobs.

## 459. Как применить тему «эволюционировать event schema без остановки consumers» в production AI/LLM/agent backend?

**Уровень:** Lead

**Ответ:**
Agent event `tool_completed` должен поддерживать старые consumers dashboards во время добавления cost/trace fields. Agent lifecycle events можно partition по run_id, а side effects всё равно требуют idempotent consumer и transactional boundary.

## 460. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «работает idempotency key для POST side effect»?

**Уровень:** Lead

**Ответ:**
Хранение результатов требует TTL/storage и semantics для in-progress. Зато безопасные retries критичны для payments/tools. Повтор повышает availability только для transient failures; слишком агрессивный retry увеличивает latency и давление на уже больную dependency.

## 461. Как изменится ваше решение по теме «circuit breaker и чем он отличается от retry» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Breaker уменьшает load и latency во время outage, но создаёт false negatives при плохой настройке. Нужны half-open probes и metrics. Повтор повышает availability только для transient failures; слишком агрессивный retry увеличивает latency и давление на уже больную dependency.

## 462. Какой главный trade-off у темы «timeout budget/deadline propagation» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Жёсткий deadline защищает SLO, но может снизить completion rate для long-tail задач. Long operations переводят в async job. Повтор повышает availability только для transient failures; слишком агрессивный retry увеличивает latency и давление на уже больную dependency.

## 463. Как проектировать graceful degradation AI backend?

**Уровень:** Lead

**Ответ:**
Определите tiers: primary model/tool → cheaper/fallback provider → cached/partial response → explicit unavailable. Degradation должна сохранять safety/permissions и быть наблюдаемой, а не молча ухудшать semantics.

## 464. Представьте production-инцидент вокруг темы «проектировать graceful degradation AI backend». Что вы проверите первым и почему?

**Уровень:** Lead

**Ответ:**
Fallback model может не поддерживать tool schema/context length и дать более опасный ответ. Cache может быть stale. Главные риски — retry storm, повтор non-idempotent side effect, вложенные retries и отсутствие общего deadline.

## 465. Сравните основной подход в теме «проектировать graceful degradation AI backend» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Lead

**Ответ:**
Fallback повышает availability, но усложняет eval/compatibility/cost. Для некоторых high-risk flows правильнее fail closed. Повтор повышает availability только для transient failures; слишком агрессивный retry увеличивает latency и давление на уже больную dependency.

## 466. Спроектируйте практическое применение темы «проектировать graceful degradation AI backend» в сервисе AI-агентов.

**Уровень:** Lead

**Ответ:**
В support assistant при outage можно отключить action tools и оставить read-only retrieval; financial agent лучше остановить действия полностью. LLM/tool gateway должен иметь error taxonomy, exponential backoff с jitter, retry budget, idempotency keys и circuit breaking.

## 467. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «Что делать при client disconnect во время LLM stream»?

**Уровень:** Lead

**Ответ:**
Cancellation экономит ресурсы, но некоторые jobs должны продолжаться как durable run. Это должно быть продуктовой semantics, а не случайностью transport. SSE проще для server→client token stream; WebSocket нужен для двунаправленного realtime, но дороже по state и operations.

## 468. Как изменится ваше решение по теме «backpressure работает в streaming response» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Минимальный buffer снижает память, но связывает provider throughput с client speed. Иногда stream агрегируют небольшими chunks. SSE проще для server→client token stream; WebSocket нужен для двунаправленного realtime, но дороже по state и operations.

## 469. Как проектировать resumable stream после reconnect?

**Уровень:** Lead

**Ответ:**
Нужен event ID/sequence и durable или bounded replay buffer; клиент присылает last seen ID, server продолжает с следующего. Для одноразовых model tokens часто проще перезапустить/показать final persisted response, чем гарантировать replay каждого token.

## 470. Production debugging: какие failure modes характерны для темы «проектировать resumable stream после reconnect» и как их локализовать?

**Уровень:** Lead

**Ответ:**
Если sequence только в памяти pod, reconnect на другой pod теряет позицию. Повтор side-effect events при replay опасен. Проверяйте backpressure, client disconnect, unbounded buffers, proxy timeouts, reconnect semantics и cleanup producer после cancellation.

## 471. Какой главный trade-off у темы «проектировать resumable stream после reconnect» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Durable event log повышает надёжность и стоимость. Решите, что является source of truth: token stream или run events/final output. SSE проще для server→client token stream; WebSocket нужен для двунаправленного realtime, но дороже по state и operations.

## 472. Как применить тему «проектировать resumable stream после reconnect» в production AI/LLM/agent backend?

**Уровень:** Lead

**Ответ:**
Long agent run сохраняет typed events в DB/stream, а UI SSE может reconnect по event_seq без повторного выполнения tools. Streaming ответа не должен означать streaming side effects: tool actions и durable state фиксируются отдельно от transport connection.

## 473. Как изменится ваше решение по теме «тестировать async code и cancellation paths» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Deterministic synchronization сложнее написать, но даёт стабильные race tests. Иногда нужен stress test многократно. Unit tests дают быстрый feedback, integration ловят реальные contracts, E2E проверяют путь пользователя, но дороже и flaky.

## 474. Сравните основной подход в теме «deterministic profiler отличается от sampling profiler» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Lead

**Ответ:**
Для production-like нагрузки sampling часто безопаснее; локальный deterministic profile полезен после локализации hot path. Кэширование и batching повышают throughput, но добавляют memory/latency и сложность invalidation; native extensions ускоряют CPU ценой portability.

## 475. Когда решение из темы «диагностировать memory leak в long-running Python process» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Restart workers маскирует leak и может быть временным safeguard, но root cause остаётся. Memory limits защищают cluster. Кэширование и batching повышают throughput, но добавляют memory/latency и сложность invalidation; native extensions ускоряют CPU ценой portability.

## 476. Как изменится ваше решение по теме «Сколько FastAPI/Uvicorn workers запускать и от чего это зависит» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
В Kubernetes часто меньше workers на pod + больше replicas упрощают autoscaling; pre-fork может быть полезен вне orchestration. Больше workers повышает concurrency до внешнего bottleneck, но умножает RSS и DB/provider connections; autoscaling не заменяет capacity limits.

## 477. Какой главный trade-off у темы «Что должно происходить при startup/readiness/liveness» и когда вы выберете альтернативный подход?

**Уровень:** Lead

**Ответ:**
Fail-fast startup хорош для обязательной config, но external transient dependency иногда лучше проверять readiness и retry connection. Больше workers повышает concurrency до внешнего bottleneck, но умножает RSS и DB/provider connections; autoscaling не заменяет capacity limits.

## 478. Как делать graceful rolling deployment web + workers?

**Уровень:** Lead

**Ответ:**
Новые instances проходят readiness после init, старые сначала исключаются из traffic, drain requests/jobs, получают termination signal и закрывают resources в bounded grace period. Queue jobs должны быть ack/checkpoint-safe.

## 479. Представьте production-инцидент вокруг темы «делать graceful rolling deployment web + workers». Что вы проверите первым и почему?

**Уровень:** Lead

**Ответ:**
Kill сразу после SIGTERM создаёт dropped streams и duplicate tasks. Слишком длинный grace блокирует rollout и node drain. Ищите restart storms, readiness до прогрева, незавершённые requests/jobs при deploy, неправильное worker count и connection-pool multiplication.

## 480. Сравните основной подход в теме «делать graceful rolling deployment web + workers» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Lead

**Ответ:**
Long jobs лучше durable/checkpointed, чем держать pod alive час. Web streaming требует connection drain policy. Больше workers повышает concurrency до внешнего bottleneck, но умножает RSS и DB/provider connections; autoscaling не заменяет capacity limits.

## 481. Спроектируйте практическое применение темы «делать graceful rolling deployment web + workers» в сервисе AI-агентов.

**Уровень:** Lead

**Ответ:**
Agent run сохраняет checkpoint и может resume на новом worker; HTTP SSE client reconnect-ится по run events. AI workloads стоит разделять на interactive и background pools с разными SLO, quotas и graceful-drain политиками.

## 482. Когда решение из темы «проектировать configuration/feature flags для безопасного rollout» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Dynamic flags ускоряют mitigation/canary, но требуют governance и testing. Не всё должно быть runtime flag. Больше workers повышает concurrency до внешнего bottleneck, но умножает RSS и DB/provider connections; autoscaling не заменяет capacity limits.

## 483. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «спроектировать backend вокруг внешнего LLM API, чтобы provider не протёк во весь код»?

**Уровень:** Lead

**Ответ:**
Тонкий adapter облегчает migration/tests, но advanced provider features иногда требуют explicit capability extension. Абстракция provider снижает lock-in, но не должна скрывать capability differences; дешёвый model routing требует quality gates.

## 484. Как изменится ваше решение по теме «контролировать concurrency, rate limits и cost при массовых LLM calls» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Жёсткие quotas защищают платформу, но могут ухудшить burst UX. Token bucket и priority queues позволяют контролируемый burst. Абстракция provider снижает lock-in, но не должна скрывать capability differences; дешёвый model routing требует quality gates.

## 485. Как строить NL-to-SQL backend, чтобы latency, security и correctness были приемлемы?

**Уровень:** Lead

**Ответ:**
Разделите generation и execution. Модель получает ограниченную schema/context, SQL парсится/валидируется, разрешены read-only statements/allowlisted schemas, отдельная DB role, row/time limits и audit. Для сложных queries можно approval.

## 486. Представьте production-инцидент вокруг темы «строить NL-to-SQL backend, чтобы latency, security и correctness были приемлемы». Что вы проверите первым и почему?

**Уровень:** Lead

**Ответ:**
Главный риск — считать generated SQL обычным trusted query: data exfiltration, expensive scans, injection через schema/context. Также ответ может быть синтаксически валиден, но семантически неверен.

## 487. Сравните основной подход в теме «строить NL-to-SQL backend, чтобы latency, security и correctness были приемлемы» с ближайшей альтернативой по correctness, latency и complexity.

**Уровень:** Lead

**Ответ:**
Sandbox/read replica повышают безопасность ценой freshness/infra. Predefined semantic layer безопаснее raw SQL, но ограничивает expressiveness. Абстракция provider снижает lock-in, но не должна скрывать capability differences; дешёвый model routing требует quality gates.

## 488. Спроектируйте практическое применение темы «строить NL-to-SQL backend, чтобы latency, security и correctness были приемлемы» в сервисе AI-агентов.

**Уровень:** Lead

**Ответ:**
Backend кэширует schema metadata, генерирует SQL, validates AST, выполняет read-only transaction с timeout, затем LLM объясняет bounded result. Core backend должен моделировать runs, model/tool budgets, tracing, policy и durable state независимо от конкретного LLM SDK.

```python
import sqlite3
ALLOWED={"users","orders"}
def safe_table(name:str)->str:
    if name not in ALLOWED: raise ValueError("table not allowed")
    return name
assert safe_table("users") == "users"
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.

## 489. Спроектируйте Python backend для 100+ AI-агентов с streaming, tools, memory и durable jobs.

**Уровень:** Lead

**Ответ:**
Разделите synchronous API/data plane и durable execution plane. API gateway/FastAPI делает auth, quotas, request validation и stream subscription; orchestrator workers ведут state/checkpoints; DB — source of truth, Redis — cache/rate limit, queue/event log — jobs/events, tool gateway — policy/idempotency. Общие clients/pools lifecycle-managed, telemetry end-to-end.

## 490. Какая типичная ошибка возникает при работе с темой «Python backend для 100+ AI-агентов с streaming, tools, memory и durable jobs.» и как она проявится под нагрузкой?

**Уровень:** Lead

**Ответ:**
Монолитный web worker с `create_task` теряет jobs при deploy, смешивает quotas и не масштабирует CPU/I/O независимо. Shared tenant state без isolation создаёт security risk. Начинайте с failure domains, source of truth, idempotency, tenant isolation, queue lag, dependency quotas и rollback, а не с количества микросервисов.

## 491. Когда решение из темы «Python backend для 100+ AI-агентов с streaming, tools, memory и durable jobs.» перестаёт быть хорошим и почему?

**Уровень:** Lead

**Ответ:**
Больше сервисов повышает fault isolation и independent scaling, но добавляет distributed complexity. Начинайте с modular monolith + durable worker и разделяйте по измеряемым bottlenecks.

## 492. Как встроить решение по теме «Python backend для 100+ AI-агентов с streaming, tools, memory и durable jobs.» в FastAPI/worker pipeline для LLM-системы?

**Уровень:** Lead

**Ответ:**
Ключевые SLO: task success, p95 first-token/end-to-end, queue lag, duplicate side effects, cost/task. Все mutations имеют idempotency и audit. Для 100+ агентов platform layer должна стандартизировать auth, model/tool gateways, durable execution, observability, budgets и schema/version governance.

## 493. Как выбрать границы microservices в AI platform и не получить distributed monolith?

**Уровень:** Lead

**Ответ:**
Граница должна иметь отдельный lifecycle, ownership, scaling/security profile и устойчивый contract. Не делите по классам `prompt-service`, `validator-service`, если каждый request синхронно ходит через 12 hops. Сначала domain/capability boundaries.

## 494. Code review: какие скрытые дефекты вы бы искали в реализации темы «выбрать границы microservices в AI platform и не получить distributed monolith»?

**Уровень:** Lead

**Ответ:**
Слишком мелкие services увеличивают latency, retries, tracing и deployment coordination; один giant service ограничивает ownership/scaling. Начинайте с failure domains, source of truth, idempotency, tenant isolation, queue lag, dependency quotas и rollback, а не с количества микросервисов.

## 495. Какие архитектурные компромиссы нужно проговорить на Senior/Lead уровне для темы «выбрать границы microservices в AI platform и не получить distributed monolith»?

**Уровень:** Lead

**Ответ:**
Modular monolith дешевле до появления независимых scaling/ownership needs. Service extraction должен решать конкретную проблему. Модульный монолит дешевле операционно; сервисное разделение оправдано независимым scaling, security boundary или ownership, подтверждёнными нагрузкой.

## 496. Как вы реализуете и будете наблюдать тему «выбрать границы microservices в AI platform и не получить distributed monolith» в multi-tenant AI backend?

**Уровень:** Lead

**Ответ:**
Tool execution с privileged network policy может быть отдельным service; prompt formatting обычно остаётся library/application module. Для 100+ агентов platform layer должна стандартизировать auth, model/tool gateways, durable execution, observability, budgets и schema/version governance.

## 497. Как провести capacity planning для Python AI backend?

**Уровень:** Lead

**Ответ:**
Начните с arrival rate, concurrency по Little’s Law, service-time distribution, tokens/request, provider quotas, DB/Redis pools, worker CPU/RSS и queue lag SLO. Load test representative mixes и failure modes, закладывайте headroom.

## 498. Какие edge cases и failure scenarios нужно обязательно протестировать для темы «провести capacity planning для Python AI backend»?

**Уровень:** Lead

**Ответ:**
Средняя latency/RPS скрывают burst и p99. Масштабировать pods без увеличения provider/DB quota может только усилить throttling. Начинайте с failure domains, source of truth, idempotency, tenant isolation, queue lag, dependency quotas и rollback, а не с количества микросервисов.

## 499. Как изменится ваше решение по теме «провести capacity planning для Python AI backend» при росте нагрузки в 100 раз?

**Уровень:** Lead

**Ответ:**
Provisioning на peak дорого; autoscaling снижает cost, но cold starts/queue delay требуют reserved baseline. External bottlenecks задают верхнюю границу. Модульный монолит дешевле операционно; сервисное разделение оправдано независимым scaling, security boundary или ownership, подтверждёнными нагрузкой.

## 500. Какие production controls добавите вокруг темы «провести capacity planning для Python AI backend» в автономном AI-agent сервисе?

**Уровень:** Lead

**Ответ:**
Отдельно моделируйте interactive streams, batch eval/embedding и long agent jobs: у них разные service time и приоритет. Для 100+ агентов platform layer должна стандартизировать auth, model/tool gateways, durable execution, observability, budgets и schema/version governance.

```python
def required_concurrency(rps:float, avg_seconds:float)->float:
    return rps * avg_seconds
assert required_concurrency(100,0.5) == 50
```

Пример показывает ключевой механизм; внешние infrastructure guarantees всё равно должны проверяться integration tests.
