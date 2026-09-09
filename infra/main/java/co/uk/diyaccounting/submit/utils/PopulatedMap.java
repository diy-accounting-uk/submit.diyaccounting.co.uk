/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// infra/main/java/co/uk/diyaccounting/submit/utils/PopulatedMap.java
package co.uk.diyaccounting.submit.utils;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.BiFunction;
import java.util.function.Function;

public final class PopulatedMap<K extends CharSequence, V extends CharSequence> extends HashMap<K, V> {

    public PopulatedMap() {}

    public PopulatedMap(int initialCapacity) {
        super(initialCapacity);
    }

    public PopulatedMap(Map<? extends K, ? extends V> m) {
        putAll(m);
    }

    public PopulatedMap<K, V> with(K key, V value) {
        put(key, value);
        return this;
    }

    private static boolean isBlank(CharSequence cs) {
        if (cs == null) return true;
        int len = cs.length();
        for (int i = 0; i < len; i++) {
            if (!Character.isWhitespace(cs.charAt(i))) return false;
        }
        return true;
    }

    private static <T extends CharSequence> T requireNonBlank(T cs, String what) {
        Objects.requireNonNull(cs, what + " must not be null");
        if (isBlank(cs)) {
            throw new IllegalArgumentException(what + " must not be blank");
        }
        return cs;
    }

    @Override
    public V put(K key, V value) {
        requireNonBlank(key, "key");
        requireNonBlank(value, "value");
        return super.put(key, value);
    }

    @Override
    public void putAll(Map<? extends K, ? extends V> m) {
        for (var e : m.entrySet()) {
            requireNonBlank(e.getKey(), "key");
            requireNonBlank(e.getValue(), "value");
        }
        super.putAll(m);
    }

    @Override
    public V putIfAbsent(K key, V value) {
        requireNonBlank(key, "key");
        requireNonBlank(value, "value");
        return super.putIfAbsent(key, value);
    }

    @Override
    public V replace(K key, V value) {
        requireNonBlank(key, "key");
        requireNonBlank(value, "value");
        return super.replace(key, value);
    }

    @Override
    public boolean replace(K key, V oldValue, V newValue) {
        requireNonBlank(key, "key");
        requireNonBlank(oldValue, "oldValue");
        requireNonBlank(newValue, "newValue");
        return super.replace(key, oldValue, newValue);
    }

    @Override
    public V compute(K key, BiFunction<? super K, ? super V, ? extends V> remappingFunction) {
        requireNonBlank(key, "key");
        Objects.requireNonNull(remappingFunction, "remappingFunction");
        V result = super.compute(key, remappingFunction);
        if (result == null || isBlank(result)) {
            throw new IllegalArgumentException("compute produced null or blank value");
        }
        return result;
    }

    @Override
    public V computeIfAbsent(K key, Function<? super K, ? extends V> mappingFunction) {
        requireNonBlank(key, "key");
        Objects.requireNonNull(mappingFunction, "mappingFunction");
        return super.computeIfAbsent(key, k -> {
            V v = mappingFunction.apply(k);
            if (v == null || isBlank(v)) {
                throw new IllegalArgumentException("computeIfAbsent produced null or blank value");
            }
            return v;
        });
    }

    @Override
    public V computeIfPresent(K key, BiFunction<? super K, ? super V, ? extends V> remappingFunction) {
        requireNonBlank(key, "key");
        Objects.requireNonNull(remappingFunction, "remappingFunction");
        return super.computeIfPresent(key, (k, v) -> {
            V nv = remappingFunction.apply(k, v);
            if (nv == null || isBlank(nv)) {
                throw new IllegalArgumentException("computeIfPresent produced null or blank value");
            }
            return nv;
        });
    }

    @Override
    public V merge(K key, V value, BiFunction<? super V, ? super V, ? extends V> remappingFunction) {
        requireNonBlank(key, "key");
        requireNonBlank(value, "value");
        Objects.requireNonNull(remappingFunction, "remappingFunction");
        V result = super.merge(key, value, (oldV, newV) -> {
            V nv = remappingFunction.apply(oldV, newV);
            if (nv == null || isBlank(nv)) {
                throw new IllegalArgumentException("merge produced null or blank value");
            }
            return nv;
        });
        if (result == null || isBlank(result)) {
            throw new IllegalArgumentException("merge resulted in null or blank value");
        }
        return result;
    }
}
