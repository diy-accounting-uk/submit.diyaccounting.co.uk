<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

Kind.java = tiny, static, null-tolerant helpers that make Java config code read like Node. Defaults are explicit: order-preserving maps, last-writer-wins, no double-brace hacks, and clear escape hatches for strict merges. Uses Java 21 sequenced collections where relevant. ([OpenJDK][1])

# KIND

Minimal helpers for expressive, JS-style config composition in Java.

## Why

* Preserve encounter order by default using `LinkedHashMap`, which aligns with Java 21 `SequencedMap`. ([Oracle Docs][2])
* Make merge intent explicit and safe via `Map.merge` and friends. ([Oracle Docs][3])
* Avoid double-brace initialization and its pitfalls. ([errorprone.info][4])
* Keep names conventional: class `Kind`, package lowercase. ([Oracle][5])

## Install

Plain source. No dependencies.

```
src/main/java/co/uk/diyaccounting/util/Kind.java
```

## API

### `concat`

Order-preserving merge. Later maps win.

```java
var merged = Kind.concat(mapA, mapB, mapC);
```

### `concatWith`

Order-preserving merge with conflict policy.

```java
var keepFirst = Kind.concatWith((oldV, newV) -> oldV, a, b);
var keepSecond = Kind.concatWith((oldV, newV) -> newV, a, b);
```

Uses `Map.merge` under the hood. ([Oracle Docs][3])

### `concatLoose`

Stringifies keys and accepts any values. Good for ‘config blobs’.

```java
Map<String,Object> cfg = Kind.concatLoose(
    Map.of("timeout", 30),
    Map.of(42, "answer")  // key becomes "42"
);
```

### `concatImmutable`

Immutable snapshot of `concat`.

```java
Map<K,V> imm = Kind.concatImmutable(a, b);
```

Equivalent to `Map.copyOf(concat(...))` semantics. See unmodifiable collectors for related behavior. ([Oracle Docs][6])

### `orEmpty`

Null-to-empty.

```java
Map<K,V> safe = Kind.orEmpty(possiblyNull);
```

### `obj`

Tiny ‘object literal’ for quick small maps.

```java
Map<String,Object> m = Kind.obj(
    "name", "service",
    "retries", 3
);
```

## Design choices

* `LinkedHashMap` for predictable iteration order and sequenced ops. ([Oracle Docs][2])
* No double-brace init to avoid anonymous-class baggage. ([errorprone.info][4])
* Static methods on `Kind` for discoverability and idiomatic calls via static import. Naming follows standard Java conventions. ([Oracle][5])

## Example

```java
import static co.uk.diyaccounting.util.Kind.*;

Map<String, BehaviorOptions> merged = concat(
    authStack.additionalOriginsBehaviourMappings,
    applicationStack.additionalOriginsBehaviourMappings
);

// Strict policy example: keep first on clashes
Map<String, BehaviorOptions> strict = concatWith((oldV, newV) -> oldV,
    authStack.additionalOriginsBehaviourMappings,
    applicationStack.additionalOriginsBehaviourMappings
);
```

## Coming next

A focused set of static helpers to ‘nodeify’ everyday Java without magic.

**Maps**

* `pick(m, keys...)` – subset by keys, preserves order.
* `omit(m, keys...)` – drop keys.
* `defaults(base, overrides...)` – like concat but ‘first writer wins’.
* `deepMerge(a, b, combiner)` – recursive merge for `Map<String, Object>`.
* `coerceKeys(m, fn)` – transform keys (e.g., to kebab\_case).
* `ensure(m, key, supplier)` – get or put if absent.

**Collections**

* `listOfNonNull(values...)` – skips nulls.
* `concatLists(lists...)` – flatten lists.
* `uniq(list)` – stable dedupe.
* `partition(list, predicate)` – `[pass, fail]`.
* `chunk(list, size)` – split into fixed sizes.

**Strings and paths**

* `joinPath(parts...)` – clean join with single separators.
* `trimToNull(s)` / `nullToEmpty(s)` – common sanitizers.
* `stripPrefix(s, prefix)` / `stripSuffix(s, suffix)` – safe removals.

**Env and props**

* `env(name, def)` – get env var with default.
* `prop(name, def)` – system property with default.
* `parseDuration("10s")` → `Duration` – minimal units: ms, s, m, h.

**Numbers and parsing**

* `toInt(obj, def)` / `toLong` / `toBool` – tolerant coercions.
* `clamp(n, min, max)` – bound a number.

**JSON-adjacent**

* `jsonDecode(str)` → `Map<String,Object>` using JDK JSON if present or pluggable adapter.
* `jsonEncode(obj)` – minimal serializer for primitives, maps, lists.

**Timing and retries**

* `sleepQuietly(Duration)` – no checked exception leakage.
* `retry(times, delay, Supplier<T>)` – simple retry with fixed delay.

**Sequenced collections (Java 21+)**

* `reverse(m)` – reverse encounter order of a `SequencedMap`.
* `firstEntry(m)` / `lastEntry(m)` – concise front/back access. ([OpenJDK][1])

**Stream shortcuts**

* `toLinkedMap(stream, keyFn, valFn)` – collector alias that keeps order.
* `toUnmodifiableMap(stream, keyFn, valFn, mergeFn)` – immutable result. ([Oracle Docs][6])

## Non-goals

* No hidden global state.
* No reflection.
* No opinionated logging or frameworks.

## License

MIT.

[1]: https://openjdk.org/jeps/431?utm_source=chatgpt.com "JEP 431: Sequenced Collections"
[2]: https://docs.oracle.com/javase/8/docs/api/java/util/LinkedHashMap.html?utm_source=chatgpt.com "LinkedHashMap (Java Platform SE 8 )"
[3]: https://docs.oracle.com/javase/8/docs/api/java/util/Map.html?utm_source=chatgpt.com "Map (Java Platform SE 8 )"
[4]: https://errorprone.info/bugpattern/DoubleBraceInitialization?utm_source=chatgpt.com "DoubleBraceInitialization"
[5]: https://www.oracle.com/java/technologies/javase/codeconventions-namingconventions.html?utm_source=chatgpt.com "9. Naming Conventions"
[6]: https://docs.oracle.com/javase/10/docs/api/java/util/stream/Collectors.html?utm_source=chatgpt.com "Collectors (Java SE 10 & JDK 10 )"
