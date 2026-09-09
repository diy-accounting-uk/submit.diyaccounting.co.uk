/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import java.util.List;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;

/**
 * Helper for granting Lambda functions access to user sub hash salt secret.
 *
 * The salt is stored in AWS Secrets Manager at: {envName}/submit/user-sub-hash-salt
 * and is used by subHasher.js to create HMAC-SHA256 hashes of user sub claims.
 */
public class SubHashSaltHelper {

    /**
     * Grant a Lambda function permission to read the user sub hash salt secret.
     *
     * @param lambda  The Lambda function to grant access to
     * @param region  AWS region (e.g., "eu-west-2")
     * @param account AWS account ID
     * @param envName Environment name (e.g., "ci", "prod")
     */
    public static void grantSaltAccess(Function lambda, String region, String account, String envName) {
        // Secret ARN pattern includes wildcard suffix because Secrets Manager
        // appends a random suffix to secret names
        String saltSecretArn = String.format(
                "arn:aws:secretsmanager:%s:%s:secret:%s/submit/user-sub-hash-salt*", region, account, envName);

        lambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(saltSecretArn))
                .build());
    }
}
