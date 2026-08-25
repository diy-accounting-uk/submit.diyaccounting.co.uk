/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.swagger;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Generates OpenAPI/Swagger documentation for the API Gateway endpoints by examining
 * the CDK infrastructure code and extracting route definitions from SubmitSharedNames.
 * <p>
 * This generator introspects the available CDK code structure to automatically discover
 * API routes, their methods, paths, and metadata, eliminating the need for manual
 * hardcoding of endpoint definitions.
 */
public class OpenApiGenerator {

    private static final String OPENAPI_VERSION = "3.0.3";
    private static final String API_TITLE = "DIY Accounting Submit API";
    private static final String API_DESCRIPTION = "DIY Accounting Submit API documentation";

    public static void main(String[] args) {
        if (args.length != 3) {
            System.err.println("Usage: OpenApiGenerator <baseUrl> <version> <outputDir>");
            System.exit(1);
        }

        String baseUrl = args[0];
        String version = args[1];
        String outputDir = args[2];
        try {
            generateOpenApiSpec(baseUrl, version, outputDir);
            System.out.println("OpenAPI specification generated successfully in: " + outputDir);
        } catch (Exception e) {
            System.err.println("Failed to generate OpenAPI specification: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void generateOpenApiSpec(String baseUrl, String version, String outputDir) throws IOException {
        ObjectMapper mapper = new ObjectMapper();

        // Create OpenAPI 3.0 specification
        ObjectNode openApi = mapper.createObjectNode();
        openApi.put("openapi", OPENAPI_VERSION);

        // Info section
        ObjectNode info = createInfoSection(mapper, version);
        openApi.set("info", info);

        // Servers section - parameterized base URL
        ArrayNode servers = createServersSection(mapper, baseUrl);
        openApi.set("servers", servers);

        // Introspect CDK code to discover API routes
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        // Build paths from published Lambda definitions discovered in CDK code
        ObjectNode paths = buildPathsFromCdkCode(mapper, sharedNames);
        openApi.set("paths", paths);

        // Components section for security schemes
        ObjectNode components = createComponentsSection(mapper);
        openApi.set("components", components);

        // Write the OpenAPI spec to files
        writeSpecificationFiles(mapper, openApi, outputDir);

        // Generate Swagger UI HTML
        generateSwaggerUiHtml(Paths.get(outputDir));
    }

    /**
     * Creates the info section with authentication guide
     */
    private static ObjectNode createInfoSection(ObjectMapper mapper, String version) {
        ObjectNode info = mapper.createObjectNode();
        info.put("title", API_TITLE);
        info.put("description", API_DESCRIPTION);
        info.put("version", version);

        ObjectNode authInfo = mapper.createObjectNode();
        authInfo.put(
                "description",
                "This API is protected by Amazon Cognito. To use the API:\n\n"
                        + "1. **Via Website**: If you are logged into the DIY Accounting Submit website, you can access the Swagger UI directly and API calls will use your existing session cookies.\n\n"
                        + "2. **External Access**: \n"
                        + "   - First complete the Cognito hosted UI OAuth flow to get an authorization code\n"
                        + "   - Exchange that code for an access token by calling `/api/v1/cognito/token`\n"
                        + "   - Include the token in the `Authorization: Bearer <token>` header\n\n"
                        + "3. **For HMRC Integration**: Some endpoints require HMRC authorization tokens obtained via `/api/v1/hmrc/token`\n\n"
                        + "**Note**: All endpoints require proper CORS headers and are accessible from the same domain as the main application.");
        info.set("x-authentication-guide", authInfo);

        return info;
    }

    /**
     * Creates the servers section with parameterized base URL
     */
    private static ArrayNode createServersSection(ObjectMapper mapper, String baseUrl) {
        ArrayNode servers = mapper.createArrayNode();
        ObjectNode server = mapper.createObjectNode();
        server.put("url", "%sapi/v1/".formatted(baseUrl));
        server.put("description", API_DESCRIPTION);
        servers.add(server);
        return servers;
    }

    /**
     * Builds paths by introspecting the CDK code structure through SubmitSharedNames.
     * This method examines the publishedApiLambdas which are discovered from the CDK stacks.
     */
    private static ObjectNode buildPathsFromCdkCode(ObjectMapper mapper, SubmitSharedNames sharedNames) {
        ObjectNode paths = mapper.createObjectNode();

        // Group lambdas by path for easier processing
        Map<String, List<SubmitSharedNames.PublishedLambda>> pathToLambdas = sharedNames.publishedApiLambdas.stream()
                .collect(Collectors.groupingBy(pl -> pl.urlPath.replaceFirst("^/api/v1", "")));

        // Build base operations from discovered lambdas in CDK code
        for (Map.Entry<String, List<SubmitSharedNames.PublishedLambda>> entry : pathToLambdas.entrySet()) {
            String openApiPath = entry.getKey();
            ObjectNode pathItem = mapper.createObjectNode();

            for (SubmitSharedNames.PublishedLambda pl : entry.getValue()) {
                ObjectNode operation = mapper.createObjectNode();
                operation.put("summary", pl.summary);
                operation.put("description", pl.description);
                operation.put("operationId", pl.operationId);

                // Parameters from SubmitSharedNames (path/query/header)
                if (pl.parameters != null && !pl.parameters.isEmpty()) {
                    ArrayNode paramsArr = mapper.createArrayNode();
                    for (SubmitSharedNames.ApiParameter p : pl.parameters) {
                        ObjectNode pObj = mapper.createObjectNode();
                        pObj.put("name", p.name);
                        pObj.put("in", p.in);
                        pObj.put("required", p.required);
                        if (p.description != null) pObj.put("description", p.description);
                        ObjectNode schema = mapper.createObjectNode();
                        schema.put("type", "string");
                        // Add sensible defaults/examples for known params
                        switch (p.name) {
                            case "vrn" -> {
                                schema.put("example", "983238295");
                                schema.put("pattern", "^\\d{9}$");
                            }
                            case "from" -> schema.put("example", "2025-01-01");
                            case "to" -> schema.put("example", "2025-03-31");
                            case "status" -> {
                                schema.put("enum", "O,F");
                                schema.put("example", "O");
                            }
                            case "periodKey" -> schema.put("example", "24A1");
                            case "Gov-Test-Scenario" -> schema.put("example", "QUARTERLY_ONE_MET");
                            case "state" -> schema.put("example", "csrf-1234");
                            case "scope" -> schema.put("example", "write:vat read:vat");
                            case "name" -> schema.put("example", "2025-03-31-123456789012.json");
                            case "key" ->
                                schema.put(
                                        "example",
                                        "receipts/00000000-0000-0000-0000-000000000000/2025-03-31-123456789012.json");
                            case "bundleId" -> schema.put("example", "test");
                            case "removeAll" -> schema.put("example", "false");
                        }
                        pObj.set("schema", schema);
                        paramsArr.add(pObj);
                    }
                    operation.set("parameters", paramsArr);
                }

                String method = pl.method.name().toLowerCase();

                // Add requestBody definitions for POST endpoints
                if ("post".equals(method)) {
                    ObjectNode requestBody = mapper.createObjectNode();
                    requestBody.put("required", true);
                    ObjectNode content = mapper.createObjectNode();

                    if (pl.urlPath.endsWith("/cognito/token")) {
                        // form-urlencoded with code
                        ObjectNode media = mapper.createObjectNode();
                        ObjectNode schema = mapper.createObjectNode();
                        schema.put("type", "object");
                        ObjectNode props = mapper.createObjectNode();
                        ObjectNode code = mapper.createObjectNode();
                        code.put("type", "string");
                        code.put("example", "abc123");
                        props.set("code", code);
                        schema.set("properties", props);
                        media.set("schema", schema);
                        ObjectNode exam = mapper.createObjectNode();
                        exam.put("code", "abc123");
                        media.set("example", exam);
                        content.set("application/x-www-form-urlencoded", media);
                    } else if (pl.urlPath.endsWith("/hmrc/token")) {
                        ObjectNode media = mapper.createObjectNode();
                        ObjectNode schema = mapper.createObjectNode();
                        schema.put("type", "object");
                        ObjectNode props = mapper.createObjectNode();
                        ObjectNode code = mapper.createObjectNode();
                        code.put("type", "string");
                        code.put("example", "abc123");
                        props.set("code", code);
                        schema.set("properties", props);
                        media.set("schema", schema);
                        ObjectNode exam = mapper.createObjectNode();
                        exam.put("code", "abc123");
                        media.set("example", exam);
                        content.set("application/json", media);
                    } else if (pl.urlPath.endsWith("/hmrc/vat/return")) {
                        ObjectNode media = mapper.createObjectNode();
                        ObjectNode schema = mapper.createObjectNode();
                        schema.put("type", "object");
                        ObjectNode props = mapper.createObjectNode();
                        ObjectNode vatNumber = mapper.createObjectNode();
                        vatNumber.put("type", "string");
                        vatNumber.put("example", "983238295");
                        ObjectNode periodKey = mapper.createObjectNode();
                        periodKey.put("type", "string");
                        periodKey.put("example", "24A1");
                        ObjectNode vatDue = mapper.createObjectNode();
                        vatDue.put("type", "number");
                        vatDue.put("format", "float");
                        vatDue.put("example", 2400.00);
                        ObjectNode accessToken = mapper.createObjectNode();
                        accessToken.put("type", "string");
                        accessToken.put("example", "HMRC_ACCESS_TOKEN");
                        props.set("vatNumber", vatNumber);
                        props.set("periodKey", periodKey);
                        props.set("vatDue", vatDue);
                        props.set("accessToken", accessToken);
                        schema.set("properties", props);
                        media.set("schema", schema);
                        ObjectNode exam = mapper.createObjectNode();
                        exam.put("vatNumber", "983238295");
                        exam.put("periodKey", "24A1");
                        exam.put("vatDue", 2400.00);
                        exam.put("accessToken", "HMRC_ACCESS_TOKEN");
                        media.set("example", exam);
                        content.set("application/json", media);
                    } else if (pl.urlPath.endsWith("/hmrc/receipt")) {
                        ObjectNode media = mapper.createObjectNode();
                        ObjectNode schema = mapper.createObjectNode();
                        schema.put("type", "object");
                        ObjectNode props = mapper.createObjectNode();
                        ObjectNode receipt = mapper.createObjectNode();
                        receipt.put("type", "object");
                        ObjectNode receiptProps = mapper.createObjectNode();
                        ObjectNode formBundleNumber = mapper.createObjectNode();
                        formBundleNumber.put("type", "string");
                        formBundleNumber.put("example", "123456789012");
                        receiptProps.set("formBundleNumber", formBundleNumber);
                        receipt.set("properties", receiptProps);
                        props.set("receipt", receipt);
                        schema.set("properties", props);
                        media.set("schema", schema);
                        ObjectNode exam = mapper.createObjectNode();
                        ObjectNode recExam = mapper.createObjectNode();
                        recExam.put("formBundleNumber", "123456789012");
                        exam.set("receipt", recExam);
                        media.set("example", exam);
                        content.set("application/json", media);
                    } else if (pl.urlPath.endsWith("/bundle")) {
                        ObjectNode media = mapper.createObjectNode();
                        ObjectNode schema = mapper.createObjectNode();
                        schema.put("type", "object");
                        ObjectNode props = mapper.createObjectNode();
                        ObjectNode bundleId = mapper.createObjectNode();
                        bundleId.put("type", "string");
                        bundleId.put("example", "test");
                        ObjectNode qualifiers = mapper.createObjectNode();
                        qualifiers.put("type", "object");
                        ObjectNode qualProps = mapper.createObjectNode();
                        ObjectNode transactionId = mapper.createObjectNode();
                        transactionId.put("type", "string");
                        transactionId.put("example", "TX-12345");
                        qualProps.set("transactionId", transactionId);
                        qualifiers.set("properties", qualProps);
                        props.set("bundleId", bundleId);
                        props.set("qualifiers", qualifiers);
                        schema.set("properties", props);
                        media.set("schema", schema);
                        ObjectNode exam = mapper.createObjectNode();
                        exam.put("bundleId", "test");
                        ObjectNode qualExam = mapper.createObjectNode();
                        qualExam.put("transactionId", "TX-12345");
                        exam.set("qualifiers", qualExam);
                        content.set("application/json", media);
                        media.set("example", exam);
                    }

                    if (content.size() > 0) {
                        requestBody.set("content", content);
                        operation.set("requestBody", requestBody);
                    }
                }

                pathItem.set(method, operation);
            }

            paths.set(openApiPath, pathItem);
        }

        // Apply endpoint-specific enrichments (tags, security, responses)
        enrichEndpoints(paths, mapper);

        return paths;
    }

    /**
     * Enriches endpoints with tags, security, and response definitions based on path patterns
     */
    private static void enrichEndpoints(ObjectNode paths, ObjectMapper mapper) {
        // Categorize and enrich endpoints based on their path
        paths.fieldNames().forEachRemaining(path -> {
            ObjectNode pathItem = (ObjectNode) paths.get(path);

            if (path.startsWith("/cognito/")) {
                enrichCognitoEndpoints(pathItem, path, mapper);
            } else if (path.startsWith("/hmrc/")) {
                enrichHmrcEndpoints(pathItem, path, mapper);
            } else if (path.matches("/(catalog|bundle).*")) {
                enrichAccountEndpoints(pathItem, path, mapper);
            }
        });
    }

    /**
     * Enriches Cognito authentication endpoints
     */
    private static void enrichCognitoEndpoints(ObjectNode pathItem, String path, ObjectMapper mapper) {
        ArrayNode tags = mapper.createArrayNode();
        tags.add("Authentication");

        pathItem.fieldNames().forEachRemaining(method -> {
            ObjectNode operation = (ObjectNode) pathItem.get(method);
            operation.set("tags", tags);

            ObjectNode responses = mapper.createObjectNode();
            ObjectNode response200 = mapper.createObjectNode();

            if (path.equals("/cognito/token")) {
                response200.put("description", "Token exchanged successfully");
            }

            responses.set(SubmitSharedNames.Responses.OK, response200);
            operation.set("responses", responses);
        });
    }

    /**
     * Enriches HMRC endpoints with appropriate security and tags
     */
    private static void enrichHmrcEndpoints(ObjectNode pathItem, String path, ObjectMapper mapper) {
        ArrayNode hmrcTags = mapper.createArrayNode();
        hmrcTags.add("HMRC");

        // Security requirement arrays
        ArrayNode cognitoSecurityArr = createSecurityRequirement(mapper, "CognitoAuth");
        ArrayNode hmrcSecurityArr = createSecurityRequirement(mapper, "HmrcAuth");

        pathItem.fieldNames().forEachRemaining(method -> {
            ObjectNode operation = (ObjectNode) pathItem.get(method);
            operation.set("tags", hmrcTags);

            // Determine appropriate security based on path
            if (path.equals("/hmrc/vat/return") && method.equals("post")) {
                operation.set("security", hmrcSecurityArr);
            } else if (!path.equals("/hmrc/vat/return")) {
                operation.set("security", cognitoSecurityArr);
            }

            // Add appropriate response
            ObjectNode responses = mapper.createObjectNode();
            ObjectNode response200 = mapper.createObjectNode();
            response200.put("description", getHmrcResponseDescription(path, method));
            responses.set(SubmitSharedNames.Responses.OK, response200);
            operation.set("responses", responses);
        });
    }

    /**
     * Enriches Account endpoints (catalog, bundle)
     */
    private static void enrichAccountEndpoints(ObjectNode pathItem, String path, ObjectMapper mapper) {
        ArrayNode accountTags = mapper.createArrayNode();
        accountTags.add("Account");

        ArrayNode cognitoSecurity = createSecurityRequirement(mapper, "CognitoAuth");

        pathItem.fieldNames().forEachRemaining(method -> {
            ObjectNode operation = (ObjectNode) pathItem.get(method);
            operation.set("tags", accountTags);

            // Catalog doesn't require auth, but bundle operations do
            if (path.startsWith("/bundle")) {
                operation.set("security", cognitoSecurity);
            }

            ObjectNode responses = mapper.createObjectNode();
            ObjectNode response200 = mapper.createObjectNode();
            response200.put("description", getAccountResponseDescription(path, method));
            responses.set(SubmitSharedNames.Responses.OK, response200);

            if (path.startsWith("/bundle")) {
                ObjectNode response202 = mapper.createObjectNode();
                response202.put("description", "Request accepted for processing (async)");
                responses.set(SubmitSharedNames.Responses.ACCEPTED, response202);
            }

            operation.set("responses", responses);
        });
    }

    /**
     * Creates a security requirement array for the given scheme
     */
    private static ArrayNode createSecurityRequirement(ObjectMapper mapper, String schemeName) {
        ArrayNode securityArr = mapper.createArrayNode();
        ObjectNode securityObj = mapper.createObjectNode();
        securityObj.set(schemeName, mapper.createArrayNode());
        securityArr.add(securityObj);
        return securityArr;
    }

    /**
     * Gets appropriate response description for HMRC endpoints
     */
    private static String getHmrcResponseDescription(String path, String method) {
        return switch (path) {
            case "/hmrc/token" -> "HMRC token exchanged successfully";
            case "/hmrc/vat/return" -> "VAT return submitted successfully";
            case "/hmrc/receipt" ->
                method.equals("post") ? "Receipt logged successfully" : "Receipts retrieved successfully";
            default -> "Request completed successfully";
        };
    }

    /**
     * Gets appropriate response description for Account endpoints
     */
    private static String getAccountResponseDescription(String path, String method) {
        if ("/catalog".equals(path)) {
            return "Catalog retrieved successfully";
        }
        if (path.startsWith("/bundle")) {
            return switch (method) {
                case "post" -> "Bundle created successfully";
                case "get" -> "Bundles retrieved successfully";
                case "delete" -> "Bundle deleted successfully";
                default -> "Request completed successfully";
            };
        }
        return "Request completed successfully";
    }

    /**
     * Creates the components section with security schemes
     */
    private static ObjectNode createComponentsSection(ObjectMapper mapper) {
        ObjectNode components = mapper.createObjectNode();
        ObjectNode securitySchemes = mapper.createObjectNode();

        ObjectNode cognitoAuth = mapper.createObjectNode();
        cognitoAuth.put("type", "http");
        cognitoAuth.put("scheme", "bearer");
        cognitoAuth.put("bearerFormat", "JWT");
        cognitoAuth.put("description", "Cognito JWT token");
        securitySchemes.set("CognitoAuth", cognitoAuth);

        ObjectNode hmrcAuth = mapper.createObjectNode();
        hmrcAuth.put("type", "http");
        hmrcAuth.put("scheme", "bearer");
        hmrcAuth.put("description", "HMRC OAuth2 token");
        securitySchemes.set("HmrcAuth", hmrcAuth);

        components.set("securitySchemes", securitySchemes);
        return components;
    }

    /**
     * Writes the OpenAPI specification to JSON and YAML files
     */
    private static void writeSpecificationFiles(ObjectMapper mapper, ObjectNode openApi, String outputDir)
            throws IOException {
        Path outputPath = Paths.get(outputDir);
        Files.createDirectories(outputPath);

        // Write JSON file
        File jsonFile = outputPath.resolve("openapi.json").toFile();
        mapper.writerWithDefaultPrettyPrinter().writeValue(jsonFile, openApi);

        // Write YAML file (simplified conversion)
        File yamlFile = outputPath.resolve("openapi.yaml").toFile();
        String yamlContent = convertToYaml(openApi);
        Files.writeString(yamlFile.toPath(), yamlContent);
    }

    /**
     * Converts OpenAPI JSON to a simplified YAML format
     */
    private static String convertToYaml(ObjectNode openApi) {
        StringBuilder yaml = new StringBuilder();
        yaml.append("openapi: ").append(openApi.get("openapi").asText()).append("\n");
        yaml.append("info:\n");
        yaml.append("  title: ")
                .append(openApi.path("info").path("title").asText())
                .append("\n");
        yaml.append("  description: ")
                .append(openApi.path("info").path("description").asText())
                .append("\n");
        yaml.append("  version: ")
                .append(openApi.path("info").path("version").asText())
                .append("\n");
        yaml.append("# Full specification available in openapi.json\n");
        return yaml.toString();
    }

    /**
     * Generates the Swagger UI HTML file
     */
    private static void generateSwaggerUiHtml(Path outputPath) throws IOException {
        String swaggerUiHtml =
                """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>DIY Accounting Submit API</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin:0;
            background: #fafafa;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            // Determine if we're logged in by checking for Cognito session
            const isLoggedIn = document.cookie.includes('AWSELBAuthSessionCookie') ||
                              document.cookie.includes('cognito') ||
                              localStorage.getItem('cognitoToken');

            const ui = SwaggerUIBundle({
                url: './openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                requestInterceptor: function(request) {
                    // If logged in via the website, include cookies for same-origin requests
                    if (isLoggedIn && request.url.startsWith(window.location.origin)) {
                        request.credentials = 'include';
                    }
                    return request;
                },
                onComplete: function() {
                    if (isLoggedIn) {
                        // Show a notice that the user is authenticated
                        const authNotice = document.createElement('div');
                        authNotice.style.cssText = 'background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 10px; margin: 10px; border-radius: 4px;';
                        authNotice.innerHTML = '✓ You appear to be logged in. API calls will use your existing session.';
                        document.querySelector('.swagger-ui').prepend(authNotice);
                    }
                }
            });

            window.ui = ui;
        };
    </script>
</body>
</html>
        """;

        Files.writeString(outputPath.resolve("index.html"), swaggerUiHtml);
    }
}
