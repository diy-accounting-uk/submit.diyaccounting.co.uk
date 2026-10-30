/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import java.util.List;
import java.util.Map;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.constructs.Construct;

/**
 * Helper for granting Lambda functions access to the operator emails secret.
 *
 * The list is stored in AWS Secrets Manager at: {envName}/submit/operator-emails
 * and is read by app/lib/operators.js to grant the operator bundle to a matching email, and by
 * app/lib/activityAlert.js to label an operator's activity events.
 */
public class OperatorEmailsHelper {

    private static final String GRANT_MARKER_ID = "OperatorEmailsAccess";

    /**
     * Grant a Lambda function permission to read the operator emails secret.
     *
     * @param lambda  The Lambda function to grant access to
     * @param region  AWS region (e.g., "eu-west-2")
     * @param account AWS account ID
     * @param envName Environment name (e.g., "ci", "prod")
     */
    public static void grantOperatorEmailsAccess(Function lambda, String region, String account, String envName) {
        // A Lambda can reach this from its construct and from its stack; grant it once.
        if (lambda.getNode().tryFindChild(GRANT_MARKER_ID) != null) return;
        new Construct(lambda, GRANT_MARKER_ID);
        // Secret ARN pattern includes wildcard suffix because Secrets Manager
        // appends a random suffix to secret names
        String operatorEmailsSecretArn = String.format(
                "arn:aws:secretsmanager:%s:%s:secret:%s/submit/operator-emails*", region, account, envName);

        lambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(operatorEmailsSecretArn))
                .build());
    }

    /**
     * Grant the operator emails secret to a Lambda that publishes activity events (its environment
     * names ACTIVITY_BUS_NAME), because publishActivityEvent loads the operator list to label the
     * actor. The environment name comes from the Lambda's own ENVIRONMENT_NAME.
     *
     * @param lambda      The Lambda function
     * @param environment The Lambda's environment variables
     */
    public static void grantWhenPublishingActivity(Function lambda, Map<String, String> environment) {
        if (!environment.containsKey("ACTIVITY_BUS_NAME")) return;
        String envName = environment.get("ENVIRONMENT_NAME");
        if (envName == null) {
            throw new IllegalArgumentException(
                    "A Lambda that publishes activity events needs ENVIRONMENT_NAME to read the operator list: "
                            + lambda.getNode().getPath());
        }
        var stack = Stack.of(lambda);
        grantOperatorEmailsAccess(lambda, stack.getRegion(), stack.getAccount(), envName);
    }
}
