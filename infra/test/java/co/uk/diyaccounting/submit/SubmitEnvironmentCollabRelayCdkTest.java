/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Stack;

/** The relay stack is synthesised for ci and never for prod. */
class SubmitEnvironmentCollabRelayCdkTest {

    private static SubmitEnvironment synthEnvironment() throws IOException {
        Map<String, Object> ctx = new HashMap<>();
        JsonNode context = new ObjectMapper()
                .readTree(Files.readString(Path.of("cdk-environment/cdk.json")))
                .get("context");
        context.properties()
                .forEach(entry -> ctx.put(entry.getKey(), entry.getValue().asText()));
        App app = new App(AppProps.builder().context(ctx).build());
        var appProps = SubmitEnvironment.loadAppProps(app, "cdk-environment/");
        var environment = new SubmitEnvironment(app, appProps);
        app.synth();
        return environment;
    }

    private static boolean hasStackNamed(SubmitEnvironment environment, String suffix) {
        return environment.dataStack.getNode().getRoot().getNode().getChildren().stream()
                .anyMatch(child ->
                        child instanceof Stack stack && stack.getStackName().endsWith(suffix));
    }

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "ci"),
        @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "ci"),
        @SetEnvironmentVariable(key = "BASE_IMAGE_TAG", value = "env-collab-relay-test"),
        @SetEnvironmentVariable(key = "COLLAB_COORDINATOR_PUBLIC_KEY_PATH", value = "target/no-such-coordinator.pub"),
        @SetEnvironmentVariable(
                key = "GOOGLE_CLIENT_SECRET_ARN",
                value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:relay-google-secret"),
        @SetEnvironmentVariable(
                key = "MICROSOFT_CLIENT_SECRET_ARN",
                value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:relay-microsoft-secret"),
        @SetEnvironmentVariable(key = "HOLDING_DOC_ROOT_PATH", value = "./web/holding"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
    })
    void ciSynthesisesTheRelayStack() throws IOException {
        var environment = synthEnvironment();
        assertNotNull(environment.collabRelayStack);
        assertEquals("ci-env-CollabRelayStack", environment.collabRelayStack.getStackName());
    }

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "prod"),
        @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "prod"),
        @SetEnvironmentVariable(key = "BASE_IMAGE_TAG", value = "env-collab-relay-test"),
        @SetEnvironmentVariable(
                key = "GOOGLE_CLIENT_SECRET_ARN",
                value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:relay-google-secret"),
        @SetEnvironmentVariable(
                key = "MICROSOFT_CLIENT_SECRET_ARN",
                value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:relay-microsoft-secret"),
        @SetEnvironmentVariable(key = "HOLDING_DOC_ROOT_PATH", value = "./web/holding"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
        @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
    })
    void prodHasNoRelayStackAndNoRelayResource() throws IOException {
        var environment = synthEnvironment();
        assertNull(environment.collabRelayStack);
        assertFalse(hasStackNamed(environment, "CollabRelayStack"));
    }

    @Test
    void readsTheFirstKeyLineAndAnswersEmptyWhenTheFileIsAbsent(@TempDir Path dir) throws IOException {
        var key = dir.resolve("coordinator.pub");
        Files.writeString(key, "\nssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample coordinator\n");
        assertEquals(
                "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample coordinator",
                SubmitEnvironment.readCoordinatorPublicKey(key.toString()));
        assertEquals(
                "",
                SubmitEnvironment.readCoordinatorPublicKey(
                        dir.resolve("absent.pub").toString()));
        assertTrue(SubmitEnvironment.readCoordinatorPublicKey("").isEmpty());
    }
}
