/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.grantTableIndexActions;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambda;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cognito.IUserPool;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.EmailSubscription;
import software.constructs.Construct;

public class AccountStack extends Stack {

    public AbstractApiLambdaProps bundleGetLambdaProps;
    public Function bundleGetLambda;
    public ILogGroup bundleGetLambdaLogGroup;

    public AbstractApiLambdaProps bundlePostLambdaProps;
    public Function bundlePostLambda;
    public ILogGroup bundlePostLambdaLogGroup;

    public AbstractApiLambdaProps bundleDeleteLambdaProps;
    public Function bundleDeleteLambda;
    public ILogGroup bundleDeleteLambdaLogGroup;

    public AbstractApiLambdaProps supportTicketPostLambdaProps;
    public Function supportTicketPostLambda;
    public ILogGroup supportTicketPostLambdaLogGroup;

    public AbstractApiLambdaProps interestPostLambdaProps;
    public Function interestPostLambda;
    public ILogGroup interestPostLambdaLogGroup;

    public AbstractApiLambdaProps passGetLambdaProps;
    public Function passGetLambda;
    public ILogGroup passGetLambdaLogGroup;

    public AbstractApiLambdaProps passPostLambdaProps;
    public Function passPostLambda;
    public ILogGroup passPostLambdaLogGroup;

    public AbstractApiLambdaProps passAdminPostLambdaProps;
    public Function passAdminPostLambda;
    public ILogGroup passAdminPostLambdaLogGroup;

    public AbstractApiLambdaProps passGeneratePostLambdaProps;
    public Function passGeneratePostLambda;
    public ILogGroup passGeneratePostLambdaLogGroup;

    public AbstractApiLambdaProps passMyPassesGetLambdaProps;
    public Function passMyPassesGetLambda;
    public ILogGroup passMyPassesGetLambdaLogGroup;

    public Function bundleCapacityReconcileLambda;
    public ILogGroup bundleCapacityReconcileLambdaLogGroup;
    public Rule bundleCapacityReconcileSchedule;

    public AbstractApiLambdaProps sessionBeaconPostLambdaProps;
    public Function sessionBeaconPostLambda;
    public ILogGroup sessionBeaconPostLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface AccountStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String baseImageTag();

        String cognitoUserPoolArn();

        @Value.Default
        default String githubTokenSecretArn() {
            return "";
        }

        @Value.Default
        default String githubRepo() {
            return "diy-accounting-uk/submit.diyaccounting.co.uk";
        }

        @Value.Default
        default boolean feedbackEngagementEnabled() {
            return true;
        }

        static ImmutableAccountStackProps.Builder builder() {
            return ImmutableAccountStackProps.builder();
        }
    }

    public AccountStack(Construct scope, String id, AccountStackProps props) {
        this(scope, id, null, props);
    }

    public AccountStack(Construct scope, String id, StackProps stackProps, AccountStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing Cognito UserPool
        // TODO: Remove this and the the BUNDLE_DYNAMODB_TABLE_NAME from customAuthorizerLambdaEnv once otherwise stable
        IUserPool userPool = UserPool.fromUserPoolArn(
                this, "ImportedUserPool-%s".formatted(props.deploymentName()), props.cognitoUserPoolArn());

        // Lookup existing DynamoDB Passes Table
        ITable passesTable = Table.fromTableName(
                this, "ImportedPassesTable-%s".formatted(props.deploymentName()), props.sharedNames().passesTableName);

        // Lookup existing DynamoDB Bundle Capacity Table
        ITable bundleCapacityTable = Table.fromTableName(
                this,
                "ImportedBundleCapacityTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundleCapacityTableName);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lookup existing DynamoDB Bundle POST Async Requests Table
        ITable bundlePostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedBundlePostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlePostAsyncRequestsTableName);

        // Lookup existing DynamoDB Bundle DELETE Async Requests Table
        ITable bundleDeleteAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedBundleDeleteAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundleDeleteAsyncRequestsTableName);

        // Lookup existing DynamoDB Security State Table (issue #10 data-theft detection: bundle
        // burst counters and, once AuthStack's customAuthorizer uses it, mid-session geo state)
        ITable securityStateTable = Table.fromTableName(
                this,
                "ImportedSecurityStateTable-%s".formatted(props.deploymentName()),
                props.sharedNames().securityStateTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Construct Cognito User Pool ARN for IAM policies
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "us-east-1";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";
        var cognitoUserPoolArn =
                String.format("arn:aws:cognito-idp:%s:%s:userpool/%s", region, account, userPool.getUserPoolId());

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activityBusName);

        // Get Bundles Lambda
        var getBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME", bundleCapacityTable.getTableName())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        // .with("ASYNC_REQUESTS_DYNAMODB_TABLE_NAME", asyncRequestsTable.getTableName());
        var getBundlesAsyncLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundleGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().bundleGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().bundleGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().bundleGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().bundleGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().bundleGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundleGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundleGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundleGetLambdaCustomAuthorizer)
                        .environment(getBundlesLambdaEnv)
                        .build());

        this.bundleGetLambdaProps = getBundlesAsyncLambda.apiProps;
        this.bundleGetLambda = getBundlesAsyncLambda.ingestLambda;
        this.bundleGetLambdaLogGroup = getBundlesAsyncLambda.logGroup;
        this.lambdaFunctionProps.add(this.bundleGetLambdaProps);
        infof(
                "Created Async API Lambda %s for get bundles with ingestHandler %s",
                this.bundleGetLambda.getNode().getId(), props.sharedNames().bundleGetIngestLambdaHandler);

        // Grant the GetBundlesLambda permission to access Cognito User Pool
        var getBundlesLambdaGrantPrincipal = this.bundleGetLambda.getGrantPrincipal();
        userPool.grant(getBundlesLambdaGrantPrincipal, "cognito-idp:AdminGetUser");
        this.bundleGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("cognito-idp:AdminGetUser"))
                .resources(List.of(cognitoUserPoolArn))
                .build());

        infof(
                "Granted Cognito permissions to %s for User Pool %s",
                this.bundleGetLambda.getFunctionName(), userPool.getUserPoolId());

        // Grant DynamoDB permissions to both API and Worker Lambdas
        // bundleGet performs lazy token refresh (UpdateItem) when a bundle's tokenResetAt has elapsed.
        bundlesTable.grant(this.bundleGetLambda, "dynamodb:Query", "dynamodb:UpdateItem");
        bundleCapacityTable.grant(this.bundleGetLambda, "dynamodb:BatchGetItem");

        infof(
                "Granted DynamoDB permissions to %s for Bundles and Bundle Capacity Tables",
                this.bundleGetLambda.getFunctionName());

        // Burst detection: bundleGet increments a one-minute rate counter on the security
        // state table for every request (issue #10 acceptance criteria 3 and 6).
        securityStateTable.grant(this.bundleGetLambda, "dynamodb:UpdateItem");

        infof(
                "Granted DynamoDB UpdateItem on Security State Table to %s",
                this.bundleGetLambda.getFunctionName());

        // Grant access to user sub hash salt secret in Secrets Manager
        SubHashSaltHelper.grantSaltAccess(this.bundleGetLambda, region, account, props.envName());
        infof("Granted Secrets Manager salt access to %s", this.bundleGetLambda.getFunctionName());

        // Grant EventBridge PutEvents permission
        this.bundleGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        // Request Bundles Lambda
        var requestBundlesLambdaEnv = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME", bundleCapacityTable.getTableName())
                .with("ASYNC_REQUESTS_DYNAMODB_TABLE_NAME", bundlePostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName())
                .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
                .with("TEST_BUNDLE_USER_LIMIT", "10");
        var requestBundlesAsyncLambda = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundlePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().bundlePostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().bundlePostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().bundlePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().bundlePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().bundlePostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().bundlePostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().bundlePostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().bundlePostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().bundlePostLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().bundlePostLambdaDeadLetterQueueName)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().bundlePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundlePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundlePostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundlePostLambdaCustomAuthorizer)
                        .environment(requestBundlesLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        requestBundlesLambdaEnv.put("SQS_QUEUE_URL", requestBundlesAsyncLambda.queue.getQueueUrl());

        this.bundlePostLambdaProps = requestBundlesAsyncLambda.apiProps;
        this.bundlePostLambda = requestBundlesAsyncLambda.ingestLambda;
        this.bundlePostLambdaLogGroup = requestBundlesAsyncLambda.logGroup;
        this.lambdaFunctionProps.add(this.bundlePostLambdaProps);
        infof(
                "Created Async API Lambda %s for request bundles with ingestHandler %s and worker %s",
                this.bundlePostLambda.getNode().getId(),
                props.sharedNames().bundlePostIngestLambdaHandler,
                props.sharedNames().bundlePostWorkerLambdaHandler);

        // Grant permissions to both API and Worker Lambdas
        List.of(this.bundlePostLambda, requestBundlesAsyncLambda.workerLambda).forEach(fn -> {
            // Grant Cognito permissions
            userPool.grant(
                    fn, "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers");
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of(
                            "cognito-idp:AdminGetUser",
                            "cognito-idp:AdminUpdateUserAttributes",
                            "cognito-idp:ListUsers"))
                    .resources(List.of(cognitoUserPoolArn))
                    .build());

            // Grant DynamoDB permissions
            bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:PutItem", "dynamodb:DeleteItem");
            bundlePostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");
            bundleCapacityTable.grant(fn, "dynamodb:UpdateItem");

            // Grant access to user sub hash salt secret in Secrets Manager
            SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

            // Grant EventBridge PutEvents permission
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("events:PutEvents"))
                    .resources(List.of(activityBusArn))
                    .build());
        });

        infof(
                "Granted Cognito, DynamoDB, and Secrets Manager salt permissions to %s and its worker",
                this.bundlePostLambda.getFunctionName());

        // Delete Bundles Lambda
        var bundleDeleteLambdaEnv = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ASYNC_REQUESTS_DYNAMODB_TABLE_NAME", bundleDeleteAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName())
                .with("TEST_BUNDLE_EXPIRY_DATE", "2025-12-31")
                .with("TEST_BUNDLE_USER_LIMIT", "10");
        var bundleDeleteAsyncLambda = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().bundleDeleteIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().bundleDeleteIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().bundleDeleteIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().bundleDeleteIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().bundleDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().bundleDeleteWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().bundleDeleteWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().bundleDeleteWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().bundleDeleteWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().bundleDeleteLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().bundleDeleteLambdaDeadLetterQueueName)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().bundleDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().bundleDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().bundleDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().bundleDeleteLambdaCustomAuthorizer)
                        .environment(bundleDeleteLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        bundleDeleteLambdaEnv.put("SQS_QUEUE_URL", bundleDeleteAsyncLambda.queue.getQueueUrl());

        this.bundleDeleteLambdaProps = bundleDeleteAsyncLambda.apiProps;
        this.bundleDeleteLambda = bundleDeleteAsyncLambda.ingestLambda;
        this.bundleDeleteLambdaLogGroup = bundleDeleteAsyncLambda.logGroup;
        this.lambdaFunctionProps.add(this.bundleDeleteLambdaProps);

        // Also expose a second route for deleting a bundle by path parameter {id}
        this.lambdaFunctionProps.add(AsyncApiLambdaProps.builder()
                .idPrefix(props.sharedNames().bundleDeleteIngestLambdaFunctionName + "-ByIdRoute")
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                .ingestFunctionName(props.sharedNames().bundleDeleteIngestLambdaFunctionName)
                .ingestHandler(props.sharedNames().bundleDeleteIngestLambdaHandler)
                .ingestLambdaArn(props.sharedNames().bundleDeleteIngestLambdaArn)
                .ingestProvisionedConcurrencyAliasArn(
                        props.sharedNames().bundleDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                .workerFunctionName(props.sharedNames().bundleDeleteWorkerLambdaFunctionName)
                .workerHandler(props.sharedNames().bundleDeleteWorkerLambdaHandler)
                .workerLambdaArn(props.sharedNames().bundleDeleteWorkerLambdaArn)
                .workerProvisionedConcurrencyAliasArn(
                        props.sharedNames().bundleDeleteWorkerProvisionedConcurrencyLambdaAliasArn)
                .workerQueueName(props.sharedNames().bundleDeleteLambdaQueueName)
                .workerDeadLetterQueueName(props.sharedNames().bundleDeleteLambdaDeadLetterQueueName)
                .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                .httpMethod(props.sharedNames().bundleDeleteLambdaHttpMethod)
                .urlPath("/api/v1/bundle/{id}")
                .jwtAuthorizer(props.sharedNames().bundleDeleteLambdaJwtAuthorizer)
                .customAuthorizer(props.sharedNames().bundleDeleteLambdaCustomAuthorizer)
                .build());
        infof(
                "Created Async API Lambda %s for delete bundles with ingestHandler %s and worker %s",
                this.bundleDeleteLambda.getNode().getId(),
                props.sharedNames().bundleDeleteIngestLambdaHandler,
                props.sharedNames().bundleDeleteWorkerLambdaHandler);

        // Grant permissions to both API and Worker Lambdas
        List.of(this.bundleDeleteLambda, bundleDeleteAsyncLambda.workerLambda).forEach(fn -> {
            // Grant Cognito permissions
            userPool.grant(
                    fn, "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes", "cognito-idp:ListUsers");
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of(
                            "cognito-idp:AdminGetUser",
                            "cognito-idp:AdminUpdateUserAttributes",
                            "cognito-idp:ListUsers"))
                    .resources(List.of(cognitoUserPoolArn))
                    .build());

            // Grant DynamoDB permissions
            bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:PutItem", "dynamodb:DeleteItem");
            bundleDeleteAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

            // Grant access to user sub hash salt secret in Secrets Manager
            SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

            // Grant EventBridge PutEvents permission
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("events:PutEvents"))
                    .resources(List.of(activityBusArn))
                    .build());
        });

        infof(
                "Granted Cognito, DynamoDB, and Secrets Manager salt permissions to %s and its worker",
                this.bundleDeleteLambda.getFunctionName());

        // Support Ticket POST Lambda - only create if GitHub token secret ARN is provided
        if (props.githubTokenSecretArn() != null
                && !props.githubTokenSecretArn().isEmpty()) {
            var supportTicketPostLambdaEnv = new PopulatedMap<String, String>()
                    .with("ENVIRONMENT_NAME", props.envName())
                    .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                    .with("GITHUB_TOKEN_SECRET_ARN", props.githubTokenSecretArn())
                    .with("GITHUB_REPO", props.githubRepo());
            var supportTicketPostApiLambda = new ApiLambda(
                    this,
                    ApiLambdaProps.builder()
                            .idPrefix(props.sharedNames().supportTicketPostIngestLambdaFunctionName)
                            .baseImageTag(props.baseImageTag())
                            .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                            .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                            .ingestFunctionName(props.sharedNames().supportTicketPostIngestLambdaFunctionName)
                            .ingestHandler(props.sharedNames().supportTicketPostIngestLambdaHandler)
                            .ingestLambdaArn(props.sharedNames().supportTicketPostIngestLambdaArn)
                            .ingestProvisionedConcurrencyAliasArn(
                                    props.sharedNames().supportTicketPostIngestProvisionedConcurrencyLambdaAliasArn)
                            .ingestProvisionedConcurrency(0)
                            .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                            .httpMethod(props.sharedNames().supportTicketPostLambdaHttpMethod)
                            .urlPath(props.sharedNames().supportTicketPostLambdaUrlPath)
                            .jwtAuthorizer(props.sharedNames().supportTicketPostLambdaJwtAuthorizer)
                            .customAuthorizer(props.sharedNames().supportTicketPostLambdaCustomAuthorizer)
                            .environment(supportTicketPostLambdaEnv)
                            .build());

            this.supportTicketPostLambdaProps = supportTicketPostApiLambda.apiProps;
            this.supportTicketPostLambda = supportTicketPostApiLambda.ingestLambda;
            this.supportTicketPostLambdaLogGroup = supportTicketPostApiLambda.logGroup;
            this.lambdaFunctionProps.add(this.supportTicketPostLambdaProps);

            // Grant permission to read the GitHub token secret. Secrets Manager appends a random
            // suffix to the ARN it hands back from create-secret, so the resource policy must
            // match with a wildcard (see OpsStack's identical alarmToGithubIssueLambda grant).
            var githubTokenSecretArnWithWildcard = props.githubTokenSecretArn().endsWith("*")
                    ? props.githubTokenSecretArn()
                    : props.githubTokenSecretArn() + "-*";
            this.supportTicketPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(githubTokenSecretArnWithWildcard))
                    .build());

            // Grant EventBridge PutEvents permission
            this.supportTicketPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("events:PutEvents"))
                    .resources(List.of(activityBusArn))
                    .build());

            infof(
                    "Created Support Ticket POST Lambda %s with handler %s",
                    this.supportTicketPostLambda.getNode().getId(),
                    props.sharedNames().supportTicketPostIngestLambdaHandler);

            cfnOutput(this, "SupportTicketPostLambdaArn", this.supportTicketPostLambda.getFunctionArn());
        } else {
            infof("Skipping Support Ticket Lambda - no GitHub token secret ARN provided");
        }

        // ============================================================================
        // Interest POST Lambda (JWT auth - feedback engagement via SNS)
        // Feature-switched via feedbackEngagementEnabled in cdk.json
        // ============================================================================
        if (props.feedbackEngagementEnabled()) {
            var feedbackTopic = Topic.Builder.create(
                            this, "%s-feedback-engagement".formatted(props.resourceNamePrefix()))
                    .topicName("%s-feedback-engagement".formatted(props.resourceNamePrefix()))
                    .build();
            feedbackTopic.addSubscription(new EmailSubscription("antony@diyaccounting.co.uk"));

            var interestPostLambdaEnv = new PopulatedMap<String, String>()
                    .with("ENVIRONMENT_NAME", props.envName())
                    .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                    .with("FEEDBACK_TOPIC_ARN", feedbackTopic.getTopicArn());
            var interestPostApiLambda = new ApiLambda(
                    this,
                    ApiLambdaProps.builder()
                            .idPrefix(props.sharedNames().interestPostIngestLambdaFunctionName)
                            .baseImageTag(props.baseImageTag())
                            .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                            .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                            .ingestFunctionName(props.sharedNames().interestPostIngestLambdaFunctionName)
                            .ingestHandler(props.sharedNames().interestPostIngestLambdaHandler)
                            .ingestLambdaArn(props.sharedNames().interestPostIngestLambdaArn)
                            .ingestProvisionedConcurrencyAliasArn(
                                    props.sharedNames().interestPostIngestProvisionedConcurrencyLambdaAliasArn)
                            .ingestProvisionedConcurrency(0)
                            .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                            .httpMethod(props.sharedNames().interestPostLambdaHttpMethod)
                            .urlPath(props.sharedNames().interestPostLambdaUrlPath)
                            .jwtAuthorizer(props.sharedNames().interestPostLambdaJwtAuthorizer)
                            .customAuthorizer(props.sharedNames().interestPostLambdaCustomAuthorizer)
                            .environment(interestPostLambdaEnv)
                            .build());

            this.interestPostLambdaProps = interestPostApiLambda.apiProps;
            this.interestPostLambda = interestPostApiLambda.ingestLambda;
            this.interestPostLambdaLogGroup = interestPostApiLambda.logGroup;
            this.lambdaFunctionProps.add(this.interestPostLambdaProps);

            // Grant permission to publish to the feedback engagement SNS topic
            feedbackTopic.grantPublish(this.interestPostLambda);

            // Grant EventBridge PutEvents permission
            this.interestPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("events:PutEvents"))
                    .resources(List.of(activityBusArn))
                    .build());

            infof(
                    "Created Interest POST Lambda %s with handler %s",
                    this.interestPostLambda.getNode().getId(), props.sharedNames().interestPostIngestLambdaHandler);

            cfnOutput(this, "InterestPostLambdaArn", this.interestPostLambda.getFunctionArn());
            cfnOutput(this, "FeedbackEngagementTopicArn", feedbackTopic.getTopicArn());
        } else {
            infof("Skipping Feedback Engagement Lambda - feedbackEngagementEnabled is false");
        }

        // ============================================================================
        // Pass GET Lambda (public, no auth)
        // ============================================================================
        var passGetLambdaEnv = new PopulatedMap<String, String>()
                .with("PASSES_DYNAMODB_TABLE_NAME", passesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var passGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().passGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().passGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().passGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().passGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().passGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().passGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().passGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().passGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().passGetLambdaCustomAuthorizer)
                        .environment(passGetLambdaEnv)
                        .build());
        this.passGetLambdaProps = passGetApiLambda.apiProps;
        this.passGetLambda = passGetApiLambda.ingestLambda;
        this.passGetLambdaLogGroup = passGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.passGetLambdaProps);
        passesTable.grant(this.passGetLambda, "dynamodb:GetItem");
        this.passGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof("Created Pass GET Lambda %s", this.passGetLambda.getNode().getId());

        // ============================================================================
        // Pass POST Lambda (JWT auth - redeems pass and grants bundle)
        // ============================================================================
        var passPostLambdaEnv = new PopulatedMap<String, String>()
                .with("PASSES_DYNAMODB_TABLE_NAME", passesTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME", bundleCapacityTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var passPostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().passPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().passPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().passPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().passPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().passPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().passPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().passPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().passPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().passPostLambdaCustomAuthorizer)
                        .environment(passPostLambdaEnv)
                        .build());
        this.passPostLambdaProps = passPostApiLambda.apiProps;
        this.passPostLambda = passPostApiLambda.ingestLambda;
        this.passPostLambdaLogGroup = passPostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.passPostLambdaProps);
        // Redeem is an atomic UpdateItem; when it fails, diagnoseFailure reads the pass back.
        passesTable.grant(this.passPostLambda, "dynamodb:UpdateItem", "dynamodb:GetItem");
        // Redeeming a pass grants a bundle, which runs the same bundle writes as bundlePost.
        bundlesTable.grant(this.passPostLambda, "dynamodb:Query", "dynamodb:PutItem", "dynamodb:DeleteItem");
        bundleCapacityTable.grant(this.passPostLambda, "dynamodb:UpdateItem");
        SubHashSaltHelper.grantSaltAccess(this.passPostLambda, region, account, props.envName());
        this.passPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof("Created Pass POST Lambda %s", this.passPostLambda.getNode().getId());

        // ============================================================================
        // Pass Admin POST Lambda (JWT auth - generates pass codes)
        // ============================================================================
        var passAdminPostLambdaEnv = new PopulatedMap<String, String>()
                .with("PASSES_DYNAMODB_TABLE_NAME", passesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var passAdminPostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().passAdminPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().passAdminPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().passAdminPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().passAdminPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().passAdminPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().passAdminPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().passAdminPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().passAdminPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().passAdminPostLambdaCustomAuthorizer)
                        .environment(passAdminPostLambdaEnv)
                        .build());
        this.passAdminPostLambdaProps = passAdminPostApiLambda.apiProps;
        this.passAdminPostLambda = passAdminPostApiLambda.ingestLambda;
        this.passAdminPostLambdaLogGroup = passAdminPostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.passAdminPostLambdaProps);
        passesTable.grant(this.passAdminPostLambda, "dynamodb:PutItem");
        this.passAdminPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof(
                "Created Pass Admin POST Lambda %s",
                this.passAdminPostLambda.getNode().getId());

        // ============================================================================
        // Pass Generate POST Lambda (JWT auth - user pass generation using tokens)
        // ============================================================================
        var passGeneratePostLambdaEnv = new PopulatedMap<String, String>()
                .with("PASSES_DYNAMODB_TABLE_NAME", passesTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME", bundleCapacityTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var passGeneratePostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().passGeneratePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().passGeneratePostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().passGeneratePostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().passGeneratePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().passGeneratePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().passGeneratePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().passGeneratePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().passGeneratePostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().passGeneratePostLambdaCustomAuthorizer)
                        .environment(passGeneratePostLambdaEnv)
                        .build());
        this.passGeneratePostLambdaProps = passGeneratePostApiLambda.apiProps;
        this.passGeneratePostLambda = passGeneratePostApiLambda.ingestLambda;
        this.passGeneratePostLambdaLogGroup = passGeneratePostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.passGeneratePostLambdaProps);
        passesTable.grant(this.passGeneratePostLambda, "dynamodb:PutItem");
        // Generating a pass spends one of the issuer's tokens: read the bundle, then record the spend.
        bundlesTable.grant(this.passGeneratePostLambda, "dynamodb:Query", "dynamodb:UpdateItem");
        SubHashSaltHelper.grantSaltAccess(this.passGeneratePostLambda, region, account, props.envName());
        this.passGeneratePostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof(
                "Created Pass Generate POST Lambda %s",
                this.passGeneratePostLambda.getNode().getId());

        // ============================================================================
        // Pass My Passes GET Lambda (JWT auth - list user's generated passes)
        // ============================================================================
        var passMyPassesGetLambdaEnv = new PopulatedMap<String, String>()
                .with("PASSES_DYNAMODB_TABLE_NAME", passesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var passMyPassesGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().passMyPassesGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().passMyPassesGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().passMyPassesGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().passMyPassesGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().passMyPassesGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().passMyPassesGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().passMyPassesGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().passMyPassesGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().passMyPassesGetLambdaCustomAuthorizer)
                        .environment(passMyPassesGetLambdaEnv)
                        .build());
        this.passMyPassesGetLambdaProps = passMyPassesGetApiLambda.apiProps;
        this.passMyPassesGetLambda = passMyPassesGetApiLambda.ingestLambda;
        this.passMyPassesGetLambdaLogGroup = passMyPassesGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.passMyPassesGetLambdaProps);
        // Listing a user's own passes queries issuedBy-index, and falls back to a table Scan when
        // the query fails. The index needs its own grant: an imported table's ARN does not cover it.
        passesTable.grant(this.passMyPassesGetLambda, "dynamodb:Query", "dynamodb:Scan");
        grantTableIndexActions(passesTable, this.passMyPassesGetLambda, "issuedBy-index", "dynamodb:Query");
        SubHashSaltHelper.grantSaltAccess(this.passMyPassesGetLambda, region, account, props.envName());
        this.passMyPassesGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof(
                "Created Pass My Passes GET Lambda %s",
                this.passMyPassesGetLambda.getNode().getId());

        // ============================================================================
        // Bundle Capacity Reconciliation Lambda (EventBridge scheduled, every 5 minutes)
        // ============================================================================
        var reconcileLambdaEnv = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME", bundleCapacityTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var reconcileLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(props.sharedNames().bundleCapacityReconcileLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().bundleCapacityReconcileLambdaFunctionName)
                        .ingestHandler(props.sharedNames().bundleCapacityReconcileLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().bundleCapacityReconcileLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().bundleCapacityReconcileProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.minutes(5))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(reconcileLambdaEnv)
                        .build());
        this.bundleCapacityReconcileLambda = reconcileLambda.ingestLambda;
        this.bundleCapacityReconcileLambdaLogGroup = reconcileLambda.logGroup;
        // Reconciliation counts live bundles, which is the one legitimate Scan in the system.
        bundlesTable.grant(this.bundleCapacityReconcileLambda, "dynamodb:Scan");
        bundleCapacityTable.grant(this.bundleCapacityReconcileLambda, "dynamodb:PutItem");
        this.bundleCapacityReconcileLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        // EventBridge Rule: trigger reconciliation every hour
        this.bundleCapacityReconcileSchedule = Rule.Builder.create(
                        this, props.sharedNames().bundleCapacityReconcileLambdaFunctionName + "-Schedule")
                .ruleName(props.sharedNames().bundleCapacityReconcileLambdaFunctionName + "-schedule")
                .description("Reconcile bundle capacity counters every hour")
                .schedule(Schedule.rate(Duration.hours(1)))
                .targets(List.of(LambdaFunction.Builder.create(this.bundleCapacityReconcileLambda)
                        .build()))
                .build();
        infof(
                "Created Bundle Capacity Reconciliation Lambda %s with hourly schedule",
                this.bundleCapacityReconcileLambda.getNode().getId());

        // ============================================================================
        // Session Beacon POST Lambda (public, no auth)
        // ============================================================================
        var sessionBeaconPostLambdaEnv = new PopulatedMap<String, String>()
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var sessionBeaconPostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().sessionBeaconPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().sessionBeaconPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().sessionBeaconPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().sessionBeaconPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().sessionBeaconPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().sessionBeaconPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().sessionBeaconPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().sessionBeaconPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().sessionBeaconPostLambdaCustomAuthorizer)
                        .environment(sessionBeaconPostLambdaEnv)
                        .build());
        this.sessionBeaconPostLambdaProps = sessionBeaconPostApiLambda.apiProps;
        this.sessionBeaconPostLambda = sessionBeaconPostApiLambda.ingestLambda;
        this.sessionBeaconPostLambdaLogGroup = sessionBeaconPostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.sessionBeaconPostLambdaProps);
        this.sessionBeaconPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof(
                "Created Session Beacon POST Lambda %s",
                this.sessionBeaconPostLambda.getNode().getId());

        cfnOutput(this, "GetBundlesLambdaArn", this.bundleGetLambda.getFunctionArn());
        cfnOutput(this, "RequestBundlesLambdaArn", this.bundlePostLambda.getFunctionArn());
        cfnOutput(this, "BundleDeleteLambdaArn", this.bundleDeleteLambda.getFunctionArn());
        cfnOutput(this, "PassGetLambdaArn", this.passGetLambda.getFunctionArn());
        cfnOutput(this, "PassPostLambdaArn", this.passPostLambda.getFunctionArn());
        cfnOutput(this, "PassAdminPostLambdaArn", this.passAdminPostLambda.getFunctionArn());
        cfnOutput(this, "PassGeneratePostLambdaArn", this.passGeneratePostLambda.getFunctionArn());
        cfnOutput(this, "PassMyPassesGetLambdaArn", this.passMyPassesGetLambda.getFunctionArn());
        cfnOutput(this, "BundleCapacityReconcileLambdaArn", this.bundleCapacityReconcileLambda.getFunctionArn());
        cfnOutput(this, "SessionBeaconPostLambdaArn", this.sessionBeaconPostLambda.getFunctionArn());

        infof(
                "AccountStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
