/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability OPS-126 Provide config-composition helpers for CDK code
// - **Use when:** Java CDK config code needs order-preserving maps or null-tolerant merges instead of double-brace hacks.
// - **Does:** Kind is a set of tiny, static, null-tolerant helpers, such as order-preserving maps and explicit merge, that make Java CDK config code read like JS or Node config, documented in KIND.md. KindCdk builds on it for CDK-specific concerns: environment setup, CloudFormation outputs and AwsCustomResource provider management. PopulatedMap extends HashMap to throw on any blank key or value.
// - **Run:** no command; see Does and Entry
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/utils/Kind.java`; `infra/main/java/co/uk/diyaccounting/submit/utils/KindCdk.java`; `infra/main/java/co/uk/diyaccounting/submit/utils/PopulatedMap.java`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/utils/Kind.java, infra/main/java/co/uk/diyaccounting/submit/utils/KindCdk.java, ../private.diyaccounting.co.uk/engineering/submit/archive/infra/main/java/co/uk/diyaccounting/submit/utils/KIND.md, infra/main/java/co/uk/diyaccounting/submit/utils/PopulatedMap.java, infra/test/java/co/uk/diyaccounting/submit/utils/KindTest.java, infra/test/java/co/uk/diyaccounting/submit/utils/KindCdkTest.java
// - **Keywords:** kind helpers, config composition, cdk config, null-tolerant map, populatedmap
// - **Related:** OPS-127
// @end-capability
// spotless:on

package co.uk.diyaccounting.submit.utils;

import java.util.Map;
import java.util.Optional;

public final class Kind {
    private Kind() {}

    public static void logf(String fmt, Object... args) {
        System.out.printf(fmt + "%n", args);
    }

    public static void infof(String fmt, Object... args) {
        logf("[INFO] " + fmt, args);
    }

    public static void warnf(String fmt, Object... args) {
        logf("[WARN] " + fmt, args);
    }

    // Safe putIfNotNull
    public static <K, V> void putIfNotNull(Map<K, V> map, K key, V value) {
        if (value != null) {
            map.put(key, value);
            infof("Put key %s with value %s", key, value);
        } else {
            infof("Did not put key %s with null/empty value %s", key, value);
        }
    }

    public static <K, V> void putIfPresent(Map<K, V> map, K key, Optional<? extends V> value) {
        if (value != null && value.isPresent()) {
            map.put(key, value.get());
            infof("Put key %s with value %s", key, value);
        } else {
            infof("Did not put key %s with null/empty value %s", key, value);
        }
    }

    public static String envOr(String environmentVariable, String alternativeValue) {
        return envOr(environmentVariable, alternativeValue, "");
    }

    public static String envOr(String environmentVariable, String alternativeValue, String alternativeSource) {
        String environmentValue = System.getenv(environmentVariable);
        if (environmentValue != null && !environmentValue.isBlank()) {
            infof("Using environment variable %s for value %s", environmentVariable, environmentValue);
            return environmentValue;
        } else {
            var sourceLabel = alternativeSource == null ? "" : " " + alternativeSource;
            infof(
                    "Using environment variable %s is null or blank using alternative%s, value %s",
                    environmentVariable, sourceLabel, alternativeValue);
            return alternativeValue;
        }
    }
}
