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
 * Helper for granting Lambda functions access to the email hash secret.
 *
 * The secret is stored in AWS Secrets Manager at: {envName}/submit/email-hash-secret
 * and is used by emailHash.js to create HMAC-SHA256 hashes of email addresses, so that a pass
 * carrying an email restriction can be matched without storing the address.
 *
 * Only the handlers that reach passService.js need it, and only a pass with an email restriction
 * causes the fetch - which is why the secret being absent went unnoticed until one was created.
 */
public class EmailHashSecretHelper {

    /**
     * Grant a Lambda function permission to read the email hash secret.
     *
     * @param lambda  The Lambda function to grant access to
     * @param region  AWS region (e.g., "eu-west-2")
     * @param account AWS account ID
     * @param envName Environment name (e.g., "ci", "prod")
     */
    public static void grantEmailHashSecretAccess(Function lambda, String region, String account, String envName) {
        // Secrets Manager appends a random suffix to the ARN it hands back from create-secret, so
        // the resource must match with a wildcard.
        String emailHashSecretArn = String.format(
                "arn:aws:secretsmanager:%s:%s:secret:%s/submit/email-hash-secret*", region, account, envName);

        lambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(emailHashSecretArn))
                .build());
    }
}
