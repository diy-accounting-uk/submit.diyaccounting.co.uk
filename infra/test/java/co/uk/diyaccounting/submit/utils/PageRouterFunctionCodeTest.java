/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PageRouterFunctionCodeTest {

    @Test
    void pagesAreGroupedByDirectoryWithoutTheirExtensionAndOtherBehavioursAreLeftOut() {
        Map<String, String> pages = PageRouterFunctionCode.pagesOf(List.of(
                "index.html",
                "about.html",
                "submit.css",
                "cy/index.html",
                "hmrc/vat/submitVat.html",
                "docs/api/index.html",
                "tests/index.html",
                "embed/checker.html",
                ".well-known/openai-apps-challenge"));

        assertEquals(Map.of("", "about index", "cy/", "index", "hmrc/vat/", "submitVat"), pages);
    }

    @Test
    void aFileWithNoExtensionOutsideWellKnownStopsTheBuild() {
        assertThrows(IllegalStateException.class, () -> PageRouterFunctionCode.pagesOf(List.of("robots")));
    }

    @Test
    void theDataLinesAreFilledAndCommentLinesAreDropped() {
        String template = "// a comment\nconst PAGES = {};\nconst NOT_FOUND_HTML = \"\";\n\nfunction handler() {}\n";

        String code = PageRouterFunctionCode.build(template, Map.of("", "about"), "<h1>\"Page\"</h1>");

        assertEquals(
                "const PAGES = {\"\":\"about\"};\nconst NOT_FOUND_HTML = \"<h1>\\\"Page\\\"</h1>\";\nfunction handler() {}\n",
                code);
    }

    @Test
    void aTemplateWithoutTheDataLinesStopsTheBuild() {
        assertThrows(
                IllegalStateException.class, () -> PageRouterFunctionCode.build("function handler() {}", Map.of(), ""));
    }

    @Test
    void codeOverCloudFrontsTenKilobyteLimitStopsTheBuild() {
        String template = "const PAGES = {};\nconst NOT_FOUND_HTML = \"\";\n";

        assertThrows(
                IllegalStateException.class, () -> PageRouterFunctionCode.build(template, Map.of(), "x".repeat(10240)));
    }

    @Test
    void thePublishedSiteFitsInOneFunctionAndListsTheWelshHomePage() {
        String code = PageRouterFunctionCode.fromDisk(
                Path.of("web/public").toAbsolutePath(),
                Path.of("app/functions/edge").toAbsolutePath());

        assertTrue(code.getBytes(StandardCharsets.UTF_8).length <= PageRouterFunctionCode.MAX_FUNCTION_BYTES);
        assertTrue(code.matches("(?s).*\"cy/\":\"[^\"]*\\bindex\\b.*"), "cy/index.html is listed");
        assertFalse(code.contains("// "), "comment lines are dropped");
    }
}
