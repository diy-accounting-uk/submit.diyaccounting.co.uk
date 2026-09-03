/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambda;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class HmrcStack extends Stack {

    public AbstractApiLambdaProps hmrcTokenPostLambdaProps;
    public Function hmrcTokenPostLambda;
    public ILogGroup hmrcTokenPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcVatReturnPostLambdaProps;
    public Function hmrcVatReturnPostLambda;
    public ILogGroup hmrcVatReturnPostLambdaLogGroup;

    // New HMRC VAT GET Lambdas
    public AbstractApiLambdaProps hmrcVatObligationGetLambdaProps;
    public Function hmrcVatObligationGetLambda;
    public ILogGroup hmrcVatObligationGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcVatLiabilitiesGetLambdaProps;
    public Function hmrcVatLiabilitiesGetLambda;
    public ILogGroup hmrcVatLiabilitiesGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcVatReturnGetLambdaProps;
    public Function hmrcVatReturnGetLambda;
    public ILogGroup hmrcVatReturnGetLambdaLogGroup;

    public AbstractApiLambdaProps receiptGetLambdaProps;
    public Function receiptGetLambda;
    public ILogGroup receiptGetLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface HmrcStackProps extends StackProps, SubmitStackProps {

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

        String baseImageTag();

        String hmrcBaseUri();

        String hmrcClientId();

        String hmrcClientSecretArn();

        String hmrcSandboxBaseUri();

        String hmrcSandboxClientId();

        String hmrcSandboxClientSecretArn();

        String cognitoUserPoolId();

        @Override
        SubmitSharedNames sharedNames();

        static ImmutableHmrcStackProps.Builder builder() {
            return ImmutableHmrcStackProps.builder();
        }
    }

    public HmrcStack(Construct scope, String id, HmrcStackProps props) {
        this(scope, id, null, props);
    }

    public HmrcStack(Construct scope, String id, StackProps stackProps, HmrcStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lookup existing DynamoDB HMRC API requests Table
        ITable hmrcApiRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcApiRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcApiRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Return POST async request table
        ITable hmrcVatReturnPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatReturnPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Return GET async request table
        ITable hmrcVatReturnGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatReturnGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Obligation GET async request table
        ITable hmrcVatObligationGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatObligationGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Liabilities GET async request table
        ITable hmrcVatLiabilitiesGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatLiabilitiesGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcVatLiabilitiesGetAsyncRequestsTableName);

        // Lookup existing DynamoDB Receipts Table
        ITable receiptsTable = Table.fromTableName(
                this,
                "ImportedReceiptsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().receiptsTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for Secrets Manager access
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activityBusName);

        // exchangeToken - HMRC
        var exchangeHmrcTokenLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_CLIENT_ID", props.hmrcClientId())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("HMRC_SANDBOX_CLIENT_ID", props.hmrcSandboxClientId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            exchangeHmrcTokenLambdaEnv.with("HMRC_CLIENT_SECRET_ARN", props.hmrcClientSecretArn());
        }
        if (StringUtils.isNotBlank(props.hmrcSandboxClientSecretArn())) {
            exchangeHmrcTokenLambdaEnv.with("HMRC_SANDBOX_CLIENT_SECRET_ARN", props.hmrcSandboxClientSecretArn());
        }

        var exchangeHmrcTokenLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcTokenPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcTokenPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcTokenPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcTokenPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcTokenPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcTokenPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcTokenPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcTokenPostLambdaCustomAuthorizer)
                        .environment(exchangeHmrcTokenLambdaEnv)
                        .build());
        this.hmrcTokenPostLambdaProps = exchangeHmrcTokenLambdaUrlOrigin.apiProps;
        this.hmrcTokenPostLambda = exchangeHmrcTokenLambdaUrlOrigin.ingestLambda;
        this.hmrcTokenPostLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcTokenPostLambdaProps);
        infof(
                "Created Lambda %s for HMRC exchange token with ingestHandler %s",
                this.hmrcTokenPostLambda.getNode().getId(), props.sharedNames().hmrcTokenPostIngestLambdaHandler);

        // No bundles grant: the HMRC token exchange writes an audit record and reads no bundle.

        // Allow the token exchange Lambda to write HMRC API request audit records to DynamoDB
        hmrcApiRequestsTable.grant(this.hmrcTokenPostLambda, "dynamodb:PutItem");

        // Grant access to HMRC client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            // Use the provided ARN with wildcard suffix to handle AWS Secrets Manager's automatic suffix
            String secretArnWithWildcard = props.hmrcClientSecretArn().endsWith("-*")
                    ? props.hmrcClientSecretArn()
                    : props.hmrcClientSecretArn() + "-*";
            this.hmrcTokenPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(secretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                    this.hmrcTokenPostLambda.getFunctionName(), props.hmrcClientSecretArn(), secretArnWithWildcard);
        }

        // Grant access to HMRC sandbox client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.hmrcSandboxClientSecretArn())) {
            String sandboxSecretArnWithWildcard =
                    props.hmrcSandboxClientSecretArn().endsWith("-*")
                            ? props.hmrcSandboxClientSecretArn()
                            : props.hmrcSandboxClientSecretArn() + "-*";
            this.hmrcTokenPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(sandboxSecretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for sandbox secret %s (with wildcard: %s)",
                    this.hmrcTokenPostLambda.getFunctionName(),
                    props.hmrcSandboxClientSecretArn(),
                    sandboxSecretArnWithWildcard);
        }

        // Grant access to user sub hash salt secret in Secrets Manager
        SubHashSaltHelper.grantSaltAccess(this.hmrcTokenPostLambda, region, account, props.envName());
        infof("Granted Secrets Manager salt access to %s", this.hmrcTokenPostLambda.getFunctionName());

        // Grant EventBridge PutEvents permission
        this.hmrcTokenPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        // submitVat
        var submitVatLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName)
                .with(
                        "HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatReturnPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var submitVatLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatReturnPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcVatReturnPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcVatReturnPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcVatReturnPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcVatReturnPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .ingestMemorySize(256)
                        .workerFunctionName(props.sharedNames().hmrcVatReturnPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcVatReturnPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcVatReturnPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcVatReturnPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcVatReturnPostLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrcVatReturnPostLambdaDeadLetterQueueName)
                        .workerLambdaTimeout(Duration.seconds(300))
                        .queueVisibilityTimeout(Duration.seconds(320))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcVatReturnPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatReturnPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatReturnPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatReturnPostLambdaCustomAuthorizer)
                        .environment(submitVatLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        submitVatLambdaEnv.put("SQS_QUEUE_URL", submitVatLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatReturnPostLambdaProps = submitVatLambdaUrlOrigin.apiProps;
        this.hmrcVatReturnPostLambda = submitVatLambdaUrlOrigin.ingestLambda;
        this.hmrcVatReturnPostLambdaLogGroup = submitVatLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatReturnPostLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT submission with ingestHandler %s and worker %s",
                this.hmrcVatReturnPostLambda.getNode().getId(),
                props.sharedNames().hmrcVatReturnPostIngestLambdaHandler,
                props.sharedNames().hmrcVatReturnPostWorkerLambdaHandler);

        // Grant the VAT submission Lambda and its worker permission to access DynamoDB Bundles Table
        // Read+Write needed: bundle enforcement reads bundles, token enforcement updates tokensConsumed
        List.of(this.hmrcVatReturnPostLambda, submitVatLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatReturnPostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcVatReturnPostLambda.getFunctionName());

        // VAT obligations GET
        var vatObligationLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatObligationGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcVatObligationGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatObligationGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcVatObligationGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcVatObligationGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcVatObligationGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcVatObligationGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcVatObligationGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcVatObligationGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcVatObligationGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcVatObligationGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcVatObligationGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrcVatObligationGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcVatObligationGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatObligationGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatObligationGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatObligationGetLambdaCustomAuthorizer)
                        .environment(vatObligationLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        vatObligationLambdaEnv.put("SQS_QUEUE_URL", hmrcVatObligationGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatObligationGetLambdaProps = hmrcVatObligationGetLambdaUrlOrigin.apiProps;
        this.hmrcVatObligationGetLambda = hmrcVatObligationGetLambdaUrlOrigin.ingestLambda;
        this.hmrcVatObligationGetLambdaLogGroup = hmrcVatObligationGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatObligationGetLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT obligations with ingestHandler %s and worker %s",
                this.hmrcVatObligationGetLambda.getNode().getId(),
                props.sharedNames().hmrcVatObligationGetIngestLambdaHandler,
                props.sharedNames().hmrcVatObligationGetWorkerLambdaHandler);

        // Grant the VAT obligations Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatObligationGetLambda, hmrcVatObligationGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatObligationGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcVatObligationGetLambda.getFunctionName());

        // VAT liabilities GET
        var vatLiabilitiesLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_VAT_LIABILITIES_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatLiabilitiesGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcVatLiabilitiesGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatLiabilitiesGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcVatLiabilitiesGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcVatLiabilitiesGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcVatLiabilitiesGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcVatLiabilitiesGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcVatLiabilitiesGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcVatLiabilitiesGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcVatLiabilitiesGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcVatLiabilitiesGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcVatLiabilitiesGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrcVatLiabilitiesGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcVatLiabilitiesGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatLiabilitiesGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatLiabilitiesGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatLiabilitiesGetLambdaCustomAuthorizer)
                        .environment(vatLiabilitiesLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        vatLiabilitiesLambdaEnv.put("SQS_QUEUE_URL", hmrcVatLiabilitiesGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatLiabilitiesGetLambdaProps = hmrcVatLiabilitiesGetLambdaUrlOrigin.apiProps;
        this.hmrcVatLiabilitiesGetLambda = hmrcVatLiabilitiesGetLambdaUrlOrigin.ingestLambda;
        this.hmrcVatLiabilitiesGetLambdaLogGroup = hmrcVatLiabilitiesGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatLiabilitiesGetLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT liabilities with ingestHandler %s and worker %s",
                this.hmrcVatLiabilitiesGetLambda.getNode().getId(),
                props.sharedNames().hmrcVatLiabilitiesGetIngestLambdaHandler,
                props.sharedNames().hmrcVatLiabilitiesGetWorkerLambdaHandler);

        // Grant the VAT liabilities Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatLiabilitiesGetLambda, hmrcVatLiabilitiesGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatLiabilitiesGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcVatLiabilitiesGetLambda.getFunctionName());

        // VAT return GET
        var vatReturnGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatReturnGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcVatReturnGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcVatReturnGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcVatReturnGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcVatReturnGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcVatReturnGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcVatReturnGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcVatReturnGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcVatReturnGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcVatReturnGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcVatReturnGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcVatReturnGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrcVatReturnGetLambdaDeadLetterQueueName)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcVatReturnGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcVatReturnGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcVatReturnGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcVatReturnGetLambdaCustomAuthorizer)
                        .environment(vatReturnGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        vatReturnGetLambdaEnv.put("SQS_QUEUE_URL", hmrcVatReturnGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatReturnGetLambdaProps = hmrcVatReturnGetLambdaUrlOrigin.apiProps;
        this.hmrcVatReturnGetLambda = hmrcVatReturnGetLambdaUrlOrigin.ingestLambda;
        this.hmrcVatReturnGetLambdaLogGroup = hmrcVatReturnGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatReturnGetLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT return retrieval with ingestHandler %s and worker %s",
                this.hmrcVatReturnGetLambda.getNode().getId(),
                props.sharedNames().hmrcVatReturnGetIngestLambdaHandler,
                props.sharedNames().hmrcVatReturnGetWorkerLambdaHandler);

        // Grant the VAT return retrieval Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatReturnGetLambda, hmrcVatReturnGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatReturnGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcVatReturnGetLambda.getFunctionName());

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var myReceiptsLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().receiptGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().receiptGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().receiptGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().receiptGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().receiptGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().receiptGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().receiptGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().receiptGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().receiptGetLambdaCustomAuthorizer)
                        .environment(myReceiptsLambdaEnv)
                        .build());
        this.receiptGetLambdaProps = myReceiptsLambdaUrlOrigin.apiProps;
        this.receiptGetLambda = myReceiptsLambdaUrlOrigin.ingestLambda;
        this.receiptGetLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.receiptGetLambdaProps);
        // Also expose a second route for retrieving a single receipt by name using the same Lambda
        this.lambdaFunctionProps.add(ApiLambdaProps.builder()
                .idPrefix(props.sharedNames().receiptGetIngestLambdaFunctionName + "-ByNameRoute")
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                .ingestFunctionName(props.sharedNames().receiptGetIngestLambdaFunctionName)
                .ingestHandler(props.sharedNames().receiptGetIngestLambdaHandler)
                .ingestLambdaArn(props.sharedNames().receiptGetIngestLambdaArn)
                .ingestProvisionedConcurrencyAliasArn(
                        props.sharedNames().receiptGetIngestProvisionedConcurrencyLambdaAliasArn)
                .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                .httpMethod(props.sharedNames().receiptGetLambdaHttpMethod)
                .urlPath(props.sharedNames().receiptGetByNameLambdaUrlPath)
                .jwtAuthorizer(props.sharedNames().receiptGetLambdaJwtAuthorizer)
                .customAuthorizer(props.sharedNames().receiptGetLambdaCustomAuthorizer)
                .build());
        infof(
                "Created Lambda %s for my receipts retrieval with ingestHandler %s",
                this.receiptGetLambda.getNode().getId(), props.sharedNames().receiptGetIngestLambdaHandler);

        // No bundles grant: receipt retrieval reads receipts only.
        // A single receipt is fetched by key; the listing queries the user's partition.
        receiptsTable.grant(this.receiptGetLambda, "dynamodb:GetItem", "dynamodb:Query");

        // Grant access to user sub hash salt secret in Secrets Manager
        SubHashSaltHelper.grantSaltAccess(this.receiptGetLambda, region, account, props.envName());
        infof("Granted Secrets Manager salt access to %s", this.receiptGetLambda.getFunctionName());

        // Grant EventBridge PutEvents permission
        this.receiptGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        Lambda.stackHealthAlarm(
                this,
                props.resourceNamePrefix(),
                "hmrc",
                List.of(
                        exchangeHmrcTokenLambdaUrlOrigin,
                        submitVatLambdaUrlOrigin,
                        hmrcVatObligationGetLambdaUrlOrigin,
                        hmrcVatLiabilitiesGetLambdaUrlOrigin,
                        hmrcVatReturnGetLambdaUrlOrigin,
                        myReceiptsLambdaUrlOrigin));

        cfnOutput(this, "ExchangeHmrcTokenLambdaArn", this.hmrcTokenPostLambda.getFunctionArn());
        cfnOutput(this, "SubmitVatLambdaArn", this.hmrcVatReturnPostLambda.getFunctionArn());
        cfnOutput(this, "MyReceiptsLambdaArn", this.receiptGetLambda.getFunctionArn());

        infof(
                "HmrcStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
