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
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.IGrantable;
import software.amazon.awscdk.services.iam.IRole;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.Policy;
import software.amazon.awscdk.services.iam.PolicyDocument;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
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
        if (contextValue != null && StringUtils.isNotBlank(contextValue.toString())) {
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

    private static final String AWS_CUSTOM_RESOURCE_PROVIDER_LOG_GROUP_ID = "AwsCustomResourceProviderLogGroup";

    private static final String AWS_CUSTOM_RESOURCE_PROVIDER_ROLE_ID = "AwsCustomResourceProviderRole";

    /**
     * Returns the execution role for a stack's singleton AwsCustomResource provider Lambda,
     * creating it on first call and returning the same instance on every later call for that stack.
     *
     * <p>CDK gives every {@link AwsCustomResource} in a stack the same provider Lambda, so they all
     * share one execution role, and each resource's {@code policy} becomes another inline policy on
     * it. IAM caps the total size of a role's inline policies at 10240 bytes, so a stack that
     * creates enough custom resources eventually fails to deploy. Owning the role here lets a
     * construct grant one consolidated policy for a whole family of resources instead of one policy
     * per resource — see {@code BusinessViews}, where every Athena view shares a single grant.
     *
     * <p>The role must be passed to every {@link AwsCustomResource} in the stack. CDK takes the role
     * from whichever resource happens to build the singleton first and ignores it on the rest, so a
     * resource that misses it would run under a different role than the one carrying its grants.
     *
     * @param stack The stack whose AwsCustomResource provider role is needed
     * @return The shared execution role for that stack's provider Lambda
     */
    public static IRole ensureAwsCustomResourceProviderRole(Stack stack) {
        software.constructs.IConstruct existing = stack.getNode().tryFindChild(AWS_CUSTOM_RESOURCE_PROVIDER_ROLE_ID);
        if (existing != null) {
            return (IRole) existing;
        }
        return Role.Builder.create(stack, AWS_CUSTOM_RESOURCE_PROVIDER_ROLE_ID)
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")))
                .build();
    }

    private static final String AWS_CUSTOM_RESOURCE_PROVIDER_POLICY_ID = "AwsCustomResourceProviderPolicy";

    /**
     * Grants {@code statements} to the stack's shared AwsCustomResource provider role, through one
     * policy per stack that every custom resource in that stack contributes to, and returns that
     * policy so the caller can make its resource depend on it.
     *
     * <p>Letting each {@link AwsCustomResource} carry its own {@code policy} is what walks a stack
     * into IAM's 10240-byte inline-policy limit: the per-policy and per-statement boilerplate is
     * repeated once per resource, so the cost grows with the resource count rather than with the
     * distinct permissions. One minimized document instead merges statements that share an action
     * or a resource, and the same table granted twice costs nothing the second time.
     *
     * @param stack The stack whose provider role is being granted to
     * @param statements The permissions one custom resource needs
     * @return The shared policy, to be added as a dependency of that custom resource
     */
    public static Policy grantToAwsCustomResourceProvider(Stack stack, List<PolicyStatement> statements) {
        software.constructs.IConstruct existing = stack.getNode().tryFindChild(AWS_CUSTOM_RESOURCE_PROVIDER_POLICY_ID);
        Policy policy;
        if (existing != null) {
            policy = (Policy) existing;
        } else {
            policy = Policy.Builder.create(stack, AWS_CUSTOM_RESOURCE_PROVIDER_POLICY_ID)
                    .document(PolicyDocument.Builder.create().minimize(true).build())
                    .build();
            policy.attachToRole(ensureAwsCustomResourceProviderRole(stack));
        }
        statements.forEach(policy::addStatements);
        return policy;
    }

    /**
     * Returns the log group for a stack's default AwsCustomResource provider Lambda, creating it
     * on first call and returning the same instance on every later call for that stack.
     *
     * <p>An {@link AwsCustomResource} built without an explicit function name reuses one singleton
     * Lambda per stack (CDK looks it up by a fixed construct id under the stack, regardless of
     * which class created it), so every such resource in a stack must share one log group here —
     * a second {@code LogGroup} construct with the same name would fail at deploy with
     * "already exists".
     *
     * @param stack The stack whose default AwsCustomResource provider log group is needed
     * @return The shared ILogGroup for that stack's provider Lambda
     */
    public static ILogGroup ensureAwsCustomResourceProviderLogGroup(Stack stack) {
        software.constructs.IConstruct existing =
                stack.getNode().tryFindChild(AWS_CUSTOM_RESOURCE_PROVIDER_LOG_GROUP_ID);
        if (existing != null) {
            return (ILogGroup) existing;
        }
        return LogGroup.Builder.create(stack, AWS_CUSTOM_RESOURCE_PROVIDER_LOG_GROUP_ID)
                .logGroupName("/aws/lambda/" + stack.getStackName() + "-AwsCustomResourceProvider")
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
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

        // Deletes the log group when this custom resource is torn down with the stack, so a
        // destroyed stack leaves nothing behind even though the group was never a native
        // CloudFormation-owned LogGroup resource. ResourceNotFoundException is ignored because the
        // group may already be gone (or never got past onCreate).
        AwsSdkCall deleteLogGroupCall = AwsSdkCall.builder()
                .service("CloudWatchLogs")
                .action("deleteLogGroup")
                .parameters(Map.of("logGroupName", logGroupName))
                .ignoreErrorCodesMatching("ResourceNotFoundException")
                .build();

        // Both calls are granted up front, before either resource exists, because the retention
        // call runs within a second of the grant and IAM propagation is not that fast: it was once
        // denied in prod on a permission that had just landed.
        // PutRetentionPolicy authorises against the bare log-group ARN, not the ":*" form the
        // stream-level actions use.
        String logGroupArn =
                "arn:aws:logs:" + stack.getRegion() + ":" + stack.getAccount() + ":log-group:" + logGroupName;
        Policy logGroupGrant = grantToAwsCustomResourceProvider(
                stack,
                List.of(
                        PolicyStatement.Builder.create()
                                .actions(List.of("logs:CreateLogGroup", "logs:DeleteLogGroup"))
                                .resources(List.of(logGroupArn + ":*"))
                                .build(),
                        PolicyStatement.Builder.create()
                                .actions(List.of("logs:PutRetentionPolicy"))
                                .resources(List.of(logGroupArn, logGroupArn + ":*"))
                                .build()));

        AwsCustomResource ensureResource = AwsCustomResource.Builder.create(stack, id + "-EnsureLogGroup")
                .onCreate(createLogGroupCall)
                .onUpdate(createLogGroupCall)
                .onDelete(deleteLogGroupCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();
        ensureResource.getNode().addDependency(logGroupGrant);

        // CreateLogGroup has no retention parameter, so retention is a second, dependent call —
        // the same two-call shape as ensurePointInTimeRecovery.
        AwsSdkCall putRetentionCall = AwsSdkCall.builder()
                .service("CloudWatchLogs")
                .action("putRetentionPolicy")
                .parameters(Map.of("logGroupName", logGroupName, "retentionInDays", 3))
                .physicalResourceId(PhysicalResourceId.of(logGroupName + "-retention"))
                .build();

        AwsCustomResource ensureRetentionResource = AwsCustomResource.Builder.create(
                        stack, id + "-EnsureLogGroupRetention")
                .onCreate(putRetentionCall)
                .onUpdate(putRetentionCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();
        ensureRetentionResource.getNode().addDependency(logGroupGrant);
        ensureRetentionResource.getNode().addDependency(ensureResource);

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

        Policy bucketGrant = grantToAwsCustomResourceProvider(
                stack,
                List.of(PolicyStatement.Builder.create()
                        .actions(List.of("s3:CreateBucket"))
                        .resources(List.of("arn:aws:s3:::" + bucketName))
                        .build()));

        AwsCustomResource ensureBucketResource = AwsCustomResource.Builder.create(stack, id + "-EnsureBucket")
                .onCreate(createBucketCall)
                .onUpdate(createBucketCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();
        ensureBucketResource.getNode().addDependency(bucketGrant);

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

        Policy createTableGrant = grantToAwsCustomResourceProvider(
                stack,
                List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:CreateTable", "dynamodb:DescribeTable"))
                        .resources(List.of(dynamoTableArn(stack, tableName)))
                        .build()));

        AwsCustomResource ensureTableResource = AwsCustomResource.Builder.create(stack, id + "-EnsureTable")
                .onCreate(createTableCall)
                .onUpdate(createTableCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();
        ensureTableResource.getNode().addDependency(createTableGrant);

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
                "TableName", tableName, "PointInTimeRecoverySpecification", Map.of("PointInTimeRecoveryEnabled", true));

        AwsSdkCall updateContinuousBackupsCall = AwsSdkCall.builder()
                .service("DynamoDB")
                .action("updateContinuousBackups")
                .parameters(updateContinuousBackupsParams)
                .physicalResourceId(PhysicalResourceId.of(tableName + "-pitr"))
                .build();

        Policy pitrGrant = grantToAwsCustomResourceProvider(
                stack,
                List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:UpdateContinuousBackups", "dynamodb:DescribeContinuousBackups"))
                        .resources(List.of(dynamoTableArn(stack, tableName)))
                        .build()));

        AwsCustomResource ensurePitrResource = AwsCustomResource.Builder.create(stack, id + "-EnsurePITR")
                .onCreate(updateContinuousBackupsCall)
                .onUpdate(updateContinuousBackupsCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();

        ensurePitrResource.getNode().addDependency(pitrGrant);
        ensurePitrResource.getNode().addDependency(ensureTableResource);
    }

    /**
     * Grants actions on one global secondary index of a table.
     *
     * <p>Tables imported with {@code Table.fromTableName} carry no index metadata, so CDK's own
     * grant helpers emit the bare table ARN and nothing else. A Query against an index is then
     * denied however broad the grant looks, because an index has its own ARN. Anything querying an
     * index needs this alongside its table grant.
     *
     * @param table The table owning the index
     * @param grantee The function that queries the index
     * @param indexName The name of the global secondary index
     * @param actions The DynamoDB actions to allow on the index
     */
    public static void grantTableIndexActions(ITable table, IGrantable grantee, String indexName, String... actions) {
        grantee.getGrantPrincipal()
                .addToPrincipalPolicy(PolicyStatement.Builder.create()
                        .actions(List.of(actions))
                        .resources(List.of(table.getTableArn() + "/index/" + indexName))
                        .build());
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

        Policy gsiGrant = grantToAwsCustomResourceProvider(
                stack,
                List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:UpdateTable", "dynamodb:DescribeTable"))
                        .resources(List.of(dynamoTableArn(stack, tableName)))
                        .build()));

        AwsCustomResource ensureGsiResource = AwsCustomResource.Builder.create(stack, id + "-EnsureGSI")
                .onCreate(updateTableCall)
                .onUpdate(updateTableCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();
        ensureGsiResource.getNode().addDependency(gsiGrant);
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

        Policy ttlGrant = grantToAwsCustomResourceProvider(
                stack,
                List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:UpdateTimeToLive", "dynamodb:DescribeTimeToLive"))
                        .resources(List.of(dynamoTableArn(stack, tableName)))
                        .build()));

        AwsCustomResource ensureTtlResource = AwsCustomResource.Builder.create(stack, id + "-EnsureTTL")
                .onCreate(updateTtlCall)
                .onUpdate(updateTtlCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();
        ensureTtlResource.getNode().addDependency(ttlGrant);
    }

    /**
     * Turns on a DynamoDB stream on an existing table idempotently using AwsCustomResource.
     *
     * <p>CreateTable takes no StreamSpecification parameter and does nothing at all when the table
     * already exists, so the stream is a second call, exactly like {@link #ensurePointInTimeRecovery}
     * and {@link #ensureTimeToLive}. Call this after {@code ensureTable} and wire an explicit
     * dependency on the table's {@code -EnsureTable} construct, the same way the passes GSI depends
     * on its table, so the stream update does not race table creation.
     *
     * <p>UpdateTable rejects a no-change stream request (re-enabling a stream that already has the
     * same view type) with ValidationException, so that code is ignored to keep repeat deployments
     * idempotent.
     *
     * <p>The stream ARN comes from a second, read-only DescribeTable call rather than this UpdateTable
     * call's own response: the CDK custom-resource runtime refuses to combine {@code
     * getResponseField} with {@code ignoreErrorCodesMatching} on the same call, and the enable call
     * above must ignore ValidationException to stay idempotent. DescribeTable never errors against a
     * table that exists, so it can read the field freely; it depends on the enable call so it always
     * runs after the stream is actually on.
     *
     * @param stack The stack holding the table
     * @param id The construct ID prefix
     * @param tableName The name of the table to enable a stream on
     * @param viewType The DynamoDB StreamViewType (e.g. "NEW_AND_OLD_IMAGES")
     * @return The table's latest stream ARN
     */
    public static String ensureStream(Stack stack, String id, String tableName, String viewType) {
        Map<String, Object> streamSpecification = Map.of("StreamEnabled", true, "StreamViewType", viewType);

        Map<String, Object> updateTableParams =
                Map.of("TableName", tableName, "StreamSpecification", streamSpecification);

        AwsSdkCall updateTableCall = AwsSdkCall.builder()
                .service("DynamoDB")
                .action("updateTable")
                .parameters(updateTableParams)
                .physicalResourceId(PhysicalResourceId.of(tableName + "-stream"))
                // ValidationException means the stream is already enabled with this view type - that's fine
                .ignoreErrorCodesMatching("ValidationException")
                .build();

        Policy streamGrant = grantToAwsCustomResourceProvider(
                stack,
                List.of(PolicyStatement.Builder.create()
                        .actions(List.of("dynamodb:UpdateTable", "dynamodb:DescribeTable"))
                        .resources(List.of(dynamoTableArn(stack, tableName)))
                        .build()));

        AwsCustomResource ensureStreamResource = AwsCustomResource.Builder.create(stack, id + "-EnsureStream")
                .onCreate(updateTableCall)
                .onUpdate(updateTableCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();
        ensureStreamResource.getNode().addDependency(streamGrant);

        AwsSdkCall describeTableCall = AwsSdkCall.builder()
                .service("DynamoDB")
                .action("describeTable")
                .parameters(Map.of("TableName", tableName))
                .physicalResourceId(PhysicalResourceId.of(tableName + "-stream-arn"))
                .build();

        AwsCustomResource streamArnResource = AwsCustomResource.Builder.create(stack, id + "-DescribeStream")
                .onCreate(describeTableCall)
                .onUpdate(describeTableCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(stack))
                .role(ensureAwsCustomResourceProviderRole(stack))
                .build();
        streamArnResource.getNode().addDependency(streamGrant);
        streamArnResource.getNode().addDependency(ensureStreamResource);

        return streamArnResource.getResponseField("Table.LatestStreamArn");
    }

    private static String dynamoTableArn(Stack stack, String tableName) {
        return "arn:aws:dynamodb:" + stack.getRegion() + ":" + stack.getAccount() + ":table/" + tableName;
    }
}
