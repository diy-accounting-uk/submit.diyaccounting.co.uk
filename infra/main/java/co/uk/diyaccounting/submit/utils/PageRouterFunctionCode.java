/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Writes the code of the page router CloudFront Function from the files that the publish step
 * deploys. It does what app/functions/edge/pageRouterCode.js does for scripts/deploy-app.js, so a
 * lean deploy and a CDK deploy publish the same code.
 */
public final class PageRouterFunctionCode {

    public static final List<String> OTHER_BEHAVIOUR_DIRECTORIES = List.of("docs", "embed", "tests");
    public static final String PASS_THROUGH_DIRECTORY = ".well-known";
    public static final int MAX_FUNCTION_BYTES = 10240;

    private static final String PAGES_LINE = "const PAGES = {};";
    private static final String NOT_FOUND_HTML_LINE = "const NOT_FOUND_HTML = \"\";";
    private static final ObjectMapper JSON = new ObjectMapper();

    private PageRouterFunctionCode() {}

    public static String fromDisk(final Path docRoot, final Path functionDir) {
        try {
            String template = Files.readString(functionDir.resolve("pageRouter.js"), StandardCharsets.UTF_8);
            String notFoundHtml = Files.readString(docRoot.resolve("errors/404.html"), StandardCharsets.UTF_8);
            List<String> relativePaths;
            try (Stream<Path> files = Files.walk(docRoot)) {
                relativePaths = files.filter(Files::isRegularFile)
                        .map(file -> docRoot.relativize(file).toString().replace('\\', '/'))
                        .collect(Collectors.toList());
            }
            return build(template, pagesOf(relativePaths), notFoundHtml);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read the page router sources", e);
        }
    }

    public static Map<String, String> pagesOf(final List<String> relativePaths) {
        Map<String, List<String>> namesByDir = new TreeMap<>();
        for (String relativePath : relativePaths) {
            String firstSegment = relativePath.split("/")[0];
            if (OTHER_BEHAVIOUR_DIRECTORIES.contains(firstSegment) || PASS_THROUGH_DIRECTORY.equals(firstSegment)) {
                continue;
            }
            int slash = relativePath.lastIndexOf('/');
            String dir = relativePath.substring(0, slash + 1);
            String fileName = relativePath.substring(slash + 1);
            if (fileName.contains(" ")) {
                throw new IllegalStateException(
                        relativePath + ": the page router cannot list a file name with a space");
            }
            if (fileName.endsWith(".html")) {
                namesByDir
                        .computeIfAbsent(dir, key -> new ArrayList<>())
                        .add(fileName.substring(0, fileName.length() - ".html".length()));
            } else if (!fileName.contains(".")) {
                throw new IllegalStateException(
                        relativePath + ": the page router would answer this file with no extension with 404");
            }
        }
        Map<String, String> pages = new TreeMap<>();
        namesByDir.forEach(
                (dir, names) -> pages.put(dir, names.stream().sorted().collect(Collectors.joining(" "))));
        return pages;
    }

    public static String build(final String template, final Map<String, String> pages, final String notFoundHtml) {
        List<String> lines = Arrays.asList(template.split("\n", -1));
        if (!lines.contains(PAGES_LINE) || !lines.contains(NOT_FOUND_HTML_LINE)) {
            throw new IllegalStateException(
                    "The page router template must hold the lines " + PAGES_LINE + " and " + NOT_FOUND_HTML_LINE);
        }
        try {
            String pagesJson = JSON.writeValueAsString(pages);
            String notFoundHtmlJson = JSON.writeValueAsString(notFoundHtml);
            StringBuilder code = new StringBuilder();
            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("//")) {
                    continue;
                }
                if (line.equals(PAGES_LINE)) {
                    code.append("const PAGES = ").append(pagesJson).append(';');
                } else if (line.equals(NOT_FOUND_HTML_LINE)) {
                    code.append("const NOT_FOUND_HTML = ")
                            .append(notFoundHtmlJson)
                            .append(';');
                } else {
                    code.append(line);
                }
                code.append('\n');
            }
            int bytes = code.toString().getBytes(StandardCharsets.UTF_8).length;
            if (bytes > MAX_FUNCTION_BYTES) {
                throw new IllegalStateException("The page router is " + bytes
                        + " bytes; CloudFront takes a function of at most " + MAX_FUNCTION_BYTES + " bytes");
            }
            return code.toString();
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot write the page router data as JSON", e);
        }
    }
}
