/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class ResourceNameUtilsTest {

    @Test
    void camelCaseAndDotConversions() {
        assertEquals("my-func-name", ResourceNameUtils.convertCamelCaseToDashSeparated("MyFuncName"));
        assertEquals("my-name", ResourceNameUtils.convertCamelCaseToDashSeparated("myName"));
        assertEquals("my-func", ResourceNameUtils.convertCamelCaseToDashSeparated("my_func.ingestHandler"));
        assertEquals("my-func", ResourceNameUtils.convertCamelCaseToDashSeparated("my_func.workerHandler"));

        assertEquals("a-b-c", ResourceNameUtils.convertDotSeparatedToDashSeparated("a.b.c"));
        // With custom mapping applied twice
        var mappings = List.of(new java.util.AbstractMap.SimpleEntry<>(java.util.regex.Pattern.compile("b"), "bee"));
        assertEquals("a-bee-c", ResourceNameUtils.convertDotSeparatedToDashSeparated("a.b.c", mappings));
    }

    @Test
    void iamCompatibleAndOtherNames() {
        String name = ResourceNameUtils.generateIamCompatibleName("my@prefix#bad", "role$name");
        assertTrue(name.matches("[A-Za-z0-9+=,.@-]+"));
        assertTrue(name.length() <= 64);
        assertTrue(name.contains("my@prefix-"));
    }
}
