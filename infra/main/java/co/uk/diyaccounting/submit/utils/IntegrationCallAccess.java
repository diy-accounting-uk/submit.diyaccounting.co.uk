/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import java.util.List;
import java.util.Map;
import software.amazon.awscdk.Arn;
import software.amazon.awscdk.ArnComponents;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;

/**
 * Lets a Lambda that sends through a recorded path write its call records (app/lib/integrationCalls.js).
 * A stack names the table in the Lambda's environment with {@link #ENV_NAME}. Lambda and
 * AsyncApiLambda then add one PutItem statement on that table to the function's role. The
 * statement joins the role's existing policy, so it adds no CloudFormation resource.
 */
public final class IntegrationCallAccess {

    public static final String ENV_NAME = "INTEGRATION_CALLS_DYNAMODB_TABLE_NAME";

    /** Each record names the deployment that sent it. */
    public static final String DEPLOYMENT_ENV_NAME = "DEPLOYMENT_NAME";

    private IntegrationCallAccess() {}

    /** The environment a Lambda needs to write call records. */
    public static void addEnv(PopulatedMap<String, String> env, String tableName, String deploymentName) {
        env.with(ENV_NAME, tableName).with(DEPLOYMENT_ENV_NAME, deploymentName);
    }

    /** Grants PutItem on the table the environment names. A function whose environment names none is left as it is. */
    public static void grantWhenRecording(Function lambda, Map<String, String> environment) {
        String tableName = environment.get(ENV_NAME);
        if (tableName == null || tableName.isBlank()) return;
        String tableArn = Arn.format(
                ArnComponents.builder()
                        .service("dynamodb")
                        .resource("table")
                        .resourceName(tableName)
                        .build(),
                Stack.of(lambda));
        lambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("dynamodb:PutItem"))
                .resources(List.of(tableArn))
                .build());
    }
}
