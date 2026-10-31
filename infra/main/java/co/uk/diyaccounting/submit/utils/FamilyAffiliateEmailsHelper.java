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
 * Helper for granting Lambda functions access to the family affiliate emails secret.
 *
 * The list is stored in AWS Secrets Manager at: {envName}/submit/family-affiliate-emails and is
 * read by app/lib/familyAffiliates.js, to mark a family affiliate when it generates a pass and to
 * find each family affiliate's hashed sub for the operator snapshot.
 */
public class FamilyAffiliateEmailsHelper {

    /**
     * Grant a Lambda function permission to read the family affiliate emails secret.
     *
     * @param lambda  The Lambda function to grant access to
     * @param region  AWS region (e.g., "eu-west-2")
     * @param account AWS account ID
     * @param envName Environment name (e.g., "ci", "prod")
     */
    public static void grantFamilyAffiliateEmailsAccess(
            Function lambda, String region, String account, String envName) {
        // Secrets Manager appends a random suffix to the secret name, so the ARN ends in a wildcard.
        String secretArn = String.format(
                "arn:aws:secretsmanager:%s:%s:secret:%s/submit/family-affiliate-emails*", region, account, envName);

        lambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(secretArn))
                .build());
    }
}
