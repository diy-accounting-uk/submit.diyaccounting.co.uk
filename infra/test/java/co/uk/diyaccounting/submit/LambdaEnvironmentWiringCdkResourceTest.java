/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.stacks.CompaniesHouseStack;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jetbrains.annotations.NotNull;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;

/**
 * Walks every Docker-image Lambda in the synthesized application and environment stacks, follows
 * its handler file's relative imports through {@code app/lib}, {@code app/data} and {@code
 * app/services}, and asserts the {@code process.env.X} and {@code getResourceName("X")} names the
 * code reads are all set on the function's {@code Environment.Variables}. Handlers that
 * transitively import {@code app/lib/appClientResolver.js} must also have their role granted
 * {@code ssm:GetParameter} on the three app-client-id parameters it reads.
 *
 * <p>A function whose {@code ImageConfig} is absent (an edge Lambda, a CDK custom-resource
 * provider, an {@code AwsCustomResource} singleton) carries no application handler file and is
 * skipped. A name a handler reads with an immediate {@code ||} or {@code ??} fallback is treated
 * as optional. Names that are genuinely unwired, or that the Lambda runtime sets itself, live in
 * {@code infra/test/resources/lambda-env-allowlist.txt}.
 */
class LambdaEnvironmentWiringCdkResourceTest {

    private static final AllowList ALLOW_LIST = loadAllowList();

    private static final Pattern IMPORT_FROM = Pattern.compile("\\bfrom\\s*[\"']([^\"']+)[\"']");
    private static final Pattern PROCESS_ENV = Pattern.compile("process\\.env\\.([A-Z][A-Z0-9_]*)");
    private static final Pattern GET_RESOURCE_NAME = Pattern.compile("getResourceName\\(\\s*[\"']([A-Z0-9_]+)[\"']");
    private static final Pattern LINE_COMMENT = Pattern.compile("(?<!:)//.*");
    private static final Pattern BLOCK_COMMENT = Pattern.compile("/\\*.*?\\*/", Pattern.DOTALL);

    private static final Set<String> APP_CLIENT_ID_PARAMETER_SUFFIXES =
            Set.of("submit-app-client-id", "spreadsheets-diya-gl-app-client-id", "mcp-app-client-id");

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "test"),
        @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "tt-witheight"),
        @SetEnvironmentVariable(
                key = "COGNITO_USER_POOL_ARN",
                value = "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_123456789"),
        @SetEnvironmentVariable(key = "COGNITO_CLIENT_ID", value = "tt-witheight-cognito-client-id"),
        @SetEnvironmentVariable(key = "COGNITO_DIYA_GL_CLIENT_ID", value = "tt-witheight-cognito-books-client-id"),
        @SetEnvironmentVariable(
                key = "HMRC_CLIENT_SECRET_ARN",
                value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:tt-witheight/submit/hmrc/client_secret"),
        @SetEnvironmentVariable(
                key = "HMRC_SANDBOX_CLIENT_SECRET_ARN",
                value =
                        "arn:aws:secretsmanager:eu-west-2:111111111111:secret:tt-witheight/submit/hmrc/sandbox_client_secret"),
        @SetEnvironmentVariable(key = "BASE_IMAGE_TAG", value = "test"),
        @SetEnvironmentVariable(key = "CLOUD_TRAIL_ENABLED", value = "true"),
        @SetEnvironmentVariable(key = "SELF_DESTRUCT_DELAY_HOURS", value = "1"),
        @SetEnvironmentVariable(key = "HTTP_API_URL", value = "https://test-api.example.com/"),
        @SetEnvironmentVariable(key = "DOC_ROOT_PATH", value = "web/public"),
        @SetEnvironmentVariable(key = "EDGE_FUNCTION_ASSET_PATH", value = "app/functions/edge"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
    })
    void applicationLambdasCarryEveryEnvironmentVariableTheirHandlerCodeReads() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());

        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();

        assertEveryImageLambdaIsWired(collectStacks(submitApplication));
    }

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "test"),
        @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "tt-witheight"),
        @SetEnvironmentVariable(
                key = "GOOGLE_CLIENT_SECRET_ARN",
                value = "arn:aws:secretsmanager:us-east-1:111111111111:secret:tt-witheight-google-secret"),
        @SetEnvironmentVariable(key = "CLOUD_TRAIL_ENABLED", value = "true"),
        @SetEnvironmentVariable(key = "ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS", value = "1"),
        @SetEnvironmentVariable(key = "DYNAMODB_RETAIN_RECEIPTS_TABLE", value = "false"),
        @SetEnvironmentVariable(key = "HOLDING_DOC_ROOT_PATH", value = "./web/holding"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "us-east-1"),
    })
    void environmentLambdasCarryEveryEnvironmentVariableTheirHandlerCodeReads() throws IOException {
        Path cdkJsonPath = Path.of("cdk-environment/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);

        if (ctx.containsKey("apexActiveLabel")) {
            ctx.put("activeLabel", ctx.get("apexActiveLabel"));
        }
        if (ctx.containsKey("apexDeploymentOrigins")) {
            ctx.put("deploymentOriginsCsv", ctx.get("apexDeploymentOrigins"));
        }
        ctx.put(
                "certificateArn",
                "arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789012");
        ctx.put(
                "holdingCertificateArn",
                "arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789012");

        App app = new App(AppProps.builder().context(ctx).build());

        SubmitEnvironment.SubmitEnvironmentProps appProps = SubmitEnvironment.loadAppProps(app, "cdk-environment/");
        var env = new SubmitEnvironment(app, appProps);
        app.synth();

        assertEveryImageLambdaIsWired(collectStacks(env));
    }

    // COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS is set only in .env.prod (CS-11a): the ci
    // deployment this test's cdk.json defaults mirror must carry no value on the confirmation
    // statement submit Lambda, so the waiver can never reach a customer's filing.
    @Test
    @SuppressWarnings("unchecked")
    void confirmationStatementPostLambdaCarriesNoFeeWaiverOnCi() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        CompaniesHouseStack stack = new CompaniesHouseStack(
                app,
                "TestCompaniesHouseStackCi",
                CompaniesHouseStack.CompaniesHouseStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("ci")
                        .deploymentName("ci")
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .baseImageTag("latest")
                        .companiesHouseBaseUri("https://api.company-information.service.gov.uk")
                        .companiesHouseApiKeyArn("")
                        .companiesHouseFilingBaseUri("https://api-sandbox.company-information.service.gov.uk")
                        .companiesHouseIdentityBaseUri("https://identity-sandbox.company-information.service.gov.uk")
                        .companiesHouseClientId("test-companies-house-client-id")
                        .companiesHouseClientSecretArn("")
                        .companiesHouseXmlGatewayUri("https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway")
                        .companiesHousePresenterIdArn("")
                        .companiesHousePresenterCodeArn("")
                        .companiesHouseCsFeeWaivedCompanyNumbers("")
                        .build());

        Template template = Template.fromStack(stack);
        Map<String, Map<String, Object>> functions = template.findResources(
                "AWS::Lambda::Function",
                Map.of(
                        "Properties",
                        Map.of(
                                "FunctionName",
                                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName())));
        assertTrue(functions.size() == 1, "expected exactly one confirmation statement submit Lambda");

        Map<String, Object> properties =
                (Map<String, Object>) functions.values().iterator().next().get("Properties");
        Map<String, Object> environment = (Map<String, Object>) properties.get("Environment");
        Map<String, Object> variables = (Map<String, Object>) environment.get("Variables");
        assertFalse(variables.containsKey("COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS"));
    }

    /** Every public {@link Stack}-typed field an application object carries, in declaration order. */
    private static List<Stack> collectStacks(Object owner) {
        var stacks = new ArrayList<Stack>();
        for (Field field : owner.getClass().getFields()) {
            if (!Stack.class.isAssignableFrom(field.getType())) continue;
            try {
                Object value = field.get(owner);
                if (value != null) stacks.add((Stack) value);
            } catch (IllegalAccessException e) {
                throw new RuntimeException("Failed to read stack field " + field.getName(), e);
            }
        }
        return stacks;
    }

    @SuppressWarnings("unchecked")
    private static void assertEveryImageLambdaIsWired(List<Stack> stacks) {
        var missingEnvVars = new ArrayList<String>();
        var missingSsmGrants = new ArrayList<String>();

        for (Stack stack : stacks) {
            Template template = Template.fromStack(stack);
            Map<String, Map<String, Object>> functions = template.findResources("AWS::Lambda::Function");

            for (Map.Entry<String, Map<String, Object>> entry : functions.entrySet()) {
                String logicalId = entry.getKey();
                Map<String, Object> properties =
                        (Map<String, Object>) entry.getValue().get("Properties");
                if (properties == null) continue;

                Map<String, Object> imageConfig = (Map<String, Object>) properties.get("ImageConfig");
                if (imageConfig == null) continue; // not an application handler: edge fn, custom-resource provider

                List<Object> command = (List<Object>) imageConfig.get("Command");
                if (command == null || command.isEmpty()) continue;
                String handlerCommand = String.valueOf(command.get(0));
                String functionName = String.valueOf(properties.get("FunctionName"));

                Path handlerFile = handlerJsFile(handlerCommand);
                if (!Files.isRegularFile(handlerFile)) continue;

                Set<Path> transitiveFiles = new LinkedHashSet<>();
                collectTransitiveRelativeImports(handlerFile, transitiveFiles);

                Set<String> requiredEnvVars = new TreeSet<>();
                boolean readsAppClientIds = false;
                for (Path file : transitiveFiles) {
                    String source = readSource(file);
                    requiredEnvVars.addAll(requiredEnvVarNames(source));
                    if (file.toString().replace('\\', '/').endsWith("app/lib/appClientResolver.js")) {
                        readsAppClientIds = true;
                    }
                }

                Map<String, Object> environment = (Map<String, Object>) properties.get("Environment");
                Map<String, Object> variables =
                        environment == null ? Map.of() : (Map<String, Object>) environment.get("Variables");
                if (variables == null) variables = Map.of();

                for (String required : requiredEnvVars) {
                    if (isAllowListed(required, handlerFile)) continue;
                    if (!variables.containsKey(required)) {
                        missingEnvVars.add(functionName + " (" + logicalId + " in " + stack.getStackName()
                                + "): missing " + required + ", read from " + handlerFile);
                    }
                }

                if (readsAppClientIds && !roleGrantsAppClientIdParameterAccess(template, properties)) {
                    missingSsmGrants.add(functionName + " (" + logicalId + " in " + stack.getStackName() + ")");
                }
            }
        }

        assertTrue(
                missingEnvVars.isEmpty(),
                "Handlers reading an environment variable their Lambda's Environment.Variables does not set:\n"
                        + String.join("\n", missingEnvVars));
        assertTrue(
                missingSsmGrants.isEmpty(),
                "Handlers importing app/lib/appClientResolver.js whose role is not granted ssm:GetParameter on all "
                        + "three app-client-id parameters:\n" + String.join("\n", missingSsmGrants));
    }

    /** {@code app/functions/auth/signInActivityPublish.handler} -> {@code app/functions/auth/signInActivityPublish.js}. */
    private static Path handlerJsFile(String handlerCommand) {
        int lastDot = handlerCommand.lastIndexOf('.');
        String withoutExportName = lastDot >= 0 ? handlerCommand.substring(0, lastDot) : handlerCommand;
        return Path.of(withoutExportName + ".js");
    }

    /** Recursion is followed only into files under these directories (see the class doc). */
    private static final Set<String> TRANSITIVE_IMPORT_ROOTS = Set.of("app/lib/", "app/data/", "app/services/");

    /**
     * Follows every relative {@code import ... from "..."} statement from {@code file} outward,
     * depth-first, adding each file visited to {@code visited}. {@code file} itself is always
     * scanned; an import is only followed further when it resolves under {@code app/lib},
     * {@code app/data} or {@code app/services} -- a handler importing a sibling handler file (to
     * reuse one exported function) does not pull in everything that sibling file's own unrelated
     * exports read. A non-relative specifier (a package name) is left alone.
     */
    private static void collectTransitiveRelativeImports(Path file, Set<Path> visited) {
        Path normalized = file.normalize();
        if (visited.contains(normalized)) return;
        if (!Files.isRegularFile(normalized)) return;
        visited.add(normalized);

        String source = readSource(normalized);
        Matcher matcher = IMPORT_FROM.matcher(source);
        while (matcher.find()) {
            String importSpecifier = matcher.group(1);
            if (!importSpecifier.startsWith(".")) continue;

            Path resolved = normalized.getParent().resolve(importSpecifier).normalize();
            if (!resolved.toString().endsWith(".js")) {
                resolved = Path.of(resolved + ".js");
            }
            if (!isUnderTransitiveImportRoot(resolved)) continue;
            collectTransitiveRelativeImports(resolved, visited);
        }
    }

    private static boolean isUnderTransitiveImportRoot(Path path) {
        String normalized = path.toString().replace('\\', '/');
        for (String root : TRANSITIVE_IMPORT_ROOTS) {
            if (normalized.contains(root)) return true;
        }
        return false;
    }

    private static String readSource(Path file) {
        try {
            return Files.readString(file);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read " + file, e);
        }
    }

    /**
     * Every {@code process.env.NAME} read with no adjacent {@code ||}/{@code ??} fallback on
     * either side (covers both {@code process.env.X || "default"} and {@code param ||
     * process.env.X}), and every {@code getResourceName("NAME")} read, in {@code source}. Reads
     * inside a comment are ignored.
     */
    private static Set<String> requiredEnvVarNames(String source) {
        String stripped = stripComments(source);
        var required = new LinkedHashSet<String>();

        Matcher envMatcher = PROCESS_ENV.matcher(stripped);
        while (envMatcher.find()) {
            if (hasAdjacentFallbackOperator(stripped, envMatcher.start(), envMatcher.end())) continue;
            required.add(envMatcher.group(1));
        }

        Matcher resourceMatcher = GET_RESOURCE_NAME.matcher(stripped);
        while (resourceMatcher.find()) {
            required.add(resourceMatcher.group(1));
        }

        return required;
    }

    private static String stripComments(String source) {
        String withoutBlockComments = BLOCK_COMMENT.matcher(source).replaceAll("");
        return LINE_COMMENT.matcher(withoutBlockComments).replaceAll("");
    }

    /** True when a {@code ||} or {@code ??} sits immediately before or after (whitespace aside). */
    private static boolean hasAdjacentFallbackOperator(String source, int start, int end) {
        return isPrecededByFallbackOperator(source, start) || isFollowedByFallbackOperator(source, end);
    }

    private static boolean isPrecededByFallbackOperator(String source, int start) {
        int i = start - 1;
        while (i >= 0 && Character.isWhitespace(source.charAt(i))) i--;
        if (i < 1) return false;
        return (source.charAt(i) == '|' && source.charAt(i - 1) == '|')
                || (source.charAt(i) == '?' && source.charAt(i - 1) == '?');
    }

    private static boolean isFollowedByFallbackOperator(String source, int end) {
        int i = end;
        while (i < source.length() && Character.isWhitespace(source.charAt(i))) i++;
        if (i + 1 >= source.length()) return false;
        return (source.charAt(i) == '|' && source.charAt(i + 1) == '|')
                || (source.charAt(i) == '?' && source.charAt(i + 1) == '?');
    }

    /**
     * True when the function's role is granted {@code ssm:GetParameter} on resources ending in all
     * three app-client-id parameter names (see {@link #APP_CLIENT_ID_PARAMETER_SUFFIXES}).
     */
    @SuppressWarnings("unchecked")
    private static boolean roleGrantsAppClientIdParameterAccess(
            Template template, Map<String, Object> functionProperties) {
        String roleLogicalId = roleLogicalIdOf(functionProperties);
        if (roleLogicalId == null) return false;

        var grantedSuffixes = new HashSet<String>();
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        for (Map<String, Object> policyResource : policies.values()) {
            Map<String, Object> props = (Map<String, Object>) policyResource.get("Properties");
            if (props == null) continue;
            if (!policyAttachesToRole(props, roleLogicalId)) continue;

            Object document = props.get("PolicyDocument");
            if (!(document instanceof Map)) continue;
            Object statements = ((Map<String, Object>) document).get("Statement");
            if (!(statements instanceof List<?>)) continue;

            for (Object statementObj : (List<Object>) statements) {
                if (!(statementObj instanceof Map)) continue;
                Map<String, Object> statement = (Map<String, Object>) statementObj;
                if (!statementGrantsSsmGetParameter(statement)) continue;
                for (String resourceArn : resourceStrings(statement.get("Resource"))) {
                    for (String suffix : APP_CLIENT_ID_PARAMETER_SUFFIXES) {
                        if (resourceArn.endsWith(suffix)) grantedSuffixes.add(suffix);
                    }
                }
            }
        }
        return grantedSuffixes.containsAll(APP_CLIENT_ID_PARAMETER_SUFFIXES);
    }

    @SuppressWarnings("unchecked")
    private static String roleLogicalIdOf(Map<String, Object> functionProperties) {
        Object role = functionProperties.get("Role");
        if (role instanceof Map) {
            Object getAtt = ((Map<String, Object>) role).get("Fn::GetAtt");
            if (getAtt instanceof List<?> parts && !parts.isEmpty()) {
                return String.valueOf(parts.get(0));
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static boolean policyAttachesToRole(Map<String, Object> policyProps, String roleLogicalId) {
        Object roles = policyProps.get("Roles");
        if (!(roles instanceof List<?>)) return false;
        for (Object role : (List<Object>) roles) {
            if (!(role instanceof Map)) continue;
            Object ref = ((Map<String, Object>) role).get("Ref");
            if (roleLogicalId.equals(ref)) return true;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static boolean statementGrantsSsmGetParameter(Map<String, Object> statement) {
        Object action = statement.get("Action");
        if (action instanceof String) return "ssm:GetParameter".equals(action);
        if (action instanceof List<?>) {
            for (Object a : (List<Object>) action) {
                if ("ssm:GetParameter".equals(a)) return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static List<String> resourceStrings(Object resource) {
        if (resource instanceof String) return List.of((String) resource);
        if (resource instanceof List<?>) {
            var out = new ArrayList<String>();
            for (Object part : (List<Object>) resource) {
                out.addAll(resourceStrings(part));
            }
            return out;
        }
        return List.of();
    }

    /**
     * {@code global} holds a name exempt on every handler (bucket a -- optional wherever it is
     * read). {@code scoped} holds a name exempt only on the specific handler file(s) named beside
     * it (bucket b -- the scanner credited that handler with a shared module's whole file, though
     * the handler never reaches the code that reads this name); a name in this map is NOT exempt
     * on any other handler, so a genuine regression on the handler(s) that do read it still fails.
     */
    private record AllowList(Set<String> global, Map<String, Set<String>> scoped) {}

    private static boolean isAllowListed(String name, Path handlerFile) {
        if (ALLOW_LIST.global().contains(name)) return true;
        Set<String> scopedToHandlers = ALLOW_LIST.scoped().get(name);
        if (scopedToHandlers == null) return false;
        return scopedToHandlers.contains(handlerFile.toString().replace('\\', '/'));
    }

    /**
     * Parses {@code infra/test/resources/lambda-env-allowlist.txt}. A line's second
     * whitespace-separated token is a handler path -- and the entry scoped, not global -- when it
     * starts with {@code app/functions/} and ends with {@code .js} exactly (a reason that merely
     * cites a handler path, e.g. {@code app/functions/hmrc/hmrcTokenPost.js:145,}, carries a
     * trailing suffix and so is left as ordinary reason text, keeping the entry global).
     */
    private static AllowList loadAllowList() {
        Path allowListPath = Path.of("infra/test/resources/lambda-env-allowlist.txt");
        try {
            var global = new HashSet<String>();
            var scoped = new HashMap<String, Set<String>>();
            for (String line : Files.readAllLines(allowListPath)) {
                String trimmed = line.strip();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                String[] tokens = trimmed.split("\\s+", 3);
                String name = tokens[0];
                String secondToken = tokens.length >= 2 ? tokens[1] : null;
                boolean isHandlerPath =
                        secondToken != null && secondToken.startsWith("app/functions/") && secondToken.endsWith(".js");
                if (isHandlerPath) {
                    scoped.computeIfAbsent(name, unused -> new HashSet<>()).add(secondToken);
                } else {
                    global.add(name);
                }
            }
            return new AllowList(global, scoped);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read " + allowListPath, e);
        }
    }

    private static @NotNull Map<String, Object> buildContextPropertyMapFromCdkJsonPath(Path cdkJsonPath)
            throws IOException {
        String json = Files.readString(cdkJsonPath);

        ObjectMapper om = new ObjectMapper();
        JsonNode root = om.readTree(json);
        JsonNode ctxNode = root.path("context");

        Map<String, Object> ctx = new HashMap<>();
        for (Map.Entry<String, JsonNode> e : ctxNode.properties()) {
            ctx.put(e.getKey(), e.getValue().asText());
        }
        return ctx;
    }
}
