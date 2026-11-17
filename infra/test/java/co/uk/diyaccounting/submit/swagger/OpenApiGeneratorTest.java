/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.swagger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class OpenApiGeneratorTest {

    @Test
    void generatedSpecCarriesLicenseContactAndTermsOfService(@TempDir Path outputDir) throws IOException {
        OpenApiGenerator.main(new String[] {"https://submit.diyaccounting.co.uk/", "1.0.0", outputDir.toString()});

        ObjectMapper mapper = new ObjectMapper();
        JsonNode info =
                mapper.readTree(outputDir.resolve("openapi.json").toFile()).path("info");

        JsonNode license = info.path("license");
        assertEquals("PolyForm Internal Use License 1.0.0", license.path("name").asText());
        assertEquals(
                "https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/blob/main/LICENSE",
                license.path("url").asText());

        assertEquals(
                "admin@diyaccounting.co.uk", info.path("contact").path("email").asText());
        assertEquals(
                "https://submit.diyaccounting.co.uk/terms.html",
                info.path("termsOfService").asText());
    }

    @Test
    void generatedDocsPageHasNoInlineScriptAndLoadsThePageScript(@TempDir Path outputDir) throws IOException {
        OpenApiGenerator.main(new String[] {"https://submit.diyaccounting.co.uk/", "1.0.0", outputDir.toString()});
        String html = Files.readString(outputDir.resolve("index.html"));

        Matcher scriptTag =
                Pattern.compile("<script\\b([^>]*)>", Pattern.CASE_INSENSITIVE).matcher(html);
        while (scriptTag.find()) {
            assertTrue(scriptTag.group(1).contains("src="), "inline script tag: " + scriptTag.group());
        }
        assertTrue(html.contains("<script src=\"index.page.js\"></script>"));
    }

    @Test
    void buildReproducesTheCommittedSpecFiles(@TempDir Path outputDir) throws IOException {
        String pomText = Files.readString(Path.of("pom.xml"));
        Matcher projectVersion = Pattern.compile("<artifactId>web</artifactId>\\s*<version>([^<]+)</version>")
                .matcher(pomText);
        assertTrue(projectVersion.find(), "pom.xml project version not found");
        Matcher baseUrl = Pattern.compile("<baseUrl>([^<]+)</baseUrl>").matcher(pomText);
        assertTrue(baseUrl.find(), "pom.xml baseUrl property not found");

        OpenApiGenerator.main(new String[] {baseUrl.group(1), projectVersion.group(1), outputDir.toString()});

        Path committed = Path.of("web/public/docs/api");
        for (String file : new String[] {"openapi.json", "openapi.yaml"}) {
            assertEquals(
                    Files.readString(committed.resolve(file)),
                    Files.readString(outputDir.resolve(file)),
                    committed.resolve(file) + " differs from what the build writes; run ./mvnw package and commit it");
        }
    }
}
