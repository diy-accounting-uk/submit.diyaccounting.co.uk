/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;

class KindTest {

    @Test
    void putIf() {
        Map<String, String> m = new HashMap<>();
        Kind.putIfNotNull(m, "a", null);
        assertFalse(m.containsKey("a"));
        Kind.putIfNotNull(m, "a", "v");
        assertEquals("v", m.get("a"));

        Kind.putIfPresent(m, "b", Optional.empty());
        assertFalse(m.containsKey("b"));
        Kind.putIfPresent(m, "b", Optional.of("w"));
        assertEquals("w", m.get("b"));
    }

    @Test
    @SetEnvironmentVariable(key = "TEST_ENV", value = "env-value")
    void envOrPicksEnvOrDefault() {
        assertEquals("env-value", Kind.envOr("TEST_ENV", "alt"));
        assertEquals("alt", Kind.envOr("MISSING_ENV", "alt", "(default)"));
    }
}
