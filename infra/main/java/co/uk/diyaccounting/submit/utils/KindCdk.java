/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.utils;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;

import java.util.List;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsCustomResourcePolicy;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class KindCdk {
    public static CfnOutput cfnOutput(Construct scope, String id, String value) {
        if (StringUtils.isBlank(value)) {
            warnf("CfnOutput value for %s is blank", id);
        }
        return CfnOutput.Builder.create(scope, id).value(value).build();
    }

    public static String getContextValueString(Construct scope, String contextKey, String defaultValue) {
        var contextValue = scope.getNode().tryGetContext(contextKey);
        String defaultedValue;
        String source;
        if (StringUtils.isNotBlank(contextValue.toString())) {
            defaultedValue = contextValue.toString();
            infof("%s=%s (source: CDK context)", contextKey, defaultedValue);
        } else {
            defaultedValue = defaultValue;
            infof("%s=%s (resolved from default)", contextKey, defaultedValue);
        }

        return defaultedValue;
    }

    public static @NotNull Environment buildPrimaryEnvironment() {
        String cdkDefaultAccount = System.getenv("CDK_DEFAULT_ACCOUNT");
        String cdkDefaultRegion = System.getenv("CDK_DEFAULT_REGION");
        Environment primaryEnv = null;
        if (cdkDefaultAccount != null
                && !cdkDefaultAccount.isBlank()
                && cdkDefaultRegion != null
                && !cdkDefaultRegion.isBlank()) {
            primaryEnv = Environment.builder()
                    .account(cdkDefaultAccount)
                    .region(cdkDefaultRegion)
                    .build();
            infof("Using primary environment account %s region %s", cdkDefaultAccount, cdkDefaultRegion);
        } else {
            primaryEnv = Environment.builder().build();
            warnf(
                    "CDK_DEFAULT_ACCOUNT or CDK_DEFAULT_REGION environment variables are not set, using environment agnostic stacks");
        }
        return primaryEnv;
    }

    /**
     * Record class to hold both the ILogGroup and the AwsCustomResource that creates it.
     * This allows callers to add explicit dependencies when needed.
     */
    public record EnsuredLogGroup(ILogGroup logGroup, AwsCustomResource ensureResource) {}

    /**
     * Creates a LogGroup idempotently using AwsCustomResource.
     * Uses createLogGroup API with ignoreErrorCodesMatching("ResourceAlreadyExistsException")
     * so deployments succeed whether the log group exists or not.
     *
     * @param stack The stack to create the log group in
     * @param id The construct ID prefix
     * @param logGroupName The name of the log group
     * @return EnsuredLogGroup containing both the ILogGroup and the AwsCustomResource
     */
    public static EnsuredLogGroup ensureLogGroupWithDependency(Stack stack, String id, String logGroupName) {
        AwsSdkCall createLogGroupCall = AwsSdkCall.builder()
                .service("CloudWatchLogs")
                .action("createLogGroup")
                .parameters(Map.of("logGroupName", logGroupName))
                .physicalResourceId(PhysicalResourceId.of(logGroupName))
                .ignoreErrorCodesMatching("ResourceAlreadyExistsException")
                .build();

        AwsCustomResource ensureResource = AwsCustomResource.Builder.create(stack, id + "-EnsureLogGroup")
                .onCreate(createLogGroupCall)
                .onUpdate(createLogGroupCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .actions(List.of("logs:CreateLogGroup"))
                        .resources(List.of("arn:aws:logs:" + stack.getRegion() + ":" + stack.getAccount()
                                + ":log-group:" + logGroupName + ":*"))
                        .build())))
                .build();

        ILogGroup logGroup = LogGroup.fromLogGroupName(stack, id + "-LogGroup", logGroupName);

        return new EnsuredLogGroup(logGroup, ensureResource);
    }

    /**
     * Creates an S3 bucket idempotently using AwsCustomResource.
     * Uses CreateBucket API with ignoreErrorCodesMatching("BucketAlreadyOwnedByYou")
     * so deployments succeed whether the bucket exists (owned by us) or not.
     *
     * Note: "BucketAlreadyExists" (owned by someone else) is NOT ignored - that's a real error.
     *
     * @param stack The stack to create the bucket in
     * @param id The construct ID prefix
     * @param bucketName The name of the bucket
     * @param region The region for the bucket (use stack.getRegion() for same-region)
     * @return IBucket reference to the bucket
     */
    public static IBucket ensureBucket(Stack stack, String id, String bucketName, String region) {
        // CreateBucket requires LocationConstraint for non-us-east-1 regions
        Map<String, Object> createBucketParams;
        if ("us-east-1".equals(region)) {
            createBucketParams = Map.of("Bucket", bucketName);
        } else {
            createBucketParams =
                    Map.of("Bucket", bucketName, "CreateBucketConfiguration", Map.of("LocationConstraint", region));
        }

        AwsSdkCall createBucketCall = AwsSdkCall.builder()
                .service("S3")
                .action("createBucket")
                .parameters(createBucketParams)
                .physicalResourceId(PhysicalResourceId.of(bucketName))
                // BucketAlreadyOwnedByYou means we own it - that's fine
                // BucketAlreadyExists means someone else owns it - that's a real error (not ignored)
                .ignoreErrorCodesMatching("BucketAlreadyOwnedByYou")
                .build();

        AwsCustomResource.Builder.create(stack, id + "-EnsureBucket")
                .onCreate(createBucketCall)
                .onUpdate(createBucketCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .actions(List.of("s3:CreateBucket"))
                        .resources(List.of("arn:aws:s3:::" + bucketName))
                        .build())))
                .build();

        return Bucket.fromBucketName(stack, id + "-Bucket", bucketName);
    }

    /**
     * Creates a DynamoDB table idempotently using AwsCustomResource, with point-in-time recovery on.
     * Uses CreateTable API with ignoreErrorCodesMatching("ResourceInUseException")
     * so deployments succeed whether the table exists or not.
     *
     * <p>CreateTable takes no PITR parameter and does nothing at all when the table already exists,
     * so PITR is a second call. See {@link #ensurePointInTimeRecovery}.
     *
     * @param stack The stack to create the table in
     * @param id The construct ID prefix
     * @param tableName The name of the table
     * @param partitionKeyName The partition key attribute name
     * @param sortKeyName The sort key attribute name (can be null for tables without sort key)
     * @return ITable reference to the table
     */
    public static ITable ensureTable(
            Stack stack, String id, String tableName, String partitionKeyName, String sortKeyName) {
        // Build attribute definitions
        List<Map<String, String>> attributeDefinitions = new java.util.ArrayList<>();
        attributeDefinitions.add(Map.of("AttributeName", partitionKeyName, "AttributeType", "S"));

        // Build key schema
        List<Map<String, String>> keySchema = new java.util.ArrayList<>();
        keySchema.add(Map.of("AttributeName", partitionKeyName, "KeyType", "HASH"));

        if (sortKeyName != null) {
            attributeDefinitions.add(Map.of("AttributeName", sortKeyName, "AttributeType", "S"));
            keySchema.add(Map.of("AttributeName", sortKeyName, "KeyType", "RANGE"));
        }

        Map<String, Object> createTableParams = Map.of(
                "TableName", tableName,
                "AttributeDefinitions", attributeDefinitions,
                "KeySchema", keySchema,
                "BillingMode", "PAY_PER_REQUEST");

        AwsSdkCall createTableCall = AwsSdkCall.builder()
                .service("DynamoDB")
                .action("createTable")
                .parameters(createTableParams)
                .physicalResourceId(PhysicalResourceId.of(tableName))
                // ResourceInUseException means table already exists - that's fine
                .ignoreErrorCodesMatching("ResourceInUseException")
                .build();

        AwsCustomResource ensureTableResource = AwsCustomResource.Builder.create(stack, id + "-EnsureTable")
                .onCreate(createTableCall)
                .onUpdate(createTableCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:CreateTable", "dynamodb:DescribeTable"))
                        .resources(List.of("arn:aws:dynamodb:" + stack.getRegion() + ":" + stack.getAccount()
                                + ":table/" + tableName))
                        .build())))
                .build();

        ensurePointInTimeRecovery(stack, id, tableName, ensureTableResource);

        return Table.fromTableName(stack, id + "-Table", tableName);
    }

    /**
     * Turns on point-in-time recovery for a table, giving a 35-day continuous recovery window.
     *
     * <p>UpdateContinuousBackups is the only API that sets PITR — CreateTable has no parameter for
     * it — and it is idempotent, so it is safe against a table that already has PITR on. It reaches
     * live tables that CreateTable skips, which is what makes it work on the existing prod and CI
     * tables rather than only on new ones.
     *
     * <p>Errors are deliberately not ignored. A table that is still CREATING rejects this call, and
     * a deployment that failed loudly there is better than one that silently leaves a table with no
     * recovery window. The dependency on the CreateTable resource orders the two calls.
     *
     * @param stack The stack holding the table
     * @param id The construct ID prefix, matching the one passed to ensureTable
     * @param tableName The name of the table
     * @param ensureTableResource The CreateTable custom resource this call must follow
     */
    private static void ensurePointInTimeRecovery(
            Stack stack, String id, String tableName, AwsCustomResource ensureTableResource) {
        Map<String, Object> updateContinuousBackupsParams = Map.of(
                "TableName",
                tableName,
                "PointInTimeRecoverySpecification",
                Map.of("PointInTimeRecoveryEnabled", true));

        AwsSdkCall updateContinuousBackupsCall = AwsSdkCall.builder()
                .service("DynamoDB")
                .action("updateContinuousBackups")
                .parameters(updateContinuousBackupsParams)
                .physicalResourceId(PhysicalResourceId.of(tableName + "-pitr"))
                .build();

        AwsCustomResource ensurePitrResource = AwsCustomResource.Builder.create(stack, id + "-EnsurePITR")
                .onCreate(updateContinuousBackupsCall)
                .onUpdate(updateContinuousBackupsCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:UpdateContinuousBackups", "dynamodb:DescribeContinuousBackups"))
                        .resources(List.of("arn:aws:dynamodb:" + stack.getRegion() + ":" + stack.getAccount()
                                + ":table/" + tableName))
                        .build())))
                .build();

        ensurePitrResource.getNode().addDependency(ensureTableResource);
    }

    /**
     * Adds a Global Secondary Index to an existing DynamoDB table idempotently using AwsCustomResource.
     * Uses UpdateTable API with ignoreErrorCodesMatching("ValidationException")
     * so deployments succeed whether the GSI already exists or not.
     *
     * @param stack The stack to create the GSI in
     * @param id The construct ID prefix
     * @param tableName The name of the table to add the GSI to
     * @param indexName The name of the GSI
     * @param partitionKeyName The GSI partition key attribute name
     * @param sortKeyName The GSI sort key attribute name (can be null)
     */
    public static void ensureGlobalSecondaryIndex(
            Stack stack, String id, String tableName, String indexName, String partitionKeyName, String sortKeyName) {
        List<Map<String, String>> attributeDefinitions = new java.util.ArrayList<>();
        attributeDefinitions.add(Map.of("AttributeName", partitionKeyName, "AttributeType", "S"));

        List<Map<String, String>> gsiKeySchema = new java.util.ArrayList<>();
        gsiKeySchema.add(Map.of("AttributeName", partitionKeyName, "KeyType", "HASH"));

        if (sortKeyName != null) {
            attributeDefinitions.add(Map.of("AttributeName", sortKeyName, "AttributeType", "S"));
            gsiKeySchema.add(Map.of("AttributeName", sortKeyName, "KeyType", "RANGE"));
        }

        Map<String, Object> createGsi = Map.of(
                "IndexName", indexName,
                "KeySchema", gsiKeySchema,
                "Projection", Map.of("ProjectionType", "ALL"));

        Map<String, Object> updateTableParams = Map.of(
                "TableName", tableName,
                "AttributeDefinitions", attributeDefinitions,
                "GlobalSecondaryIndexUpdates", List.of(Map.of("Create", createGsi)));

        AwsSdkCall updateTableCall = AwsSdkCall.builder()
                .service("DynamoDB")
                .action("updateTable")
                .parameters(updateTableParams)
                .physicalResourceId(PhysicalResourceId.of(tableName + "-" + indexName))
                // ValidationException means GSI already exists - that's fine
                .ignoreErrorCodesMatching("ValidationException")
                .build();

        AwsCustomResource.Builder.create(stack, id + "-EnsureGSI")
                .onCreate(updateTableCall)
                .onUpdate(updateTableCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:UpdateTable", "dynamodb:DescribeTable"))
                        .resources(List.of("arn:aws:dynamodb:" + stack.getRegion() + ":" + stack.getAccount()
                                + ":table/" + tableName))
                        .build())))
                .build();
    }

    /**
     * Enables TTL on an existing DynamoDB table idempotently using AwsCustomResource.
     * Uses UpdateTimeToLive API with ignoreErrorCodesMatching("ValidationException")
     * so deployments succeed whether TTL is already enabled or not.
     *
     * @param stack The stack to enable TTL in
     * @param id The construct ID prefix
     * @param tableName The name of the table to enable TTL on
     * @param ttlAttributeName The name of the TTL attribute (e.g. "ttl")
     */
    public static void ensureTimeToLive(Stack stack, String id, String tableName, String ttlAttributeName) {
        Map<String, Object> timeToLiveSpec = Map.of("AttributeName", ttlAttributeName, "Enabled", true);

        Map<String, Object> updateTtlParams = Map.of("TableName", tableName, "TimeToLiveSpecification", timeToLiveSpec);

        AwsSdkCall updateTtlCall = AwsSdkCall.builder()
                .service("DynamoDB")
                .action("updateTimeToLive")
                .parameters(updateTtlParams)
                .physicalResourceId(PhysicalResourceId.of(tableName + "-ttl"))
                // ValidationException means TTL is already enabled - that's fine
                .ignoreErrorCodesMatching("ValidationException")
                .build();

        AwsCustomResource.Builder.create(stack, id + "-EnsureTTL")
                .onCreate(updateTtlCall)
                .onUpdate(updateTtlCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:UpdateTimeToLive", "dynamodb:DescribeTimeToLive"))
                        .resources(List.of("arn:aws:dynamodb:" + stack.getRegion() + ":" + stack.getAccount()
                                + ":table/" + tableName))
                        .build())))
                .build();
    }
}
