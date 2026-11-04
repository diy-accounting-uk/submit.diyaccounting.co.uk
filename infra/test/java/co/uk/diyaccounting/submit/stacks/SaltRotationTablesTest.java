/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Template;

/**
 * Every table DataStack creates must have a place in scripts/salt-rotation-tables.json, with the
 * key schema the rotation uses. A new table fails here until someone decides how a salt rotation
 * treats it.
 */
class SaltRotationTablesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String TABLE_PREFIX = "docs-env-";

    /** Table name without the environment prefix, mapped to "partitionKey/sortKey". */
    private static Map<String, String> tablesInSynth() throws IOException {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();
        DataStack dataStack = new DataStack(
                app,
                "TestDataStack",
                DataStack.DataStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .build());

        Map<String, String> tables = new TreeMap<>();
        for (Map<String, Object> resource :
                Template.fromStack(dataStack).findResources("Custom::AWS").values().stream()
                        .map(SaltRotationTablesTest::asMap)
                        .toList()) {
            Object create = asMap(resource.get("Properties")).get("Create");
            if (!(create instanceof String createJson) || !createJson.contains("\"action\":\"createTable\"")) {
                continue;
            }
            JsonNode parameters = MAPPER.readTree(createJson).get("parameters");
            String partitionKey = null;
            String sortKey = null;
            for (JsonNode key : parameters.get("KeySchema")) {
                if ("HASH".equals(key.get("KeyType").asText())) {
                    partitionKey = key.get("AttributeName").asText();
                } else {
                    sortKey = key.get("AttributeName").asText();
                }
            }
            String tableName = parameters.get("TableName").asText();
            tables.put(tableName.substring(TABLE_PREFIX.length()), partitionKey + "/" + sortKey);
        }
        return tables;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    private static JsonNode manifest() throws IOException {
        return MAPPER.readTree(Files.readString(Path.of("scripts/salt-rotation-tables.json")));
    }

    @Test
    void everyTableInTheStackHasAPlaceInTheManifest() throws IOException {
        JsonNode manifest = manifest();
        var listed = new TreeSet<String>();
        manifest.get("partitionTables").forEach(entry -> listed.add(entry.get("table").asText()));
        manifest.get("rowTables").forEach(entry -> listed.add(entry.get("table").asText()));
        manifest.get("expiringTables").forEach(entry -> listed.add(entry.get("table").asText()));
        manifest.get("noHashTables").forEach(entry -> listed.add(entry.asText()));

        assertEquals(new TreeSet<>(tablesInSynth().keySet()), listed);
    }

    @Test
    void everyHashedSubTableIsAPartitionTableWithItsSortKey() throws IOException {
        var inSynth = new TreeMap<String, String>();
        tablesInSynth().forEach((table, keys) -> {
            if (keys.startsWith("hashedSub/")) {
                inSynth.put(table, keys);
            }
        });
        var inManifest = new TreeMap<String, String>();
        manifest()
                .get("partitionTables")
                .forEach(entry -> inManifest.put(
                        entry.get("table").asText(),
                        "hashedSub/" + entry.get("sortKey").asText()));

        assertEquals(inSynth, inManifest);
    }

    @Test
    void everyRowTableKeepsTheKeysTheRotationAddresses() throws IOException {
        Map<String, String> inSynth = tablesInSynth();
        for (JsonNode entry : manifest().get("rowTables")) {
            String sortKey = entry.has("sortKey") ? entry.get("sortKey").asText() : "null";
            assertEquals(
                    entry.get("partitionKey").asText() + "/" + sortKey,
                    inSynth.get(entry.get("table").asText()));
        }
    }
}
