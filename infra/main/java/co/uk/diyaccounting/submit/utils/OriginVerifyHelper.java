/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.AbstractLambdaProps;
import java.util.List;
import java.util.Map;
import software.amazon.awscdk.SecretValue;
import software.amazon.awscdk.SecretsManagerSecretOptions;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;

/**
 * Wires the check that an API request came through CloudFront.
 *
 * <p>The secret {@code {envName}/submit/origin/verify} holds {@code {"current":..,"previous":..}}.
 * CloudFront sends the current value as an origin header, and app/lib/originVerifiedEntry.js
 * accepts the current and previous values. The secret exists in eu-west-2 for the Lambdas and in
 * us-east-1 for EdgeStack, because a CloudFormation dynamic reference reads its own region.
 */
public final class OriginVerifyHelper {

    public static final String HEADER_NAME = "x-diya-origin-verify";
    public static final String ENTRY_HANDLER = "app/lib/originVerifiedEntry.ingestHandler";
    public static final String TARGET_HANDLER_VARIABLE = "ORIGIN_VERIFY_TARGET_HANDLER";

    private static final String ENFORCE_VARIABLE = "ORIGIN_VERIFY_ENFORCE";
    private static final String SECRET_NAME_VARIABLE = "ORIGIN_VERIFY_SECRET_NAME";

    private OriginVerifyHelper() {}

    public static String secretName(String envName) {
        return envName + "/submit/origin/verify";
    }

    private static boolean checksOrigin(AbstractLambdaProps props) {
        return props instanceof AbstractApiLambdaProps apiProps && apiProps.reachedThroughCloudFront();
    }

    /** The image command: the entry that checks the origin, or the Lambda's own handler. */
    public static String imageCommand(AbstractLambdaProps props) {
        return checksOrigin(props) ? ENTRY_HANDLER : props.ingestHandler();
    }

    /** Adds the entry's variables to a Lambda environment. The flag comes from .env.ci or .env.prod. */
    public static void addEnvironment(AbstractLambdaProps props, Map<String, String> environment) {
        if (!checksOrigin(props)) return;
        environment.put(TARGET_HANDLER_VARIABLE, props.ingestHandler());
        environment.put(SECRET_NAME_VARIABLE, secretName(requireEnvironmentName(props, environment)));
        environment.put(ENFORCE_VARIABLE, Kind.envOr(ENFORCE_VARIABLE, "false"));
    }

    /** Lets the entry read the secret. The ARN pattern ends in a wildcard for the random suffix. */
    public static void grantSecretRead(
            AbstractLambdaProps props, Function lambda, Map<String, String> environment) {
        if (!checksOrigin(props)) return;
        var stack = Stack.of(lambda);
        lambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(String.format(
                        "arn:aws:secretsmanager:%s:%s:secret:%s*",
                        stack.getRegion(),
                        stack.getAccount(),
                        secretName(requireEnvironmentName(props, environment)))))
                .build());
    }

    /**
     * The origin header for the API behaviours. The reference names the secret version so that a
     * new value changes the template, because CloudFormation does not read a reference again when
     * only the secret changes. A blank version means that the secret does not exist yet.
     */
    public static Map<String, String> originCustomHeaders(String envName, String secretVersionId) {
        if (secretVersionId.isBlank()) return Map.of();
        String headerValue = SecretValue.secretsManager(
                        secretName(envName),
                        SecretsManagerSecretOptions.builder()
                                .jsonField("current")
                                .versionId(secretVersionId)
                                .build())
                .unsafeUnwrap();
        return Map.of(HEADER_NAME, headerValue);
    }

    private static String requireEnvironmentName(AbstractLambdaProps props, Map<String, String> environment) {
        String envName = environment.get("ENVIRONMENT_NAME");
        if (envName == null) {
            throw new IllegalArgumentException(
                    "An API Lambda needs ENVIRONMENT_NAME to read the origin secret: " + props.ingestFunctionName());
        }
        return envName;
    }
}
