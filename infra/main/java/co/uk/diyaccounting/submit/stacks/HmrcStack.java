/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability HMRC-31 Wire HMRC Lambda handlers into CDK stacks
// - **Use when:** a new or changed HMRC Lambda needs its CDK function, props and log group declared.
// - **Does:** HmrcStack.java declares the VAT endpoints, token exchange, receipts and most self-employment/BSAS/calculation/final-declaration ITSA Lambdas. HmrcItsaStack.java declares UK property, losses and claims, and tax liability adjustments Lambdas.
// - **Run:** `./mvnw clean verify`
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java:HmrcStack`; `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcItsaStack.java:HmrcItsaStack`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcItsaStack.java, app/unit-tests/hmrcFunctionsCdkRegistration.test.js
// - **Keywords:** cdk stack, lambda wiring, hmrc stack, hmrc itsa stack, log group, java cdk
// - **Related:** HMRC-01, HMRC-12
// @end-capability
// spotless:on

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

    public AbstractApiLambdaProps hmrcVatPaymentsGetLambdaProps;
    public Function hmrcVatPaymentsGetLambda;
    public ILogGroup hmrcVatPaymentsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcVatPenaltiesGetLambdaProps;
    public Function hmrcVatPenaltiesGetLambda;
    public ILogGroup hmrcVatPenaltiesGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcVatReturnGetLambdaProps;
    public Function hmrcVatReturnGetLambda;
    public ILogGroup hmrcVatReturnGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaBusinessDetailsGetLambdaProps;
    public Function hmrcItsaBusinessDetailsGetLambda;
    public ILogGroup hmrcItsaBusinessDetailsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaObligationsGetLambdaProps;
    public Function hmrcItsaObligationsGetLambda;
    public ILogGroup hmrcItsaObligationsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaSelfEmploymentPeriodPostLambdaProps;
    public Function hmrcItsaSelfEmploymentPeriodPostLambda;
    public ILogGroup hmrcItsaSelfEmploymentPeriodPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaSelfEmploymentPeriodsGetLambdaProps;
    public Function hmrcItsaSelfEmploymentPeriodsGetLambda;
    public ILogGroup hmrcItsaSelfEmploymentPeriodsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaSelfEmploymentPeriodGetLambdaProps;
    public Function hmrcItsaSelfEmploymentPeriodGetLambda;
    public ILogGroup hmrcItsaSelfEmploymentPeriodGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaSelfEmploymentPeriodPutLambdaProps;
    public Function hmrcItsaSelfEmploymentPeriodPutLambda;
    public ILogGroup hmrcItsaSelfEmploymentPeriodPutLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaSelfEmploymentAnnualGetLambdaProps;
    public Function hmrcItsaSelfEmploymentAnnualGetLambda;
    public ILogGroup hmrcItsaSelfEmploymentAnnualGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaSelfEmploymentAnnualPutLambdaProps;
    public Function hmrcItsaSelfEmploymentAnnualPutLambda;
    public ILogGroup hmrcItsaSelfEmploymentAnnualPutLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaCrystallisationObligationsGetLambdaProps;
    public Function hmrcItsaCrystallisationObligationsGetLambda;
    public ILogGroup hmrcItsaCrystallisationObligationsGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaStatusGetLambdaProps;
    public Function hmrcItsaStatusGetLambda;
    public ILogGroup hmrcItsaStatusGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaBsasTriggerPostLambdaProps;
    public Function hmrcItsaBsasTriggerPostLambda;
    public ILogGroup hmrcItsaBsasTriggerPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaBsasSelfEmploymentGetLambdaProps;
    public Function hmrcItsaBsasSelfEmploymentGetLambda;
    public ILogGroup hmrcItsaBsasSelfEmploymentGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaBsasSelfEmploymentAdjustPostLambdaProps;
    public Function hmrcItsaBsasSelfEmploymentAdjustPostLambda;
    public ILogGroup hmrcItsaBsasSelfEmploymentAdjustPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaCalculationTriggerPostLambdaProps;
    public Function hmrcItsaCalculationTriggerPostLambda;
    public ILogGroup hmrcItsaCalculationTriggerPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaCalculationGetLambdaProps;
    public Function hmrcItsaCalculationGetLambda;
    public ILogGroup hmrcItsaCalculationGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaFinalDeclarationPostLambdaProps;
    public Function hmrcItsaFinalDeclarationPostLambda;
    public ILogGroup hmrcItsaFinalDeclarationPostLambdaLogGroup;

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

        // The submission MCP's own client: read by every VAT and ITSA Lambda's
        // buildFraudHeaders call so an MCP-issued access token answers DESKTOP_APP_VIA_SERVER
        // instead of WEB_APP_VIA_SERVER. Blank until the deploy wiring sets it, the same way the
        // other stacks' own mcpUserPoolClientId props start.
        @Value.Default
        default String mcpUserPoolClientId() {
            return "";
        }

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
                props.sharedNames().data.bundlesTableName);

        // Lookup existing DynamoDB HMRC API requests Table
        ITable hmrcApiRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcApiRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcApiRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Return POST async request table
        ITable hmrcVatReturnPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatReturnPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcVatReturnPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Return GET async request table
        ITable hmrcVatReturnGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatReturnGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcVatReturnGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Business Details GET async request table
        ITable hmrcItsaBusinessDetailsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBusinessDetailsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaBusinessDetailsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Obligations GET async request table
        ITable hmrcItsaObligationsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaObligationsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaObligationsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Self-Employment Period POST async request table
        ITable hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Self-Employment Periods GET (list) async request table
        ITable hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Self-Employment Period GET (retrieve one) async request table
        ITable hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Self-Employment Period PUT (amend) async request table
        ITable hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Self-Employment Annual GET (retrieve) async request table
        ITable hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA Self-Employment Annual PUT (create and amend) async request table
        ITable hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA final declaration (crystallisation) obligations async request table
        ITable hmrcItsaCrystallisationObligationsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaCrystallisationObligationsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA status async request table
        ITable hmrcItsaStatusGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaStatusGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaStatusGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA BSAS trigger async request table
        ITable hmrcItsaBsasTriggerPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasTriggerPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaBsasTriggerPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA BSAS self-employment retrieve async request table
        ITable hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasSelfEmploymentGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA BSAS self-employment adjust async request table
        ITable hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA calculation trigger async request table
        ITable hmrcItsaCalculationTriggerPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaCalculationTriggerPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaCalculationTriggerPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA calculation retrieve async request table
        ITable hmrcItsaCalculationGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaCalculationGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaCalculationGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA final declaration async request table
        ITable hmrcItsaFinalDeclarationPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaFinalDeclarationPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcItsaFinalDeclarationPostAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Obligation GET async request table
        ITable hmrcVatObligationGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatObligationGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcVatObligationGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Liabilities GET async request table
        ITable hmrcVatLiabilitiesGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatLiabilitiesGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcVatLiabilitiesGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Payments GET async request table
        ITable hmrcVatPaymentsGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatPaymentsGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcVatPaymentsGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC VAT Penalties GET async request table
        ITable hmrcVatPenaltiesGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcVatPenaltiesGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.hmrcVatPenaltiesGetAsyncRequestsTableName);

        // Lookup existing DynamoDB Receipts Table
        ITable receiptsTable = Table.fromTableName(
                this,
                "ImportedReceiptsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.receiptsTableName);

        // Lookup existing DynamoDB Practice Clients Table, read by myReceipts to check a
        // clientId query parameter names one of the caller's own clients before filtering by it.
        ITable practiceClientsTable = Table.fromTableName(
                this,
                "ImportedPracticeClientsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.practiceClientsTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for Secrets Manager access
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activity.activityBusName);

        // exchangeToken - HMRC
        var exchangeHmrcTokenLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_CLIENT_ID", props.hmrcClientId())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("HMRC_SANDBOX_CLIENT_ID", props.hmrcSandboxClientId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
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
                        .idPrefix(props.sharedNames().hmrc.hmrcTokenPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcTokenPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcTokenPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcTokenPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcTokenPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcTokenPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcTokenPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcTokenPostLambdaCustomAuthorizer)
                        .environment(exchangeHmrcTokenLambdaEnv)
                        .build());
        this.hmrcTokenPostLambdaProps = exchangeHmrcTokenLambdaUrlOrigin.apiProps;
        this.hmrcTokenPostLambda = exchangeHmrcTokenLambdaUrlOrigin.ingestLambda;
        this.hmrcTokenPostLambdaLogGroup = exchangeHmrcTokenLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcTokenPostLambdaProps);
        infof(
                "Created Lambda %s for HMRC exchange token with ingestHandler %s",
                this.hmrcTokenPostLambda.getNode().getId(), props.sharedNames().hmrc.hmrcTokenPostIngestLambdaHandler);

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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", practiceClientsTable.getTableName())
                .with(
                        "HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatReturnPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            submitVatLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var submitVatLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcVatReturnPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcVatReturnPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcVatReturnPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcVatReturnPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatReturnPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .ingestMemorySize(256)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcVatReturnPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcVatReturnPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcVatReturnPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatReturnPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcVatReturnPostLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrc.hmrcVatReturnPostLambdaDeadLetterQueueName)
                        .workerLambdaTimeout(Duration.seconds(300))
                        .queueVisibilityTimeout(Duration.seconds(320))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcVatReturnPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcVatReturnPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcVatReturnPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcVatReturnPostLambdaCustomAuthorizer)
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
                props.sharedNames().hmrc.hmrcVatReturnPostIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcVatReturnPostWorkerLambdaHandler);

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

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        // Read-only, ingest Lambda only: resolves a client-scoped request's client row when
        // enforceBundles checks it. The worker never calls getClient() again - the VRN is
        // already resolved and carried on the payload by the time it dispatches.
        practiceClientsTable.grant(this.hmrcVatReturnPostLambda, "dynamodb:GetItem");
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcVatReturnPostLambda.getFunctionName());

        // VAT obligations GET
        var vatObligationLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", practiceClientsTable.getTableName())
                .with(
                        "HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatObligationGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            vatObligationLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcVatObligationGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcVatObligationGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcVatObligationGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcVatObligationGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcVatObligationGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatObligationGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcVatObligationGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcVatObligationGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcVatObligationGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatObligationGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcVatObligationGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcVatObligationGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcVatObligationGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcVatObligationGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcVatObligationGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcVatObligationGetLambdaCustomAuthorizer)
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
                props.sharedNames().hmrc.hmrcVatObligationGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcVatObligationGetWorkerLambdaHandler);

        // Grant the VAT obligations Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatObligationGetLambda, hmrcVatObligationGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatObligationGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
        // Read-only, ingest Lambda only: resolves a client-scoped request's client row when
        // enforceBundles checks it. The worker never calls getClient() again - the VRN is
        // already resolved and carried on the payload by the time it dispatches.
        practiceClientsTable.grant(this.hmrcVatObligationGetLambda, "dynamodb:GetItem");
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcVatObligationGetLambda.getFunctionName());

        // VAT liabilities GET
        var vatLiabilitiesLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_VAT_LIABILITIES_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatLiabilitiesGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            vatLiabilitiesLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcVatLiabilitiesGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcVatLiabilitiesGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcVatLiabilitiesGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcVatLiabilitiesGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcVatLiabilitiesGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcVatLiabilitiesGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcVatLiabilitiesGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcVatLiabilitiesGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcVatLiabilitiesGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcVatLiabilitiesGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcVatLiabilitiesGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcVatLiabilitiesGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcVatLiabilitiesGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcVatLiabilitiesGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcVatLiabilitiesGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcVatLiabilitiesGetLambdaCustomAuthorizer)
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
                props.sharedNames().hmrc.hmrcVatLiabilitiesGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcVatLiabilitiesGetWorkerLambdaHandler);

        // Grant the VAT liabilities Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatLiabilitiesGetLambda, hmrcVatLiabilitiesGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatLiabilitiesGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcVatLiabilitiesGetLambda.getFunctionName());

        // VAT payments GET
        var vatPaymentsLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_VAT_PAYMENTS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatPaymentsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            vatPaymentsLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcVatPaymentsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcVatPaymentsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcVatPaymentsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcVatPaymentsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcVatPaymentsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatPaymentsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcVatPaymentsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcVatPaymentsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcVatPaymentsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatPaymentsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcVatPaymentsGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrc.hmrcVatPaymentsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcVatPaymentsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcVatPaymentsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcVatPaymentsGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcVatPaymentsGetLambdaCustomAuthorizer)
                        .environment(vatPaymentsLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        vatPaymentsLambdaEnv.put("SQS_QUEUE_URL", hmrcVatPaymentsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatPaymentsGetLambdaProps = hmrcVatPaymentsGetLambdaUrlOrigin.apiProps;
        this.hmrcVatPaymentsGetLambda = hmrcVatPaymentsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcVatPaymentsGetLambdaLogGroup = hmrcVatPaymentsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatPaymentsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT payments with ingestHandler %s and worker %s",
                this.hmrcVatPaymentsGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcVatPaymentsGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcVatPaymentsGetWorkerLambdaHandler);

        // Grant the VAT payments Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatPaymentsGetLambda, hmrcVatPaymentsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatPaymentsGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcVatPaymentsGetLambda.getFunctionName());

        // VAT penalties GET
        var vatPenaltiesLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_VAT_PENALTIES_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatPenaltiesGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            vatPenaltiesLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcVatPenaltiesGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcVatPenaltiesGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcVatPenaltiesGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcVatPenaltiesGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcVatPenaltiesGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatPenaltiesGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcVatPenaltiesGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcVatPenaltiesGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcVatPenaltiesGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatPenaltiesGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcVatPenaltiesGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcVatPenaltiesGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcVatPenaltiesGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcVatPenaltiesGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcVatPenaltiesGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcVatPenaltiesGetLambdaCustomAuthorizer)
                        .environment(vatPenaltiesLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        vatPenaltiesLambdaEnv.put("SQS_QUEUE_URL", hmrcVatPenaltiesGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcVatPenaltiesGetLambdaProps = hmrcVatPenaltiesGetLambdaUrlOrigin.apiProps;
        this.hmrcVatPenaltiesGetLambda = hmrcVatPenaltiesGetLambdaUrlOrigin.ingestLambda;
        this.hmrcVatPenaltiesGetLambdaLogGroup = hmrcVatPenaltiesGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcVatPenaltiesGetLambdaProps);
        infof(
                "Created Async API Lambda %s for VAT penalties with ingestHandler %s and worker %s",
                this.hmrcVatPenaltiesGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcVatPenaltiesGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcVatPenaltiesGetWorkerLambdaHandler);

        // Grant the VAT penalties Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatPenaltiesGetLambda, hmrcVatPenaltiesGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatPenaltiesGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcVatPenaltiesGetLambda.getFunctionName());

        // VAT return GET
        var vatReturnGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcVatReturnGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            vatReturnGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcVatReturnGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcVatReturnGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcVatReturnGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcVatReturnGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcVatReturnGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatReturnGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcVatReturnGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcVatReturnGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcVatReturnGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcVatReturnGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcVatReturnGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrc.hmrcVatReturnGetLambdaDeadLetterQueueName)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcVatReturnGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcVatReturnGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcVatReturnGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcVatReturnGetLambdaCustomAuthorizer)
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
                props.sharedNames().hmrc.hmrcVatReturnGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcVatReturnGetWorkerLambdaHandler);

        // Grant the VAT return retrieval Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcVatReturnGetLambda, hmrcVatReturnGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcVatReturnGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcVatReturnGetLambda.getFunctionName());

        // ITSA Business Details GET
        var itsaBusinessDetailsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BUSINESS_DETAILS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBusinessDetailsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaBusinessDetailsGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaBusinessDetailsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaBusinessDetailsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaBusinessDetailsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetLambdaCustomAuthorizer)
                        .environment(itsaBusinessDetailsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBusinessDetailsGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaBusinessDetailsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBusinessDetailsGetLambdaProps = hmrcItsaBusinessDetailsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaBusinessDetailsGetLambda = hmrcItsaBusinessDetailsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBusinessDetailsGetLambdaLogGroup = hmrcItsaBusinessDetailsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBusinessDetailsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA business details with ingestHandler %s and worker %s",
                this.hmrcItsaBusinessDetailsGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaBusinessDetailsGetWorkerLambdaHandler);

        // Grant the ITSA business details Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaBusinessDetailsGetLambda, hmrcItsaBusinessDetailsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBusinessDetailsGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaBusinessDetailsGetLambda.getFunctionName());

        // ITSA Obligations GET
        var itsaObligationsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_OBLIGATIONS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaObligationsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaObligationsGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaObligationsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaObligationsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcItsaObligationsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaObligationsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaObligationsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaObligationsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcItsaObligationsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaObligationsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaObligationsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaObligationsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaObligationsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaObligationsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaObligationsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaObligationsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaObligationsGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcItsaObligationsGetLambdaCustomAuthorizer)
                        .environment(itsaObligationsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaObligationsGetLambdaEnv.put("SQS_QUEUE_URL", hmrcItsaObligationsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaObligationsGetLambdaProps = hmrcItsaObligationsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaObligationsGetLambda = hmrcItsaObligationsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaObligationsGetLambdaLogGroup = hmrcItsaObligationsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaObligationsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA obligations with ingestHandler %s and worker %s",
                this.hmrcItsaObligationsGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaObligationsGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaObligationsGetWorkerLambdaHandler);

        // Grant the ITSA obligations Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaObligationsGetLambda, hmrcItsaObligationsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaObligationsGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaObligationsGetLambda.getFunctionName());

        // ITSA Self-Employment Period POST
        var itsaSelfEmploymentPeriodPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_SELF_EMPLOYMENT_PERIOD_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaSelfEmploymentPeriodPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaSelfEmploymentPeriodPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentPeriodPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostLambdaCustomAuthorizer)
                        .environment(itsaSelfEmploymentPeriodPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaSelfEmploymentPeriodPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaSelfEmploymentPeriodPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaSelfEmploymentPeriodPostLambdaProps = hmrcItsaSelfEmploymentPeriodPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaSelfEmploymentPeriodPostLambda = hmrcItsaSelfEmploymentPeriodPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaSelfEmploymentPeriodPostLambdaLogGroup = hmrcItsaSelfEmploymentPeriodPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaSelfEmploymentPeriodPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA self-employment period with ingestHandler %s and worker %s",
                this.hmrcItsaSelfEmploymentPeriodPostLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaHandler);

        // Grant the ITSA self-employment period Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(
                        this.hmrcItsaSelfEmploymentPeriodPostLambda,
                        hmrcItsaSelfEmploymentPeriodPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable.grant(
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
                this.hmrcItsaSelfEmploymentPeriodPostLambda.getFunctionName());

        // ITSA Self-Employment Periods GET (list)
        var itsaSelfEmploymentPeriodsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_SELF_EMPLOYMENT_PERIODS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaSelfEmploymentPeriodsGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaSelfEmploymentPeriodsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentPeriodsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentPeriodsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetLambdaCustomAuthorizer)
                        .environment(itsaSelfEmploymentPeriodsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaSelfEmploymentPeriodsGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaSelfEmploymentPeriodsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaSelfEmploymentPeriodsGetLambdaProps = hmrcItsaSelfEmploymentPeriodsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaSelfEmploymentPeriodsGetLambda = hmrcItsaSelfEmploymentPeriodsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaSelfEmploymentPeriodsGetLambdaLogGroup = hmrcItsaSelfEmploymentPeriodsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaSelfEmploymentPeriodsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA self-employment periods list with ingestHandler %s and worker %s",
                this.hmrcItsaSelfEmploymentPeriodsGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaHandler);

        // Grant the ITSA self-employment periods list Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(
                        this.hmrcItsaSelfEmploymentPeriodsGetLambda,
                        hmrcItsaSelfEmploymentPeriodsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable.grant(
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
                this.hmrcItsaSelfEmploymentPeriodsGetLambda.getFunctionName());

        // ITSA Self-Employment Period GET (retrieve one)
        var itsaSelfEmploymentPeriodGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_SELF_EMPLOYMENT_PERIOD_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaSelfEmploymentPeriodGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaSelfEmploymentPeriodGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentPeriodGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetLambdaCustomAuthorizer)
                        .environment(itsaSelfEmploymentPeriodGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaSelfEmploymentPeriodGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaSelfEmploymentPeriodGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaSelfEmploymentPeriodGetLambdaProps = hmrcItsaSelfEmploymentPeriodGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaSelfEmploymentPeriodGetLambda = hmrcItsaSelfEmploymentPeriodGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaSelfEmploymentPeriodGetLambdaLogGroup = hmrcItsaSelfEmploymentPeriodGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaSelfEmploymentPeriodGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA self-employment period retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaSelfEmploymentPeriodGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaHandler);

        // Grant the ITSA self-employment period retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaSelfEmploymentPeriodGetLambda, hmrcItsaSelfEmploymentPeriodGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable.grant(
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
                this.hmrcItsaSelfEmploymentPeriodGetLambda.getFunctionName());

        // ITSA Self-Employment Period PUT (amend)
        var itsaSelfEmploymentPeriodPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_SELF_EMPLOYMENT_PERIOD_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaSelfEmploymentPeriodPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaSelfEmploymentPeriodPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentPeriodPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutLambdaCustomAuthorizer)
                        .environment(itsaSelfEmploymentPeriodPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaSelfEmploymentPeriodPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaSelfEmploymentPeriodPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaSelfEmploymentPeriodPutLambdaProps = hmrcItsaSelfEmploymentPeriodPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaSelfEmploymentPeriodPutLambda = hmrcItsaSelfEmploymentPeriodPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaSelfEmploymentPeriodPutLambdaLogGroup = hmrcItsaSelfEmploymentPeriodPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaSelfEmploymentPeriodPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA self-employment period amendment with ingestHandler %s and worker %s",
                this.hmrcItsaSelfEmploymentPeriodPutLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaHandler);

        // Grant the ITSA self-employment period amendment Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaSelfEmploymentPeriodPutLambda, hmrcItsaSelfEmploymentPeriodPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable.grant(
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
                this.hmrcItsaSelfEmploymentPeriodPutLambda.getFunctionName());

        // ITSA Self-Employment Annual GET (retrieve)
        var itsaSelfEmploymentAnnualGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_SELF_EMPLOYMENT_ANNUAL_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaSelfEmploymentAnnualGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaSelfEmploymentAnnualGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentAnnualGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetLambdaCustomAuthorizer)
                        .environment(itsaSelfEmploymentAnnualGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaSelfEmploymentAnnualGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaSelfEmploymentAnnualGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaSelfEmploymentAnnualGetLambdaProps = hmrcItsaSelfEmploymentAnnualGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaSelfEmploymentAnnualGetLambda = hmrcItsaSelfEmploymentAnnualGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaSelfEmploymentAnnualGetLambdaLogGroup = hmrcItsaSelfEmploymentAnnualGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaSelfEmploymentAnnualGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA self-employment annual submission retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaSelfEmploymentAnnualGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaHandler);

        // Grant the ITSA self-employment annual submission retrieval Lambda and its worker permission to access
        // DynamoDB Bundles Table
        List.of(this.hmrcItsaSelfEmploymentAnnualGetLambda, hmrcItsaSelfEmploymentAnnualGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable.grant(
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
                this.hmrcItsaSelfEmploymentAnnualGetLambda.getFunctionName());

        // ITSA Self-Employment Annual PUT (create and amend)
        var itsaSelfEmploymentAnnualPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_SELF_EMPLOYMENT_ANNUAL_PUT_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaSelfEmploymentAnnualPutLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaSelfEmploymentAnnualPutLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentAnnualPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaSelfEmploymentAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutLambdaCustomAuthorizer)
                        .environment(itsaSelfEmploymentAnnualPutLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaSelfEmploymentAnnualPutLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaSelfEmploymentAnnualPutLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaSelfEmploymentAnnualPutLambdaProps = hmrcItsaSelfEmploymentAnnualPutLambdaUrlOrigin.apiProps;
        this.hmrcItsaSelfEmploymentAnnualPutLambda = hmrcItsaSelfEmploymentAnnualPutLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaSelfEmploymentAnnualPutLambdaLogGroup = hmrcItsaSelfEmploymentAnnualPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaSelfEmploymentAnnualPutLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA self-employment annual submission with ingestHandler %s and worker %s",
                this.hmrcItsaSelfEmploymentAnnualPutLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaHandler);

        // Grant the ITSA self-employment annual submission Lambda and its worker permission to access DynamoDB Bundles
        // Table.
        List.of(this.hmrcItsaSelfEmploymentAnnualPutLambda, hmrcItsaSelfEmploymentAnnualPutLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable.grant(
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
                this.hmrcItsaSelfEmploymentAnnualPutLambda.getFunctionName());

        // ITSA final declaration (crystallisation) obligations
        var itsaCrystallisationObligationsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_CRYSTALLISATION_OBLIGATIONS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaCrystallisationObligationsGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaCrystallisationObligationsGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaCrystallisationObligationsGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaCrystallisationObligationsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetWorkerLambdaFunctionName)
                        .workerHandler(
                                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaCrystallisationObligationsGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetLambdaCustomAuthorizer)
                        .environment(itsaCrystallisationObligationsGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaCrystallisationObligationsGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaCrystallisationObligationsGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaCrystallisationObligationsGetLambdaProps =
                hmrcItsaCrystallisationObligationsGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaCrystallisationObligationsGetLambda =
                hmrcItsaCrystallisationObligationsGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaCrystallisationObligationsGetLambdaLogGroup =
                hmrcItsaCrystallisationObligationsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaCrystallisationObligationsGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA crystallisation obligations with ingestHandler %s and worker %s",
                this.hmrcItsaCrystallisationObligationsGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaCrystallisationObligationsGetWorkerLambdaHandler);

        // Grant the ITSA crystallisation obligations Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(
                        this.hmrcItsaCrystallisationObligationsGetLambda,
                        hmrcItsaCrystallisationObligationsGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaCrystallisationObligationsGetAsyncRequestsTable.grant(
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
                this.hmrcItsaCrystallisationObligationsGetLambda.getFunctionName());

        // ITSA status
        var itsaStatusGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_STATUS_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaStatusGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaStatusGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaStatusGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaStatusGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcItsaStatusGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaStatusGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaStatusGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcItsaStatusGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcItsaStatusGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaStatusGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaStatusGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.hmrcItsaStatusGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaStatusGetLambdaQueueName)
                        .workerDeadLetterQueueName(props.sharedNames().hmrc.hmrcItsaStatusGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaStatusGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaStatusGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaStatusGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcItsaStatusGetLambdaCustomAuthorizer)
                        .environment(itsaStatusGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaStatusGetLambdaEnv.put("SQS_QUEUE_URL", hmrcItsaStatusGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaStatusGetLambdaProps = hmrcItsaStatusGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaStatusGetLambda = hmrcItsaStatusGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaStatusGetLambdaLogGroup = hmrcItsaStatusGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaStatusGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA status with ingestHandler %s and worker %s",
                this.hmrcItsaStatusGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaStatusGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaStatusGetWorkerLambdaHandler);

        // Grant the ITSA status Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaStatusGetLambda, hmrcItsaStatusGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaStatusGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaStatusGetLambda.getFunctionName());

        // ITSA business source adjustable summary trigger
        var itsaBsasTriggerPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_TRIGGER_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasTriggerPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaBsasTriggerPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaBsasTriggerPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaBsasTriggerPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaBsasTriggerPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaBsasTriggerPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcItsaBsasTriggerPostLambdaCustomAuthorizer)
                        .environment(itsaBsasTriggerPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBsasTriggerPostLambdaEnv.put("SQS_QUEUE_URL", hmrcItsaBsasTriggerPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBsasTriggerPostLambdaProps = hmrcItsaBsasTriggerPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaBsasTriggerPostLambda = hmrcItsaBsasTriggerPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBsasTriggerPostLambdaLogGroup = hmrcItsaBsasTriggerPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBsasTriggerPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA BSAS trigger with ingestHandler %s and worker %s",
                this.hmrcItsaBsasTriggerPostLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaBsasTriggerPostIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaBsasTriggerPostWorkerLambdaHandler);

        // Grant the ITSA BSAS trigger Lambda and its worker permission to access DynamoDB Bundles Table.
        // No token consumption and no receipt here - the trigger is a computation, not a filing.
        List.of(this.hmrcItsaBsasTriggerPostLambda, hmrcItsaBsasTriggerPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasTriggerPostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaBsasTriggerPostLambda.getFunctionName());

        // ITSA business source adjustable summary (self-employment) retrieve
        var itsaBsasSelfEmploymentGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_SELF_EMPLOYMENT_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaBsasSelfEmploymentGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaBsasSelfEmploymentGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaBsasSelfEmploymentGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaBsasSelfEmploymentGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetLambdaCustomAuthorizer)
                        .environment(itsaBsasSelfEmploymentGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBsasSelfEmploymentGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaBsasSelfEmploymentGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBsasSelfEmploymentGetLambdaProps = hmrcItsaBsasSelfEmploymentGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaBsasSelfEmploymentGetLambda = hmrcItsaBsasSelfEmploymentGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBsasSelfEmploymentGetLambdaLogGroup = hmrcItsaBsasSelfEmploymentGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBsasSelfEmploymentGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA BSAS self-employment retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaBsasSelfEmploymentGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentGetWorkerLambdaHandler);

        // Grant the ITSA BSAS self-employment retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaBsasSelfEmploymentGetLambda, hmrcItsaBsasSelfEmploymentGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable.grant(
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
                this.hmrcItsaBsasSelfEmploymentGetLambda.getFunctionName());

        // ITSA business source adjustable summary (self-employment) adjust
        var itsaBsasSelfEmploymentAdjustPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_SELF_EMPLOYMENT_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaBsasSelfEmploymentAdjustPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaBsasSelfEmploymentAdjustPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaBsasSelfEmploymentAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostLambdaCustomAuthorizer)
                        .environment(itsaBsasSelfEmploymentAdjustPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBsasSelfEmploymentAdjustPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaProps =
                hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambda =
                hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaLogGroup =
                hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA BSAS self-employment adjustment with ingestHandler %s and worker %s",
                this.hmrcItsaBsasSelfEmploymentAdjustPostLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaHandler);

        // Grant the ITSA BSAS self-employment adjustment Lambda and its worker permission to access DynamoDB Bundles
        // Table.
        // No token consumption and no receipt here - the plan's receipts table lists none for this call.
        List.of(
                        this.hmrcItsaBsasSelfEmploymentAdjustPostLambda,
                        hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable.grant(
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
                this.hmrcItsaBsasSelfEmploymentAdjustPostLambda.getFunctionName());

        // ITSA tax calculation trigger
        var itsaCalculationTriggerPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_CALCULATION_TRIGGER_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaCalculationTriggerPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaCalculationTriggerPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaCalculationTriggerPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaCalculationTriggerPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaCalculationTriggerPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostLambdaCustomAuthorizer)
                        .environment(itsaCalculationTriggerPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaCalculationTriggerPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaCalculationTriggerPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaCalculationTriggerPostLambdaProps = hmrcItsaCalculationTriggerPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaCalculationTriggerPostLambda = hmrcItsaCalculationTriggerPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaCalculationTriggerPostLambdaLogGroup = hmrcItsaCalculationTriggerPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaCalculationTriggerPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA calculation trigger with ingestHandler %s and worker %s",
                this.hmrcItsaCalculationTriggerPostLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaCalculationTriggerPostWorkerLambdaHandler);

        // Grant the ITSA calculation trigger Lambda and its worker permission to access DynamoDB Bundles Table.
        // No token consumption and no receipt here - the trigger is a computation, not a filing.
        List.of(this.hmrcItsaCalculationTriggerPostLambda, hmrcItsaCalculationTriggerPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaCalculationTriggerPostAsyncRequestsTable.grant(
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
                this.hmrcItsaCalculationTriggerPostLambda.getFunctionName());

        // ITSA tax calculation retrieve
        var itsaCalculationGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_CALCULATION_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaCalculationGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaCalculationGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaCalculationGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaCalculationGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.hmrcItsaCalculationGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaCalculationGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaCalculationGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaCalculationGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrc.hmrcItsaCalculationGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaCalculationGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaCalculationGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaCalculationGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaCalculationGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaCalculationGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaCalculationGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaCalculationGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaCalculationGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcItsaCalculationGetLambdaCustomAuthorizer)
                        .environment(itsaCalculationGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaCalculationGetLambdaEnv.put("SQS_QUEUE_URL", hmrcItsaCalculationGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaCalculationGetLambdaProps = hmrcItsaCalculationGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaCalculationGetLambda = hmrcItsaCalculationGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaCalculationGetLambdaLogGroup = hmrcItsaCalculationGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaCalculationGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA calculation retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaCalculationGetLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaCalculationGetIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaCalculationGetWorkerLambdaHandler);

        // Grant the ITSA calculation retrieval Lambda and its worker permission to access DynamoDB Bundles Table
        List.of(this.hmrcItsaCalculationGetLambda, hmrcItsaCalculationGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaCalculationGetAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaCalculationGetLambda.getFunctionName());

        // ITSA final declaration
        var itsaFinalDeclarationPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with(
                        "HMRC_ITSA_FINAL_DECLARATION_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaFinalDeclarationPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaFinalDeclarationPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaFinalDeclarationPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaFinalDeclarationPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrc
                                .hmrcItsaFinalDeclarationPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostLambdaCustomAuthorizer)
                        .environment(itsaFinalDeclarationPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaFinalDeclarationPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaFinalDeclarationPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaFinalDeclarationPostLambdaProps = hmrcItsaFinalDeclarationPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaFinalDeclarationPostLambda = hmrcItsaFinalDeclarationPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaFinalDeclarationPostLambdaLogGroup = hmrcItsaFinalDeclarationPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaFinalDeclarationPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA final declaration with ingestHandler %s and worker %s",
                this.hmrcItsaFinalDeclarationPostLambda.getNode().getId(),
                props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostIngestLambdaHandler,
                props.sharedNames().hmrc.hmrcItsaFinalDeclarationPostWorkerLambdaHandler);

        // Grant the ITSA final declaration Lambda and its worker permission to access DynamoDB Bundles Table.
        // Charges one token per the plan's Tokens table, so this needs UpdateItem on the bundles
        // table (like the quarterly update Lambdas) plus a receipt write, unlike the trigger and
        // retrieve Lambdas above.
        List.of(this.hmrcItsaFinalDeclarationPostLambda, hmrcItsaFinalDeclarationPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:UpdateItem");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    receiptsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaFinalDeclarationPostAsyncRequestsTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

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
                this.hmrcItsaFinalDeclarationPostLambda.getFunctionName());

        // myReceipts Lambda
        var myReceiptsLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", practiceClientsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var myReceiptsLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrc.receiptGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrc.receiptGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().hmrc.receiptGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrc.receiptGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().hmrc.receiptGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrc.receiptGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrc.receiptGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrc.receiptGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrc.receiptGetLambdaCustomAuthorizer)
                        .environment(myReceiptsLambdaEnv)
                        .build());
        this.receiptGetLambdaProps = myReceiptsLambdaUrlOrigin.apiProps;
        this.receiptGetLambda = myReceiptsLambdaUrlOrigin.ingestLambda;
        this.receiptGetLambdaLogGroup = myReceiptsLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.receiptGetLambdaProps);
        // Also expose a second route for retrieving a single receipt by name using the same Lambda
        this.lambdaFunctionProps.add(ApiLambdaProps.builder()
                .idPrefix(props.sharedNames().hmrc.receiptGetIngestLambdaFunctionName + "-ByNameRoute")
                .baseImageTag(props.baseImageTag())
                .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                .ingestFunctionName(props.sharedNames().hmrc.receiptGetIngestLambdaFunctionName)
                .ingestHandler(props.sharedNames().hmrc.receiptGetIngestLambdaHandler)
                .ingestLambdaArn(props.sharedNames().hmrc.receiptGetIngestLambdaArn)
                .ingestProvisionedConcurrencyAliasArn(
                        props.sharedNames().hmrc.receiptGetIngestProvisionedConcurrencyLambdaAliasArn)
                .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                .httpMethod(props.sharedNames().hmrc.receiptGetLambdaHttpMethod)
                .urlPath(props.sharedNames().hmrc.receiptGetByNameLambdaUrlPath)
                .jwtAuthorizer(props.sharedNames().hmrc.receiptGetLambdaJwtAuthorizer)
                .customAuthorizer(props.sharedNames().hmrc.receiptGetLambdaCustomAuthorizer)
                .build());
        infof(
                "Created Lambda %s for my receipts retrieval with ingestHandler %s",
                this.receiptGetLambda.getNode().getId(), props.sharedNames().hmrc.receiptGetIngestLambdaHandler);

        // No bundles grant: receipt retrieval reads receipts only.
        // A single receipt is fetched by key; the listing queries the user's partition.
        receiptsTable.grant(this.receiptGetLambda, "dynamodb:GetItem", "dynamodb:Query");
        // Read-only: confirms a clientId query parameter names one of the caller's own clients.
        practiceClientsTable.grant(this.receiptGetLambda, "dynamodb:GetItem");

        // Grant access to user sub hash salt secret in Secrets Manager
        SubHashSaltHelper.grantSaltAccess(this.receiptGetLambda, region, account, props.envName());
        infof("Granted Secrets Manager salt access to %s", this.receiptGetLambda.getFunctionName());

        // Grant EventBridge PutEvents permission
        this.receiptGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        Lambda.appStackHealthAlarm(
                this,
                props.envName(),
                props.resourceNamePrefix(),
                "hmrc",
                List.of(
                        exchangeHmrcTokenLambdaUrlOrigin,
                        submitVatLambdaUrlOrigin,
                        hmrcVatObligationGetLambdaUrlOrigin,
                        hmrcVatLiabilitiesGetLambdaUrlOrigin,
                        hmrcVatPaymentsGetLambdaUrlOrigin,
                        hmrcVatPenaltiesGetLambdaUrlOrigin,
                        hmrcVatReturnGetLambdaUrlOrigin,
                        hmrcItsaBusinessDetailsGetLambdaUrlOrigin,
                        hmrcItsaObligationsGetLambdaUrlOrigin,
                        hmrcItsaSelfEmploymentPeriodPostLambdaUrlOrigin,
                        hmrcItsaSelfEmploymentPeriodsGetLambdaUrlOrigin,
                        hmrcItsaSelfEmploymentPeriodGetLambdaUrlOrigin,
                        hmrcItsaSelfEmploymentPeriodPutLambdaUrlOrigin,
                        hmrcItsaSelfEmploymentAnnualGetLambdaUrlOrigin,
                        hmrcItsaSelfEmploymentAnnualPutLambdaUrlOrigin,
                        hmrcItsaCrystallisationObligationsGetLambdaUrlOrigin,
                        hmrcItsaStatusGetLambdaUrlOrigin,
                        hmrcItsaBsasTriggerPostLambdaUrlOrigin,
                        hmrcItsaBsasSelfEmploymentGetLambdaUrlOrigin,
                        hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlOrigin,
                        hmrcItsaCalculationTriggerPostLambdaUrlOrigin,
                        hmrcItsaCalculationGetLambdaUrlOrigin,
                        hmrcItsaFinalDeclarationPostLambdaUrlOrigin,
                        myReceiptsLambdaUrlOrigin));

        cfnOutput(this, "ExchangeHmrcTokenLambdaArn", this.hmrcTokenPostLambda.getFunctionArn());
        cfnOutput(this, "SubmitVatLambdaArn", this.hmrcVatReturnPostLambda.getFunctionArn());
        cfnOutput(this, "MyReceiptsLambdaArn", this.receiptGetLambda.getFunctionArn());

        infof(
                "HmrcStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
