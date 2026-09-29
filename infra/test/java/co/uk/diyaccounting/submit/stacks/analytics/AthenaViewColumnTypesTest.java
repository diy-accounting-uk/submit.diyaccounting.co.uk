/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Athena cannot store a column of type {@code timestamp with time zone} in a view: the
 * {@code CREATE VIEW} statement fails and the stack that owns the view rolls back. The offending
 * expressions are {@code from_iso8601_timestamp(...)}, {@code current_timestamp} and
 * {@code ... AT TIME ZONE ...}; each must be wrapped in {@code CAST(... AS timestamp)},
 * {@code CAST(... AS date)} or {@code date(...)} wherever it reaches the final SELECT list.
 * Expressions inside CTEs and subqueries are not stored, so only the outermost SELECT list is read.
 */
class AthenaViewColumnTypesTest {

    private static final Path VIEWS_DIRECTORY = Path.of("main/resources/analytics/views");

    private static final Pattern TIME_ZONE_EXPRESSION =
            Pattern.compile("from_iso8601_timestamp\\s*\\(|current_timestamp|at\\s+time\\s+zone");

    private static final Pattern TIME_ZONE_TYPE_NAME = Pattern.compile("with\\s+time\\s+zone");

    @Test
    void everyViewProjectsOnlyColumnTypesAthenaCanStore() throws IOException {
        Path directory = Files.isDirectory(VIEWS_DIRECTORY)
                ? VIEWS_DIRECTORY
                : Path.of("infra").resolve(VIEWS_DIRECTORY);
        List<String> offences = new ArrayList<>();
        int viewCount = 0;
        try (Stream<Path> files = Files.list(directory)) {
            for (Path file :
                    files.filter(f -> f.toString().endsWith(".sql")).sorted().toList()) {
                viewCount++;
                for (String offence : findTimeZoneColumns(Files.readString(file))) {
                    offences.add(file.getFileName() + ": " + offence);
                }
            }
        }
        assertTrue(viewCount > 0, "no view SQL found under " + directory);
        assertEquals(List.of(), offences, "views project a type Athena cannot store in a view");
    }

    @Test
    void bareFromIso8601TimestampInTheFinalSelectListIsFlagged() {
        String sql =
                "CREATE OR REPLACE VIEW v AS\nSELECT from_iso8601_timestamp(hour) AS hour, count(*) AS n\nFROM t GROUP BY 1";
        assertEquals(1, findTimeZoneColumns(sql).size());
    }

    @Test
    void currentTimestampAndAtTimeZoneInTheFinalSelectListAreFlagged() {
        assertEquals(
                1, findTimeZoneColumns("SELECT current_timestamp AS at FROM t").size());
        assertEquals(
                1,
                findTimeZoneColumns("SELECT ts AT TIME ZONE 'UTC' AS at FROM t").size());
    }

    @Test
    void literalTimestampWithTimeZoneTypeIsFlaggedEvenInsideACast() {
        assertEquals(
                1,
                findTimeZoneColumns("SELECT CAST(x AS timestamp with time zone) AS at FROM t")
                        .size());
    }

    @Test
    void castToTimestampOrDateAndDateFunctionAreAccepted() {
        assertEquals(
                List.of(),
                findTimeZoneColumns("SELECT CAST(from_iso8601_timestamp(hour) AS timestamp) AS hour FROM t"));
        assertEquals(List.of(), findTimeZoneColumns("SELECT CAST(from_iso8601_timestamp(day) AS date) AS day FROM t"));
        assertEquals(
                List.of(),
                findTimeZoneColumns("SELECT date(date_trunc('quarter', from_iso8601_timestamp(at))) AS q FROM t"));
    }

    @Test
    void timeZoneExpressionsInsideCtesAndCommentsAreNotFlagged() {
        String sql = "-- returns timestamp with time zone from from_iso8601_timestamp(x)\n"
                + "WITH s AS (SELECT min(from_iso8601_timestamp(at)) AS first_at FROM t GROUP BY 1)\n"
                + "SELECT date(first_at) AS day FROM s";
        assertEquals(List.of(), findTimeZoneColumns(sql));
    }

    /** Returns one description per time-zone-typed expression that reaches the outermost SELECT list. */
    static List<String> findTimeZoneColumns(String sql) {
        String text = sql.replaceAll("(?m)--.*$", "").replaceAll("(?s)/\\*.*?\\*/", "");
        String lower = text.toLowerCase(Locale.ROOT);
        String selectList = outermostSelectList(lower);
        List<String> offences = new ArrayList<>();

        Matcher typeName = TIME_ZONE_TYPE_NAME.matcher(selectList);
        while (typeName.find()) {
            offences.add("'" + typeName.group() + "' in the SELECT list");
        }
        Matcher expression = TIME_ZONE_EXPRESSION.matcher(selectList);
        while (expression.find()) {
            if (!isWrappedInStorableType(selectList, expression.start())) {
                offences.add("'" + expression.group().trim()
                        + "' is not wrapped in CAST(... AS timestamp|date) or date(...)");
            }
        }
        return offences;
    }

    private static String outermostSelectList(String lower) {
        int depth = 0;
        int selectStart = -1;
        int selectEnd = -1;
        for (int i = 0; i < lower.length(); i++) {
            char c = lower.charAt(i);
            if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
            } else if (depth == 0 && startsWord(lower, i, "select")) {
                selectStart = i + "select".length();
                selectEnd = lower.length();
            } else if (depth == 0 && selectStart >= 0 && selectEnd == lower.length() && startsWord(lower, i, "from")) {
                selectEnd = i;
            }
        }
        return selectStart < 0 ? "" : lower.substring(selectStart, selectEnd);
    }

    private static boolean startsWord(String text, int index, String word) {
        if (!text.startsWith(word, index)) {
            return false;
        }
        boolean startOk =
                index == 0 || !Character.isLetterOrDigit(text.charAt(index - 1)) && text.charAt(index - 1) != '_';
        int end = index + word.length();
        boolean endOk = end >= text.length() || !Character.isLetterOrDigit(text.charAt(end)) && text.charAt(end) != '_';
        return startOk && endOk;
    }

    /** True when an enclosing parenthesis group is a date(...) call or a CAST(... AS timestamp|date). */
    private static boolean isWrappedInStorableType(String selectList, int position) {
        int depth = 0;
        for (int i = position - 1; i >= 0; i--) {
            char c = selectList.charAt(i);
            if (c == ')') {
                depth++;
            } else if (c == '(') {
                if (depth > 0) {
                    depth--;
                    continue;
                }
                String before = selectList.substring(0, i).stripTrailing();
                if (before.endsWith("cast")) {
                    int close = matchingClose(selectList, i);
                    String inner = selectList.substring(i + 1, close).stripTrailing();
                    if (inner.matches("(?s).*\\bas\\s+(timestamp|date)$")) {
                        return true;
                    }
                } else if (before.matches("(?s).*(^|[^a-z0-9_])date$")) {
                    return true;
                }
            }
        }
        return false;
    }

    private static int matchingClose(String text, int open) {
        int depth = 0;
        for (int i = open; i < text.length(); i++) {
            if (text.charAt(i) == '(') {
                depth++;
            } else if (text.charAt(i) == ')' && --depth == 0) {
                return i;
            }
        }
        return text.length();
    }
}
