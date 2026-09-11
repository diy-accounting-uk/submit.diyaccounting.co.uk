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

    public AbstractApiLambdaProps hmrcItsaBsasUkPropertyGetLambdaProps;
    public Function hmrcItsaBsasUkPropertyGetLambda;
    public ILogGroup hmrcItsaBsasUkPropertyGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaBsasUkPropertyAdjustPostLambdaProps;
    public Function hmrcItsaBsasUkPropertyAdjustPostLambda;
    public ILogGroup hmrcItsaBsasUkPropertyAdjustPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaLossesAndClaimsGetLambdaProps;
    public Function hmrcItsaLossesAndClaimsGetLambda;
    public ILogGroup hmrcItsaLossesAndClaimsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaLossesAndClaimsPutLambdaProps;
    public Function hmrcItsaLossesAndClaimsPutLambda;
    public ILogGroup hmrcItsaLossesAndClaimsPutLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaLossesAndClaimsDeleteLambdaProps;
    public Function hmrcItsaLossesAndClaimsDeleteLambda;
    public ILogGroup hmrcItsaLossesAndClaimsDeleteLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaTaxLiabilityAdjustmentsGetLambdaProps;
    public Function hmrcItsaTaxLiabilityAdjustmentsGetLambda;
    public ILogGroup hmrcItsaTaxLiabilityAdjustmentsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaTaxLiabilityAdjustmentsPutLambdaProps;
    public Function hmrcItsaTaxLiabilityAdjustmentsPutLambda;
    public ILogGroup hmrcItsaTaxLiabilityAdjustmentsPutLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaProps;
    public Function hmrcItsaTaxLiabilityAdjustmentsDeleteLambda;
    public ILogGroup hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaLogGroup;

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

        // Lookup existing DynamoDB HMRC ITSA business source adjustable summary (UK property) retrieve async request table
        ITable hmrcItsaBsasUkPropertyGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasUkPropertyGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaBsasUkPropertyGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA business source adjustable summary (UK property) adjust async request table
        ITable hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA losses and claims GET async request table
        ITable hmrcItsaLossesAndClaimsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaLossesAndClaimsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaLossesAndClaimsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA losses and claims PUT async request table
        ITable hmrcItsaLossesAndClaimsPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaLossesAndClaimsPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaLossesAndClaimsPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA losses and claims DELETE async request table
        ITable hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaLossesAndClaimsDeleteAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA tax liability adjustments GET async request table
        ITable hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA tax liability adjustments PUT async request table
        ITable hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA tax liability adjustments DELETE async request table
        ITable hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName);

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

        // ITSA business source adjustable summary (UK property) retrieve
        var itsaBsasUkPropertyGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_UK_PROPERTY_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasUkPropertyGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaBsasUkPropertyGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaBsasUkPropertyGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaBsasUkPropertyGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaBsasUkPropertyGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaBsasUkPropertyGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaBsasUkPropertyGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaBsasUkPropertyGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaBsasUkPropertyGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaBsasUkPropertyGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrcItsaBsasUkPropertyGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaBsasUkPropertyGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaBsasUkPropertyGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaBsasUkPropertyGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaBsasUkPropertyGetLambdaCustomAuthorizer)
                        .environment(itsaBsasUkPropertyGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBsasUkPropertyGetLambdaEnv.put("SQS_QUEUE_URL", hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBsasUkPropertyGetLambdaProps = hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaBsasUkPropertyGetLambda = hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBsasUkPropertyGetLambdaLogGroup = hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBsasUkPropertyGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA BSAS UK property retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaBsasUkPropertyGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsaBsasUkPropertyGetIngestLambdaHandler,
                props.sharedNames().hmrcItsaBsasUkPropertyGetWorkerLambdaHandler);

        // Grant the ITSA BSAS UK property retrieval Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaBsasUkPropertyGetLambda, hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasUkPropertyGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaBsasUkPropertyGetLambda.getFunctionName());

        // ITSA business source adjustable summary (UK property) adjust
        var itsaBsasUkPropertyAdjustPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_UK_PROPERTY_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaBsasUkPropertyAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostLambdaCustomAuthorizer)
                        .environment(itsaBsasUkPropertyAdjustPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBsasUkPropertyAdjustPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBsasUkPropertyAdjustPostLambdaProps = hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaBsasUkPropertyAdjustPostLambda = hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBsasUkPropertyAdjustPostLambdaLogGroup = hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBsasUkPropertyAdjustPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA BSAS UK property adjustment with ingestHandler %s and worker %s",
                this.hmrcItsaBsasUkPropertyAdjustPostLambda.getNode().getId(),
                props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostIngestLambdaHandler,
                props.sharedNames().hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaHandler);

        // Grant the ITSA BSAS UK property adjustment Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaBsasUkPropertyAdjustPostLambda, hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaBsasUkPropertyAdjustPostLambda.getFunctionName());

        // ITSA losses and claims GET (retrieve)
        var itsaLossesAndClaimsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_LOSSES_AND_CLAIMS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaLossesAndClaimsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaLossesAndClaimsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaLossesAndClaimsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaLossesAndClaimsGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaLossesAndClaimsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaLossesAndClaimsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaLossesAndClaimsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaLossesAndClaimsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaLossesAndClaimsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaLossesAndClaimsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaLossesAndClaimsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaLossesAndClaimsGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrcItsaLossesAndClaimsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaLossesAndClaimsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaLossesAndClaimsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaLossesAndClaimsGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaLossesAndClaimsGetLambdaCustomAuthorizer)
                        .environment(itsaLossesAndClaimsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaLossesAndClaimsGetLambdaEnv.put("SQS_QUEUE_URL", hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaLossesAndClaimsGetLambdaProps = hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaLossesAndClaimsGetLambda = hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaLossesAndClaimsGetLambdaLogGroup = hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaLossesAndClaimsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA losses and claims retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaLossesAndClaimsGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsaLossesAndClaimsGetIngestLambdaHandler,
                props.sharedNames().hmrcItsaLossesAndClaimsGetWorkerLambdaHandler);

        // Grant the ITSA losses and claims retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaLossesAndClaimsGetLambda, hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaLossesAndClaimsGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaLossesAndClaimsGetLambda.getFunctionName());

        // ITSA losses and claims PUT (create and amend)
        var itsaLossesAndClaimsPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName)
                .with(
                        "HMRC_ITSA_LOSSES_AND_CLAIMS_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaLossesAndClaimsPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaLossesAndClaimsPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaLossesAndClaimsPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaLossesAndClaimsPutIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaLossesAndClaimsPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaLossesAndClaimsPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaLossesAndClaimsPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaLossesAndClaimsPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaLossesAndClaimsPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaLossesAndClaimsPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaLossesAndClaimsPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaLossesAndClaimsPutLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrcItsaLossesAndClaimsPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaLossesAndClaimsPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaLossesAndClaimsPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaLossesAndClaimsPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaLossesAndClaimsPutLambdaCustomAuthorizer)
                        .environment(itsaLossesAndClaimsPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaLossesAndClaimsPutLambdaEnv.put("SQS_QUEUE_URL", hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaLossesAndClaimsPutLambdaProps = hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaLossesAndClaimsPutLambda = hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaLossesAndClaimsPutLambdaLogGroup = hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaLossesAndClaimsPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA losses and claims submission with ingestHandler %s and worker %s",
                this.hmrcItsaLossesAndClaimsPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsaLossesAndClaimsPutIngestLambdaHandler,
                props.sharedNames().hmrcItsaLossesAndClaimsPutWorkerLambdaHandler);

        // Grant the ITSA losses and claims submission Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaLossesAndClaimsPutLambda, hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaLossesAndClaimsPutAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaLossesAndClaimsPutLambda.getFunctionName());

        // ITSA losses and claims DELETE
        var itsaLossesAndClaimsDeleteLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_LOSSES_AND_CLAIMS_DELETE_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaLossesAndClaimsDeleteIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaLossesAndClaimsDeleteIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaLossesAndClaimsDeleteIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaLossesAndClaimsDeleteIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaLossesAndClaimsDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaLossesAndClaimsDeleteWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaLossesAndClaimsDeleteWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaLossesAndClaimsDeleteWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrcItsaLossesAndClaimsDeleteWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaLossesAndClaimsDeleteLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaLossesAndClaimsDeleteLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaLossesAndClaimsDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaLossesAndClaimsDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaLossesAndClaimsDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaLossesAndClaimsDeleteLambdaCustomAuthorizer)
                        .environment(itsaLossesAndClaimsDeleteLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaLossesAndClaimsDeleteLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaLossesAndClaimsDeleteLambdaProps = hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin.apiProps;
        this.hmrcItsaLossesAndClaimsDeleteLambda = hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaLossesAndClaimsDeleteLambdaLogGroup = hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaLossesAndClaimsDeleteLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA losses and claims deletion with ingestHandler %s and worker %s",
                this.hmrcItsaLossesAndClaimsDeleteLambda.getNode().getId(),
                props.sharedNames().hmrcItsaLossesAndClaimsDeleteIngestLambdaHandler,
                props.sharedNames().hmrcItsaLossesAndClaimsDeleteWorkerLambdaHandler);

        // Grant the ITSA losses and claims deletion Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaLossesAndClaimsDeleteLambda, hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaLossesAndClaimsDeleteLambda.getFunctionName());

        // ITSA tax liability adjustments GET (retrieve)
        var itsaTaxLiabilityAdjustmentsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaTaxLiabilityAdjustmentsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaTaxLiabilityAdjustmentsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetLambdaCustomAuthorizer)
                        .environment(itsaTaxLiabilityAdjustmentsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaTaxLiabilityAdjustmentsGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaTaxLiabilityAdjustmentsGetLambdaProps = hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaTaxLiabilityAdjustmentsGetLambda = hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaTaxLiabilityAdjustmentsGetLambdaLogGroup = hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaTaxLiabilityAdjustmentsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA tax liability adjustments retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaTaxLiabilityAdjustmentsGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaHandler,
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsGetWorkerLambdaHandler);

        // Grant the ITSA tax liability adjustments retrieval Lambda and its worker permission to access DynamoDB
        // Bundles Table
        List.of(
                        this.hmrcItsaTaxLiabilityAdjustmentsGetLambda,
                        hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaTaxLiabilityAdjustmentsGetLambda.getFunctionName());

        // ITSA tax liability adjustments PUT (create and amend)
        var itsaTaxLiabilityAdjustmentsPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().receiptsTableName)
                .with(
                        "HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaTaxLiabilityAdjustmentsPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaTaxLiabilityAdjustmentsPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutLambdaCustomAuthorizer)
                        .environment(itsaTaxLiabilityAdjustmentsPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaTaxLiabilityAdjustmentsPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaTaxLiabilityAdjustmentsPutLambdaProps = hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaTaxLiabilityAdjustmentsPutLambda = hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaTaxLiabilityAdjustmentsPutLambdaLogGroup = hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaTaxLiabilityAdjustmentsPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA tax liability adjustments submission with ingestHandler %s and worker %s",
                this.hmrcItsaTaxLiabilityAdjustmentsPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaHandler,
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaHandler);

        // Grant the ITSA tax liability adjustments submission Lambda and its worker permission to access DynamoDB
        // Bundles Table
        List.of(
                        this.hmrcItsaTaxLiabilityAdjustmentsPutLambda,
                        hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaTaxLiabilityAdjustmentsPutLambda.getFunctionName());

        // ITSA tax liability adjustments DELETE
        var itsaTaxLiabilityAdjustmentsDeleteLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_DELETE_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaCustomAuthorizer)
                        .environment(itsaTaxLiabilityAdjustmentsDeleteLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaTaxLiabilityAdjustmentsDeleteLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaProps =
                hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.apiProps;
        this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambda = hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaLogGroup =
                hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA tax liability adjustments deletion with ingestHandler %s and worker %s",
                this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambda.getNode().getId(),
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaHandler,
                props.sharedNames().hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaHandler);

        // Grant the ITSA tax liability adjustments deletion Lambda and its worker permission to access DynamoDB
        // Bundles Table
        List.of(
                        this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambda,
                        hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambda.getFunctionName());

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
                        hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin,
                        hmrcItsaBsasUkPropertyGetLambdaUrlOrigin,
                        hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin,
                        hmrcItsaLossesAndClaimsGetLambdaUrlOrigin,
                        hmrcItsaLossesAndClaimsPutLambdaUrlOrigin,
                        hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin,
                        hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin,
                        hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin,
                        hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin));

        infof("HmrcItsaStack %s created successfully for %s", id, props.deploymentName());
    }
}
