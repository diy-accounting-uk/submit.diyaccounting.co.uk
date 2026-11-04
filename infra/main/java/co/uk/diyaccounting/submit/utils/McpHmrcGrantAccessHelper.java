/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import java.util.List;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awscdk.services.ssm.StringParameter;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

/**
 * Lets an HMRC handler Lambda open an MCP session's HMRC grant (app/lib/mcpHmrcGrantAccess.js).
 * The grant lives sealed in the mcp-sessions table. Opening it reads the item, may refresh the
 * access token and write the new seal back, and needs the sealing key and the HMRC client secret
 * for the refresh. Every call here adds environment values and policy statements to existing
 * Lambdas and roles. It creates no CloudFormation resource.
 */
public final class McpHmrcGrantAccessHelper {

    private McpHmrcGrantAccessHelper() {}

    /** The imported mcp-sessions table and the secret that holds the sealing key. */
    public record GrantStore(ITable mcpSessionsTable, ISecret sealKeySecret) {}

    public static GrantStore lookup(
            Construct scope, String idSuffix, String mcpSessionsTableName, String sealKeySecretArnParameterName) {
        ITable table = Table.fromTableName(scope, "ImportedGrantSessionsTable-" + idSuffix, mcpSessionsTableName);
        ISecret secret = Secret.fromSecretCompleteArn(
                scope,
                "GrantSealKey-" + idSuffix,
                StringParameter.valueForStringParameter(scope, sealKeySecretArnParameterName));
        return new GrantStore(table, secret);
    }

    /** The environment the grant helper reads: the table, the sealing key and the HMRC client for a refresh. */
    public static void addEnv(
            PopulatedMap<String, String> env,
            GrantStore store,
            String hmrcBaseUri,
            String hmrcClientId,
            String hmrcClientSecretArn,
            String hmrcSandboxBaseUri,
            String hmrcSandboxClientId,
            String hmrcSandboxClientSecretArn) {
        env.with("MCP_SESSIONS_DYNAMODB_TABLE_NAME", store.mcpSessionsTable().getTableName())
                .with("MCP_OAUTH_BLOB_KEY_SECRET_ARN", store.sealKeySecret().getSecretArn());
        withIfPresent(env, "HMRC_BASE_URI", hmrcBaseUri);
        withIfPresent(env, "HMRC_CLIENT_ID", hmrcClientId);
        withIfPresent(env, "HMRC_CLIENT_SECRET_ARN", hmrcClientSecretArn);
        withIfPresent(env, "HMRC_SANDBOX_BASE_URI", hmrcSandboxBaseUri);
        withIfPresent(env, "HMRC_SANDBOX_CLIENT_ID", hmrcSandboxClientId);
        withIfPresent(env, "HMRC_SANDBOX_CLIENT_SECRET_ARN", hmrcSandboxClientSecretArn);
    }

    private static void withIfPresent(PopulatedMap<String, String> env, String key, String value) {
        if (StringUtils.isNotBlank(value)) {
            env.with(key, value);
        }
    }

    public static void grant(
            Function fn, GrantStore store, String hmrcClientSecretArn, String hmrcSandboxClientSecretArn) {
        store.mcpSessionsTable().grantReadWriteData(fn);
        store.sealKeySecret().grantRead(fn);
        for (String secretArn : List.of(hmrcClientSecretArn, hmrcSandboxClientSecretArn)) {
            if (StringUtils.isBlank(secretArn)) {
                continue;
            }
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(secretArn.endsWith("-*") ? secretArn : secretArn + "-*"))
                    .build());
        }
    }
}
