/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.swagger;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
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
}
