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
import co.uk.diyaccounting.submit.utils.OperatorEmailsHelper;
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

    public AbstractApiLambdaProps hmrcItsaForeignPropertyPeriodPostLambdaProps;
    public Function hmrcItsaForeignPropertyPeriodPostLambda;
    public ILogGroup hmrcItsaForeignPropertyPeriodPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaForeignPropertyPeriodGetLambdaProps;
    public Function hmrcItsaForeignPropertyPeriodGetLambda;
    public ILogGroup hmrcItsaForeignPropertyPeriodGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaForeignPropertyPeriodPutLambdaProps;
    public Function hmrcItsaForeignPropertyPeriodPutLambda;
    public ILogGroup hmrcItsaForeignPropertyPeriodPutLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaUkPropertyAnnualGetLambdaProps;
    public Function hmrcItsaUkPropertyAnnualGetLambda;
    public ILogGroup hmrcItsaUkPropertyAnnualGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaUkPropertyAnnualPutLambdaProps;
    public Function hmrcItsaUkPropertyAnnualPutLambda;
    public ILogGroup hmrcItsaUkPropertyAnnualPutLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaForeignPropertyAnnualGetLambdaProps;
    public Function hmrcItsaForeignPropertyAnnualGetLambda;
    public ILogGroup hmrcItsaForeignPropertyAnnualGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaForeignPropertyAnnualPutLambdaProps;
    public Function hmrcItsaForeignPropertyAnnualPutLambda;
    public ILogGroup hmrcItsaForeignPropertyAnnualPutLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaForeignPropertyDetailsGetLambdaProps;
    public Function hmrcItsaForeignPropertyDetailsGetLambda;
    public ILogGroup hmrcItsaForeignPropertyDetailsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaForeignPropertyDetailsPostLambdaProps;
    public Function hmrcItsaForeignPropertyDetailsPostLambda;
    public ILogGroup hmrcItsaForeignPropertyDetailsPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaForeignPropertyDetailsPutLambdaProps;
    public Function hmrcItsaForeignPropertyDetailsPutLambda;
    public ILogGroup hmrcItsaForeignPropertyDetailsPutLambdaLogGroup;

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

    public AbstractApiLambdaProps hmrcVatAssistReportPostLambdaProps;
    public Function hmrcVatAssistReportPostLambda;
    public ILogGroup hmrcVatAssistReportPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcVatAssistAcknowledgePostLambdaProps;
    public Function hmrcVatAssistAcknowledgePostLambda;
    public ILogGroup hmrcVatAssistAcknowledgePostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaAssistReportPostLambdaProps;
    public Function hmrcItsaAssistReportPostLambda;
    public ILogGroup hmrcItsaAssistReportPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaAssistAcknowledgePostLambdaProps;
    public Function hmrcItsaAssistAcknowledgePostLambda;
    public ILogGroup hmrcItsaAssistAcknowledgePostLambdaLogGroup;

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

        // The submission MCP's own client: read by every Lambda in this stack's
        // buildFraudHeaders call so an MCP-issued access token answers DESKTOP_APP_VIA_SERVER
        // instead of WEB_APP_VIA_SERVER. Blank until the deploy wiring sets it, the same way the
        // other stacks' own mcpUserPoolClientId props start.
        @Value.Default
        default String mcpUserPoolClientId() {
            return "";
        }

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
                props.sharedNames().data.bundlesTableName);

        // Lookup existing DynamoDB HMRC API requests Table
        ITable hmrcApiRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcApiRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcApiRequestsTableName);

        // Lookup existing DynamoDB Receipts Table
        ITable receiptsTable = Table.fromTableName(
                this,
                "ImportedReceiptsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.receiptsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Period POST async request table
        ITable hmrcItsaUkPropertyPeriodPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyPeriodPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Periods GET (list) async request table
        ITable hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyPeriodsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Period GET (retrieve one) async request table
        ITable hmrcItsaUkPropertyPeriodGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyPeriodGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Period PUT (amend) async request table
        ITable hmrcItsaUkPropertyPeriodPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyPeriodPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Foreign Property Period POST async request table
        ITable hmrcItsaForeignPropertyPeriodPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaForeignPropertyPeriodPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodPostAsyncRequestsTableName);
        // Lookup existing DynamoDB HMRC ITSA Foreign Property Period GET (retrieve one) async request table
        ITable hmrcItsaForeignPropertyPeriodGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaForeignPropertyPeriodGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodGetAsyncRequestsTableName);
        // Lookup existing DynamoDB HMRC ITSA Foreign Property Period PUT (amend) async request table
        ITable hmrcItsaForeignPropertyPeriodPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaForeignPropertyPeriodPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodPutAsyncRequestsTableName);
        // Lookup existing DynamoDB HMRC ITSA UK Property Annual GET (retrieve) async request table
        ITable hmrcItsaUkPropertyAnnualGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyAnnualGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA UK Property Annual PUT (create and amend) async request table
        ITable hmrcItsaUkPropertyAnnualPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaUkPropertyAnnualPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Foreign Property Annual GET (retrieve) async request table
        ITable hmrcItsaForeignPropertyAnnualGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaForeignPropertyAnnualGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaForeignPropertyAnnualGetAsyncRequestsTableName);
        // Lookup existing DynamoDB HMRC ITSA Foreign Property Annual PUT (create and amend) async request table
        ITable hmrcItsaForeignPropertyAnnualPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaForeignPropertyAnnualPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaForeignPropertyAnnualPutAsyncRequestsTableName);
        // Lookup existing DynamoDB HMRC ITSA Foreign Property Details GET async request table
        ITable hmrcItsaForeignPropertyDetailsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaForeignPropertyDetailsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Foreign Property Details POST async request table
        ITable hmrcItsaForeignPropertyDetailsPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaForeignPropertyDetailsPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Foreign Property Details PUT async request table
        ITable hmrcItsaForeignPropertyDetailsPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaForeignPropertyDetailsPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA business source adjustable summary (UK property) retrieve async request
        // table
        ITable hmrcItsaBsasUkPropertyGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasUkPropertyGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaBsasUkPropertyGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA business source adjustable summary (UK property) adjust async request
        // table
        ITable hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA losses and claims GET async request table
        ITable hmrcItsaLossesAndClaimsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaLossesAndClaimsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaLossesAndClaimsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA losses and claims PUT async request table
        ITable hmrcItsaLossesAndClaimsPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaLossesAndClaimsPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaLossesAndClaimsPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA losses and claims DELETE async request table
        ITable hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaLossesAndClaimsDeleteAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA tax liability adjustments GET async request table
        ITable hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA tax liability adjustments PUT async request table
        ITable hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA tax liability adjustments DELETE async request table
        ITable hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Assist report async request table
        ITable hmrcVatAssistReportPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatAssistReportPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcVatAssistReportPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Assist acknowledge async request table
        ITable hmrcVatAssistAcknowledgePostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatAssistAcknowledgePostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcVatAssistAcknowledgePostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Assist report async request table
        ITable hmrcItsaAssistReportPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaAssistReportPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaAssistReportPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Assist acknowledge async request table
        ITable hmrcItsaAssistAcknowledgePostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaAssistAcknowledgePostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaAssistAcknowledgePostAsyncRequestsTableName);

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for Secrets Manager access
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activity.activityBusName);

        // ITSA UK Property Period POST (create)
        var itsaUkPropertyPeriodPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_UK_PROPERTY_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyPeriodPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaUkPropertyPeriodPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyPeriodPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostLambdaCustomAuthorizer)
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
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPostWorkerLambdaHandler);

        // Grant the ITSA UK property period Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaUkPropertyPeriodPostLambda, hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyPeriodPostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_UK_PROPERTY_PERIODS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaUkPropertyPeriodsGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyPeriodsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyPeriodsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetLambdaCustomAuthorizer)
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
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodsGetWorkerLambdaHandler);

        // Grant the ITSA UK property periods list Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaUkPropertyPeriodsGetLambda, hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_UK_PROPERTY_PERIOD_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyPeriodGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaUkPropertyPeriodGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyPeriodGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetLambdaCustomAuthorizer)
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
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodGetWorkerLambdaHandler);

        // Grant the ITSA UK property period retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaUkPropertyPeriodGetLambda, hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyPeriodGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_UK_PROPERTY_PERIOD_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyPeriodPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaUkPropertyPeriodPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyPeriodPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutLambdaCustomAuthorizer)
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
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyPeriodPutWorkerLambdaHandler);

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

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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

        // ITSA Foreign Property Period POST (create)
        var itsaForeignPropertyPeriodPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_FOREIGN_PROPERTY_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaForeignPropertyPeriodPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaForeignPropertyPeriodPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaForeignPropertyPeriodPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyPeriodPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostWorkerLambdaFunctionName)
                        .workerHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostLambdaCustomAuthorizer)
                        .environment(itsaForeignPropertyPeriodPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaForeignPropertyPeriodPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaForeignPropertyPeriodPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaForeignPropertyPeriodPostLambdaProps = hmrcItsaForeignPropertyPeriodPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaForeignPropertyPeriodPostLambda = hmrcItsaForeignPropertyPeriodPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaForeignPropertyPeriodPostLambdaLogGroup =
                hmrcItsaForeignPropertyPeriodPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaForeignPropertyPeriodPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA foreign property period with ingestHandler %s and worker %s",
                this.hmrcItsaForeignPropertyPeriodPostLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPostWorkerLambdaHandler);

        // Grant the ITSA foreign property period Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(
                        this.hmrcItsaForeignPropertyPeriodPostLambda,
                        hmrcItsaForeignPropertyPeriodPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaForeignPropertyPeriodPostAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaForeignPropertyPeriodPostLambda.getFunctionName());

        // ITSA Foreign Property Period GET (retrieve one)
        var itsaForeignPropertyPeriodGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_FOREIGN_PROPERTY_PERIOD_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaForeignPropertyPeriodGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaForeignPropertyPeriodGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaForeignPropertyPeriodGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyPeriodGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetLambdaCustomAuthorizer)
                        .environment(itsaForeignPropertyPeriodGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaForeignPropertyPeriodGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaForeignPropertyPeriodGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaForeignPropertyPeriodGetLambdaProps = hmrcItsaForeignPropertyPeriodGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaForeignPropertyPeriodGetLambda = hmrcItsaForeignPropertyPeriodGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaForeignPropertyPeriodGetLambdaLogGroup = hmrcItsaForeignPropertyPeriodGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaForeignPropertyPeriodGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA foreign property period retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaForeignPropertyPeriodGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodGetWorkerLambdaHandler);

        // Grant the ITSA foreign property period retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(
                        this.hmrcItsaForeignPropertyPeriodGetLambda,
                        hmrcItsaForeignPropertyPeriodGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaForeignPropertyPeriodGetAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaForeignPropertyPeriodGetLambda.getFunctionName());

        // ITSA Foreign Property Period PUT (amend)
        var itsaForeignPropertyPeriodPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_FOREIGN_PROPERTY_PERIOD_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaForeignPropertyPeriodPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaForeignPropertyPeriodPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaForeignPropertyPeriodPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyPeriodPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutLambdaCustomAuthorizer)
                        .environment(itsaForeignPropertyPeriodPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaForeignPropertyPeriodPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaForeignPropertyPeriodPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaForeignPropertyPeriodPutLambdaProps = hmrcItsaForeignPropertyPeriodPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaForeignPropertyPeriodPutLambda = hmrcItsaForeignPropertyPeriodPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaForeignPropertyPeriodPutLambdaLogGroup = hmrcItsaForeignPropertyPeriodPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaForeignPropertyPeriodPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA foreign property period amendment with ingestHandler %s and worker %s",
                this.hmrcItsaForeignPropertyPeriodPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyPeriodPutWorkerLambdaHandler);

        // Grant the ITSA foreign property period amendment Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(
                        this.hmrcItsaForeignPropertyPeriodPutLambda,
                        hmrcItsaForeignPropertyPeriodPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaForeignPropertyPeriodPutAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaForeignPropertyPeriodPutLambda.getFunctionName());

        // ITSA UK Property Annual GET (retrieve)
        var itsaUkPropertyAnnualGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_UK_PROPERTY_ANNUAL_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyAnnualGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaUkPropertyAnnualGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyAnnualGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetLambdaCustomAuthorizer)
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
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualGetWorkerLambdaHandler);

        // Grant the ITSA UK property annual retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaUkPropertyAnnualGetLambda, hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyAnnualGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_UK_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaUkPropertyAnnualPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaUkPropertyAnnualPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyAnnualPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaUkPropertyAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutLambdaCustomAuthorizer)
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
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaUkPropertyAnnualPutWorkerLambdaHandler);

        // Grant the ITSA UK property annual submission Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaUkPropertyAnnualPutLambda, hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaUkPropertyAnnualPutAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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

        // ITSA Foreign Property Annual GET (retrieve)
        var itsaForeignPropertyAnnualGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_FOREIGN_PROPERTY_ANNUAL_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaForeignPropertyAnnualGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaForeignPropertyAnnualGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaForeignPropertyAnnualGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyAnnualGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetLambdaCustomAuthorizer)
                        .environment(itsaForeignPropertyAnnualGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaForeignPropertyAnnualGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaForeignPropertyAnnualGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaForeignPropertyAnnualGetLambdaProps = hmrcItsaForeignPropertyAnnualGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaForeignPropertyAnnualGetLambda = hmrcItsaForeignPropertyAnnualGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaForeignPropertyAnnualGetLambdaLogGroup = hmrcItsaForeignPropertyAnnualGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaForeignPropertyAnnualGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA foreign property annual submission retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaForeignPropertyAnnualGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualGetWorkerLambdaHandler);

        // Grant the ITSA foreign property annual retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(
                        this.hmrcItsaForeignPropertyAnnualGetLambda,
                        hmrcItsaForeignPropertyAnnualGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaForeignPropertyAnnualGetAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaForeignPropertyAnnualGetLambda.getFunctionName());

        // ITSA Foreign Property Annual PUT (create and amend)
        var itsaForeignPropertyAnnualPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_FOREIGN_PROPERTY_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaForeignPropertyAnnualPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaForeignPropertyAnnualPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaForeignPropertyAnnualPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyAnnualPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutLambdaCustomAuthorizer)
                        .environment(itsaForeignPropertyAnnualPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaForeignPropertyAnnualPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaForeignPropertyAnnualPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaForeignPropertyAnnualPutLambdaProps = hmrcItsaForeignPropertyAnnualPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaForeignPropertyAnnualPutLambda = hmrcItsaForeignPropertyAnnualPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaForeignPropertyAnnualPutLambdaLogGroup = hmrcItsaForeignPropertyAnnualPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaForeignPropertyAnnualPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA foreign property annual submission with ingestHandler %s and worker %s",
                this.hmrcItsaForeignPropertyAnnualPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyAnnualPutWorkerLambdaHandler);

        // Grant the ITSA foreign property annual submission Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(
                        this.hmrcItsaForeignPropertyAnnualPutLambda,
                        hmrcItsaForeignPropertyAnnualPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaForeignPropertyAnnualPutAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaForeignPropertyAnnualPutLambda.getFunctionName());

        // ITSA Foreign Property Details GET (retrieve)
        var itsaForeignPropertyDetailsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_FOREIGN_PROPERTY_DETAILS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaForeignPropertyDetailsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaForeignPropertyDetailsGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaForeignPropertyDetailsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyDetailsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetWorkerLambdaFunctionName)
                        .workerHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyDetailsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetLambdaCustomAuthorizer)
                        .environment(itsaForeignPropertyDetailsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaForeignPropertyDetailsGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaForeignPropertyDetailsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaForeignPropertyDetailsGetLambdaProps = hmrcItsaForeignPropertyDetailsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaForeignPropertyDetailsGetLambda = hmrcItsaForeignPropertyDetailsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaForeignPropertyDetailsGetLambdaLogGroup =
                hmrcItsaForeignPropertyDetailsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaForeignPropertyDetailsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA foreign property details retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaForeignPropertyDetailsGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsGetWorkerLambdaHandler);

        // Grant the ITSA foreign property details retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(
                        this.hmrcItsaForeignPropertyDetailsGetLambda,
                        hmrcItsaForeignPropertyDetailsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaForeignPropertyDetailsGetAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaForeignPropertyDetailsGetLambda.getFunctionName());

        // ITSA Foreign Property Details POST (create)
        var itsaForeignPropertyDetailsPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_FOREIGN_PROPERTY_DETAILS_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaForeignPropertyDetailsPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaForeignPropertyDetailsPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaForeignPropertyDetailsPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyDetailsPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostWorkerLambdaFunctionName)
                        .workerHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyDetailsPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyDetailsPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostLambdaCustomAuthorizer)
                        .environment(itsaForeignPropertyDetailsPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaForeignPropertyDetailsPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaForeignPropertyDetailsPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaForeignPropertyDetailsPostLambdaProps = hmrcItsaForeignPropertyDetailsPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaForeignPropertyDetailsPostLambda = hmrcItsaForeignPropertyDetailsPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaForeignPropertyDetailsPostLambdaLogGroup =
                hmrcItsaForeignPropertyDetailsPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaForeignPropertyDetailsPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA foreign property details creation with ingestHandler %s and worker %s",
                this.hmrcItsaForeignPropertyDetailsPostLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPostWorkerLambdaHandler);

        // Grant the ITSA foreign property details creation Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(
                        this.hmrcItsaForeignPropertyDetailsPostLambda,
                        hmrcItsaForeignPropertyDetailsPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaForeignPropertyDetailsPostAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaForeignPropertyDetailsPostLambda.getFunctionName());

        // ITSA Foreign Property Details PUT (update)
        var itsaForeignPropertyDetailsPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_FOREIGN_PROPERTY_DETAILS_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaForeignPropertyDetailsPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaForeignPropertyDetailsPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaForeignPropertyDetailsPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyDetailsPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutWorkerLambdaFunctionName)
                        .workerHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaForeignPropertyDetailsPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutLambdaCustomAuthorizer)
                        .environment(itsaForeignPropertyDetailsPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaForeignPropertyDetailsPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaForeignPropertyDetailsPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaForeignPropertyDetailsPutLambdaProps = hmrcItsaForeignPropertyDetailsPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaForeignPropertyDetailsPutLambda = hmrcItsaForeignPropertyDetailsPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaForeignPropertyDetailsPutLambdaLogGroup =
                hmrcItsaForeignPropertyDetailsPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaForeignPropertyDetailsPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA foreign property details update with ingestHandler %s and worker %s",
                this.hmrcItsaForeignPropertyDetailsPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaForeignPropertyDetailsPutWorkerLambdaHandler);

        // Grant the ITSA foreign property details update Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(
                        this.hmrcItsaForeignPropertyDetailsPutLambda,
                        hmrcItsaForeignPropertyDetailsPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaForeignPropertyDetailsPutAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaForeignPropertyDetailsPutLambda.getFunctionName());

        // ITSA business source adjustable summary (UK property) retrieve
        var itsaBsasUkPropertyGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_UK_PROPERTY_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasUkPropertyGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaBsasUkPropertyGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaBsasUkPropertyGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaBsasUkPropertyGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaBsasUkPropertyGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetLambdaCustomAuthorizer)
                        .environment(itsaBsasUkPropertyGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBsasUkPropertyGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBsasUkPropertyGetLambdaProps = hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaBsasUkPropertyGetLambda = hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBsasUkPropertyGetLambdaLogGroup = hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBsasUkPropertyGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA BSAS UK property retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaBsasUkPropertyGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyGetWorkerLambdaHandler);

        // Grant the ITSA BSAS UK property retrieval Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaBsasUkPropertyGetLambda, hmrcItsaBsasUkPropertyGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasUkPropertyGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_UK_PROPERTY_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaBsasUkPropertyAdjustPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaBsasUkPropertyAdjustPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaBsasUkPropertyAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostLambdaCustomAuthorizer)
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
                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaHandler);

        // Grant the ITSA BSAS UK property adjustment Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(
                        this.hmrcItsaBsasUkPropertyAdjustPostLambda,
                        hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_LOSSES_AND_CLAIMS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaLossesAndClaimsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaLossesAndClaimsGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaLossesAndClaimsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaLossesAndClaimsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaLossesAndClaimsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetLambdaCustomAuthorizer)
                        .environment(itsaLossesAndClaimsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaLossesAndClaimsGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaLossesAndClaimsGetLambdaProps = hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaLossesAndClaimsGetLambda = hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaLossesAndClaimsGetLambdaLogGroup = hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaLossesAndClaimsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA losses and claims retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaLossesAndClaimsGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsGetWorkerLambdaHandler);

        // Grant the ITSA losses and claims retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaLossesAndClaimsGetLambda, hmrcItsaLossesAndClaimsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaLossesAndClaimsGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_LOSSES_AND_CLAIMS_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaLossesAndClaimsPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaLossesAndClaimsPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaLossesAndClaimsPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaLossesAndClaimsPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaLossesAndClaimsPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutLambdaCustomAuthorizer)
                        .environment(itsaLossesAndClaimsPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaLossesAndClaimsPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaLossesAndClaimsPutLambdaProps = hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaLossesAndClaimsPutLambda = hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaLossesAndClaimsPutLambdaLogGroup = hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaLossesAndClaimsPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA losses and claims submission with ingestHandler %s and worker %s",
                this.hmrcItsaLossesAndClaimsPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsPutWorkerLambdaHandler);

        // Grant the ITSA losses and claims submission Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaLossesAndClaimsPutLambda, hmrcItsaLossesAndClaimsPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaLossesAndClaimsPutAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_LOSSES_AND_CLAIMS_DELETE_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaLossesAndClaimsDeleteLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaLossesAndClaimsDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaLossesAndClaimsDeleteWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteLambdaCustomAuthorizer)
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
                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaLossesAndClaimsDeleteWorkerLambdaHandler);

        // Grant the ITSA losses and claims deletion Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaLossesAndClaimsDeleteLambda, hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaTaxLiabilityAdjustmentsGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetWorkerLambdaFunctionName)
                        .workerHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetLambdaCustomAuthorizer)
                        .environment(itsaTaxLiabilityAdjustmentsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaTaxLiabilityAdjustmentsGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaTaxLiabilityAdjustmentsGetLambdaProps = hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaTaxLiabilityAdjustmentsGetLambda = hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaTaxLiabilityAdjustmentsGetLambdaLogGroup =
                hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaTaxLiabilityAdjustmentsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA tax liability adjustments retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaTaxLiabilityAdjustmentsGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsGetWorkerLambdaHandler);

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

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaTaxLiabilityAdjustmentsPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaFunctionName)
                        .workerHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutLambdaCustomAuthorizer)
                        .environment(itsaTaxLiabilityAdjustmentsPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaTaxLiabilityAdjustmentsPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaTaxLiabilityAdjustmentsPutLambdaProps = hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaTaxLiabilityAdjustmentsPutLambda = hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaTaxLiabilityAdjustmentsPutLambdaLogGroup =
                hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaTaxLiabilityAdjustmentsPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA tax liability adjustments submission with ingestHandler %s and worker %s",
                this.hmrcItsaTaxLiabilityAdjustmentsPutLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaHandler);

        // Grant the ITSA tax liability adjustments submission Lambda and its worker permission to access DynamoDB
        // Bundles Table
        List.of(
                        this.hmrcItsaTaxLiabilityAdjustmentsPutLambda,
                        hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_TAX_LIABILITY_ADJUSTMENTS_DELETE_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaTaxLiabilityAdjustmentsDeleteLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaFunctionName)
                        .workerHandler(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaHandler)
                        .workerLambdaArn(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaCustomAuthorizer)
                        .environment(itsaTaxLiabilityAdjustmentsDeleteLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaTaxLiabilityAdjustmentsDeleteLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaProps =
                hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.apiProps;
        this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambda =
                hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaLogGroup =
                hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA tax liability adjustments deletion with ingestHandler %s and worker %s",
                this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaHandler);

        // Grant the ITSA tax liability adjustments deletion Lambda and its worker permission to access DynamoDB
        // Bundles Table
        List.of(
                        this.hmrcItsaTaxLiabilityAdjustmentsDeleteLambda,
                        hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

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

        // VAT Assist report
        var vatAssistReportPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_VAT_ASSIST_REPORT_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatAssistReportPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            vatAssistReportPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcVatAssistReportPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcVatAssistReportPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcVatAssistReportPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcVatAssistReportPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcVatAssistReportPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcVatAssistReportPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsa.hmrcVatAssistReportPostLambdaCustomAuthorizer)
                        .environment(vatAssistReportPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        vatAssistReportPostLambdaEnv.put("SQS_QUEUE_URL", hmrcVatAssistReportPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatAssistReportPostLambdaProps = hmrcVatAssistReportPostLambdaUrlOrigin.apiProps;
        this.hmrcVatAssistReportPostLambda = hmrcVatAssistReportPostLambdaUrlOrigin.ingestLambda;
        this.hmrcVatAssistReportPostLambdaLogGroup = hmrcVatAssistReportPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatAssistReportPostLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT Assist report with ingestHandler %s and worker %s",
                this.hmrcVatAssistReportPostLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcVatAssistReportPostIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcVatAssistReportPostWorkerLambdaHandler);

        // Grant the VAT Assist report Lambda and its worker the bundles read, receipt access and async request table
        // access.
        List.of(this.hmrcVatAssistReportPostLambda, hmrcVatAssistReportPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatAssistReportPostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcVatAssistReportPostLambda.getFunctionName());

        // VAT Assist acknowledge
        var vatAssistAcknowledgePostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_VAT_ASSIST_ACKNOWLEDGE_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatAssistAcknowledgePostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            vatAssistAcknowledgePostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcVatAssistAcknowledgePostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcVatAssistAcknowledgePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcVatAssistAcknowledgePostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostLambdaCustomAuthorizer)
                        .environment(vatAssistAcknowledgePostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        vatAssistAcknowledgePostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcVatAssistAcknowledgePostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatAssistAcknowledgePostLambdaProps = hmrcVatAssistAcknowledgePostLambdaUrlOrigin.apiProps;
        this.hmrcVatAssistAcknowledgePostLambda = hmrcVatAssistAcknowledgePostLambdaUrlOrigin.ingestLambda;
        this.hmrcVatAssistAcknowledgePostLambdaLogGroup = hmrcVatAssistAcknowledgePostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatAssistAcknowledgePostLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT Assist acknowledge with ingestHandler %s and worker %s",
                this.hmrcVatAssistAcknowledgePostLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcVatAssistAcknowledgePostWorkerLambdaHandler);

        // Grant the VAT Assist acknowledge Lambda and its worker the bundles read, receipt access and async request
        // table access.
        List.of(this.hmrcVatAssistAcknowledgePostLambda, hmrcVatAssistAcknowledgePostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:GetItem", "dynamodb:PutItem");
                    hmrcVatAssistAcknowledgePostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcVatAssistAcknowledgePostLambda.getFunctionName());

        // ITSA Assist report
        var itsaAssistReportPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_ASSIST_REPORT_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaAssistReportPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaAssistReportPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaAssistReportPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaAssistReportPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaAssistReportPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostLambdaCustomAuthorizer)
                        .environment(itsaAssistReportPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaAssistReportPostLambdaEnv.put("SQS_QUEUE_URL", hmrcItsaAssistReportPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaAssistReportPostLambdaProps = hmrcItsaAssistReportPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaAssistReportPostLambda = hmrcItsaAssistReportPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaAssistReportPostLambdaLogGroup = hmrcItsaAssistReportPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaAssistReportPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA Assist report with ingestHandler %s and worker %s",
                this.hmrcItsaAssistReportPostLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaAssistReportPostWorkerLambdaHandler);

        // Grant the ITSA Assist report Lambda and its worker the bundles read, receipt access and async request table
        // access.
        List.of(this.hmrcItsaAssistReportPostLambda, hmrcItsaAssistReportPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaAssistReportPostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaAssistReportPostLambda.getFunctionName());

        // ITSA Assist acknowledge
        var itsaAssistAcknowledgePostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_ASSIST_ACKNOWLEDGE_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaAssistAcknowledgePostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaAssistAcknowledgePostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaAssistAcknowledgePostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaAssistAcknowledgePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsa
                                .hmrcItsaAssistAcknowledgePostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostLambdaCustomAuthorizer)
                        .environment(itsaAssistAcknowledgePostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaAssistAcknowledgePostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaAssistAcknowledgePostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaAssistAcknowledgePostLambdaProps = hmrcItsaAssistAcknowledgePostLambdaUrlOrigin.apiProps;
        this.hmrcItsaAssistAcknowledgePostLambda = hmrcItsaAssistAcknowledgePostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaAssistAcknowledgePostLambdaLogGroup = hmrcItsaAssistAcknowledgePostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaAssistAcknowledgePostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA Assist acknowledge with ingestHandler %s and worker %s",
                this.hmrcItsaAssistAcknowledgePostLambda.getNode().getId(),
                props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostIngestLambdaHandler,
                props.sharedNames().hmrcItsa.hmrcItsaAssistAcknowledgePostWorkerLambdaHandler);

        // Grant the ITSA Assist acknowledge Lambda and its worker the bundles read, receipt access and async request
        // table access.
        List.of(this.hmrcItsaAssistAcknowledgePostLambda, hmrcItsaAssistAcknowledgePostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:GetItem", "dynamodb:PutItem");
                    hmrcItsaAssistAcknowledgePostAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaAssistAcknowledgePostLambda.getFunctionName());

        Lambda.appStackHealthAlarm(
                this,
                props.envName(),
                props.resourceNamePrefix(),
                "hmrc-itsa",
                List.of(
                        hmrcItsaUkPropertyPeriodPostLambdaUrlOrigin,
                        hmrcItsaUkPropertyPeriodsGetLambdaUrlOrigin,
                        hmrcItsaUkPropertyPeriodGetLambdaUrlOrigin,
                        hmrcItsaUkPropertyPeriodPutLambdaUrlOrigin,
                        hmrcItsaForeignPropertyPeriodPostLambdaUrlOrigin,
                        hmrcItsaForeignPropertyPeriodGetLambdaUrlOrigin,
                        hmrcItsaForeignPropertyPeriodPutLambdaUrlOrigin,
                        hmrcItsaUkPropertyAnnualGetLambdaUrlOrigin,
                        hmrcItsaUkPropertyAnnualPutLambdaUrlOrigin,
                        hmrcItsaForeignPropertyAnnualGetLambdaUrlOrigin,
                        hmrcItsaForeignPropertyAnnualPutLambdaUrlOrigin,
                        hmrcItsaForeignPropertyDetailsGetLambdaUrlOrigin,
                        hmrcItsaForeignPropertyDetailsPostLambdaUrlOrigin,
                        hmrcItsaForeignPropertyDetailsPutLambdaUrlOrigin,
                        hmrcItsaBsasUkPropertyGetLambdaUrlOrigin,
                        hmrcItsaBsasUkPropertyAdjustPostLambdaUrlOrigin,
                        hmrcItsaLossesAndClaimsGetLambdaUrlOrigin,
                        hmrcItsaLossesAndClaimsPutLambdaUrlOrigin,
                        hmrcItsaLossesAndClaimsDeleteLambdaUrlOrigin,
                        hmrcItsaTaxLiabilityAdjustmentsGetLambdaUrlOrigin,
                        hmrcItsaTaxLiabilityAdjustmentsPutLambdaUrlOrigin,
                        hmrcItsaTaxLiabilityAdjustmentsDeleteLambdaUrlOrigin,
                        hmrcVatAssistReportPostLambdaUrlOrigin,
                        hmrcVatAssistAcknowledgePostLambdaUrlOrigin,
                        hmrcItsaAssistReportPostLambdaUrlOrigin,
                        hmrcItsaAssistAcknowledgePostLambdaUrlOrigin));

        infof("HmrcItsaStack %s created successfully for %s", id, props.deploymentName());
    }
}
