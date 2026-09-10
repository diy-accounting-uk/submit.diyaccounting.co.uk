/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
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
import software.constructs.Construct;

/**
 * Holds the ITSA Lambdas added after HmrcStack reached CloudFormation's 500-resource-per-stack
 * ceiling. HmrcStack already carries every VAT Lambda and the first wave of ITSA ones (business
 * details, obligations, self-employment); each further async Lambda pair costs roughly ten
 * CloudFormation resources (functions, versions, aliases, roles, policies, queues, alarms), so
 * the UK property, cumulative, losses and tax liability adjustment journeys live here instead.
 * New ITSA Lambdas belong in this stack, not HmrcStack, until this one needs splitting too.
 */
public class HmrcItsaStack extends Stack {

    public AbstractApiLambdaProps hmrcItsaUkPropertyPeriodPostLambdaProps;
    public Function hmrcItsaUkPropertyPeriodPostLambda;
    public ILogGroup hmrcItsaUkPropertyPeriodPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaUkPropertyPeriodsGetLambdaProps;
    public Function hmrcItsaUkPropertyPeriodsGetLambda;
    public ILogGroup hmrcItsaUkPropertyPeriodsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaUkPropertyPeriodGetLambdaProps;
    public Function hmrcItsaUkPropertyPeriodGetLambda;
    public ILogGroup hmrcItsaUkPropertyPeriodGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaUkPropertyPeriodPutLambdaProps;
    public Function hmrcItsaUkPropertyPeriodPutLambda;
    public ILogGroup hmrcItsaUkPropertyPeriodPutLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaUkPropertyAnnualGetLambdaProps;
    public Function hmrcItsaUkPropertyAnnualGetLambda;
    public ILogGroup hmrcItsaUkPropertyAnnualGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaUkPropertyAnnualPutLambdaProps;
    public Function hmrcItsaUkPropertyAnnualPutLambda;
    public ILogGroup hmrcItsaUkPropertyAnnualPutLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface HmrcItsaStackProps extends StackProps, SubmitStackProps {

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

        String hmrcSandboxBaseUri();

        @Override
        SubmitSharedNames sharedNames();

        static ImmutableHmrcItsaStackProps.Builder builder() {
            return ImmutableHmrcItsaStackProps.builder();
        }
    }

    public HmrcItsaStack(Construct scope, String id, HmrcItsaStackProps props) {
        this(scope, id, null, props);
    }

    public HmrcItsaStack(Construct scope, String id, StackProps stackProps, HmrcItsaStackProps props) {
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

        // Lookup existing DynamoDB Receipts Table
        ITable receiptsTable = Table.fromTableName(
                this,
                "ImportedReceiptsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().receiptsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Period POST async request table
        ITable hmrcItsaUkPropertyPeriodPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyPeriodPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Periods GET (list) async request table
        ITable hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyPeriodsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Period GET (retrieve one) async request table
        ITable hmrcItsaUkPropertyPeriodGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyPeriodGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Period PUT (amend) async request table
        ITable hmrcItsaUkPropertyPeriodPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyPeriodPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Annual GET (retrieve) async request table
        ITable hmrcItsaUkPropertyAnnualGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyAnnualGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Annual PUT (create and amend) async request table
        ITable hmrcItsaUkPropertyAnnualPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyAnnualPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName);

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for Secrets Manager access
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activityBusName);

        // ITSA UK Property Period POST (create)
        var itsaUkPropertyPeriodPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName)
                .with(
                        "HMRC_ITSA_UK_PROPERTY_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyPeriodPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaUkPropertyPeriodPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaUkPropertyPeriodPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyPeriodPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaUkPropertyPeriodPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaUkPropertyPeriodPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaUkPropertyPeriodPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaUkPropertyPeriodPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaUkPropertyPeriodPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaUkPropertyPeriodPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaUkPropertyPeriodPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaUkPropertyPeriodPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaUkPropertyPeriodPostLambdaCustomAuthorizer)
                        .environment(itsaUkPropertyPeriodPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaUkPropertyPeriodPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaUkPropertyPeriodPostLambdaProps = hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaUkPropertyPeriodPostLambda = hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaUkPropertyPeriodPostLambdaLogGroup = hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaUkPropertyPeriodPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA UK property period with ingestHandler %s and worker %s",
                this.hmrcItsaUkPropertyPeriodPostLambda.getNode().getId(),
                props.sharedNames().hmrcItsaUkPropertyPeriodPostIngestLambdaHandler,
                props.sharedNames().hmrcItsaUkPropertyPeriodPostWorkerLambdaHandler);

        // Grant the ITSA UK property period Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaUkPropertyPeriodPostLambda, hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyPeriodPostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaUkPropertyPeriodPostLambda.getFunctionName());

        // ITSA UK Property Periods GET (list)
        var itsaUkPropertyPeriodsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_UK_PROPERTY_PERIODS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaUkPropertyPeriodsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaUkPropertyPeriodsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyPeriodsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaUkPropertyPeriodsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaUkPropertyPeriodsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaUkPropertyPeriodsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyPeriodsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaUkPropertyPeriodsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaUkPropertyPeriodsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaUkPropertyPeriodsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaUkPropertyPeriodsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaUkPropertyPeriodsGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaUkPropertyPeriodsGetLambdaCustomAuthorizer)
                        .environment(itsaUkPropertyPeriodsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaUkPropertyPeriodsGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaUkPropertyPeriodsGetLambdaProps = hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaUkPropertyPeriodsGetLambda = hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaUkPropertyPeriodsGetLambdaLogGroup = hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaUkPropertyPeriodsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA UK property periods list with ingestHandler %s and worker %s",
                this.hmrcItsaUkPropertyPeriodsGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsaUkPropertyPeriodsGetIngestLambdaHandler,
                props.sharedNames().hmrcItsaUkPropertyPeriodsGetWorkerLambdaHandler);

        // Grant the ITSA UK property periods list Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaUkPropertyPeriodsGetLambda, hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaUkPropertyPeriodsGetLambda.getFunctionName());

        // ITSA UK Property Period GET (retrieve one)
        var itsaUkPropertyPeriodGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_UK_PROPERTY_PERIOD_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyPeriodGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaUkPropertyPeriodGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaUkPropertyPeriodGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyPeriodGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaUkPropertyPeriodGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaUkPropertyPeriodGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaUkPropertyPeriodGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaUkPropertyPeriodGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaUkPropertyPeriodGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaUkPropertyPeriodGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaUkPropertyPeriodGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaUkPropertyPeriodGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaUkPropertyPeriodGetLambdaCustomAuthorizer)
                        .environment(itsaUkPropertyPeriodGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaUkPropertyPeriodGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaUkPropertyPeriodGetLambdaProps = hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaUkPropertyPeriodGetLambda = hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaUkPropertyPeriodGetLambdaLogGroup = hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaUkPropertyPeriodGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA UK property period retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaUkPropertyPeriodGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsaUkPropertyPeriodGetIngestLambdaHandler,
                props.sharedNames().hmrcItsaUkPropertyPeriodGetWorkerLambdaHandler);

        // Grant the ITSA UK property period retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaUkPropertyPeriodGetLambda, hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyPeriodGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaUkPropertyPeriodGetLambda.getFunctionName());

        // ITSA UK Property Period PUT (amend)
        var itsaUkPropertyPeriodPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName)
                .with(
                        "HMRC_ITSA_UK_PROPERTY_PERIOD_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyPeriodPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaUkPropertyPeriodPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaUkPropertyPeriodPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyPeriodPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaUkPropertyPeriodPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaUkPropertyPeriodPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaUkPropertyPeriodPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaUkPropertyPeriodPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaUkPropertyPeriodPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaUkPropertyPeriodPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaUkPropertyPeriodPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaUkPropertyPeriodPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaUkPropertyPeriodPutLambdaCustomAuthorizer)
                        .environment(itsaUkPropertyPeriodPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaUkPropertyPeriodPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaUkPropertyPeriodPutLambdaProps = hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaUkPropertyPeriodPutLambda = hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaUkPropertyPeriodPutLambdaLogGroup = hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaUkPropertyPeriodPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA UK property period amendment with ingestHandler %s and worker %s",
                this.hmrcItsaUkPropertyPeriodPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsaUkPropertyPeriodPutIngestLambdaHandler,
                props.sharedNames().hmrcItsaUkPropertyPeriodPutWorkerLambdaHandler);

        // Grant the ITSA UK property period amendment Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaUkPropertyPeriodPutLambda, hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyPeriodPutAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaUkPropertyPeriodPutLambda.getFunctionName());

        // ITSA UK Property Annual GET (retrieve)
        var itsaUkPropertyAnnualGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_UK_PROPERTY_ANNUAL_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyAnnualGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaUkPropertyAnnualGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaUkPropertyAnnualGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyAnnualGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaUkPropertyAnnualGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaUkPropertyAnnualGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaUkPropertyAnnualGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaUkPropertyAnnualGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaUkPropertyAnnualGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaUkPropertyAnnualGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaUkPropertyAnnualGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaUkPropertyAnnualGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaUkPropertyAnnualGetLambdaCustomAuthorizer)
                        .environment(itsaUkPropertyAnnualGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaUkPropertyAnnualGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaUkPropertyAnnualGetLambdaProps = hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaUkPropertyAnnualGetLambda = hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaUkPropertyAnnualGetLambdaLogGroup = hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaUkPropertyAnnualGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA UK property annual submission retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaUkPropertyAnnualGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsaUkPropertyAnnualGetIngestLambdaHandler,
                props.sharedNames().hmrcItsaUkPropertyAnnualGetWorkerLambdaHandler);

        // Grant the ITSA UK property annual retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaUkPropertyAnnualGetLambda, hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyAnnualGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaUkPropertyAnnualGetLambda.getFunctionName());

        // ITSA UK Property Annual PUT (create and amend)
        var itsaUkPropertyAnnualPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName)
                .with(
                        "HMRC_ITSA_UK_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyAnnualPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaUkPropertyAnnualPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaUkPropertyAnnualPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyAnnualPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaUkPropertyAnnualPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaUkPropertyAnnualPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaUkPropertyAnnualPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaUkPropertyAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaUkPropertyAnnualPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaUkPropertyAnnualPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaUkPropertyAnnualPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaUkPropertyAnnualPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaUkPropertyAnnualPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaUkPropertyAnnualPutLambdaCustomAuthorizer)
                        .environment(itsaUkPropertyAnnualPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaUkPropertyAnnualPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaUkPropertyAnnualPutLambdaProps = hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaUkPropertyAnnualPutLambda = hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaUkPropertyAnnualPutLambdaLogGroup = hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaUkPropertyAnnualPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA UK property annual submission with ingestHandler %s and worker %s",
                this.hmrcItsaUkPropertyAnnualPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsaUkPropertyAnnualPutIngestLambdaHandler,
                props.sharedNames().hmrcItsaUkPropertyAnnualPutWorkerLambdaHandler);

        // Grant the ITSA UK property annual submission Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaUkPropertyAnnualPutLambda, hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyAnnualPutAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaUkPropertyAnnualPutLambda.getFunctionName());

        Lambda.stackHealthAlarm(
                this,
                props.resourceNamePrefix(),
                "hmrc-itsa",
                List.of(
                        hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin,
                        hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin,
                        hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin,
                        hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin,
                        hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin,
                        hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin));

        infof("HmrcItsaStack %s created successfully for %s", id, props.deploymentName());
    }
}
