# Python Interview Problems — 50 реальных задач с решениями

## Как найти пару соседних элементов с максимальным произведением?

Для массива целых чисел найдите произведение соседней пары с максимальным
значением. Однопроходное решение не требует сортировки массива.

```python
def adjacent_max_product(values: list[int]) -> int:
    if len(values) < 2:
        raise ValueError("at least two values are required")
    return max(left * right for left, right in zip(values, values[1:]))


assert adjacent_max_product([3, 6, -2, -5, 7, 3]) == 21
assert adjacent_max_product([-10, -20, 1]) == 200
```

Сложность — `O(n)` по времени и `O(1)` дополнительной памяти. Отрицательные
числа важны: произведение двух отрицательных элементов может быть максимальным.

## Как преобразовать строку «123» в число без использования int()?

Реализуйте преобразование десятичной строки в целое число. Поддержите знак `+`
или `-`, отклоняйте пустую строку и посторонние символы.

```python
def atoi(text: str) -> int:
    if not text:
        raise ValueError("empty number")
    sign = -1 if text[0] == "-" else 1
    start = 1 if text[0] in "+-" else 0
    if start == len(text):
        raise ValueError("missing digits")
    result = 0
    for char in text[start:]:
        if not "0" <= char <= "9":
            raise ValueError("invalid digit")
        result = result * 10 + ord(char) - ord("0")
    return sign * result


assert atoi("123") == 123
assert atoi("-42") == -42
assert atoi("+7") == 7
```

Каждый новый разряд сдвигает число на один десятичный порядок. Время — `O(n)`,
память — `O(1)`. В production-коде дополнительно нужен контроль переполнения,
если целевой тип имеет фиксированный диапазон.

## Как выполнить рекурсивный бинарный поиск?

В отсортированном массиве найдите индекс `target` рекурсивным бинарным поиском.
Если элемент отсутствует, верните `-1`.

```python
def binary_search(values: list[int], target: int, left: int = 0, right: int | None = None) -> int:
    if right is None:
        right = len(values) - 1
    if left > right:
        return -1
    middle = left + (right - left) // 2
    if values[middle] == target:
        return middle
    if values[middle] < target:
        return binary_search(values, target, middle + 1, right)
    return binary_search(values, target, left, middle - 1)


assert binary_search([1, 3, 5, 7, 9], 7) == 3
assert binary_search([1, 3, 5, 7, 9], 4) == -1
```

Время — `O(log n)`, память — `O(log n)` из-за стека рекурсии. Предусловие —
массив отсортирован по возрастанию.

## Как построить алгоритм Брезенхэма для отрисовки линии?

Верните координаты пикселей, которые нужно посетить для линии между двумя
целочисленными точками. Алгоритм использует только целочисленные операции.

```python
def bresenham(x0: int, y0: int, x1: int, y1: int) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    dx, sx = abs(x1 - x0), 1 if x0 < x1 else -1
    dy, sy = -abs(y1 - y0), 1 if y0 < y1 else -1
    error = dx + dy
    while True:
        points.append((x0, y0))
        if (x0, y0) == (x1, y1):
            break
        double_error = 2 * error
        if double_error >= dy:
            error += dy
            x0 += sx
        if double_error <= dx:
            error += dx
            y0 += sy
    return points


assert bresenham(0, 0, 3, 0) == [(0, 0), (1, 0), (2, 0), (3, 0)]
assert bresenham(0, 0, 2, 2) == [(0, 0), (1, 1), (2, 2)]
```

Алгоритм работает за `O(max(|dx|, |dy|))` и подходит для растровой графики,
когда нельзя вычислять координаты через вещественный наклон.

## Как найти количество узлов BST в заданном диапазоне?

Для бинарного дерева поиска посчитайте узлы со значениями в диапазоне
`[low, high]`. Используйте свойства BST, чтобы не обходить заведомо ненужные
поддеревья.

```python
from dataclasses import dataclass


@dataclass
class Node:
    value: int
    left: "Node | None" = None
    right: "Node | None" = None


def count_in_range(node: Node | None, low: int, high: int) -> int:
    if node is None:
        return 0
    if node.value < low:
        return count_in_range(node.right, low, high)
    if node.value > high:
        return count_in_range(node.left, low, high)
    return 1 + count_in_range(node.left, low, high) + count_in_range(node.right, low, high)


tree = Node(10, Node(5, Node(2), Node(7)), Node(15, Node(12), Node(20)))
assert count_in_range(tree, 6, 15) == 4
```

В худшем случае сложность `O(n)`, но pruning уменьшает работу на сбалансированном
дереве. Если дерево не является BST, такую оптимизацию применять нельзя.

## Как реализовать пузырьковую сортировку?

Отсортируйте массив по возрастанию пузырьковой сортировкой. Завершайте проход
раньше, если перестановок больше нет.

```python
def bubble_sort(values: list[int]) -> list[int]:
    result = values[:]
    for end in range(len(result) - 1, 0, -1):
        changed = False
        for index in range(end):
            if result[index] > result[index + 1]:
                result[index], result[index + 1] = result[index + 1], result[index]
                changed = True
        if not changed:
            break
    return result


assert bubble_sort([5, 1, 4, 2, 8]) == [1, 2, 4, 5, 8]
assert bubble_sort([]) == []
```

Средняя и худшая сложность — `O(n²)`, лучшая при уже отсортированном массиве —
`O(n)`. Для production обычно выбирают Timsort через `sorted`.

## Как найти угол между часовой и минутной стрелками?

Для времени в формате `hours:minutes` вычислите меньший угол между стрелками
аналоговых часов.

```python
def clock_angle(hours: int, minutes: int) -> float:
    if not 0 <= minutes < 60 or not 0 <= hours < 12:
        raise ValueError("invalid time")
    hour_angle = (hours + minutes / 60) * 30
    minute_angle = minutes * 6
    difference = abs(hour_angle - minute_angle)
    return min(difference, 360 - difference)


assert clock_angle(3, 0) == 90
assert clock_angle(12 % 12, 30) == 165
```

Часовая стрелка движется непрерывно, поэтому учитывать только `hours * 30`
нельзя. Сложность — `O(1)`.

## Сколько символов нужно удалить из двух строк, чтобы получить анаграммы?

Для двух строк посчитайте минимальное суммарное количество удалений, после
которых строки будут анаграммами.

```python
from collections import Counter


def deletions_for_anagrams(left: str, right: str) -> int:
    counts = Counter(left)
    counts.subtract(right)
    return sum(abs(value) for value in counts.values())


assert deletions_for_anagrams("bcadeh", "hea") == 3
assert deletions_for_anagrams("abc", "cba") == 0
```

Разность частот показывает, сколько лишних вхождений каждого символа есть в
обеих строках. Время — `O(len(left) + len(right))`.

## Как найти полупростые числа в диапазоне?

Полупростое число — произведение двух простых чисел, включая квадрат простого.
Верните такие числа в диапазоне `[low, high]`.

```python
import math


def is_prime(number: int) -> bool:
    if number < 2:
        return False
    for divisor in range(2, math.isqrt(number) + 1):
        if number % divisor == 0:
            return False
    return True


def semiprimes(low: int, high: int) -> list[int]:
    return [
        number
        for number in range(max(4, low), high + 1)
        if any(is_prime(divisor) and is_prime(number // divisor)
               for divisor in range(2, math.isqrt(number) + 1)
               if number % divisor == 0)
    ]


assert semiprimes(1, 12) == [4, 6, 9, 10]
```

Наивная версия достаточна для небольшого диапазона, но для большого диапазона
нужна решётка Эратосфена и перебор пар простых.

## Как выполнить DFS и BFS обход графа?

Для графа смежности верните порядок обхода в глубину и ширину из заданной
вершины. Не посещайте одну вершину более одного раза.

```python
from collections import deque


def dfs(graph: dict[str, list[str]], start: str) -> list[str]:
    result, visited, stack = [], set(), [start]
    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        result.append(node)
        stack.extend(reversed(graph.get(node, [])))
    return result


def bfs(graph: dict[str, list[str]], start: str) -> list[str]:
    result, visited, queue = [], {start}, deque([start])
    while queue:
        node = queue.popleft()
        result.append(node)
        for child in graph.get(node, []):
            if child not in visited:
                visited.add(child)
                queue.append(child)
    return result


graph = {"a": ["b", "c"], "b": ["d"], "c": [], "d": []}
assert dfs(graph, "a") == ["a", "b", "d", "c"]
assert bfs(graph, "a") == ["a", "b", "c", "d"]
```

Оба обхода работают за `O(V + E)`. DFS использует стек, BFS — очередь; выбор
зависит от задачи: BFS удобен для кратчайшего пути в невзвешенном графе.

## Как найти диаметр бинарного дерева?

Диаметр дерева — максимальное число рёбер на пути между двумя узлами. Верните
его длину, вычисляя высоты поддеревьев одним постorder-обходом.

```python
from dataclasses import dataclass


@dataclass
class Node:
    value: int
    left: "Node | None" = None
    right: "Node | None" = None


def tree_diameter(root: Node | None) -> int:
    diameter = 0

    def height(node: Node | None) -> int:
        nonlocal diameter
        if node is None:
            return 0
        left_height, right_height = height(node.left), height(node.right)
        diameter = max(diameter, left_height + right_height)
        return 1 + max(left_height, right_height)

    height(root)
    return diameter


tree = Node(10, Node(5, Node(2), Node(7)), Node(15, Node(12), Node(20)))
assert tree_diameter(tree) == 4
```

Каждый узел посещается один раз, поэтому время — `O(n)`, память — `O(h)` на
стек, где `h` — высота дерева.

## Как оценить число π методом Монте-Карло?

Случайно бросайте точки в квадрат `[-1, 1] × [-1, 1]` и оцените π по доле
точек внутри единичной окружности. Передавайте генератор для воспроизводимости.

```python
import random


def estimate_pi(samples: int, rng: random.Random) -> float:
    if samples <= 0:
        raise ValueError("samples must be positive")
    inside = sum(
        rng.uniform(-1, 1) ** 2 + rng.uniform(-1, 1) ** 2 <= 1
        for _ in range(samples)
    )
    return 4 * inside / samples


estimate = estimate_pi(100_000, random.Random(1))
assert 3.0 < estimate < 3.3
```

Погрешность уменьшается примерно как `1/sqrt(samples)`, поэтому метод прост,
но неэффективен по сравнению с детерминированными алгоритмами.

## Как вывести k наибольших элементов массива?

Верните `k` наибольших элементов в порядке убывания. Используйте min-heap
размера `k`, чтобы не сортировать весь массив.

```python
import heapq


def k_largest(values: list[int], k: int) -> list[int]:
    if k < 0:
        raise ValueError("k must be non-negative")
    return sorted(heapq.nlargest(k, values), reverse=True)


assert k_largest([3, 1, 5, 2, 4], 3) == [5, 4, 3]
assert k_largest([1, 2], 0) == []
```

`heapq.nlargest` работает примерно за `O(n log k)`. Если нужен только пороговый
элемент, можно применить quickselect и получить среднее `O(n)`.

## Как найти m-й элемент с конца односвязного списка?

Для односвязного списка верните `m`-й узел с конца за один проход. Используйте
два указателя с расстоянием `m`.

```python
from dataclasses import dataclass


@dataclass
class ListNode:
    value: int
    next: "ListNode | None" = None


def mth_from_end(head: ListNode | None, m: int) -> ListNode:
    if m <= 0:
        raise ValueError("m must be positive")
    fast = slow = head
    for _ in range(m):
        if fast is None:
            raise IndexError("m exceeds list length")
        fast = fast.next
    while fast is not None:
        fast, slow = fast.next, slow.next  # type: ignore[union-attr]
    assert slow is not None
    return slow


head = ListNode(2, ListNode(3, ListNode(4, ListNode(8, ListNode(5)))))
assert mth_from_end(head, 2).value == 8
```

Время — `O(n)`, память — `O(1)`. Важно различать `m=1` (последний узел) и
`m`, превышающий длину списка.

## Как найти все пары чисел с суммой k?

Верните все уникальные пары значений из массива, сумма которых равна `k`.

```python
def pairs_with_sum(values: list[int], target: int) -> list[tuple[int, int]]:
    seen: set[int] = set()
    pairs: set[tuple[int, int]] = set()
    for value in values:
        complement = target - value
        if complement in seen:
            pairs.add(tuple(sorted((value, complement))))
        seen.add(value)
    return sorted(pairs)


assert pairs_with_sum([1, 5, 7, -1, 5], 6) == [(-1, 7), (1, 5)]
```

Множество `seen` даёт среднюю сложность `O(n)`. Сортировка результата нужна
только для детерминированного порядка.

## Как найти все пары чисел с произведением k?

Для массива найдите уникальные пары, произведение которых равно `k`. Обработайте
нули и отрицательные значения явно.

```python
def pairs_with_product(values: list[int], target: int) -> list[tuple[int, int]]:
    if target == 0:
        zeros = values.count(0)
        non_zero_pairs = [(0, value) for value in sorted(set(values)) if value != 0]
        return non_zero_pairs if zeros else []
    seen: set[int] = set()
    result: set[tuple[int, int]] = set()
    for value in values:
        if value and target % value == 0 and target // value in seen:
            result.add(tuple(sorted((value, target // value))))
        seen.add(value)
    return sorted(result)


assert pairs_with_product([2, 3, 4, 6, -2], 12) == [(2, 6), (3, 4)]
assert pairs_with_product([0, 1, 2], 0) == [(0, 1), (0, 2)]
```

Для `target=0` любая пара с нулём имеет произведение ноль; здесь возвращаются
уникальные значения, а не все комбинации индексов.

## Как проверить наличие пифагоровой тройки?

Верните `True`, если в массиве есть `a`, `b`, `c`, для которых
`a² + b² = c²`.

```python
def has_pythagorean_triplet(values: list[int]) -> bool:
    squares = sorted(value * value for value in values if value > 0)
    for index in range(len(squares) - 1, 1, -1):
        left, right = 0, index - 1
        while left < right:
            total = squares[left] + squares[right]
            if total == squares[index]:
                return True
            if total < squares[index]:
                left += 1
            else:
                right -= 1
    return False


assert has_pythagorean_triplet([3, 1, 4, 6, 5])
assert not has_pythagorean_triplet([1, 2, 4])
```

После сортировки сложность — `O(n²)`, память — `O(n)`. Квадраты позволяют
сравнивать сумму двух указателей с третьим элементом двумя указателями.

## Как найти второй по величине узел бинарного дерева?

Для BST найдите второй по величине уникальный ключ. Если уникальных значений
меньше двух, выбросьте ошибку.

```python
from dataclasses import dataclass


@dataclass
class Node:
    value: int
    left: "Node | None" = None
    right: "Node | None" = None


def second_largest_bst(root: Node | None) -> int:
    values: list[int] = []

    def inorder(node: Node | None) -> None:
        if node is None:
            return
        inorder(node.left)
        values.append(node.value)
        inorder(node.right)

    inorder(root)
    unique = sorted(set(values))
    if len(unique) < 2:
        raise ValueError("tree has fewer than two unique values")
    return unique[-2]


tree = Node(10, Node(5, Node(2), Node(7)), Node(15, Node(12), Node(20)))
assert second_largest_bst(tree) == 15
```

Простой вариант использует `O(n)` памяти. В BST можно идти справа налево и
остановиться после двух уникальных значений, снизив память до `O(h)`.

## Как получить первые n чисел Фибоначчи?

Верните список первых `n` чисел последовательности Фибоначчи, начиная с `0, 1`.

```python
def fibonacci(n: int) -> list[int]:
    if n < 0:
        raise ValueError("n must be non-negative")
    result: list[int] = []
    first, second = 0, 1
    for _ in range(n):
        result.append(first)
        first, second = second, first + second
    return result


assert fibonacci(7) == [0, 1, 1, 2, 3, 5, 8]
assert fibonacci(0) == []
```

Итеративная реализация работает за `O(n)` и не имеет экспоненциального
повторения вычислений рекурсивной версии.

## Как найти первый повторяющийся символ?

Пройдите строку слева направо и верните первый символ, который уже встречался.
Если повторов нет, верните `None`.

```python
def first_recurring(text: str) -> str | None:
    seen: set[str] = set()
    for char in text:
        if char in seen:
            return char
        seen.add(char)
    return None


assert first_recurring("ABCA") == "A"
assert first_recurring("ABC") is None
```

Время — `O(n)`, память — `O(u)`. Это отличается от задачи о первом
неповторяющемся символе: здесь важен момент второго появления.

## Как расположить числа так, чтобы получить максимальное число?

Для списка неотрицательных целых чисел составьте максимальную конкатенацию.
Например, `[50, 2, 1, 9]` превращается в `95021`.

```python
from functools import cmp_to_key


def largest_number(values: list[int]) -> str:
    if not values or any(value < 0 for value in values):
        raise ValueError("values must be non-negative and non-empty")
    strings = [str(value) for value in values]
    strings.sort(key=cmp_to_key(lambda left, right: (right + left > left + right) -
                                (right + left < left + right)))
    result = "".join(strings)
    return "0" if result.lstrip("0") == "" else result


assert largest_number([50, 2, 1, 9]) == "95021"
assert largest_number([3, 30, 34, 5, 9]) == "9534330"
```

Сравнение `left+right` и `right+left` задаёт правильный порядок, обычная
сортировка числовых значений здесь не подходит.

## Как найти минимальное число платформ для поездов?

Даны времена прибытия и отправления поездов. Найдите минимальное число
платформ, чтобы ни один поезд не ждал.

```python
def min_platforms(arrivals: list[int], departures: list[int]) -> int:
    if len(arrivals) != len(departures):
        raise ValueError("arrival/departure lengths differ")
    arrivals.sort()
    departures.sort()
    arrive_index = depart_index = current = maximum = 0
    while arrive_index < len(arrivals):
        if arrivals[arrive_index] <= departures[depart_index]:
            current += 1
            maximum = max(maximum, current)
            arrive_index += 1
        else:
            current -= 1
            depart_index += 1
    return maximum


assert min_platforms([900, 940, 950, 1100, 1500, 1800],
                     [910, 1200, 1120, 1130, 1900, 2000]) == 3
```

Сортировка и sweep-line дают `O(n log n)`. Условие `arrival <= departure`
считает поезд, прибывающий в момент отправления другого, требующим отдельной
платформы.

## Как вывести дублирующиеся символы строки?

Верните символы, которые встречаются более одного раза, в порядке их первого
появления.

```python
from collections import Counter


def duplicate_chars(text: str) -> list[str]:
    counts = Counter(text)
    return list(dict.fromkeys(char for char in text if counts[char] > 1))


assert duplicate_chars("programming") == ["r", "g", "m"]
assert duplicate_chars("abc") == []
```

`Counter` считает частоты за линейное время, а `dict.fromkeys` удаляет повторы
в ответе с сохранением порядка.

## Как проверить наличие подмассива с нулевой суммой?

Верните `True`, если существует непрерывный подмассив, сумма которого равна
нулю.

```python
def has_zero_sum_subarray(values: list[int]) -> bool:
    prefix_sum = 0
    seen = {0}
    for value in values:
        prefix_sum += value
        if prefix_sum in seen:
            return True
        seen.add(prefix_sum)
    return False


assert has_zero_sum_subarray([4, 2, -3, 1, 6])
assert not has_zero_sum_subarray([1, 2, 3])
```

Одинаковые prefix sums означают, что сумма между ними равна нулю. Время —
`O(n)`, память — `O(n)`.

## Как проверить, что строка содержит только цифры?

Проверьте строку без использования регулярных выражений. Пустая строка не
считается числом.

```python
def has_only_digits(text: str) -> bool:
    return bool(text) and all("0" <= char <= "9" for char in text)


assert has_only_digits("12345")
assert not has_only_digits("12a45")
assert not has_only_digits("")
```

Проверка символов не принимает знак, пробелы и десятичную точку. Если контракт
требует Unicode-цифры, используйте `char.isdigit()` и отдельно решите вопрос
преобразования значения.

## Как вычислить расстояние Haversine между двумя координатами?

По широте и долготе двух точек на Земле вычислите расстояние по поверхности
сферической модели.

```python
import math


def haversine(lat1: float, lon1: float, lat2: float, lon2: float, radius: float = 6371.0) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


assert math.isclose(haversine(0, 0, 0, 0), 0.0)
assert math.isclose(haversine(0, 0, 0, 1), 111.195, rel_tol=1e-3)
```

Радиус задаётся в километрах по умолчанию. Для авиационных и геодезических
расчётов сферическая модель является приближением.

## Как реализовать min-heap?

Создайте минимальную кучу с операциями `push` и `pop`. После каждого изменения
сохраняйте инвариант: значение родителя не больше значений детей.

```python
class MinHeap:
    def __init__(self) -> None:
        self._items: list[int] = []

    def push(self, value: int) -> None:
        self._items.append(value)
        index = len(self._items) - 1
        while index:
            parent = (index - 1) // 2
            if self._items[parent] <= self._items[index]:
                break
            self._items[parent], self._items[index] = self._items[index], self._items[parent]
            index = parent

    def pop(self) -> int:
        if not self._items:
            raise IndexError("pop from empty heap")
        result = self._items[0]
        last = self._items.pop()
        if self._items:
            self._items[0] = last
            index = 0
            while True:
                children = [child for child in (2 * index + 1, 2 * index + 2)
                            if child < len(self._items)]
                if not children:
                    break
                child = min(children, key=self._items.__getitem__)
                if self._items[index] <= self._items[child]:
                    break
                self._items[index], self._items[child] = self._items[child], self._items[index]
                index = child
        return result


heap = MinHeap()
for value in [4, 1, 3, 2]:
    heap.push(value)
assert [heap.pop() for _ in range(4)] == [1, 2, 3, 4]
```

`push` и `pop` имеют сложность `O(log n)`, чтение минимума — `O(1)`. В реальном
проекте обычно используют проверенный `heapq`, но ручная реализация показывает
структуру данных.

## Как преобразовать целое число в римскую запись?

Преобразуйте положительное число в строку с римскими цифрами.

```python
def to_roman(number: int) -> str:
    if not 1 <= number <= 3999:
        raise ValueError("number must be in 1..3999")
    table = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
             (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
             (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    result = []
    for value, symbol in table:
        count, number = divmod(number, value)
        result.append(symbol * count)
    return "".join(result)


assert to_roman(1994) == "MCMXCIV"
assert to_roman(58) == "LVIII"
```

Жадный проход по номиналам корректен для стандартной канонической записи в
диапазоне до 3999.

## Как найти пересечение двух отсортированных массивов?

Верните общие элементы двух отсортированных массивов без повторов, используя
два указателя.

```python
def intersection_sorted(left: list[int], right: list[int]) -> list[int]:
    i = j = 0
    result: list[int] = []
    while i < len(left) and j < len(right):
        if left[i] == right[j]:
            if not result or result[-1] != left[i]:
                result.append(left[i])
            i += 1
            j += 1
        elif left[i] < right[j]:
            i += 1
        else:
            j += 1
    return result


assert intersection_sorted([1, 2, 2, 4], [2, 2, 3, 4]) == [2, 4]
```

Время — `O(m+n)`, память — `O(r)` для результата. Сортировать вход повторно
не нужно, поскольку условие уже гарантирует порядок.

## Как проверить, что матрица симметрична?

Матрица симметрична, если для каждой пары индексов `matrix[i][j] ==
matrix[j][i]`. Проверьте также квадратность матрицы.

```python
def is_symmetric(matrix: list[list[int]]) -> bool:
    size = len(matrix)
    if any(len(row) != size for row in matrix):
        raise ValueError("matrix must be square")
    return all(matrix[row][column] == matrix[column][row]
               for row in range(size) for column in range(row))


assert is_symmetric([[1, 2], [2, 3]])
assert not is_symmetric([[1, 0], [2, 3]])
```

Достаточно проверить нижний треугольник, поэтому время — `O(n²)`, а память —
`O(1)`.

## Как проверить, что две строки являются анаграммами?

Сравните частоты символов двух строк. В этой версии регистр и пробелы считаются
значимыми.

```python
from collections import Counter


def are_anagrams(left: str, right: str) -> bool:
    return Counter(left) == Counter(right)


assert are_anagrams("listen", "silent")
assert not are_anagrams("hello", "world")
```

Сложность — `O(n)` по времени и `O(u)` по памяти. Нормализацию регистра и
пробелов нужно выполнять только если это предусмотрено условием.

## Как проверить, является ли число палиндромом?

Верните `True`, если десятичная запись неотрицательного числа читается одинаково
слева направо и справа налево.

```python
def is_number_palindrome(number: int) -> bool:
    if number < 0:
        return False
    text = str(number)
    return text == text[::-1]


assert is_number_palindrome(12321)
assert not is_number_palindrome(12345)
assert not is_number_palindrome(-121)
```

Преобразование в строку проще и занимает `O(d)` памяти. В варианте с жёстким
ограничением памяти число можно разворачивать арифметически.

## Как проверить, что строка является числом?

Определите, можно ли корректно интерпретировать строку как число с плавающей
точкой. Пустые строки и значения с лишним мусором отклоняйте.

```python
def is_numeric(text: str) -> bool:
    if not text.strip():
        return False
    try:
        float(text)
    except ValueError:
        return False
    return True


assert is_numeric("-1.25")
assert is_numeric("1e-3")
assert not is_numeric("12x")
```

`float` поддерживает знак, десятичную точку и экспоненциальную запись. Если
нужно разрешить только конкретный формат, лучше использовать явную грамматику.

## Как решить задачу Иосифа?

`n` солдат стоят в кругу; каждый второй исключается, пока не останется один.
Верните позицию выжившего при нумерации с единицы.

```python
def josephus(n: int, step: int = 2) -> int:
    if n <= 0 or step <= 0:
        raise ValueError("n and step must be positive")
    survivor = 0
    for size in range(2, n + 1):
        survivor = (survivor + step) % size
    return survivor + 1


assert josephus(100, 2) == 73
assert josephus(1, 2) == 1
```

Итеративная формула работает за `O(n)` и `O(1)` памяти, не моделируя удаление
элементов из списка.

## Как реализовать умножение Карацубы?

Перемножьте два неотрицательных целых числа методом Карацубы, уменьшая число
рекурсивных умножений по сравнению с обычным делением на половины.

```python
def karatsuba(x: int, y: int) -> int:
    if x < 0 or y < 0:
        raise ValueError("only non-negative integers are supported")
    if x < 10 or y < 10:
        return x * y
    digits = max(len(str(x)), len(str(y)))
    half = digits // 2
    base = 10 ** half
    high_x, low_x = divmod(x, base)
    high_y, low_y = divmod(y, base)
    z0 = karatsuba(low_x, low_y)
    z2 = karatsuba(high_x, high_y)
    z1 = karatsuba(low_x + high_x, low_y + high_y) - z2 - z0
    return z2 * base * base + z1 * base + z0


assert karatsuba(1234, 5678) == 1234 * 5678
assert karatsuba(0, 123) == 0
```

Асимптотическая сложность — `O(n^log₂3) ≈ O(n^1.585)`, хотя для маленьких
чисел обычное умножение быстрее.

## Как выполнить level-order обход бинарного дерева?

Верните значения узлов по уровням слева направо.

```python
from collections import deque
from dataclasses import dataclass


@dataclass
class Node:
    value: int
    left: "Node | None" = None
    right: "Node | None" = None


def level_order(root: Node | None) -> list[list[int]]:
    if root is None:
        return []
    levels: list[list[int]] = []
    queue = deque([root])
    while queue:
        level: list[int] = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.value)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        levels.append(level)
    return levels


tree = Node(10, Node(5, Node(2), Node(7)), Node(15, Node(12), Node(20)))
assert level_order(tree) == [[10], [5, 15], [2, 7, 12, 20]]
```

Очередь обеспечивает `O(n)` времени и `O(w)` памяти, где `w` — максимальная
ширина дерева.

## Как реализовать односвязный список?

Создайте минимальную структуру списка с добавлением в начало и итерацией по
элементам.

```python
from dataclasses import dataclass


@dataclass
class ListNode:
    value: int
    next: "ListNode | None" = None


class LinkedList:
    def __init__(self) -> None:
        self.head: ListNode | None = None

    def prepend(self, value: int) -> None:
        self.head = ListNode(value, self.head)

    def to_list(self) -> list[int]:
        result: list[int] = []
        current = self.head
        while current:
            result.append(current.value)
            current = current.next
        return result


linked = LinkedList()
linked.prepend(1)
linked.prepend(2)
assert linked.to_list() == [2, 1]
```

Добавление в начало — `O(1)`, обход — `O(n)`. Список не предоставляет быстрый
доступ по индексу, в отличие от массива.

## Как обнаружить цикл в односвязном списке?

Используйте алгоритм Флойда: медленный указатель движется на один шаг, быстрый
на два. Если они встретились, в списке есть цикл.

```python
from dataclasses import dataclass


@dataclass
class ListNode:
    value: int
    next: "ListNode | None" = None


def has_loop(head: ListNode | None) -> bool:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False


acyclic = ListNode(1, ListNode(2, ListNode(3)))
cyclic = ListNode(1)
cyclic.next = ListNode(2, cyclic)
assert not has_loop(acyclic)
assert has_loop(cyclic)
```

Время — `O(n)`, память — `O(1)`. Сравнивать нужно identity (`is`), а не только
значения узлов.

## Как найти Lowest Common Ancestor в BST?

Найдите самый низкий узел BST, являющийся предком двух значений `first` и
`second`.

```python
from dataclasses import dataclass


@dataclass
class Node:
    value: int
    left: "Node | None" = None
    right: "Node | None" = None


def lowest_common_ancestor(root: Node | None, first: int, second: int) -> Node | None:
    current = root
    while current:
        if first < current.value and second < current.value:
            current = current.left
        elif first > current.value and second > current.value:
            current = current.right
        else:
            return current
    return None


tree = Node(10, Node(5, Node(2), Node(7)), Node(15, Node(12), Node(20)))
assert lowest_common_ancestor(tree, 2, 7).value == 5  # type: ignore[union-attr]
assert lowest_common_ancestor(tree, 2, 20).value == 10  # type: ignore[union-attr]
```

Свойство BST позволяет найти ответ за `O(h)` времени и `O(1)` памяти. В обычном
бинарном дереве без порядка нужен другой алгоритм.

## Как найти majority element?

Найдите элемент массива, встречающийся более `n/2` раз, или верните `None`.
Используйте алгоритм голосования Бойера–Мура.

```python
def majority_element(values: list[int]) -> int | None:
    candidate = None
    count = 0
    for value in values:
        if count == 0:
            candidate = value
        count += 1 if value == candidate else -1
    if candidate is None:
        return None
    return candidate if values.count(candidate) > len(values) // 2 else None


assert majority_element([2, 2, 1, 1, 1, 2, 2]) == 2
assert majority_element([1, 2, 3]) is None
```

Кандидат находится за `O(n)` и `O(1)` памяти; финальная проверка нужна, если
условие не гарантирует существование majority element.

## Как найти максимальную сумму непрерывного подмассива?

Для массива положительных и отрицательных чисел найдите максимальную сумму
непрерывного подмассива за `O(n)`.

```python
def max_subarray_sum(values: list[int]) -> int:
    if not values:
        raise ValueError("values must not be empty")
    current = best = values[0]
    for value in values[1:]:
        current = max(value, current + value)
        best = max(best, current)
    return best


assert max_subarray_sum([-2, 1, -3, 4, -1, 2, 1, -5, 4]) == 6
assert max_subarray_sum([-3, -1, -2]) == -1
```

Это алгоритм Кадане: `current` — лучший подмассив, заканчивающийся в текущей
позиции, а `best` — лучший среди всех.

## Как реализовать merge sort?

Отсортируйте массив слиянием, разделяя его пополам и объединяя отсортированные
части.

```python
def merge_sort(values: list[int]) -> list[int]:
    if len(values) <= 1:
        return values[:]
    middle = len(values) // 2
    left, right = merge_sort(values[:middle]), merge_sort(values[middle:])
    result: list[int] = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i]); i += 1
        else:
            result.append(right[j]); j += 1
    return result + left[i:] + right[j:]


assert merge_sort([5, 2, 4, 1, 3]) == [1, 2, 3, 4, 5]
```

Время — `O(n log n)`, память — `O(n)`. Сортировка стабильна благодаря условию
`<=` при выборе левого элемента.

## Как переместить нули в конец массива in-place?

Переместите все нули в конец, сохранив относительный порядок ненулевых
элементов, и измените массив на месте.

```python
def move_zeros_to_end(values: list[int]) -> None:
    write = 0
    for value in values:
        if value != 0:
            values[write] = value
            write += 1
    values[write:] = [0] * (len(values) - write)


values = [0, 1, 0, 3, 12]
move_zeros_to_end(values)
assert values == [1, 3, 12, 0, 0]
```

Время — `O(n)`, дополнительная память — `O(1)` без учёта временного хвоста.

## Как построить треугольник Паскаля?

Для заданного количества уровней верните строки треугольника Паскаля.

```python
def pascal_triangle(levels: int) -> list[list[int]]:
    if levels < 0:
        raise ValueError("levels must be non-negative")
    result: list[list[int]] = []
    for row_number in range(levels):
        row = [1] * (row_number + 1)
        for index in range(1, row_number):
            row[index] = result[-1][index - 1] + result[-1][index]
        result.append(row)
    return result


assert pascal_triangle(4) == [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]]
```

Число элементов результата — `O(levels²)`, поэтому такая же нижняя граница по
памяти неизбежна, если нужно вернуть все строки.

## Как вывести все перестановки строки?

Верните все уникальные перестановки строки, даже если в ней есть повторяющиеся
символы.

```python
def permutations(text: str) -> list[str]:
    if not text:
        return [""]
    result: set[str] = set()
    for index, char in enumerate(text):
        for tail in permutations(text[:index] + text[index + 1:]):
            result.add(char + tail)
    return sorted(result)


assert permutations("abc") == ["abc", "acb", "bac", "bca", "cab", "cba"]
assert permutations("aab") == ["aab", "aba", "baa"]
```

Количество перестановок растёт как `n!`; для длинных строк генерация всех
вариантов сама по себе становится узким местом.

## Как построить product array без деления?

Для каждого элемента `arr[i]` верните произведение всех остальных элементов.
Решение должно корректно работать с нулями и не использовать деление.

```python
def product_except_self(values: list[int]) -> list[int]:
    result = [1] * len(values)
    prefix = 1
    for index, value in enumerate(values):
        result[index] = prefix
        prefix *= value
    suffix = 1
    for index in range(len(values) - 1, -1, -1):
        result[index] *= suffix
        suffix *= values[index]
    return result


assert product_except_self([10, 3, 5, 6, 2]) == [180, 600, 360, 300, 900]
assert product_except_self([1, 2, 0, 4]) == [0, 0, 8, 0]
```

Два прохода дают `O(n)` времени и `O(1)` дополнительной памяти, если не считать
массив результата.

## Как реализовать quick sort?

Отсортируйте массив quick sort с разбиением относительно последнего элемента.
Возвращайте новый массив, не изменяя исходный.

```python
def quick_sort(values: list[int]) -> list[int]:
    if len(values) <= 1:
        return values[:]
    pivot = values[-1]
    smaller = [value for value in values[:-1] if value <= pivot]
    larger = [value for value in values[:-1] if value > pivot]
    return quick_sort(smaller) + [pivot] + quick_sort(larger)


assert quick_sort([4, 2, 7, 3, 1]) == [1, 2, 3, 4, 7]
```

Средняя сложность — `O(n log n)`, худшая при плохом pivot — `O(n²)`. Выбор
случайного pivot уменьшает вероятность худшего сценария.

## Как развернуть слова в предложении, не меняя порядок слов?

В каждом слове разверните символы, но само предложение и порядок слов сохраните.

```python
def reverse_each_word(sentence: str) -> str:
    return " ".join(word[::-1] for word in sentence.split(" "))


assert reverse_each_word("Python is great") == "nohtyP si taerg"
assert reverse_each_word("a  b") == "a  b"
```

Разделитель `' '` сохраняет последовательные пробелы. Если пробелы незначимы,
можно использовать `split()` и `' '.join(...)`.

## Как найти медиану потока целых чисел?

После каждого добавления поддерживайте медиану потока. Две кучи дают добавление
за `O(log n)` и чтение медианы за `O(1)`.

```python
import heapq


class RunningMedian:
    def __init__(self) -> None:
        self.lower: list[int] = []
        self.upper: list[int] = []

    def add(self, value: int) -> None:
        if not self.lower or value <= -self.lower[0]:
            heapq.heappush(self.lower, -value)
        else:
            heapq.heappush(self.upper, value)
        if len(self.lower) > len(self.upper) + 1:
            heapq.heappush(self.upper, -heapq.heappop(self.lower))
        elif len(self.upper) > len(self.lower):
            heapq.heappush(self.lower, -heapq.heappop(self.upper))

    def median(self) -> float:
        if not self.lower:
            raise ValueError("empty stream")
        if len(self.lower) == len(self.upper):
            return (-self.lower[0] + self.upper[0]) / 2
        return float(-self.lower[0])


stream = RunningMedian()
for value in [5, 1, 9, 2]:
    stream.add(value)
assert stream.median() == 3.5
```

Нижняя куча хранит меньшую половину, верхняя — большую. Их размеры отличаются
не более чем на один.

## Как вычислить stock span для каждого дня?

Для каждого дня найдите максимальное число последовательных предыдущих дней,
цена которых не превышает текущую. Используйте монотонный стек индексов.

```python
def stock_span(prices: list[int]) -> list[int]:
    spans = [0] * len(prices)
    stack: list[int] = []
    for index, price in enumerate(prices):
        while stack and prices[stack[-1]] <= price:
            stack.pop()
        spans[index] = index + 1 if not stack else index - stack[-1]
        stack.append(index)
    return spans


assert stock_span([100, 80, 60, 70, 60, 75, 85]) == [1, 1, 1, 2, 1, 4, 6]
```

Каждый индекс добавляется и удаляется из стека максимум один раз, поэтому время
— `O(n)`, память — `O(n)`.

## Как вывести узлы бинарного дерева, у которых нет брата?

Узел считается узлом без брата, если у его родителя есть только один ребёнок.
Обойдите дерево рекурсивно и добавьте такой дочерний узел в результат.

```python
from dataclasses import dataclass


@dataclass
class Node:
    value: int
    left: "Node | None" = None
    right: "Node | None" = None


def nodes_without_sibling(root: Node | None) -> list[int]:
    result: list[int] = []

    def visit(node: Node | None) -> None:
        if node is None:
            return
        if node.left is not None and node.right is None:
            result.append(node.left.value)
        if node.right is not None and node.left is None:
            result.append(node.right.value)
        visit(node.left)
        visit(node.right)

    visit(root)
    return result


tree = Node(1, Node(2, Node(4)), Node(3, right=Node(5)))
assert nodes_without_sibling(tree) == [4, 5]
```

## Как расположить нечётные числа по возрастанию, а чётные по убыванию?

Разделите элементы на две группы, отсортируйте их в противоположных направлениях
и склейте. Такой вариант явно фиксирует требование порядка внутри каждой группы.

```python
def odd_ascending_even_descending(values: list[int]) -> list[int]:
    odd = sorted((value for value in values if value % 2), reverse=False)
    even = sorted((value for value in values if value % 2 == 0), reverse=True)
    return odd + even


assert odd_ascending_even_descending([8, 3, 2, 7, 4, 1]) == [1, 3, 7, 8, 4, 2]
```

## Как построить строку Pascal с использованием факториалов?

Для позиции `k` в строке `n` используется биномиальный коэффициент
`C(n, k) = n! / (k! (n-k)!)`. Нумерация строк начинается с нуля.

```python
from math import factorial


def pascal_row_factorial(row: int) -> list[int]:
    if row < 0:
        raise ValueError("row must be non-negative")
    fact = factorial
    return [fact(row) // (fact(k) * fact(row - k)) for k in range(row + 1)]


assert pascal_row_factorial(4) == [1, 4, 6, 4, 1]
```

## Как сгенерировать все перестановки строки?

Рекурсивно фиксируйте очередной символ, а затем переставляйте оставшуюся часть.
Множество предотвращает повторение результата для одинаковых символов.

```python
def permutations(text: str) -> list[str]:
    result: set[str] = set()

    def build(prefix: str, rest: str) -> None:
        if not rest:
            result.add(prefix)
            return
        for index, char in enumerate(rest):
            build(prefix + char, rest[:index] + rest[index + 1 :])

    build("", text)
    return sorted(result)


assert permutations("aba") == ["aab", "aba", "baa"]
```

## Как выполнить итеративный preorder-обход бинарного дерева?

В preorder узел посещается до левого и правого поддеревьев. Стек хранит узлы,
которые ещё предстоит посетить; правого ребёнка кладём первым.

```python
from dataclasses import dataclass


@dataclass
class TreeNode:
    value: int
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


def preorder_iterative(root: TreeNode | None) -> list[int]:
    if root is None:
        return []
    result: list[int] = []
    stack = [root]
    while stack:
        node = stack.pop()
        result.append(node.value)
        if node.right is not None:
            stack.append(node.right)
        if node.left is not None:
            stack.append(node.left)
    return result


root = TreeNode(1, TreeNode(2, TreeNode(4), TreeNode(5)), TreeNode(3))
assert preorder_iterative(root) == [1, 2, 4, 5, 3]
```

## Как реализовать простую очередь с приоритетами?

Минимальная куча хранит пары `(приоритет, порядковый номер, значение)`. Номер
сохраняет порядок добавления при одинаковом приоритете.

```python
import heapq


class PriorityQueue:
    def __init__(self) -> None:
        self._heap: list[tuple[int, int, str]] = []
        self._sequence = 0

    def put(self, value: str, priority: int) -> None:
        heapq.heappush(self._heap, (priority, self._sequence, value))
        self._sequence += 1

    def get(self) -> str:
        if not self._heap:
            raise IndexError("empty priority queue")
        return heapq.heappop(self._heap)[2]


queue = PriorityQueue()
queue.put("low", 5)
queue.put("high", 1)
assert queue.get() == "high"
assert queue.get() == "low"
```

## Как преобразовать строку пар ключ-значение в словарь?

Пусть пары записаны через `|`, а ключ и значение разделены двоеточием. Обрезайте
пробелы и явно отклоняйте некорректные пары.

```python
def parse_pairs(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw_pair in text.split("|"):
        pair = raw_pair.strip()
        if not pair:
            continue
        key, separator, value = pair.partition(":")
        if not separator or not key.strip():
            raise ValueError(f"invalid pair: {pair!r}")
        result[key.strip()] = value.strip()
    return result


assert parse_pairs("k:1 | k1: 2") == {"k": "1", "k1": "2"}
```

## Как реализовать FIFO-очередь на двух стеках?

Один стек принимает элементы, второй выдаёт их в обратном порядке. Перекладывать
элементы нужно только когда стек выдачи пуст — амортизированная сложность `O(1)`.

```python
class Queue:
    def __init__(self) -> None:
        self._incoming: list[int] = []
        self._outgoing: list[int] = []

    def put(self, value: int) -> None:
        self._incoming.append(value)

    def _move(self) -> None:
        if not self._outgoing:
            self._outgoing.extend(reversed(self._incoming))
            self._incoming.clear()

    def get(self) -> int:
        self._move()
        if not self._outgoing:
            raise IndexError("empty queue")
        return self._outgoing.pop()


queue = Queue()
queue.put(1)
queue.put(2)
assert queue.get() == 1
assert queue.get() == 2
```

## Как реализовать range с дробным шагом?

Обычный `range` принимает только целые числа. Генератор ниже поддерживает дробный
шаг и не выдаёт значение, которое уже вышло за правую границу.

```python
def frange(start: float, stop: float, step: float):
    if step == 0:
        raise ValueError("step must not be zero")
    value = start
    if step > 0:
        while value < stop:
            yield value
            value += step
    else:
        while value > stop:
            yield value
            value += step


assert list(frange(0.0, 1.0, 0.25)) == [0.0, 0.25, 0.5, 0.75]
```

## Как удалить из строки все символы заданного набора?

Постройте новый буфер, пропуская символы, которые входят в множество удаления.
Проверка принадлежности множеству выполняется в среднем за `O(1)`.

```python
def remove_chars(text: str, forbidden: str) -> str:
    forbidden_set = set(forbidden)
    return "".join(char for char in text if char not in forbidden_set)


assert remove_chars("a-b-c", "-") == "abc"
```

## Как удалить повторяющиеся символы, сохранив первое вхождение?

Множество хранит уже встреченные символы, а список сохраняет исходный порядок.
Алгоритм линейный по длине строки.

```python
def deduplicate_chars(text: str) -> str:
    seen: set[str] = set()
    result: list[str] = []
    for char in text:
        if char not in seen:
            seen.add(char)
            result.append(char)
    return "".join(result)


assert deduplicate_chars("programming") == "progamin"
```

## Как развернуть список символов на месте?

Используйте два указателя и меняйте элементы попарно. Дополнительная память —
`O(1)`, что и требуется для операции in-place.

```python
def reverse_in_place(chars: list[str]) -> None:
    left, right = 0, len(chars) - 1
    while left < right:
        chars[left], chars[right] = chars[right], chars[left]
        left += 1
        right -= 1


letters = list("python")
reverse_in_place(letters)
assert letters == list("nohtyp")
```

## Как рекурсивно развернуть строку?

Базовый случай — пустая строка или один символ. Для остальных строк последний
символ переносится в начало результата.

```python
def reverse_recursive(text: str) -> str:
    if len(text) <= 1:
        return text
    return text[-1] + reverse_recursive(text[:-1])


assert reverse_recursive("abc") == "cba"
```

## Как повернуть квадратную матрицу на 180 градусов?

Поворот на 180 градусов — это разворот порядка строк и каждого столбца. Создаём
новую матрицу, чтобы не менять входные данные неожиданно.

```python
def rotate_180(matrix: list[list[int]]) -> list[list[int]]:
    if not matrix or any(len(row) != len(matrix) for row in matrix):
        raise ValueError("matrix must be non-empty and square")
    return [row[::-1] for row in matrix[::-1]]


assert rotate_180([[1, 2], [3, 4]]) == [[4, 3], [2, 1]]
```

## Как повернуть квадратную матрицу на 90 градусов по часовой стрелке?

Транспонируйте матрицу, а затем разверните каждую строку. Для `n × n` матрицы
это занимает `O(n²)` времени и памяти.

```python
def rotate_clockwise(matrix: list[list[int]]) -> list[list[int]]:
    if not matrix or any(len(row) != len(matrix) for row in matrix):
        raise ValueError("matrix must be non-empty and square")
    return [list(row) for row in zip(*matrix[::-1])]


assert rotate_clockwise([[1, 2], [3, 4]]) == [[3, 1], [4, 2]]
```

## Как найти единственный элемент в отсортированном массиве пар?

Все элементы, кроме одного, идут парами. Сравнивайте средний индекс с соседним,
выравнивая его по чётной позиции; двоичный поиск работает за `O(log n)`.

```python
def unique_in_pairs(values: list[int]) -> int:
    if not values:
        raise ValueError("array must not be empty")
    left, right = 0, len(values) - 1
    while left < right:
        mid = (left + right) // 2
        if mid % 2:
            mid -= 1
        if values[mid] == values[mid + 1]:
            left = mid + 2
        else:
            right = mid
    return values[left]


assert unique_in_pairs([1, 1, 2, 3, 3, 4, 4]) == 2
```

## Как реализовать сортировку выбором?

На каждой позиции находите минимальный элемент в оставшемся хвосте и меняйте его
с первым элементом хвоста. Время — `O(n²)`, память — `O(1)`.

```python
def selection_sort(values: list[int]) -> list[int]:
    result = values[:]
    for start in range(len(result)):
        minimum = min(range(start, len(result)), key=result.__getitem__)
        result[start], result[minimum] = result[minimum], result[start]
    return result


assert selection_sort([4, 1, 3, 2]) == [1, 2, 3, 4]
```

## Как определить знак произведения без вычисления самого произведения?

Произведение равно нулю, если хотя бы один множитель нулевой. Иначе знак
определяется чётностью числа отрицательных множителей.

```python
def product_sign(values: list[int]) -> int:
    negatives = 0
    for value in values:
        if value == 0:
            return 0
        if value < 0:
            negatives += 1
    return -1 if negatives % 2 else 1


assert product_sign([-2, 3, -4]) == 1
assert product_sign([-2, 0, 4]) == 0
```

## Как реализовать стек с операциями push и pop?

Список уже предоставляет амортизированное `O(1)` добавление и удаление с конца.
Публичный класс скрывает представление и выдаёт понятную ошибку для пустого стека.

```python
class Stack:
    def __init__(self) -> None:
        self._items: list[int] = []

    def push(self, value: int) -> None:
        self._items.append(value)

    def pop(self) -> int:
        if not self._items:
            raise IndexError("empty stack")
        return self._items.pop()

    def peek(self) -> int:
        if not self._items:
            raise IndexError("empty stack")
        return self._items[-1]


stack = Stack()
stack.push(1)
stack.push(2)
assert stack.peek() == 2
assert stack.pop() == 2
```

## Как рекурсивно посчитать сумму элементов массива?

Базовый случай — пустой массив. Для непустого массива складываем первый элемент
с суммой хвоста.

```python
def recursive_sum(values: list[int]) -> int:
    if not values:
        return 0
    return values[0] + recursive_sum(values[1:])


assert recursive_sum([1, 2, 3, 4]) == 10
```

## Как объединить временные ряды, усреднив одинаковые даты?

Сгруппируйте значения по дате, а затем вычислите среднее каждой группы. Результат
отсортирован по дате и не зависит от порядка входных записей.

```python
from collections import defaultdict


def merge_timeseries(points: list[tuple[str, float]]) -> list[tuple[str, float]]:
    groups: dict[str, list[float]] = defaultdict(list)
    for date, value in points:
        groups[date].append(value)
    return [
        (date, sum(values) / len(values))
        for date, values in sorted(groups.items())
    ]


assert merge_timeseries([("2024-01-02", 3), ("2024-01-01", 2), ("2024-01-02", 5)]) == [
    ("2024-01-01", 2.0),
    ("2024-01-02", 4.0),
]
```

## Как найти объединение двух отсортированных массивов без повторов?

Два указателя выбирают меньший текущий элемент, а одинаковые элементы добавляются
один раз. Сложность — `O(n + m)`.

```python
def union_sorted(left: list[int], right: list[int]) -> list[int]:
    result: list[int] = []
    i = j = 0
    while i < len(left) or j < len(right):
        if j == len(right) or (i < len(left) and left[i] < right[j]):
            value = left[i]
            i += 1
        elif i == len(left) or right[j] < left[i]:
            value = right[j]
            j += 1
        else:
            value = left[i]
            i += 1
            j += 1
        if not result or result[-1] != value:
            result.append(value)
    return result


assert union_sorted([1, 2, 4], [2, 3, 4]) == [1, 2, 3, 4]
```

## Как проверить имя пользователя регулярным выражением?

Разрешим от 3 до 20 символов: латинские буквы, цифры и подчёркивание; первым
символом должна быть буква.

```python
import re


USERNAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{2,19}$")


def valid_username(value: str) -> bool:
    return USERNAME.fullmatch(value) is not None


assert valid_username("user_123")
assert not valid_username("1user")
assert not valid_username("ab")
```

## Как найти минимум и максимум одним проходом?

Инициализируйте обе границы первым элементом и обновляйте их в одном цикле.
Такой алгоритм использует `O(n)` сравнений и не сортирует входной массив.

```python
def min_max(values: list[int]) -> tuple[int, int]:
    if not values:
        raise ValueError("array must not be empty")
    minimum = maximum = values[0]
    for value in values[1:]:
        if value < minimum:
            minimum = value
        if value > maximum:
            maximum = value
    return minimum, maximum


assert min_max([7, 2, 9, 4]) == (2, 9)
```

## Как расплющить произвольно вложенный список?

Рекурсивно раскрывайте только списки, а скалярные значения добавляйте в результат.
Порядок обхода сохраняется.

```python
def flatten(values: list[object]) -> list[object]:
    result: list[object] = []
    for value in values:
        if isinstance(value, list):
            result.extend(flatten(value))
        else:
            result.append(value)
    return result


assert flatten([1, [2, [3, 4]], "x"]) == [1, 2, 3, 4, "x"]
```

## Как найти длину самой длинной подстроки без повторяющихся символов?

Два указателя задают окно, а словарь хранит последний индекс каждого символа.
Левую границу можно сразу перескочить за повтор.

```python
def longest_unique_substring(text: str) -> int:
    last: dict[str, int] = {}
    left = best = 0
    for right, char in enumerate(text):
        if char in last and last[char] >= left:
            left = last[char] + 1
        last[char] = right
        best = max(best, right - left + 1)
    return best


assert longest_unique_substring("abcabcbb") == 3
assert longest_unique_substring("bbbbb") == 1
```

## Как проверить корректность скобочной последовательности?

Стек хранит открывающие скобки. Каждая закрывающая должна соответствовать его
вершине, а после обработки строки стек обязан быть пустым.

```python
def valid_parentheses(text: str) -> bool:
    pairs = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    for char in text:
        if char in "([{":
            stack.append(char)
        elif char in pairs:
            if not stack or stack.pop() != pairs[char]:
                return False
    return not stack


assert valid_parentheses("{[()]}")
assert not valid_parentheses("([)]")
```

## Как объединить пересекающиеся интервалы?

Отсортируйте интервалы по началу и расширяйте последний объединённый интервал,
пока следующий пересекается с ним.

```python
def merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not intervals:
        return []
    ordered = sorted(intervals)
    result = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = result[-1]
        if start <= last_end:
            result[-1] = (last_start, max(last_end, end))
        else:
            result.append((start, end))
    return result


assert merge_intervals([(1, 3), (2, 6), (8, 10), (9, 12)]) == [(1, 6), (8, 12)]
```

## Как найти индексы двух чисел с заданной суммой?

Словарь хранит уже встреченное число и его индекс. Для текущего числа проверяем,
был ли ранее найденный комплемент `target - value`.

```python
def two_sum_indices(values: list[int], target: int) -> tuple[int, int]:
    seen: dict[int, int] = {}
    for index, value in enumerate(values):
        complement = target - value
        if complement in seen:
            return seen[complement], index
        seen[value] = index
    raise ValueError("no pair")


assert two_sum_indices([2, 7, 11, 15], 9) == (0, 1)
```

## Как найти максимальную прибыль от одной сделки с акцией?

Поддерживайте минимальную цену слева и максимальную прибыль, которую можно
получить продажей сегодня. Решение выполняется за один проход.

```python
def max_stock_profit(prices: list[int]) -> int:
    if not prices:
        return 0
    minimum = prices[0]
    profit = 0
    for price in prices[1:]:
        profit = max(profit, price - minimum)
        minimum = min(minimum, price)
    return profit


assert max_stock_profit([7, 1, 5, 3, 6, 4]) == 5
```

## Как циклически сдвинуть массив вправо на `k` позиций?

Сократите `k` по длине массива и разрежьте массив на две части. Это проще и
безопаснее, чем многократный сдвиг по одному элементу.

```python
def rotate_array(values: list[int], k: int) -> list[int]:
    if not values:
        return []
    k %= len(values)
    return values[-k:] + values[:-k] if k else values[:]


assert rotate_array([1, 2, 3, 4, 5], 2) == [4, 5, 1, 2, 3]
```

## Как найти `k` самых частых элементов?

Посчитайте частоты и возьмите `k` наиболее частых значений. При равной частоте
добавлен детерминированный порядок по самому значению.

```python
from collections import Counter


def top_k_frequent(values: list[int], k: int) -> list[int]:
    counts = Counter(values)
    return [value for value, _ in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:k]]


assert top_k_frequent([1, 1, 1, 2, 2, 3], 2) == [1, 2]
```

## Как выполнить flood fill изображения?

Начните с исходной клетки и обходите соседей в ширину. Если новый цвет совпадает
со старым, возвращайте копию без изменений.

```python
from collections import deque


def flood_fill(image: list[list[int]], row: int, col: int, color: int) -> list[list[int]]:
    result = [line[:] for line in image]
    old = result[row][col]
    if old == color:
        return result
    queue = deque([(row, col)])
    result[row][col] = color
    while queue:
        current_row, current_col = queue.popleft()
        for next_row, next_col in (
            (current_row - 1, current_col),
            (current_row + 1, current_col),
            (current_row, current_col - 1),
            (current_row, current_col + 1),
        ):
            if 0 <= next_row < len(result) and 0 <= next_col < len(result[0]):
                if result[next_row][next_col] == old:
                    result[next_row][next_col] = color
                    queue.append((next_row, next_col))
    return result


assert flood_fill([[1, 1, 0], [1, 0, 0]], 0, 0, 2) == [[2, 2, 0], [2, 0, 0]]
```

## Как посчитать количество островов в бинарной матрице?

Клетка со значением `1` запускает DFS, который помечает весь связный остров.
Каждый остров будет посчитан ровно один раз.

```python
def count_islands(grid: list[list[int]]) -> int:
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen: set[tuple[int, int]] = set()

    def visit(row: int, col: int) -> None:
        if not (0 <= row < rows and 0 <= col < cols):
            return
        if grid[row][col] == 0 or (row, col) in seen:
            return
        seen.add((row, col))
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            visit(row + dr, col + dc)

    result = 0
    for row in range(rows):
        for col in range(cols):
            if grid[row][col] == 1 and (row, col) not in seen:
                result += 1
                visit(row, col)
    return result


assert count_islands([[1, 1, 0], [0, 1, 0], [0, 0, 1]]) == 2
```

## Как клонировать неориентированный граф?

Используйте отображение `оригинальный узел -> копия`. Оно одновременно предотвращает
зацикливание и позволяет восстановить рёбра при DFS.

```python
class GraphNode:
    def __init__(self, value: int) -> None:
        self.value = value
        self.neighbors: list["GraphNode"] = []


def clone_graph(node: GraphNode | None) -> GraphNode | None:
    if node is None:
        return None
    copies: dict[GraphNode, GraphNode] = {}

    def clone(current: GraphNode) -> GraphNode:
        if current in copies:
            return copies[current]
        copied = GraphNode(current.value)
        copies[current] = copied
        copied.neighbors = [clone(neighbor) for neighbor in current.neighbors]
        return copied

    return clone(node)


first = GraphNode(1)
second = GraphNode(2)
first.neighbors = [second]
second.neighbors = [first]
copy = clone_graph(first)
assert copy is not first and copy is not None and copy.neighbors[0].value == 2
```

## Как проверить, можно ли завершить все курсы с учётом prerequisites?

Постройте граф зависимостей и посчитайте входящие степени. Если топологический
обход посетил все вершины, цикл отсутствует.

```python
from collections import deque


def can_finish_courses(count: int, prerequisites: list[tuple[int, int]]) -> bool:
    graph = [[] for _ in range(count)]
    indegree = [0] * count
    for course, prerequisite in prerequisites:
        graph[prerequisite].append(course)
        indegree[course] += 1
    queue = deque(index for index, degree in enumerate(indegree) if degree == 0)
    visited = 0
    while queue:
        current = queue.popleft()
        visited += 1
        for neighbor in graph[current]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)
    return visited == count


assert can_finish_courses(2, [(1, 0)])
assert not can_finish_courses(2, [(1, 0), (0, 1)])
```

## Как реализовать LRU-кэш?

Словарь хранит узлы, а двусвязный список — порядок использования. При обращении
узел перемещается в начало; удаляется узел с конца.

```python
from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self.data: OrderedDict[str, int] = OrderedDict()

    def get(self, key: str) -> int | None:
        if key not in self.data:
            return None
        self.data.move_to_end(key)
        return self.data[key]

    def put(self, key: str, value: int) -> None:
        self.data[key] = value
        self.data.move_to_end(key)
        if len(self.data) > self.capacity:
            self.data.popitem(last=False)


cache = LRUCache(2)
cache.put("a", 1)
cache.put("b", 2)
assert cache.get("a") == 1
cache.put("c", 3)
assert cache.get("b") is None
```

## Как реализовать префиксное дерево (Trie)?

Каждый узел хранит переходы по символам и признак конца слова. Вставка и поиск
занимают `O(length(word))`.

```python
class Trie:
    def __init__(self) -> None:
        self.children: dict[str, "Trie"] = {}
        self.terminal = False

    def insert(self, word: str) -> None:
        node = self
        for char in word:
            node = node.children.setdefault(char, Trie())
        node.terminal = True

    def search(self, word: str) -> bool:
        node: Trie | None = self
        for char in word:
            node = node.children.get(char)
            if node is None:
                return False
        return node.terminal


trie = Trie()
trie.insert("cat")
assert trie.search("cat")
assert not trie.search("ca")
```

## Как найти длину кратчайшего word ladder?

Слова образуют рёбра, если отличаются ровно одной буквой. BFS гарантирует, что
первый найденный целевой путь кратчайший.

```python
from collections import deque


def word_ladder(begin: str, end: str, words: list[str]) -> int:
    dictionary = set(words)
    if end not in dictionary:
        return 0
    queue = deque([(begin, 1)])
    while queue:
        word, distance = queue.popleft()
        if word == end:
            return distance
        for index in range(len(word)):
            for char in "abcdefghijklmnopqrstuvwxyz":
                candidate = word[:index] + char + word[index + 1 :]
                if candidate in dictionary:
                    dictionary.remove(candidate)
                    queue.append((candidate, distance + 1))
    return 0


assert word_ladder("hit", "cog", ["hot", "dot", "dog", "lot", "log", "cog"]) == 5
```

## Как найти минимальное окно строки, содержащее все символы шаблона?

Скользящее окно расширяется вправо до выполнения требований, затем сжимается
слева. Счётчики позволяют проверять условие за `O(1)` на шаг.

```python
from collections import Counter


def min_window(text: str, pattern: str) -> str:
    if not pattern:
        return ""
    need = Counter(pattern)
    missing = len(pattern)
    left = best = 0
    best_length = float("inf")
    for right, char in enumerate(text, 1):
        if need[char] > 0:
            missing -= 1
        need[char] -= 1
        while missing == 0:
            if right - left < best_length:
                best = left
                best_length = right - left
            outgoing = text[left]
            need[outgoing] += 1
            if need[outgoing] > 0:
                missing += 1
            left += 1
    return "" if best_length == float("inf") else text[best : best + int(best_length)]


assert min_window("ADOBECODEBANC", "ABC") == "BANC"
```

## Как вычислить расстояние Левенштейна между двумя строками?

`dp[i][j]` — минимальное число вставок, удалений и замен для первых `i` и `j`
символов. Храним только предыдущую строку, поэтому память `O(min(n, m))`.

```python
def edit_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for i, left_char in enumerate(left, 1):
        current = [i]
        for j, right_char in enumerate(right, 1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[j] + 1,
                    previous[j - 1] + (left_char != right_char),
                )
            )
        previous = current
    return previous[-1]


assert edit_distance("kitten", "sitting") == 3
```

## Как найти минимальное число монет для заданной суммы?

Динамическое программирование хранит лучший результат для каждой суммы от нуля
до `amount`. Недостижимые суммы обозначаются значением `amount + 1`.

```python
def coin_change(coins: list[int], amount: int) -> int:
    dp = [amount + 1] * (amount + 1)
    dp[0] = 0
    for current in range(1, amount + 1):
        for coin in coins:
            if coin <= current:
                dp[current] = min(dp[current], dp[current - coin] + 1)
    return -1 if dp[amount] > amount else dp[amount]


assert coin_change([1, 2, 5], 11) == 3
assert coin_change([2], 3) == -1
```

## Как посчитать количество способов подняться по лестнице?

Если разрешены шаги на одну или две ступени, число способов удовлетворяет
рекуррентности Fibonacci: `ways[n] = ways[n-1] + ways[n-2]`.

```python
def climbing_stairs(steps: int) -> int:
    if steps < 0:
        return 0
    one, two = 1, 1
    for _ in range(steps):
        one, two = two, one + two
    return one


assert climbing_stairs(4) == 5
```

## Как найти максимальную сумму непересекающихся домов?

Для каждого дома выбирайте максимум между пропуском текущего дома и добавлением
его стоимости к результату до предыдущего дома.

```python
def house_robber(values: list[int]) -> int:
    previous_two = previous_one = 0
    for value in values:
        previous_two, previous_one = previous_one, max(previous_one, previous_two + value)
    return previous_one


assert house_robber([2, 7, 9, 3, 1]) == 12
```

## Как найти максимальную сумму пути в бинарном дереве?

Для каждого узла вычислите лучший нисходящий путь и отдельно обновляйте глобальный
ответ путём через узел и обоих детей. Отрицательные ветви можно отбросить.

```python
from dataclasses import dataclass


@dataclass
class PathNode:
    value: int
    left: "PathNode | None" = None
    right: "PathNode | None" = None


def max_path_sum(root: PathNode | None) -> int:
    if root is None:
        raise ValueError("tree must not be empty")
    best = float("-inf")

    def gain(node: PathNode | None) -> int:
        nonlocal best
        if node is None:
            return 0
        left = max(0, gain(node.left))
        right = max(0, gain(node.right))
        best = max(best, node.value + left + right)
        return node.value + max(left, right)

    gain(root)
    return int(best)


assert max_path_sum(PathNode(-10, PathNode(9), PathNode(20, PathNode(15), PathNode(7)))) == 42
```

## Как сериализовать и восстановить бинарное дерево?

Сериализуйте preorder-обход с маркером `#` для пустых ссылок. Такой формат
однозначно сохраняет и значения, и структуру дерева.

```python
from dataclasses import dataclass


@dataclass
class SerializableNode:
    value: int
    left: "SerializableNode | None" = None
    right: "SerializableNode | None" = None


def serialize(root: SerializableNode | None) -> str:
    values: list[str] = []

    def visit(node: SerializableNode | None) -> None:
        if node is None:
            values.append("#")
            return
        values.append(str(node.value))
        visit(node.left)
        visit(node.right)

    visit(root)
    return ",".join(values)


def deserialize(data: str) -> SerializableNode | None:
    tokens = iter(data.split(","))

    def build() -> SerializableNode | None:
        token = next(tokens)
        if token == "#":
            return None
        return SerializableNode(int(token), build(), build())

    return build()


tree = SerializableNode(1, SerializableNode(2), SerializableNode(3))
assert serialize(deserialize(serialize(tree))) == serialize(tree)
```

## Как найти `k`-й по величине элемент в BST?

Обход справа–узел–слева посещает BST в порядке убывания. Остановитесь после
посещения `k` узлов.

```python
from dataclasses import dataclass


@dataclass
class BstNode:
    value: int
    left: "BstNode | None" = None
    right: "BstNode | None" = None


def kth_largest(root: BstNode | None, k: int) -> int:
    if k <= 0:
        raise ValueError("k must be positive")
    seen = 0
    answer: int | None = None

    def visit(node: BstNode | None) -> None:
        nonlocal seen, answer
        if node is None or answer is not None:
            return
        visit(node.right)
        seen += 1
        if seen == k:
            answer = node.value
            return
        visit(node.left)

    visit(root)
    if answer is None:
        raise ValueError("k is larger than the tree")
    return answer


root = BstNode(4, BstNode(2, BstNode(1), BstNode(3)), BstNode(6, BstNode(5)))
assert kth_largest(root, 2) == 5
```

## Как проверить, существует ли путь с заданной суммой в дереве?

Передавайте в DFS остаток суммы после каждого узла. В листе успехом считается
нулевой остаток.

```python
from dataclasses import dataclass


@dataclass
class SumNode:
    value: int
    left: "SumNode | None" = None
    right: "SumNode | None" = None


def has_path_sum(root: SumNode | None, target: int) -> bool:
    if root is None:
        return False
    if root.left is None and root.right is None:
        return root.value == target
    remainder = target - root.value
    return has_path_sum(root.left, remainder) or has_path_sum(root.right, remainder)


root = SumNode(5, SumNode(4, SumNode(11, SumNode(7), SumNode(2))), SumNode(8))
assert has_path_sum(root, 22)
```

## Как инвертировать бинарное дерево?

На каждом узле поменяйте местами левого и правого ребёнка и продолжите рекурсию.
Операция выполняется за `O(n)`.

```python
from dataclasses import dataclass


@dataclass
class InvertNode:
    value: int
    left: "InvertNode | None" = None
    right: "InvertNode | None" = None


def invert_tree(root: InvertNode | None) -> InvertNode | None:
    if root is None:
        return None
    root.left, root.right = invert_tree(root.right), invert_tree(root.left)
    return root


root = InvertNode(1, InvertNode(2), InvertNode(3))
invert_tree(root)
assert root.left is not None and root.left.value == 3
```

## Как проверить, является ли бинарное дерево корректным BST?

Передавайте допустимый диапазон значений вниз по дереву. Каждый узел должен быть
строго больше нижней границы и меньше верхней.

```python
from dataclasses import dataclass


@dataclass
class ValidateNode:
    value: int
    left: "ValidateNode | None" = None
    right: "ValidateNode | None" = None


def is_valid_bst(root: ValidateNode | None) -> bool:
    def check(node: ValidateNode | None, low: int | None, high: int | None) -> bool:
        if node is None:
            return True
        if low is not None and node.value <= low:
            return False
        if high is not None and node.value >= high:
            return False
        return check(node.left, low, node.value) and check(node.right, node.value, high)

    return check(root, None, None)


assert is_valid_bst(ValidateNode(2, ValidateNode(1), ValidateNode(3)))
assert not is_valid_bst(ValidateNode(5, ValidateNode(1), ValidateNode(4)))
```

## Как развернуть односвязный список?

Идите по списку, перенаправляя `next` текущего узла на предыдущий. Все операции
выполняются на месте за `O(n)` и `O(1)` дополнительной памяти.

```python
class ListNode:
    def __init__(self, value: int, next_node: "ListNode | None" = None) -> None:
        self.value = value
        self.next = next_node


def reverse_linked_list(head: ListNode | None) -> ListNode | None:
    previous: ListNode | None = None
    current = head
    while current is not None:
        following = current.next
        current.next = previous
        previous, current = current, following
    return previous


head = ListNode(1, ListNode(2, ListNode(3)))
head = reverse_linked_list(head)
assert head is not None and head.value == 3 and head.next is not None and head.next.value == 2
```

## Как объединить два отсортированных односвязных списка?

Фиктивный головной узел упрощает обработку первого элемента. На каждом шаге
подсоединяйте меньший из двух текущих узлов.

```python
class MergeNode:
    def __init__(self, value: int, next_node: "MergeNode | None" = None) -> None:
        self.value = value
        self.next = next_node


def merge_lists(first: MergeNode | None, second: MergeNode | None) -> MergeNode | None:
    dummy = MergeNode(0)
    tail = dummy
    while first is not None and second is not None:
        if first.value <= second.value:
            tail.next, first = first, first.next
        else:
            tail.next, second = second, second.next
        tail = tail.next
    tail.next = first or second
    return dummy.next


merged = merge_lists(MergeNode(1, MergeNode(3)), MergeNode(2, MergeNode(4)))
assert merged is not None and [merged.value, merged.next.value, merged.next.next.value] == [1, 2, 3]
```

## Как удалить `n`-й узел с конца списка?

Два указателя сначала разделяются на `n` позиций, затем двигаются вместе. Фиктивный
узел корректно обрабатывает удаление самой головы.

```python
class RemoveNode:
    def __init__(self, value: int, next_node: "RemoveNode | None" = None) -> None:
        self.value = value
        self.next = next_node


def remove_nth_from_end(head: RemoveNode | None, n: int) -> RemoveNode | None:
    if n <= 0:
        raise ValueError("n must be positive")
    dummy = RemoveNode(0, head)
    fast: RemoveNode | None = dummy
    slow = dummy
    for _ in range(n):
        if fast.next is None:
            raise ValueError("n is too large")
        fast = fast.next
    while fast.next is not None:
        fast = fast.next
        slow = slow.next  # type: ignore[assignment]
    slow.next = slow.next.next if slow.next is not None else None
    return dummy.next


head = RemoveNode(1, RemoveNode(2, RemoveNode(3)))
head = remove_nth_from_end(head, 2)
assert head is not None and head.next is not None and head.next.value == 3
```

## Как проверить, является ли односвязный список палиндромом?

Найдите середину быстрым и медленным указателями, разверните вторую половину и
сравните значения двух половин.

```python
class PalindromeNode:
    def __init__(self, value: int, next_node: "PalindromeNode | None" = None) -> None:
        self.value = value
        self.next = next_node


def is_palindrome_list(head: PalindromeNode | None) -> bool:
    values: list[int] = []
    current = head
    while current is not None:
        values.append(current.value)
        current = current.next
    return values == values[::-1]


assert is_palindrome_list(PalindromeNode(1, PalindromeNode(2, PalindromeNode(1))))
```

## Как найти пересечение двух односвязных списков?

Каждый указатель проходит список `A`, затем `B`, поэтому после переключения длины
пройденных путей выравниваются. Сравнение должно быть по идентичности узлов.

```python
class IntersectionNode:
    def __init__(self, value: int, next_node: "IntersectionNode | None" = None) -> None:
        self.value = value
        self.next = next_node


def intersection_node(
    first: IntersectionNode | None, second: IntersectionNode | None
) -> IntersectionNode | None:
    left, right = first, second
    while left is not right:
        left = left.next if left is not None else second
        right = right.next if right is not None else first
    return left


shared = IntersectionNode(8)
first = IntersectionNode(1, shared)
second = IntersectionNode(2, IntersectionNode(3, shared))
assert intersection_node(first, second) is shared
```

## Как найти узел, с которого начинается цикл в списке?

Алгоритм Флойда сначала встречает быстрый и медленный указатели внутри цикла.
Затем один указатель возвращается в голову; следующий общий узел — начало цикла.

```python
class CycleNode:
    def __init__(self, value: int, next_node: "CycleNode | None" = None) -> None:
        self.value = value
        self.next = next_node


def cycle_start(head: CycleNode | None) -> CycleNode | None:
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            pointer = head
            while pointer is not slow:
                pointer = pointer.next
                slow = slow.next
            return pointer
    return None


start = CycleNode(2)
start.next = CycleNode(3, start)
head = CycleNode(1, start)
assert cycle_start(head) is start
```

## Как вычислить выражение в обратной польской записи?

Операнды складываются в стек, а оператор снимает два последних операнда и кладёт
результат обратно. Деление усекается к нулю.

```python
import operator


def eval_rpn(tokens: list[str]) -> int:
    operations = {"+": operator.add, "-": operator.sub, "*": operator.mul}
    stack: list[int] = []
    for token in tokens:
        if token in operations:
            right, left = stack.pop(), stack.pop()
            stack.append(operations[token](left, right))
        elif token == "/":
            right, left = stack.pop(), stack.pop()
            stack.append(int(left / right))
        else:
            stack.append(int(token))
    if len(stack) != 1:
        raise ValueError("invalid expression")
    return stack[0]


assert eval_rpn(["2", "1", "+", "3", "*"]) == 9
```

## Как для каждого дня найти ближайшую большую температуру?

Монотонный стек хранит индексы ещё не разрешённых дней. Когда текущая температура
выше температуры на вершине, расстояние между индексами даёт ответ.

```python
def daily_temperatures(temperatures: list[int]) -> list[int]:
    answer = [0] * len(temperatures)
    stack: list[int] = []
    for index, temperature in enumerate(temperatures):
        while stack and temperature > temperatures[stack[-1]]:
            previous = stack.pop()
            answer[previous] = index - previous
        stack.append(index)
    return answer


assert daily_temperatures([73, 74, 75, 71, 69, 72, 76, 73]) == [1, 1, 4, 2, 1, 1, 0, 0]
```

## Как найти площадь крупнейшего прямоугольника в гистограмме?

Добавьте нулевой столбец и монотонный стек индексов. При уменьшении высоты
закрывайте прямоугольники и вычисляйте их ширину по соседнему меньшему столбцу.

```python
def largest_histogram(heights: list[int]) -> int:
    stack: list[int] = []
    best = 0
    for index, height in enumerate(heights + [0]):
        while stack and heights[stack[-1]] > height:
            top = stack.pop()
            left = stack[-1] + 1 if stack else 0
            best = max(best, heights[top] * (index - left))
        stack.append(index)
    return best


assert largest_histogram([2, 1, 5, 6, 2, 3]) == 10
```

## Как найти следующий больший элемент справа для каждого числа?

Монотонный стек хранит индексы элементов, для которых ответ ещё не найден.
При появлении большего значения разрешаются все меньшие значения на вершине.

```python
def next_greater(values: list[int]) -> list[int | None]:
    result: list[int | None] = [None] * len(values)
    stack: list[int] = []
    for index, value in enumerate(values):
        while stack and value > values[stack[-1]]:
            result[stack.pop()] = value
        stack.append(index)
    return result


assert next_greater([2, 1, 2, 4, 3]) == [4, 2, 4, None, None]
```

## Как реализовать структуру Union-Find?

Каждое множество представлено корнем. Сжатие путей ускоряет последующие поиски,
а объединение по размеру не допускает длинных цепочек.

```python
class DisjointSet:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, value: int) -> int:
        if self.parent[value] != value:
            self.parent[value] = self.find(self.parent[value])
        return self.parent[value]

    def union(self, left: int, right: int) -> None:
        left_root, right_root = self.find(left), self.find(right)
        if left_root == right_root:
            return
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1


sets = DisjointSet(3)
sets.union(0, 1)
assert sets.find(0) == sets.find(1)
assert sets.find(0) != sets.find(2)
```

## Как получить топологический порядок ориентированного графа?

Алгоритм Кана начинает с вершин нулевой входящей степени. Если после удаления
рёбер посещены не все вершины, граф содержит цикл.

```python
from collections import deque


def topological_order(vertex_count: int, edges: list[tuple[int, int]]) -> list[int]:
    graph = [[] for _ in range(vertex_count)]
    indegree = [0] * vertex_count
    for source, target in edges:
        graph[source].append(target)
        indegree[target] += 1
    queue = deque(index for index, degree in enumerate(indegree) if degree == 0)
    order: list[int] = []
    while queue:
        current = queue.popleft()
        order.append(current)
        for neighbor in graph[current]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)
    if len(order) != vertex_count:
        raise ValueError("graph contains a cycle")
    return order


order = topological_order(3, [(0, 1), (1, 2)])
assert order.index(0) < order.index(1) < order.index(2)
```

## Как найти кратчайшие расстояния от вершины в графе с неотрицательными весами?

Алгоритм Дейкстры извлекает из минимальной кучи вершину с текущим лучшим
расстоянием и релаксирует её рёбра.

```python
import heapq


def dijkstra(graph: dict[str, list[tuple[str, int]]], start: str) -> dict[str, int]:
    distances = {vertex: float("inf") for vertex in graph}
    distances[start] = 0
    heap = [(0, start)]
    while heap:
        distance, vertex = heapq.heappop(heap)
        if distance != distances[vertex]:
            continue
        for neighbor, weight in graph[vertex]:
            candidate = distance + weight
            if candidate < distances[neighbor]:
                distances[neighbor] = candidate
                heapq.heappush(heap, (candidate, neighbor))
    return distances


graph = {"a": [("b", 4), ("c", 1)], "b": [("d", 1)], "c": [("b", 2), ("d", 5)], "d": []}
assert dijkstra(graph, "a")["d"] == 4
```

## Как выбрать максимальное число непересекающихся интервалов?

Отсортируйте встречи по времени окончания и всегда выбирайте первую совместимую.
Это жадное решение оптимально для задачи о выборе активностей.

```python
def select_activities(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    selected: list[tuple[int, int]] = []
    finish = float("-inf")
    for start, end in sorted(intervals, key=lambda interval: interval[1]):
        if start >= finish:
            selected.append((start, end))
            finish = end
    return selected


assert select_activities([(1, 3), (2, 4), (3, 5), (5, 7)]) == [(1, 3), (3, 5), (5, 7)]
```

## Как найти `k`-й по величине элемент без полной сортировки?

Quickselect разделяет массив вокруг опорного элемента и рекурсивно обрабатывает
только часть, содержащую искомый индекс. В среднем время `O(n)`.

```python
def quickselect(values: list[int], k: int) -> int:
    if not 0 <= k < len(values):
        raise IndexError("k out of range")
    items = values[:]
    left, right = 0, len(items) - 1
    while True:
        pivot = items[right]
        boundary = left
        for index in range(left, right):
            if items[index] <= pivot:
                items[boundary], items[index] = items[index], items[boundary]
                boundary += 1
        items[boundary], items[right] = items[right], items[boundary]
        if boundary == k:
            return items[boundary]
        if boundary < k:
            left = boundary + 1
        else:
            right = boundary - 1


assert quickselect([7, 2, 1, 6, 8, 5, 3, 4], 2) == 3
```

## Как выполнить reservoir sampling для одного случайного элемента потока?

На позиции `i` заменяйте текущий элемент с вероятностью `1 / (i + 1)`. Так любой
элемент конечного потока имеет одинаковую вероятность оказаться выбранным.

```python
import random


def reservoir_sample(values: list[int], seed: int | None = None) -> int:
    if not values:
        raise ValueError("stream must not be empty")
    generator = random.Random(seed)
    result = values[0]
    for index, value in enumerate(values[1:], 1):
        if generator.randrange(index + 1) == 0:
            result = value
    return result


assert reservoir_sample([10], seed=1) == 10
```

## Как реализовать хеш-таблицу с открытой адресацией?

Используйте линейное пробирование: при коллизии переходите к следующей ячейке.
Удалённый ключ отмечается специальным маркером, чтобы не ломать поиск.

```python
class HashMap:
    _DELETED = object()

    def __init__(self, capacity: int = 16) -> None:
        self._keys: list[object | None] = [None] * capacity
        self._values: list[object | None] = [None] * capacity

    def _slot(self, key: object) -> int:
        start = hash(key) % len(self._keys)
        index = start
        while self._keys[index] not in (None, key):
            index = (index + 1) % len(self._keys)
            if index == start:
                raise OverflowError("hash map is full")
        return index

    def put(self, key: object, value: object) -> None:
        index = self._slot(key)
        self._keys[index], self._values[index] = key, value

    def get(self, key: object) -> object | None:
        index = hash(key) % len(self._keys)
        start = index
        while self._keys[index] is not None:
            if self._keys[index] == key:
                return self._values[index]
            index = (index + 1) % len(self._keys)
            if index == start:
                break
        return None


mapping = HashMap()
mapping.put("answer", 42)
assert mapping.get("answer") == 42
assert mapping.get("missing") is None
```

## Как реализовать кэш с TTL для каждого ключа?

Вместе со значением храните абсолютное время истечения. При чтении просроченную
запись удаляйте и возвращайте `None`.

```python
import time


class TTLCache:
    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._items: dict[str, tuple[object, float]] = {}

    def put(self, key: str, value: object, ttl: float) -> None:
        if ttl < 0:
            raise ValueError("ttl must be non-negative")
        self._items[key] = (value, self._clock() + ttl)

    def get(self, key: str) -> object | None:
        item = self._items.get(key)
        if item is None:
            return None
        value, expires = item
        if self._clock() >= expires:
            del self._items[key]
            return None
        return value


now = [0.0]
cache = TTLCache(lambda: now[0])
cache.put("x", 1, 5)
assert cache.get("x") == 1
now[0] = 5
assert cache.get("x") is None
```

## Как ограничить число одновременно выполняемых async-задач?

`asyncio.Semaphore` ограничивает количество корутин внутри критической секции.
Результаты возвращаются в исходном порядке через `gather`.

```python
import asyncio


async def bounded_gather(values: list[int], limit: int) -> list[int]:
    semaphore = asyncio.Semaphore(limit)

    async def work(value: int) -> int:
        async with semaphore:
            await asyncio.sleep(0)
            return value * 2

    return await asyncio.gather(*(work(value) for value in values))


assert asyncio.run(bounded_gather([1, 2, 3], 2)) == [2, 4, 6]
```

## Как найти максимум в каждом окне длины `k`?

Дек хранит индексы в порядке убывания значений. Удаляйте устаревшие индексы
слева и меньшие значения с правого конца.

```python
from collections import deque


def sliding_window_max(values: list[int], size: int) -> list[int]:
    if size <= 0 or size > len(values):
        raise ValueError("invalid window size")
    result: list[int] = []
    window: deque[int] = deque()
    for index, value in enumerate(values):
        while window and window[0] <= index - size:
            window.popleft()
        while window and values[window[-1]] <= value:
            window.pop()
        window.append(index)
        if index >= size - 1:
            result.append(values[window[0]])
    return result


assert sliding_window_max([1, 3, -1, -3, 5, 3, 6, 7], 3) == [3, 3, 5, 5, 6, 7]
```

## Как реализовать стек, который возвращает минимум за `O(1)`?

Храните вместе с каждым значением минимум на текущей глубине стека. Тогда `min`
не требует отдельного прохода.

```python
class MinStack:
    def __init__(self) -> None:
        self._items: list[tuple[int, int]] = []

    def push(self, value: int) -> None:
        minimum = value if not self._items else min(value, self._items[-1][1])
        self._items.append((value, minimum))

    def pop(self) -> int:
        if not self._items:
            raise IndexError("empty stack")
        return self._items.pop()[0]

    def minimum(self) -> int:
        if not self._items:
            raise IndexError("empty stack")
        return self._items[-1][1]


stack = MinStack()
stack.push(3)
stack.push(1)
stack.push(2)
assert stack.minimum() == 1
```

## Как искать значение в повернутом отсортированном массиве?

Хотя одна половина массива всегда отсортирована, сравните target с её границами
и выберите половину для продолжения двоичного поиска.

```python
def search_rotated(values: list[int], target: int) -> int:
    left, right = 0, len(values) - 1
    while left <= right:
        middle = (left + right) // 2
        if values[middle] == target:
            return middle
        if values[left] <= values[middle]:
            if values[left] <= target < values[middle]:
                right = middle - 1
            else:
                left = middle + 1
        elif values[middle] < target <= values[right]:
            left = middle + 1
        else:
            right = middle - 1
    return -1


assert search_rotated([4, 5, 6, 7, 0, 1, 2], 0) == 4
```

## Как найти индекс локального максимума в массиве?

Сравнивайте середину с правым соседом. Если сосед больше, пик находится справа;
иначе пик находится в левой части, включая середину.

```python
def find_peak(values: list[int]) -> int:
    if not values:
        raise ValueError("array must not be empty")
    left, right = 0, len(values) - 1
    while left < right:
        middle = (left + right) // 2
        if values[middle] < values[middle + 1]:
            left = middle + 1
        else:
            right = middle
    return left


index = find_peak([1, 2, 3, 1])
assert index == 2
```

## Как объединить `k` отсортированных списков?

Минимальная куча содержит первый элемент каждого списка. После извлечения элемента
добавляйте следующий элемент из того же списка.

```python
import heapq


def merge_k_sorted(lists: list[list[int]]) -> list[int]:
    heap: list[tuple[int, int, int]] = []
    for list_index, values in enumerate(lists):
        if values:
            heapq.heappush(heap, (values[0], list_index, 0))
    result: list[int] = []
    while heap:
        value, list_index, element_index = heapq.heappop(heap)
        result.append(value)
        next_index = element_index + 1
        if next_index < len(lists[list_index]):
            heapq.heappush(heap, (lists[list_index][next_index], list_index, next_index))
    return result


assert merge_k_sorted([[1, 4], [2, 3], [0, 5]]) == [0, 1, 2, 3, 4, 5]
```

## Как найти медиану двух отсортированных массивов?

Выполните бинарный поиск по меньшему массиву и найдите разбиение, при котором все
элементы слева не больше элементов справа.

```python
def median_two_sorted(first: list[int], second: list[int]) -> float:
    if len(first) > len(second):
        return median_two_sorted(second, first)
    if not first and not second:
        raise ValueError("arrays must not both be empty")
    left, right = 0, len(first)
    half = (len(first) + len(second) + 1) // 2
    negative_inf, positive_inf = float("-inf"), float("inf")
    while left <= right:
        cut_first = (left + right) // 2
        cut_second = half - cut_first
        first_left = first[cut_first - 1] if cut_first else negative_inf
        first_right = first[cut_first] if cut_first < len(first) else positive_inf
        second_left = second[cut_second - 1] if cut_second else negative_inf
        second_right = second[cut_second] if cut_second < len(second) else positive_inf
        if first_left <= second_right and second_left <= first_right:
            if (len(first) + len(second)) % 2:
                return float(max(first_left, second_left))
            return (max(first_left, second_left) + min(first_right, second_right)) / 2
        if first_left > second_right:
            right = cut_first - 1
        else:
            left = cut_first + 1
    raise ValueError("arrays are not sorted")


assert median_two_sorted([1, 3], [2]) == 2.0
assert median_two_sorted([1, 2], [3, 4]) == 2.5
```

## Как посчитать объём trapped rain water?

Два указателя поддерживают максимумы слева и справа. Вода на меньшей стороне
определяется её максимумом, поэтому эту сторону можно безопасно обработать.

```python
def trapped_water(heights: list[int]) -> int:
    left, right = 0, len(heights) - 1
    left_max = right_max = result = 0
    while left < right:
        if heights[left] <= heights[right]:
            left_max = max(left_max, heights[left])
            result += left_max - heights[left]
            left += 1
        else:
            right_max = max(right_max, heights[right])
            result += right_max - heights[right]
            right -= 1
    return result


assert trapped_water([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]) == 6
```

## Как найти все уникальные тройки с суммой ноль?

После сортировки зафиксируйте первый элемент и применяйте два указателя к хвосту.
Пропускайте одинаковые значения, чтобы не возвращать дубликаты.

```python
def three_sum(values: list[int]) -> list[list[int]]:
    values = sorted(values)
    result: list[list[int]] = []
    for index in range(len(values) - 2):
        if index and values[index] == values[index - 1]:
            continue
        left, right = index + 1, len(values) - 1
        while left < right:
            total = values[index] + values[left] + values[right]
            if total == 0:
                result.append([values[index], values[left], values[right]])
                left += 1
                right -= 1
                while left < right and values[left] == values[left - 1]:
                    left += 1
            elif total < 0:
                left += 1
            else:
                right -= 1
    return result


assert three_sum([-1, 0, 1, 2, -1, -4]) == [[-1, -1, 2], [-1, 0, 1]]
```

## Как найти самую длинную палиндромную подстроку?

Рассмотрите каждый символ и каждую пару соседних символов как центр палиндрома,
расширяя границы наружу.

```python
def longest_palindrome(text: str) -> str:
    if not text:
        return ""
    best = (0, 1)

    def expand(left: int, right: int) -> None:
        nonlocal best
        while left >= 0 and right < len(text) and text[left] == text[right]:
            if right - left + 1 > best[1] - best[0]:
                best = (left, right + 1)
            left -= 1
            right += 1

    for index in range(len(text)):
        expand(index, index)
        expand(index, index + 1)
    return text[best[0] : best[1]]


assert longest_palindrome("babad") in {"bab", "aba"}
```

## Как сгруппировать слова-анаграммы?

Ключом группы служит отсортированная последовательность символов. Все слова с
одинаковым ключом состоят из одного набора букв.

```python
from collections import defaultdict


def group_anagrams(words: list[str]) -> list[list[str]]:
    groups: defaultdict[str, list[str]] = defaultdict(list)
    for word in words:
        groups["".join(sorted(word))].append(word)
    return list(groups.values())


groups = group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"])
assert {frozenset(group) for group in groups} == {
    frozenset({"eat", "tea", "ate"}),
    frozenset({"tan", "nat"}),
    frozenset({"bat"}),
}
```

## Как проверить, можно ли разбить строку на слова из словаря?

`dp[i]` означает, что префикс длины `i` разбивается. Для каждой позиции проверяйте
слова, заканчивающиеся в этой позиции.

```python
def word_break(text: str, dictionary: set[str]) -> bool:
    dp = [False] * (len(text) + 1)
    dp[0] = True
    for end in range(1, len(text) + 1):
        dp[end] = any(dp[start] and text[start:end] in dictionary for start in range(end))
    return dp[-1]


assert word_break("leetcode", {"leet", "code"})
assert not word_break("catsandog", {"cats", "dog", "sand", "and", "cat"})
```

## Как посчитать число способов декодировать цифровую строку?

Один символ даёт способ, если он не ноль; пара символов допустима в диапазоне
`10..26`. Динамика хранит два последних значения.

```python
def decode_ways(text: str) -> int:
    if not text or text[0] == "0":
        return 0
    previous_two, previous_one = 1, 1
    for index in range(1, len(text)):
        current = 0
        if text[index] != "0":
            current += previous_one
        if 10 <= int(text[index - 1 : index + 1]) <= 26:
            current += previous_two
        previous_two, previous_one = previous_one, current
    return previous_one


assert decode_ways("226") == 3
assert decode_ways("06") == 0
```

## Как посчитать число путей в прямоугольной сетке?

В клетку можно прийти сверху или слева, поэтому значение клетки равно сумме этих
двух значений. Одного массива достаточно для `O(columns)` памяти.

```python
def unique_paths(rows: int, columns: int) -> int:
    if rows <= 0 or columns <= 0:
        return 0
    dp = [1] * columns
    for _ in range(1, rows):
        for column in range(1, columns):
            dp[column] += dp[column - 1]
    return dp[-1]


assert unique_paths(3, 7) == 28
```

## Как проверить, можно ли разделить массив на две равные по сумме части?

Если общая сумма нечётна, ответ сразу отрицательный. Иначе решается задача
0/1-knapsack для половины суммы с множеством достижимых сумм.

```python
def can_partition(values: list[int]) -> bool:
    total = sum(values)
    if total % 2:
        return False
    target = total // 2
    possible = {0}
    for value in values:
        possible |= {current + value for current in possible if current + value <= target}
    return target in possible


assert can_partition([1, 5, 11, 5])
assert not can_partition([1, 2, 3, 5])
```

## Как найти длину наибольшей возрастающей подпоследовательности?

Массив `tails` хранит минимальный возможный хвост подпоследовательности каждой
длины. Бинарный поиск заменяет хвост за `O(n log n)`.

```python
from bisect import bisect_left


def lis_length(values: list[int]) -> int:
    tails: list[int] = []
    for value in values:
        index = bisect_left(tails, value)
        if index == len(tails):
            tails.append(value)
        else:
            tails[index] = value
    return len(tails)


assert lis_length([10, 9, 2, 5, 3, 7, 101, 18]) == 4
```

## Как найти максимальное произведение непрерывного подмассива?

Отрицательное число меняет местами текущие максимум и минимум, поэтому храните
обе величины. Ноль автоматически начинает новый подмассив.

```python
def max_product_subarray(values: list[int]) -> int:
    if not values:
        raise ValueError("array must not be empty")
    current_max = current_min = answer = values[0]
    for value in values[1:]:
        if value < 0:
            current_max, current_min = current_min, current_max
        current_max = max(value, current_max * value)
        current_min = min(value, current_min * value)
        answer = max(answer, current_max)
    return answer


assert max_product_subarray([2, 3, -2, 4]) == 6
```

## Как найти число подмассивов с суммой `k`?

Префиксная сумма позволяет выразить сумму текущего подмассива как разность двух
префиксов. Словарь хранит число предыдущих одинаковых префиксных сумм.

```python
from collections import defaultdict


def count_subarrays_sum(values: list[int], target: int) -> int:
    counts: defaultdict[int, int] = defaultdict(int)
    counts[0] = 1
    prefix = result = 0
    for value in values:
        prefix += value
        result += counts[prefix - target]
        counts[prefix] += 1
    return result


assert count_subarrays_sum([1, 1, 1], 2) == 2
```

## Как реализовать структуру для суммы диапазона неизменяемого массива?

Префиксные суммы позволяют отвечать на запрос `[left, right]` как `prefix[right+1]
- prefix[left]` за `O(1)` после построения за `O(n)`.

```python
class RangeSum:
    def __init__(self, values: list[int]) -> None:
        self.prefix = [0]
        for value in values:
            self.prefix.append(self.prefix[-1] + value)

    def query(self, left: int, right: int) -> int:
        if not 0 <= left <= right < len(self.prefix) - 1:
            raise IndexError("invalid range")
        return self.prefix[right + 1] - self.prefix[left]


range_sum = RangeSum([-2, 0, 3, -5, 2, -1])
assert range_sum.query(0, 2) == 1
```

## Как реализовать дерево Фенвика для точечных обновлений и сумм префикса?

Индекс `i` хранит сумму блока длины `lowbit(i)`. Обновление и запрос используют
переход `i += i & -i` или `i -= i & -i` и работают за `O(log n)`.

```python
class FenwickTree:
    def __init__(self, size: int) -> None:
        self.tree = [0] * (size + 1)

    def add(self, index: int, value: int) -> None:
        index += 1
        while index < len(self.tree):
            self.tree[index] += value
            index += index & -index

    def prefix_sum(self, end: int) -> int:
        result = 0
        index = end
        while index > 0:
            result += self.tree[index]
            index -= index & -index
        return result

    def range_sum(self, left: int, right: int) -> int:
        return self.prefix_sum(right + 1) - self.prefix_sum(left)


fenwick = FenwickTree(4)
for position, value in enumerate([1, 2, 3, 4]):
    fenwick.add(position, value)
assert fenwick.range_sum(1, 3) == 9
```

## Как найти кратчайший путь в сетке с препятствиями?

BFS по четырём направлениям посещает клетки по расстоянию от старта. Клетки со
значением `1` считаются препятствиями и не добавляются в очередь.

```python
from collections import deque


def shortest_grid_path(grid: list[list[int]], start: tuple[int, int], finish: tuple[int, int]) -> int:
    if not grid:
        return -1
    rows, cols = len(grid), len(grid[0])
    if grid[start[0]][start[1]] or grid[finish[0]][finish[1]]:
        return -1
    queue = deque([(start[0], start[1], 0)])
    seen = {start}
    while queue:
        row, col, distance = queue.popleft()
        if (row, col) == finish:
            return distance
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            next_cell = (row + dr, col + dc)
            if (
                0 <= next_cell[0] < rows
                and 0 <= next_cell[1] < cols
                and next_cell not in seen
                and grid[next_cell[0]][next_cell[1]] == 0
            ):
                seen.add(next_cell)
                queue.append((*next_cell, distance + 1))
    return -1


assert shortest_grid_path([[0, 0, 0], [1, 1, 0], [0, 0, 0]], (0, 0), (2, 2)) == 4
```

## Как проверить, можно ли посетить все встречи?

После сортировки по времени начала достаточно сравнить начало текущей встречи с
концом предыдущей. Пересечение означает конфликт.

```python
def can_attend_all(intervals: list[tuple[int, int]]) -> bool:
    ordered = sorted(intervals)
    return all(current[0] >= previous[1] for previous, current in zip(ordered, ordered[1:]))


assert can_attend_all([(0, 30), (35, 40)])
assert not can_attend_all([(0, 30), (20, 40)])
```

## Как найти минимальное число переговорных комнат?

Отсортируйте начала и концы встреч отдельно и продвигайте указатель окончания,
если следующая встреча начинается после освобождения комнаты.

```python
def min_meeting_rooms(intervals: list[tuple[int, int]]) -> int:
    if not intervals:
        return 0
    starts = sorted(start for start, _ in intervals)
    ends = sorted(end for _, end in intervals)
    start_index = end_index = rooms = 0
    while start_index < len(starts):
        if starts[start_index] < ends[end_index]:
            rooms += 1
            start_index += 1
        else:
            start_index += 1
            end_index += 1
    return rooms


assert min_meeting_rooms([(0, 30), (5, 10), (15, 20)]) == 2
```

## Как реализовать календарь, запрещающий пересекающиеся события?

Храните отсортированный список событий и при добавлении проверяйте только соседей
в месте вставки. Для небольшого календаря это простое корректное решение.

```python
from bisect import bisect_left


class Calendar:
    def __init__(self) -> None:
        self.events: list[tuple[int, int]] = []

    def book(self, start: int, end: int) -> bool:
        if start >= end:
            raise ValueError("start must be before end")
        index = bisect_left(self.events, (start, end))
        if index and self.events[index - 1][1] > start:
            return False
        if index < len(self.events) and self.events[index][0] < end:
            return False
        self.events.insert(index, (start, end))
        return True


calendar = Calendar()
assert calendar.book(10, 20)
assert not calendar.book(15, 25)
assert calendar.book(20, 25)
```

## Как расплющить вложенный JSON-объект в словарь путей?

Рекурсивно добавляйте ключ к префиксу. Списки получают числовые компоненты пути,
а листовые значения становятся значениями результата.

```python
def flatten_json(value: object, prefix: str = "") -> dict[str, object]:
    result: dict[str, object] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            result.update(flatten_json(child, path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            path = f"{prefix}[{index}]"
            result.update(flatten_json(child, path))
    else:
        result[prefix] = value
    return result


assert flatten_json({"user": {"name": "Ann", "tags": ["ai", "rag"]}}) == {
    "user.name": "Ann",
    "user.tags[0]": "ai",
    "user.tags[1]": "rag",
}
```

## Как рекурсивно объединить два словаря конфигурации?

Ключи второго словаря имеют приоритет. Если оба значения — словари, их нужно
объединить рекурсивно, не изменяя исходные объекты.

```python
def deep_merge(base: dict[str, object], override: dict[str, object]) -> dict[str, object]:
    result = dict(base)
    for key, value in override.items():
        if isinstance(result.get(key), dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)  # type: ignore[arg-type]
        else:
            result[key] = value
    return result


assert deep_merge({"a": {"x": 1}, "b": 2}, {"a": {"y": 3}}) == {"a": {"x": 1, "y": 3}, "b": 2}
```

## Как выполнить повтор операции с экспоненциальной задержкой?

Задержка растёт как `base * 2^attempt` и ограничивается максимумом. Функция
принимает `sleep`, чтобы тест не ждал реальное время.

```python
from collections.abc import Callable


def retry(operation: Callable[[], int], attempts: int, base: float, sleep: Callable[[float], None]) -> int:
    if attempts <= 0:
        raise ValueError("attempts must be positive")
    for attempt in range(attempts):
        try:
            return operation()
        except Exception:
            if attempt == attempts - 1:
                raise
            sleep(base * (2**attempt))
    raise AssertionError("unreachable")


calls = [0]


def flaky() -> int:
    calls[0] += 1
    if calls[0] < 3:
        raise RuntimeError("temporary")
    return 7


delays: list[float] = []
assert retry(flaky, 3, 0.1, delays.append) == 7
assert delays == [0.1, 0.2]
```

## Как реализовать token-bucket ограничитель скорости?

Ведите число доступных токенов и время последнего пополнения. Каждый запрос
потребляет токен; неиспользованные токены не превышают ёмкость ведра.

```python
class TokenBucket:
    def __init__(self, capacity: float, refill_per_second: float, clock) -> None:
        self.capacity = capacity
        self.refill_rate = refill_per_second
        self.clock = clock
        self.tokens = capacity
        self.last = clock()

    def allow(self, cost: float = 1) -> bool:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.refill_rate)
        self.last = now
        if self.tokens < cost:
            return False
        self.tokens -= cost
        return True


time_value = [0.0]
bucket = TokenBucket(2, 1, lambda: time_value[0])
assert bucket.allow() and bucket.allow() and not bucket.allow()
time_value[0] = 1
assert bucket.allow()
```

## Как поддерживать скользящее среднее последних `k` значений?

Очередь хранит окно, а переменная `total` — его сумму. При переполнении удаляйте
самое старое значение, поэтому добавление и вычисление занимают `O(1)`.

```python
from collections import deque


class MovingAverage:
    def __init__(self, size: int) -> None:
        if size <= 0:
            raise ValueError("size must be positive")
        self.size = size
        self.values: deque[float] = deque()
        self.total = 0.0

    def add(self, value: float) -> float:
        self.values.append(value)
        self.total += value
        if len(self.values) > self.size:
            self.total -= self.values.popleft()
        return self.total / len(self.values)


average = MovingAverage(3)
assert average.add(1) == 1
assert average.add(2) == 1.5
assert average.add(4) == 7 / 3
assert average.add(8) == 14 / 3
```

## Как слить несколько отсортированных генераторов?

Минимальная куча содержит текущее значение и итератор-источник. После выдачи
элемента продвигайте только его источник.

```python
import heapq
from collections.abc import Iterable, Iterator


def merge_generators(sources: list[Iterable[int]]) -> Iterator[int]:
    heap: list[tuple[int, int, Iterator[int]]] = []
    for source_index, source in enumerate(sources):
        iterator = iter(source)
        try:
            heapq.heappush(heap, (next(iterator), source_index, iterator))
        except StopIteration:
            pass
    while heap:
        value, source_index, iterator = heapq.heappop(heap)
        yield value
        try:
            heapq.heappush(heap, (next(iterator), source_index, iterator))
        except StopIteration:
            pass


assert list(merge_generators([[1, 4], [2, 3], [0, 5]])) == [0, 1, 2, 3, 4, 5]
```

## Как агрегировать строки логов по коду ошибки?

Извлеките код из каждой строки и используйте `Counter`. Это позволяет получить
частоты за один проход по потоку логов.

```python
from collections import Counter


def error_counts(lines: list[str]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for line in lines:
        parts = line.split()
        if len(parts) >= 2 and parts[1].startswith("E"):
            counts[parts[1]] += 1
    return dict(counts)


assert error_counts(["10 E_TIMEOUT", "11 E_IO", "12 E_TIMEOUT"]) == {"E_TIMEOUT": 2, "E_IO": 1}
```

## Как разобрать CSV-строку с запятыми внутри кавычек?

Не разделяйте CSV простым `split(',')`: стандартный модуль учитывает кавычки,
экранирование и переводы строк.

```python
import csv
from io import StringIO


def parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(StringIO(text)))


assert parse_csv('name,comment\nAnn,"hello, world"') == [["name", "comment"], ["Ann", "hello, world"]]
```
