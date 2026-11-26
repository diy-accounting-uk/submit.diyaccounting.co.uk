/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability CH-14 Provision the Companies House CDK stack
// - **Use when:** adding, renaming or rewiring a Companies House Lambda function or its API Gateway route.
// - **Does:** CompaniesHouseStack.java creates all thirteen Companies House Lambda functions as ApiLambda origins. It wires each function's API Gateway route.
// - **Run:** no command; see Does and Entry
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStackTest.java
// - **Keywords:** cdk, companies house, lambda, api gateway, infrastructure, stack, ApiLambda
// - **Related:** CH-08, CH-09
// @end-capability
// spotless:on

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.FphCheckAccess;
import co.uk.diyaccounting.submit.utils.IntegrationCallAccess;
import co.uk.diyaccounting.submit.utils.OperatorEmailsHelper;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.CronOptions;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awscdk.services.ssm.StringParameter;
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

/**
 * The read-only Companies House company lookup, plus the OAuth-authorised filing Lambdas, all
 * synchronous with no async worker and no DynamoDB audit table. A separate stack from HmrcStack
 * so a failed synth here never blocks the VAT submission path, and so the Companies House API
 * key and OAuth client secret never widen the HMRC Lambdas' IAM surface.
 */
public class CompaniesHouseStack extends Stack {

    // The XML Gateway's test service and its live service want the opposite of each other on
    // both the GatewayTest flag and the accounts submission's package reference. ci is the only
    // deployment environment that talks to the test service; the references below are the ones
    // Companies House's XML team issued for the test service and for the live service. Any
    // other environment leaves the reference unset - the accounts Lambda's own validateEnv()
    // then fails that deployment's first filing attempt loudly rather than let one go out blank.
    private static final String XML_GATEWAY_TEST_ENV_NAME = "ci";
    // The async-requests partition that holds a marker per Company Tax Return waiting for HMRC's
    // answer (app/data/dynamoDbCtPendingReturnRepository.js).
    private static final String CT_PENDING_PARTITION = "hmrc-ct-pending";
    private static final String XML_GATEWAY_LIVE_ENV_NAME = "prod";
    private static final String XML_GATEWAY_TEST_PACKAGE_REFERENCE = "0012";
    private static final String XML_GATEWAY_LIVE_PACKAGE_REFERENCE = "4326";

    public AbstractApiLambdaProps companiesHouseSearchGetLambdaProps;
    public Function companiesHouseSearchGetLambda;
    public ILogGroup companiesHouseSearchGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseCompanyGetLambdaProps;
    public Function companiesHouseCompanyGetLambda;
    public ILogGroup companiesHouseCompanyGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHousePublicDeadlinesGetLambdaProps;
    public Function companiesHousePublicDeadlinesGetLambda;
    public ILogGroup companiesHousePublicDeadlinesGetLambdaLogGroup;
    public AbstractApiLambdaProps companiesHousePublicRegisterGetLambdaProps;
    public Function companiesHousePublicRegisterGetLambda;
    public ILogGroup companiesHousePublicRegisterGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseTokenPostLambdaProps;
    public Function companiesHouseTokenPostLambda;
    public ILogGroup companiesHouseTokenPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseTransactionPostLambdaProps;
    public Function companiesHouseTransactionPostLambda;
    public ILogGroup companiesHouseTransactionPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseTransactionGetLambdaProps;
    public Function companiesHouseTransactionGetLambda;
    public ILogGroup companiesHouseTransactionGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseTransactionPutLambdaProps;
    public Function companiesHouseTransactionPutLambda;
    public ILogGroup companiesHouseTransactionPutLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseRegisteredOfficeAddressGetLambdaProps;
    public Function companiesHouseRegisteredOfficeAddressGetLambda;
    public ILogGroup companiesHouseRegisteredOfficeAddressGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseRegisteredOfficeAddressPostLambdaProps;
    public Function companiesHouseRegisteredOfficeAddressPostLambda;
    public ILogGroup companiesHouseRegisteredOfficeAddressPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseRegisteredEmailEligibilityGetLambdaProps;
    public Function companiesHouseRegisteredEmailEligibilityGetLambda;
    public ILogGroup companiesHouseRegisteredEmailEligibilityGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseRegisteredEmailAddressPostLambdaProps;
    public Function companiesHouseRegisteredEmailAddressPostLambda;
    public ILogGroup companiesHouseRegisteredEmailAddressPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseAccountsRenderPostLambdaProps;
    public Function companiesHouseAccountsRenderPostLambda;
    public ILogGroup companiesHouseAccountsRenderPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseAccountsPostLambdaProps;
    public Function companiesHouseAccountsPostLambda;
    public ILogGroup companiesHouseAccountsPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseAccountsGetLambdaProps;
    public Function companiesHouseAccountsGetLambda;
    public ILogGroup companiesHouseAccountsGetLambdaLogGroup;

    public Function companiesHouseSubmissionStatusPollLambda;
    public ILogGroup companiesHouseSubmissionStatusPollLambdaLogGroup;
    public Rule companiesHouseSubmissionStatusPollSchedule;

    public AbstractApiLambdaProps hmrcCtReturnPreviewPostLambdaProps;
    public Function hmrcCtReturnPreviewPostLambda;
    public ILogGroup hmrcCtReturnPreviewPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcCtReturnPostLambdaProps;
    public Function hmrcCtReturnPostLambda;
    public ILogGroup hmrcCtReturnPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcCtReturnGetLambdaProps;
    public Function hmrcCtReturnGetLambda;
    public ILogGroup hmrcCtReturnGetLambdaLogGroup;

    public Function hmrcCtReturnStatusCheckLambda;
    public ILogGroup hmrcCtReturnStatusCheckLambdaLogGroup;
    public Rule hmrcCtReturnStatusCheckSchedule;

    public AbstractApiLambdaProps companiesHouseOfficersGetLambdaProps;
    public Function companiesHouseOfficersGetLambda;
    public ILogGroup companiesHouseOfficersGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHousePscGetLambdaProps;
    public Function companiesHousePscGetLambda;
    public ILogGroup companiesHousePscGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseCompanyReportGetLambdaProps;
    public Function companiesHouseCompanyReportGetLambda;
    public ILogGroup companiesHouseCompanyReportGetLambdaLogGroup;
    public AbstractApiLambdaProps companiesHouseFilingHistoryGetLambdaProps;
    public Function companiesHouseFilingHistoryGetLambda;
    public ILogGroup companiesHouseFilingHistoryGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseFiledAccountsGetLambdaProps;
    public Function companiesHouseFiledAccountsGetLambda;
    public ILogGroup companiesHouseFiledAccountsGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseFiledDocumentGetLambdaProps;
    public Function companiesHouseFiledDocumentGetLambda;
    public ILogGroup companiesHouseFiledDocumentGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseLastAccountsGetLambdaProps;
    public Function companiesHouseLastAccountsGetLambda;
    public ILogGroup companiesHouseLastAccountsGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseFilingDataPostLambdaProps;
    public Function companiesHouseFilingDataPostLambda;
    public ILogGroup companiesHouseFilingDataPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseConfirmationStatementRenderPostLambdaProps;
    public Function companiesHouseConfirmationStatementRenderPostLambda;
    public ILogGroup companiesHouseConfirmationStatementRenderPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseConfirmationStatementPostLambdaProps;
    public Function companiesHouseConfirmationStatementPostLambda;
    public ILogGroup companiesHouseConfirmationStatementPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseConfirmationStatementGetLambdaProps;
    public Function companiesHouseConfirmationStatementGetLambda;
    public ILogGroup companiesHouseConfirmationStatementGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHousePscVerificationStatementPostLambdaProps;
    public Function companiesHousePscVerificationStatementPostLambda;
    public ILogGroup companiesHousePscVerificationStatementPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHousePscVerificationStatementGetLambdaProps;
    public Function companiesHousePscVerificationStatementGetLambda;
    public ILogGroup companiesHousePscVerificationStatementGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHousePscCessationPostLambdaProps;
    public Function companiesHousePscCessationPostLambda;
    public ILogGroup companiesHousePscCessationPostLambdaLogGroup;
    public AbstractApiLambdaProps companiesHousePscChangeDetailsPostLambdaProps;
    public Function companiesHousePscChangeDetailsPostLambda;
    public ILogGroup companiesHousePscChangeDetailsPostLambdaLogGroup;
    public AbstractApiLambdaProps companiesHousePscStatementNotificationPostLambdaProps;
    public Function companiesHousePscStatementNotificationPostLambda;
    public ILogGroup companiesHousePscStatementNotificationPostLambdaLogGroup;
    public AbstractApiLambdaProps companiesHousePscStatementWithdrawalPostLambdaProps;
    public Function companiesHousePscStatementWithdrawalPostLambda;
    public ILogGroup companiesHousePscStatementWithdrawalPostLambdaLogGroup;
    public AbstractApiLambdaProps companiesHousePscNotificationPostLambdaProps;
    public Function companiesHousePscNotificationPostLambda;
    public ILogGroup companiesHousePscNotificationPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseFormStatusGetLambdaProps;
    public Function companiesHouseFormStatusGetLambda;
    public ILogGroup companiesHouseFormStatusGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseAccountingReferenceDatePostLambdaProps;
    public Function companiesHouseAccountingReferenceDatePostLambda;
    public ILogGroup companiesHouseAccountingReferenceDatePostLambdaLogGroup;
    public AbstractApiLambdaProps companiesHouseOfficerResignationPostLambdaProps;
    public Function companiesHouseOfficerResignationPostLambda;
    public ILogGroup companiesHouseOfficerResignationPostLambdaLogGroup;
    public AbstractApiLambdaProps companiesHouseSailAddressPostLambdaProps;
    public Function companiesHouseSailAddressPostLambda;
    public ILogGroup companiesHouseSailAddressPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseRecordLocationPostLambdaProps;
    public Function companiesHouseRecordLocationPostLambda;
    public ILogGroup companiesHouseRecordLocationPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseChangeOfNamePostLambdaProps;
    public Function companiesHouseChangeOfNamePostLambda;
    public ILogGroup companiesHouseChangeOfNamePostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseOfficerAppointmentPostLambdaProps;
    public Function companiesHouseOfficerAppointmentPostLambda;
    public ILogGroup companiesHouseOfficerAppointmentPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseOfficerChangePostLambdaProps;
    public Function companiesHouseOfficerChangePostLambda;
    public ILogGroup companiesHouseOfficerChangePostLambdaLogGroup;
    public AbstractApiLambdaProps companiesHouseAllotmentOfSharesPostLambdaProps;
    public Function companiesHouseAllotmentOfSharesPostLambda;
    public ILogGroup companiesHouseAllotmentOfSharesPostLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface CompaniesHouseStackProps extends StackProps, SubmitStackProps {

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

        String companiesHouseBaseUri();

        String companiesHouseDocumentBaseUri();

        String companiesHouseApiKeyArn();

        String companiesHouseFilingBaseUri();

        String companiesHouseFilingApiKeyArn();

        String companiesHouseIdentityBaseUri();

        String companiesHouseClientId();

        String companiesHouseClientSecretArn();

        String companiesHouseXmlGatewayUri();

        @Value.Default
        default String hmrcCtVendorId() {
            return "";
        }

        @Value.Default
        default String hmrcReceiptCertificateSha256() {
            return "";
        }

        String companiesHousePresenterIdArn();

        String companiesHousePresenterCodeArn();

        String companiesHouseCsFeeWaivedCompanyNumbers();

        // The Stripe keys a poll refunds a rejected filing's fee with (live, and test for synthetic charges).
        @Value.Default
        default String stripeSecretKeyArn() {
            return "";
        }

        @Value.Default
        default String stripeTestSecretKeyArn() {
            return "";
        }

        @Override
        SubmitSharedNames sharedNames();

        static ImmutableCompaniesHouseStackProps.Builder builder() {
            return ImmutableCompaniesHouseStackProps.builder();
        }
    }

    public CompaniesHouseStack(Construct scope, String id, CompaniesHouseStackProps props) {
        this(scope, id, null, props);
    }

    public CompaniesHouseStack(Construct scope, String id, StackProps stackProps, CompaniesHouseStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.bundlesTableName);

        // Lookup existing DynamoDB Receipts Table - only the accounts poll Lambda writes to it,
        // for the accepted filing receipt.
        ITable receiptsTable = Table.fromTableName(
                this,
                "ImportedReceiptsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.receiptsTableName);

        // Lookup existing DynamoDB Companies House accounts async-requests table - the submit and
        // poll Lambdas read and write it; allocateSubmissionNumber()'s counter item lives there too.
        ITable companiesHouseAccountsAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedCompaniesHouseAccountsAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.companiesHouseAccountsAsyncRequestsTableName);

        // Lookup existing DynamoDB Practice Clients Table - the accounts submit Lambda reads it
        // when enforceBundles resolves a client-scoped request's client row.
        ITable practiceClientsTable = Table.fromTableName(
                this,
                "ImportedPracticeClientsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.practiceClientsTableName);

        // Lookup existing DynamoDB Activity Charges Table - the confirmation statement submit
        // Lambda checks and marks a per-filing Stripe charge before it accepts a fee-due
        // submission. The confirmation statement status Lambda and the presenter poll mark that
        // charge used for a statement Companies House accepts after its envelope got no answer; the
        // other status Lambdas share their module, so they carry the table name with no grant
        // (activityCharges.js).
        ITable activityChargesTable = Table.fromTableName(
                this,
                "ImportedActivityChargesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.activityChargesTableName);

        // Lookup existing DynamoDB MCP sessions table and the key that seals the codes held in it:
        // the three Lambdas that read the codes a user typed on the codes page take their entry
        // from this table, once, and open it with this key.
        // Lookup existing DynamoDB security state table - each signed-in lookup that calls Companies
        // House on the shared API key charges the account's counter there, and the last accounts
        // Lambda keeps its answer for a filed set there.
        ITable securityStateTable = Table.fromTableName(
                this,
                "ImportedSecurityStateTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.securityStateTableName);

        ITable mcpSessionsTable = Table.fromTableName(
                this,
                "ImportedMcpSessionsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.mcpSessionsTableName);
        ISecret codesSealKeySecret = Secret.fromSecretCompleteArn(
                this,
                props.resourceNamePrefix() + "-CodesSealKey",
                StringParameter.valueForStringParameter(
                        this, props.sharedNames().mcp.mcpOauthBlobKeySecretArnParameterName));

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for Secrets Manager access
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activity.activityBusName);

        // Companies House search
        var companiesHouseSearchGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseSearchGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseSearchGetLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }

        var companiesHouseSearchGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.companiesHouseSearchGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseSearchGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.companiesHouseSearchGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseSearchGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseSearchGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseSearchGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseSearchGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.companiesHouseSearchGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseSearchGetLambdaCustomAuthorizer)
                        .environment(companiesHouseSearchGetLambdaEnv)
                        .build());
        this.companiesHouseSearchGetLambdaProps = companiesHouseSearchGetLambdaUrlOrigin.apiProps;
        this.companiesHouseSearchGetLambda = companiesHouseSearchGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseSearchGetLambdaLogGroup = companiesHouseSearchGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseSearchGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House search with ingestHandler %s",
                this.companiesHouseSearchGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseSearchGetIngestLambdaHandler);

        grantCompaniesHouseLambdaAccess(
                this.companiesHouseSearchGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        // Companies House company profile
        var companiesHouseCompanyGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseCompanyGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseCompanyGetLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }

        var companiesHouseCompanyGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.companiesHouseCompanyGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseCompanyGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.companiesHouseCompanyGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseCompanyGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseCompanyGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseCompanyGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseCompanyGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.companiesHouseCompanyGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseCompanyGetLambdaCustomAuthorizer)
                        .environment(companiesHouseCompanyGetLambdaEnv)
                        .build());
        this.companiesHouseCompanyGetLambdaProps = companiesHouseCompanyGetLambdaUrlOrigin.apiProps;
        this.companiesHouseCompanyGetLambda = companiesHouseCompanyGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseCompanyGetLambdaLogGroup = companiesHouseCompanyGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseCompanyGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House company profile with ingestHandler %s",
                this.companiesHouseCompanyGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseCompanyGetIngestLambdaHandler);

        grantCompaniesHouseLambdaAccess(
                this.companiesHouseCompanyGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        // Companies House filing deadlines for a visitor with no sign-in. The route has no
        // authorizer, so the Lambda reads no bundle, salt or activity bus: it holds the Companies
        // House key, writes call records and charges the counter of all public lookups, and nothing else.
        var companiesHousePublicDeadlinesGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHousePublicDeadlinesGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHousePublicDeadlinesGetLambdaEnv.with(
                    "COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }

        var companiesHousePublicDeadlinesGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePublicDeadlinesGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePublicDeadlinesGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHousePublicDeadlinesGetIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHousePublicDeadlinesGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePublicDeadlinesGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHousePublicDeadlinesGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHousePublicDeadlinesGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHousePublicDeadlinesGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePublicDeadlinesGetLambdaCustomAuthorizer)
                        .environment(companiesHousePublicDeadlinesGetLambdaEnv)
                        .build());
        this.companiesHousePublicDeadlinesGetLambdaProps = companiesHousePublicDeadlinesGetLambdaUrlOrigin.apiProps;
        this.companiesHousePublicDeadlinesGetLambda = companiesHousePublicDeadlinesGetLambdaUrlOrigin.ingestLambda;
        this.companiesHousePublicDeadlinesGetLambdaLogGroup = companiesHousePublicDeadlinesGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePublicDeadlinesGetLambdaProps);
        infof(
                "Created Lambda %s for the public company deadlines lookup with ingestHandler %s",
                this.companiesHousePublicDeadlinesGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePublicDeadlinesGetIngestLambdaHandler);

        grantSecretRead(this.companiesHousePublicDeadlinesGetLambda, props.companiesHouseApiKeyArn());

        // A company's register for a prefilled package, for a visitor with no sign-in: the profile,
        // the current officers and the last filed accounts' iXBRL document. Like the deadlines lookup
        // it reads no bundle, salt or activity bus; it also reads the Document API.
        var companiesHousePublicRegisterGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("COMPANIES_HOUSE_DOCUMENT_BASE_URI", props.companiesHouseDocumentBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHousePublicRegisterGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHousePublicRegisterGetLambdaEnv.with(
                    "COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }

        var companiesHousePublicRegisterGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePublicRegisterGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePublicRegisterGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHousePublicRegisterGetIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHousePublicRegisterGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePublicRegisterGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(512)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHousePublicRegisterGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHousePublicRegisterGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHousePublicRegisterGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePublicRegisterGetLambdaCustomAuthorizer)
                        .environment(companiesHousePublicRegisterGetLambdaEnv)
                        .build());
        this.companiesHousePublicRegisterGetLambdaProps = companiesHousePublicRegisterGetLambdaUrlOrigin.apiProps;
        this.companiesHousePublicRegisterGetLambda = companiesHousePublicRegisterGetLambdaUrlOrigin.ingestLambda;
        this.companiesHousePublicRegisterGetLambdaLogGroup = companiesHousePublicRegisterGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePublicRegisterGetLambdaProps);
        infof(
                "Created Lambda %s for the public company register read with ingestHandler %s",
                this.companiesHousePublicRegisterGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePublicRegisterGetIngestLambdaHandler);

        grantSecretRead(this.companiesHousePublicRegisterGetLambda, props.companiesHouseApiKeyArn());

        // Companies House OAuth token exchange. The identity base URI, client id and client
        // secret ARN are blank until the operator has registered the developer-hub application
        // (and, for prod, until the ci-only gate lifts), so each is set only when configured -
        // PopulatedMap rejects a blank value outright.
        var companiesHouseTokenPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        withCodesEntryEnv(companiesHouseTokenPostLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        IntegrationCallAccess.addEnv(
                companiesHouseTokenPostLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseIdentityBaseUri())) {
            companiesHouseTokenPostLambdaEnv.with(
                    "COMPANIES_HOUSE_IDENTITY_BASE_URI", props.companiesHouseIdentityBaseUri());
        }
        if (StringUtils.isNotBlank(props.companiesHouseClientId())) {
            companiesHouseTokenPostLambdaEnv.with("COMPANIES_HOUSE_CLIENT_ID", props.companiesHouseClientId());
        }
        if (StringUtils.isNotBlank(props.companiesHouseClientSecretArn())) {
            companiesHouseTokenPostLambdaEnv.with(
                    "COMPANIES_HOUSE_CLIENT_SECRET_ARN", props.companiesHouseClientSecretArn());
        }

        var companiesHouseTokenPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.companiesHouseTokenPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseTokenPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.companiesHouseTokenPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseTokenPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseTokenPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseTokenPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.companiesHouseTokenPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseTokenPostLambdaCustomAuthorizer)
                        .environment(companiesHouseTokenPostLambdaEnv)
                        .build());
        this.companiesHouseTokenPostLambdaProps = companiesHouseTokenPostLambdaUrlOrigin.apiProps;
        this.companiesHouseTokenPostLambda = companiesHouseTokenPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseTokenPostLambdaLogGroup = companiesHouseTokenPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseTokenPostLambdaProps);
        // Sign-out deletes the caller's own grant through the same Lambda: a further route, no
        // further function.
        this.lambdaFunctionProps.add(ApiLambdaProps.builder()
                .from(this.companiesHouseTokenPostLambdaProps)
                .httpMethod(HttpMethod.DELETE)
                .urlPath(props.sharedNames().companiesHouse.companiesHouseGrantItemUrlPath)
                .build());
        infof(
                "Created Lambda %s for Companies House token exchange with ingestHandler %s",
                this.companiesHouseTokenPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseTokenPostIngestLambdaHandler);

        // Its own grant, not grantCompaniesHouseLambdaAccess: the token exchange authenticates
        // with the OAuth client secret, not the public data API key, and does not gate on a
        // bundle entitlement (no authorizer runs on this route, so there is no user to check -
        // the same reason HmrcStack's own token exchange Lambda carries no bundles grant).
        grantCompaniesHouseTokenLambdaAccess(
                this.companiesHouseTokenPostLambda, region, account, props, activityBusArn);
        grantGrantCreate(this.companiesHouseTokenPostLambda, mcpSessionsTable, codesSealKeySecret);
        grantGrantDelete(this.companiesHouseTokenPostLambda, mcpSessionsTable);

        // The six OAuth filing Lambdas: they carry the user's Companies House access token as a
        // Bearer header (via the custom authorizer, matching the HMRC VAT routes) and call
        // COMPANIES_HOUSE_FILING_BASE_URI, blank until the operator has registered the
        // developer-hub application and, for prod, until the ci-only gate lifts.
        var companiesHouseTransactionPostLambdaEnv = filingLambdaEnv(props);
        withCodesEntryEnv(companiesHouseTransactionPostLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        var companiesHouseTransactionPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseTransactionPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseTransactionPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseTransactionPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseTransactionPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseTransactionPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPostLambdaCustomAuthorizer)
                        .environment(companiesHouseTransactionPostLambdaEnv)
                        .build());
        this.companiesHouseTransactionPostLambdaProps = companiesHouseTransactionPostLambdaUrlOrigin.apiProps;
        this.companiesHouseTransactionPostLambda = companiesHouseTransactionPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseTransactionPostLambdaLogGroup = companiesHouseTransactionPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseTransactionPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House transaction open with ingestHandler %s",
                this.companiesHouseTransactionPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseTransactionPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseTransactionPostLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantGrantRead(this.companiesHouseTransactionPostLambda, mcpSessionsTable, codesSealKeySecret);

        var companiesHouseTransactionGetLambdaEnv = filingLambdaEnv(props);
        withCodesEntryEnv(companiesHouseTransactionGetLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        var companiesHouseTransactionGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().companiesHouse.companiesHouseTransactionGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseTransactionGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseTransactionGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseTransactionGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseTransactionGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseTransactionGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseTransactionGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseTransactionGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseTransactionGetLambdaCustomAuthorizer)
                        .environment(companiesHouseTransactionGetLambdaEnv)
                        .build());
        this.companiesHouseTransactionGetLambdaProps = companiesHouseTransactionGetLambdaUrlOrigin.apiProps;
        this.companiesHouseTransactionGetLambda = companiesHouseTransactionGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseTransactionGetLambdaLogGroup = companiesHouseTransactionGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseTransactionGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House transaction get with ingestHandler %s",
                this.companiesHouseTransactionGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseTransactionGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseTransactionGetLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantGrantRead(this.companiesHouseTransactionGetLambda, mcpSessionsTable, codesSealKeySecret);

        var companiesHouseTransactionPutLambdaEnv = filingLambdaEnv(props);
        withCodesEntryEnv(companiesHouseTransactionPutLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        var companiesHouseTransactionPutLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPutIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseTransactionPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseTransactionPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseTransactionPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseTransactionPutLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPutLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseTransactionPutLambdaCustomAuthorizer)
                        .environment(companiesHouseTransactionPutLambdaEnv)
                        .build());
        this.companiesHouseTransactionPutLambdaProps = companiesHouseTransactionPutLambdaUrlOrigin.apiProps;
        this.companiesHouseTransactionPutLambda = companiesHouseTransactionPutLambdaUrlOrigin.ingestLambda;
        this.companiesHouseTransactionPutLambdaLogGroup = companiesHouseTransactionPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseTransactionPutLambdaProps);
        infof(
                "Created Lambda %s for Companies House transaction close with ingestHandler %s",
                this.companiesHouseTransactionPutLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseTransactionPutIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseTransactionPutLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantGrantRead(this.companiesHouseTransactionPutLambda, mcpSessionsTable, codesSealKeySecret);

        // Registered office address read: the API-key public register client, needing no Companies
        // House user token. The change filing runs against the filing base URI, so the read that
        // supplies its reference etag goes there too, with the key issued for that API. On ci the
        // filing base is the sandbox, where the test companies exist and the live register does not
        // know them; on prod the filing base is the live API and its filing key is the live key.
        var officeReadBaseUri = StringUtils.isNotBlank(props.companiesHouseFilingBaseUri())
                ? props.companiesHouseFilingBaseUri()
                : props.companiesHouseBaseUri();
        var officeReadApiKeyArn = StringUtils.isNotBlank(props.companiesHouseFilingBaseUri())
                ? props.companiesHouseFilingApiKeyArn()
                : props.companiesHouseApiKeyArn();
        var companiesHouseRegisteredOfficeAddressGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", officeReadBaseUri)
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseRegisteredOfficeAddressGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(officeReadApiKeyArn)) {
            companiesHouseRegisteredOfficeAddressGetLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", officeReadApiKeyArn);
        }
        var companiesHouseRegisteredOfficeAddressGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressGetLambdaCustomAuthorizer)
                        .environment(companiesHouseRegisteredOfficeAddressGetLambdaEnv)
                        .build());
        this.companiesHouseRegisteredOfficeAddressGetLambdaProps =
                companiesHouseRegisteredOfficeAddressGetLambdaUrlOrigin.apiProps;
        this.companiesHouseRegisteredOfficeAddressGetLambda =
                companiesHouseRegisteredOfficeAddressGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseRegisteredOfficeAddressGetLambdaLogGroup =
                companiesHouseRegisteredOfficeAddressGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseRegisteredOfficeAddressGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House registered office address read with ingestHandler %s",
                this.companiesHouseRegisteredOfficeAddressGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseRegisteredOfficeAddressGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseRegisteredOfficeAddressGetLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantSecretRead(this.companiesHouseRegisteredOfficeAddressGetLambda, officeReadApiKeyArn);

        var companiesHouseRegisteredOfficeAddressPostLambdaEnv = filingLambdaEnv(props);
        withCodesEntryEnv(companiesHouseRegisteredOfficeAddressPostLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        var companiesHouseRegisteredOfficeAddressPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredOfficeAddressPostLambdaCustomAuthorizer)
                        .environment(companiesHouseRegisteredOfficeAddressPostLambdaEnv)
                        .build());
        this.companiesHouseRegisteredOfficeAddressPostLambdaProps =
                companiesHouseRegisteredOfficeAddressPostLambdaUrlOrigin.apiProps;
        this.companiesHouseRegisteredOfficeAddressPostLambda =
                companiesHouseRegisteredOfficeAddressPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseRegisteredOfficeAddressPostLambdaLogGroup =
                companiesHouseRegisteredOfficeAddressPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseRegisteredOfficeAddressPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House registered office address filing with ingestHandler %s",
                this.companiesHouseRegisteredOfficeAddressPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseRegisteredOfficeAddressPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseRegisteredOfficeAddressPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantGrantRead(this.companiesHouseRegisteredOfficeAddressPostLambda, mcpSessionsTable, codesSealKeySecret);

        var companiesHouseRegisteredEmailEligibilityGetLambdaEnv = filingLambdaEnv(props);
        withCodesEntryEnv(companiesHouseRegisteredEmailEligibilityGetLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        var companiesHouseRegisteredEmailEligibilityGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailEligibilityGetLambdaCustomAuthorizer)
                        .environment(companiesHouseRegisteredEmailEligibilityGetLambdaEnv)
                        .build());
        this.companiesHouseRegisteredEmailEligibilityGetLambdaProps =
                companiesHouseRegisteredEmailEligibilityGetLambdaUrlOrigin.apiProps;
        this.companiesHouseRegisteredEmailEligibilityGetLambda =
                companiesHouseRegisteredEmailEligibilityGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseRegisteredEmailEligibilityGetLambdaLogGroup =
                companiesHouseRegisteredEmailEligibilityGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseRegisteredEmailEligibilityGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House registered email eligibility with ingestHandler %s",
                this.companiesHouseRegisteredEmailEligibilityGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseRegisteredEmailEligibilityGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseRegisteredEmailEligibilityGetLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantGrantRead(this.companiesHouseRegisteredEmailEligibilityGetLambda, mcpSessionsTable, codesSealKeySecret);

        var companiesHouseRegisteredEmailAddressPostLambdaEnv = filingLambdaEnv(props);
        withCodesEntryEnv(companiesHouseRegisteredEmailAddressPostLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        var companiesHouseRegisteredEmailAddressPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRegisteredEmailAddressPostLambdaCustomAuthorizer)
                        .environment(companiesHouseRegisteredEmailAddressPostLambdaEnv)
                        .build());
        this.companiesHouseRegisteredEmailAddressPostLambdaProps =
                companiesHouseRegisteredEmailAddressPostLambdaUrlOrigin.apiProps;
        this.companiesHouseRegisteredEmailAddressPostLambda =
                companiesHouseRegisteredEmailAddressPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseRegisteredEmailAddressPostLambdaLogGroup =
                companiesHouseRegisteredEmailAddressPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseRegisteredEmailAddressPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House registered email address filing with ingestHandler %s",
                this.companiesHouseRegisteredEmailAddressPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseRegisteredEmailAddressPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseRegisteredEmailAddressPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantGrantRead(this.companiesHouseRegisteredEmailAddressPostLambda, mcpSessionsTable, codesSealKeySecret);

        // The accounts filing route: render produces the iXBRL only, the other two reach the XML
        // Gateway with the presenter credentials, never the OAuth filing base URI or client secret
        // the six Lambdas above use.
        var companiesHouseAccountsRenderPostLambdaEnv =
                xmlGatewayFilingLambdaEnv(props).with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        var companiesHouseAccountsRenderPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountsRenderPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountsRenderPostIngestLambdaFunctionName)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseAccountsRenderPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseAccountsRenderPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountsRenderPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseAccountsRenderPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseAccountsRenderPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseAccountsRenderPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountsRenderPostLambdaCustomAuthorizer)
                        .environment(companiesHouseAccountsRenderPostLambdaEnv)
                        .build());
        this.companiesHouseAccountsRenderPostLambdaProps = companiesHouseAccountsRenderPostLambdaUrlOrigin.apiProps;
        this.companiesHouseAccountsRenderPostLambda = companiesHouseAccountsRenderPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseAccountsRenderPostLambdaLogGroup = companiesHouseAccountsRenderPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseAccountsRenderPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House accounts render with ingestHandler %s",
                this.companiesHouseAccountsRenderPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseAccountsRenderPostIngestLambdaHandler);
        // No presenter secret grant: render never reaches the gateway.
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAccountsRenderPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);

        var companiesHouseAccountsPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", practiceClientsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props))
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("COMPANIES_HOUSE_DOCUMENT_BASE_URI", props.companiesHouseDocumentBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseAccountsPostLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        withCodesEntryEnv(companiesHouseAccountsPostLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        withPresenterSecretArns(companiesHouseAccountsPostLambdaEnv, props);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseAccountsPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseAccountsPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.companiesHouseAccountsPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseAccountsPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.companiesHouseAccountsPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseAccountsPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountsPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseAccountsPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseAccountsPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.companiesHouseAccountsPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseAccountsPostLambdaCustomAuthorizer)
                        .environment(companiesHouseAccountsPostLambdaEnv)
                        .build());
        this.companiesHouseAccountsPostLambdaProps = companiesHouseAccountsPostLambdaUrlOrigin.apiProps;
        this.companiesHouseAccountsPostLambda = companiesHouseAccountsPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseAccountsPostLambdaLogGroup = companiesHouseAccountsPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseAccountsPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House accounts submit with ingestHandler %s",
                this.companiesHouseAccountsPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseAccountsPostIngestLambdaHandler);
        // The API key: the register read for revised accounts that name no receipt (the company's
        // filing history and, for an item with no made-up date, its filed document), the profile
        // read of the Welsh accounts check, and the registered office fill.
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAccountsPostLambda, bundlesTable, region, account, props, activityBusArn, true);
        // Those reads are lookups on the shared API key: UpdateItem charges the account's counter,
        // GetItem reads the stop a Companies House 429 sets, PutItem sets it.
        securityStateTable.grant(
                this.companiesHouseAccountsPostLambda, "dynamodb:UpdateItem", "dynamodb:GetItem", "dynamodb:PutItem");
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseAccountsPostLambda, props);
        grantCodesEntryAccess(this.companiesHouseAccountsPostLambda, mcpSessionsTable, codesSealKeySecret);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseAccountsPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // The revision's register read charges the account's counter and reads and sets the shared stop.
        securityStateTable.grant(
                this.companiesHouseAccountsPostLambda, "dynamodb:UpdateItem", "dynamodb:GetItem", "dynamodb:PutItem");
        // Read-only: resolves a client-scoped request's client row when enforceBundles checks it.
        practiceClientsTable.grant(this.companiesHouseAccountsPostLambda, "dynamodb:GetItem");
        // Read-only: revised accounts are checked against the receipt of the accounts they revise.
        receiptsTable.grant(this.companiesHouseAccountsPostLambda, "dynamodb:GetItem");

        var companiesHouseAccountsGetLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName())
                .with("ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME", activityChargesTable.getTableName())
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseAccountsGetLambdaEnv, props);
        var companiesHouseAccountsGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.companiesHouseAccountsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseAccountsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.companiesHouseAccountsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseAccountsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseAccountsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseAccountsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.companiesHouseAccountsGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseAccountsGetLambdaCustomAuthorizer)
                        .environment(companiesHouseAccountsGetLambdaEnv)
                        .build());
        this.companiesHouseAccountsGetLambdaProps = companiesHouseAccountsGetLambdaUrlOrigin.apiProps;
        this.companiesHouseAccountsGetLambda = companiesHouseAccountsGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseAccountsGetLambdaLogGroup = companiesHouseAccountsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseAccountsGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House accounts poll with ingestHandler %s",
                this.companiesHouseAccountsGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseAccountsGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAccountsGetLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseAccountsGetLambda, props);
        receiptsTable.grant(
                this.companiesHouseAccountsGetLambda, "dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem");
        grantTokenCharge(this.companiesHouseAccountsGetLambda, bundlesTable);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseAccountsGetLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        // The Company Tax Return route: preview builds the three documents only; submit posts the
        // signed CT600 to HMRC's Transaction Engine with the credentials the user types; poll reads the
        // outcome. None reads a secret: the Government Gateway credentials arrive in the request.
        var hmrcCtReturnPreviewPostLambdaEnv = hmrcCtLambdaEnv(props);
        var hmrcCtReturnPreviewPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .hmrcCtReturnPreviewPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(512)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostLambdaCustomAuthorizer)
                        .environment(hmrcCtReturnPreviewPostLambdaEnv)
                        .build());
        this.hmrcCtReturnPreviewPostLambdaProps = hmrcCtReturnPreviewPostLambdaUrlOrigin.apiProps;
        this.hmrcCtReturnPreviewPostLambda = hmrcCtReturnPreviewPostLambdaUrlOrigin.ingestLambda;
        this.hmrcCtReturnPreviewPostLambdaLogGroup = hmrcCtReturnPreviewPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcCtReturnPreviewPostLambdaProps);
        infof(
                "Created Lambda %s for HMRC Company Tax Return preview with ingestHandler %s",
                this.hmrcCtReturnPreviewPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.hmrcCtReturnPreviewPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.hmrcCtReturnPreviewPostLambda, bundlesTable, region, account, props, activityBusArn, false);

        var hmrcCtReturnPostLambdaEnv = hmrcCtLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("HMRC_CT_GATEWAY_TEST", gatewayTestFlag(props));
        if (StringUtils.isNotBlank(props.hmrcCtVendorId())) {
            hmrcCtReturnPostLambdaEnv.with("HMRC_CT_VENDOR_ID", props.hmrcCtVendorId());
        }
        hmrcCtReturnPostLambdaEnv.with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName());
        withFilerSealKeyEnv(hmrcCtReturnPostLambdaEnv, codesSealKeySecret);
        if (StringUtils.isNotBlank(props.hmrcReceiptCertificateSha256())) {
            hmrcCtReturnPostLambdaEnv.with("HMRC_RECEIPT_CERTIFICATE_SHA256", props.hmrcReceiptCertificateSha256());
        }
        var hmrcCtReturnPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.hmrcCtReturnPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouse.hmrcCtReturnPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.hmrcCtReturnPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.hmrcCtReturnPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .hmrcCtReturnPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(512)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.hmrcCtReturnPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.hmrcCtReturnPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.hmrcCtReturnPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouse.hmrcCtReturnPostLambdaCustomAuthorizer)
                        .environment(hmrcCtReturnPostLambdaEnv)
                        .build());
        this.hmrcCtReturnPostLambdaProps = hmrcCtReturnPostLambdaUrlOrigin.apiProps;
        this.hmrcCtReturnPostLambda = hmrcCtReturnPostLambdaUrlOrigin.ingestLambda;
        this.hmrcCtReturnPostLambdaLogGroup = hmrcCtReturnPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcCtReturnPostLambdaProps);
        infof(
                "Created Lambda %s for HMRC Company Tax Return submit with ingestHandler %s",
                this.hmrcCtReturnPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.hmrcCtReturnPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.hmrcCtReturnPostLambda, bundlesTable, region, account, props, activityBusArn, false);
        receiptsTable.grant(this.hmrcCtReturnPostLambda, "dynamodb:PutItem");
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.hmrcCtReturnPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the marker the scheduled CT600 status check reads.
        codesSealKeySecret.grantRead(this.hmrcCtReturnPostLambda);

        var hmrcCtReturnGetLambdaEnv = hmrcCtLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName());
        if (StringUtils.isNotBlank(props.hmrcReceiptCertificateSha256())) {
            hmrcCtReturnGetLambdaEnv.with("HMRC_RECEIPT_CERTIFICATE_SHA256", props.hmrcReceiptCertificateSha256());
        }
        var hmrcCtReturnGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.hmrcCtReturnGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouse.hmrcCtReturnGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.hmrcCtReturnGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.hmrcCtReturnGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .hmrcCtReturnGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(512)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.hmrcCtReturnGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.hmrcCtReturnGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.hmrcCtReturnGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouse.hmrcCtReturnGetLambdaCustomAuthorizer)
                        .environment(hmrcCtReturnGetLambdaEnv)
                        .build());
        this.hmrcCtReturnGetLambdaProps = hmrcCtReturnGetLambdaUrlOrigin.apiProps;
        this.hmrcCtReturnGetLambda = hmrcCtReturnGetLambdaUrlOrigin.ingestLambda;
        this.hmrcCtReturnGetLambdaLogGroup = hmrcCtReturnGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcCtReturnGetLambdaProps);
        infof(
                "Created Lambda %s for HMRC Company Tax Return poll with ingestHandler %s",
                this.hmrcCtReturnGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.hmrcCtReturnGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.hmrcCtReturnGetLambda, bundlesTable, region, account, props, activityBusArn, false);
        receiptsTable.grant(this.hmrcCtReturnGetLambda, "dynamodb:PutItem");
        grantTokenCharge(this.hmrcCtReturnGetLambda, bundlesTable);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.hmrcCtReturnGetLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        // The scheduled CT600 status check: finds every return that waits for HMRC's final answer by
        // a Query on the hmrc-ct-pending marker partition, and runs the page's poll for each with the
        // filer's sealed sub, so it writes the receipt, the accepted event and the token charge as the
        // page does, and records "no answer from HMRC" 30 days after sending.
        var hmrcCtReturnStatusCheckLambdaEnv = hmrcCtLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName());
        if (StringUtils.isNotBlank(props.hmrcReceiptCertificateSha256())) {
            hmrcCtReturnStatusCheckLambdaEnv.with(
                    "HMRC_RECEIPT_CERTIFICATE_SHA256", props.hmrcReceiptCertificateSha256());
        }
        withFilerSealKeyEnv(hmrcCtReturnStatusCheckLambdaEnv, codesSealKeySecret);
        var hmrcCtReturnStatusCheckLambdaConstruct = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.hmrcCtReturnStatusCheckIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.hmrcCtReturnStatusCheckIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouse.hmrcCtReturnStatusCheckIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.hmrcCtReturnStatusCheckIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .hmrcCtReturnStatusCheckIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestMemorySize(512)
                        .ingestLambdaTimeout(Duration.minutes(5))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(hmrcCtReturnStatusCheckLambdaEnv)
                        .build());
        this.hmrcCtReturnStatusCheckLambda = hmrcCtReturnStatusCheckLambdaConstruct.ingestLambda;
        this.hmrcCtReturnStatusCheckLambdaLogGroup = hmrcCtReturnStatusCheckLambdaConstruct.logGroup;
        // The salt to hash the filer's sub, PutEvents for the accepted event and the receipt email
        // request, and the bundles Query the token charge reads the filer's bundles with.
        grantCompaniesHouseLambdaAccess(
                this.hmrcCtReturnStatusCheckLambda, bundlesTable, region, account, props, activityBusArn, false);
        codesSealKeySecret.grantRead(this.hmrcCtReturnStatusCheckLambda);
        receiptsTable.grant(this.hmrcCtReturnStatusCheckLambda, "dynamodb:PutItem");
        grantTokenCharge(this.hmrcCtReturnStatusCheckLambda, bundlesTable);
        // Reads and writes the filer's request and the marker by key, and deletes a settled marker.
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.hmrcCtReturnStatusCheckLambda, "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem");
        // The one Query: the marker partition, and no user's own partition. No Scan.
        this.hmrcCtReturnStatusCheckLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("dynamodb:Query"))
                .resources(List.of(companiesHouseAccountsAsyncRequestsTable.getTableArn()))
                .conditions(Map.of(
                        "ForAllValues:StringEquals", Map.of("dynamodb:LeadingKeys", List.of(CT_PENDING_PARTITION))))
                .build());
        // Every 15 minutes, all day: the Transaction Engine answers at any hour. A return is asked
        // about at most once in 10 minutes however many deployments share the schedule, and never
        // inside the poll interval HMRC last named.
        this.hmrcCtReturnStatusCheckSchedule = Rule.Builder.create(
                        this,
                        props.sharedNames().companiesHouse.hmrcCtReturnStatusCheckIngestLambdaFunctionName
                                + "-Schedule")
                .ruleName(props.sharedNames().companiesHouse.hmrcCtReturnStatusCheckIngestLambdaFunctionName
                        + "-schedule")
                .description("Ask HMRC for the final answer to each Company Tax Return still waiting for one")
                .schedule(Schedule.rate(Duration.minutes(15)))
                .targets(List.of(LambdaFunction.Builder.create(this.hmrcCtReturnStatusCheckLambda)
                        .build()))
                .build();
        infof(
                "Created Lambda %s for the scheduled Company Tax Return status check",
                this.hmrcCtReturnStatusCheckLambda.getNode().getId());

        // The confirmation statement route: two public-data lookups (officers, PSCs - the API-key
        // client, same setting as the two company lookup Lambdas above), a synchronous filing-data
        // read (CompanyDataRequest and PaymentPeriodsRequest, through the gateway with the
        // presenter credentials), and the render/submit/poll trio the accounts route's own async
        // pattern already established, sharing its async-requests table so one submission number
        // space serves every form.
        var companiesHouseOfficersGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseOfficersGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseOfficersGetLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        var companiesHouseOfficersGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.companiesHouseOfficersGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseOfficersGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.companiesHouseOfficersGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseOfficersGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficersGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseOfficersGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseOfficersGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.companiesHouseOfficersGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseOfficersGetLambdaCustomAuthorizer)
                        .environment(companiesHouseOfficersGetLambdaEnv)
                        .build());
        this.companiesHouseOfficersGetLambdaProps = companiesHouseOfficersGetLambdaUrlOrigin.apiProps;
        this.companiesHouseOfficersGetLambda = companiesHouseOfficersGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseOfficersGetLambdaLogGroup = companiesHouseOfficersGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseOfficersGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House officers lookup with ingestHandler %s",
                this.companiesHouseOfficersGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseOfficersGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseOfficersGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        var companiesHousePscGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());

        IntegrationCallAccess.addEnv(
                companiesHousePscGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHousePscGetLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        var companiesHousePscGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouse.companiesHousePscGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHousePscGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().companiesHouse.companiesHousePscGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHousePscGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHousePscGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHousePscGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouse.companiesHousePscGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouse.companiesHousePscGetLambdaCustomAuthorizer)
                        .environment(companiesHousePscGetLambdaEnv)
                        .build());
        this.companiesHousePscGetLambdaProps = companiesHousePscGetLambdaUrlOrigin.apiProps;
        this.companiesHousePscGetLambda = companiesHousePscGetLambdaUrlOrigin.ingestLambda;
        this.companiesHousePscGetLambdaLogGroup = companiesHousePscGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePscGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House PSC lookup with ingestHandler %s",
                this.companiesHousePscGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePscGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHousePscGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        // The company lookup's drill-down: the filing history, every category, and the sets of
        // accounts the register holds with one set's iXBRL document. All three use the API-key
        // client; the two accounts routes also read the Document API.
        var companiesHouseFilingHistoryGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseFilingHistoryGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseFilingHistoryGetLambdaEnv.with(
                    "COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        var companiesHouseFilingHistoryGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFilingHistoryGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFilingHistoryGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseFilingHistoryGetIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseFilingHistoryGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFilingHistoryGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseFilingHistoryGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseFilingHistoryGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFilingHistoryGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFilingHistoryGetLambdaCustomAuthorizer)
                        .environment(companiesHouseFilingHistoryGetLambdaEnv)
                        .build());
        this.companiesHouseFilingHistoryGetLambdaProps = companiesHouseFilingHistoryGetLambdaUrlOrigin.apiProps;
        this.companiesHouseFilingHistoryGetLambda = companiesHouseFilingHistoryGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseFilingHistoryGetLambdaLogGroup = companiesHouseFilingHistoryGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseFilingHistoryGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House filing history lookup with ingestHandler %s",
                this.companiesHouseFilingHistoryGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseFilingHistoryGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseFilingHistoryGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        // The company reports: one Lambda for every report, reading the register through the shared
        // Companies House cache and the stop a Companies House 429 sets.
        ITable companiesHouseCacheTable = Table.fromTableName(
                this,
                "ImportedCompaniesHouseCacheTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.companiesHouseCacheTableName);
        var companiesHouseCompanyReportGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("COMPANIES_HOUSE_CACHE_DYNAMODB_TABLE_NAME", companiesHouseCacheTable.getTableName())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseCompanyReportGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseCompanyReportGetLambdaEnv.with(
                    "COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        var companiesHouseCompanyReportGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseCompanyReportGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseCompanyReportGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseCompanyReportGetIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseCompanyReportGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseCompanyReportGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseCompanyReportGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseCompanyReportGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseCompanyReportGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseCompanyReportGetLambdaCustomAuthorizer)
                        .environment(companiesHouseCompanyReportGetLambdaEnv)
                        .build());
        this.companiesHouseCompanyReportGetLambdaProps = companiesHouseCompanyReportGetLambdaUrlOrigin.apiProps;
        this.companiesHouseCompanyReportGetLambda = companiesHouseCompanyReportGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseCompanyReportGetLambdaLogGroup = companiesHouseCompanyReportGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseCompanyReportGetLambdaProps);
        infof(
                "Created Lambda %s for the Companies House company reports with ingestHandler %s",
                this.companiesHouseCompanyReportGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseCompanyReportGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseCompanyReportGetLambda, bundlesTable, region, account, props, activityBusArn, true);
        // The cache's reads (GetItem: an answer and the accepted filing marker) and writes (PutItem); the
        // polls that record an accepted filing drop a company's entries and write the marker.
        companiesHouseCacheTable.grant(
                this.companiesHouseCompanyReportGetLambda, "dynamodb:GetItem", "dynamodb:PutItem");

        var companiesHouseFiledAccountsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("COMPANIES_HOUSE_DOCUMENT_BASE_URI", props.companiesHouseDocumentBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseFiledAccountsGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseFiledAccountsGetLambdaEnv.with(
                    "COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        var companiesHouseFiledAccountsGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFiledAccountsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFiledAccountsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseFiledAccountsGetIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseFiledAccountsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFiledAccountsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseFiledAccountsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseFiledAccountsGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFiledAccountsGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFiledAccountsGetLambdaCustomAuthorizer)
                        .environment(companiesHouseFiledAccountsGetLambdaEnv)
                        .build());
        this.companiesHouseFiledAccountsGetLambdaProps = companiesHouseFiledAccountsGetLambdaUrlOrigin.apiProps;
        this.companiesHouseFiledAccountsGetLambda = companiesHouseFiledAccountsGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseFiledAccountsGetLambdaLogGroup = companiesHouseFiledAccountsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseFiledAccountsGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House filed accounts list with ingestHandler %s",
                this.companiesHouseFiledAccountsGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseFiledAccountsGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseFiledAccountsGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        var companiesHouseFiledDocumentGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("COMPANIES_HOUSE_DOCUMENT_BASE_URI", props.companiesHouseDocumentBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseFiledDocumentGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseFiledDocumentGetLambdaEnv.with(
                    "COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        var companiesHouseFiledDocumentGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFiledDocumentGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFiledDocumentGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseFiledDocumentGetIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseFiledDocumentGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFiledDocumentGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseFiledDocumentGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseFiledDocumentGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFiledDocumentGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFiledDocumentGetLambdaCustomAuthorizer)
                        .environment(companiesHouseFiledDocumentGetLambdaEnv)
                        .build());
        this.companiesHouseFiledDocumentGetLambdaProps = companiesHouseFiledDocumentGetLambdaUrlOrigin.apiProps;
        this.companiesHouseFiledDocumentGetLambda = companiesHouseFiledDocumentGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseFiledDocumentGetLambdaLogGroup = companiesHouseFiledDocumentGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseFiledDocumentGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House filed accounts document with ingestHandler %s",
                this.companiesHouseFiledDocumentGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseFiledDocumentGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseFiledDocumentGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        var companiesHouseLastAccountsGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("COMPANIES_HOUSE_DOCUMENT_BASE_URI", props.companiesHouseDocumentBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        IntegrationCallAccess.addEnv(
                companiesHouseLastAccountsGetLambdaEnv,
                props.sharedNames().data.integrationCallsTableName,
                props.deploymentName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseLastAccountsGetLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        var companiesHouseLastAccountsGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseLastAccountsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseLastAccountsGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseLastAccountsGetIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseLastAccountsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseLastAccountsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(512)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseLastAccountsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseLastAccountsGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseLastAccountsGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseLastAccountsGetLambdaCustomAuthorizer)
                        .environment(companiesHouseLastAccountsGetLambdaEnv)
                        .build());
        this.companiesHouseLastAccountsGetLambdaProps = companiesHouseLastAccountsGetLambdaUrlOrigin.apiProps;
        this.companiesHouseLastAccountsGetLambda = companiesHouseLastAccountsGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseLastAccountsGetLambdaLogGroup = companiesHouseLastAccountsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseLastAccountsGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House last filed accounts with ingestHandler %s",
                this.companiesHouseLastAccountsGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseLastAccountsGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseLastAccountsGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        var companiesHouseFilingDataPostLambdaEnv =
                xmlGatewayFilingLambdaEnv(props).with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withCodesEntryEnv(companiesHouseFilingDataPostLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        withPresenterSecretArns(companiesHouseFilingDataPostLambdaEnv, props);
        var companiesHouseFilingDataPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().companiesHouse.companiesHouseFilingDataPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseFilingDataPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseFilingDataPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseFilingDataPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFilingDataPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseFilingDataPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseFilingDataPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFilingDataPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFilingDataPostLambdaCustomAuthorizer)
                        .environment(companiesHouseFilingDataPostLambdaEnv)
                        .build());
        this.companiesHouseFilingDataPostLambdaProps = companiesHouseFilingDataPostLambdaUrlOrigin.apiProps;
        this.companiesHouseFilingDataPostLambda = companiesHouseFilingDataPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseFilingDataPostLambdaLogGroup = companiesHouseFilingDataPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseFilingDataPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House confirmation statement filing data with ingestHandler %s",
                this.companiesHouseFilingDataPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseFilingDataPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseFilingDataPostLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseFilingDataPostLambda, props);
        grantCodesEntryAccess(this.companiesHouseFilingDataPostLambda, mcpSessionsTable, codesSealKeySecret);

        var companiesHouseConfirmationStatementRenderPostLambdaEnv =
                xmlGatewayFilingLambdaEnv(props).with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        var companiesHouseConfirmationStatementRenderPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementRenderPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementRenderPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementRenderPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementRenderPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames()
                                        .companiesHouse
                                        .companiesHouseConfirmationStatementRenderPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementRenderPostLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementRenderPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementRenderPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementRenderPostLambdaCustomAuthorizer)
                        .environment(companiesHouseConfirmationStatementRenderPostLambdaEnv)
                        .build());
        this.companiesHouseConfirmationStatementRenderPostLambdaProps =
                companiesHouseConfirmationStatementRenderPostLambdaUrlOrigin.apiProps;
        this.companiesHouseConfirmationStatementRenderPostLambda =
                companiesHouseConfirmationStatementRenderPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseConfirmationStatementRenderPostLambdaLogGroup =
                companiesHouseConfirmationStatementRenderPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseConfirmationStatementRenderPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House confirmation statement render with ingestHandler %s",
                this.companiesHouseConfirmationStatementRenderPostLambda
                        .getNode()
                        .getId(),
                props.sharedNames().companiesHouse.companiesHouseConfirmationStatementRenderPostIngestLambdaHandler);
        // No presenter secret grant: render never reaches the gateway.
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseConfirmationStatementRenderPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);

        var companiesHouseConfirmationStatementPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME", activityChargesTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withCodesEntryEnv(companiesHouseConfirmationStatementPostLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        withPresenterSecretArns(companiesHouseConfirmationStatementPostLambdaEnv, props);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseConfirmationStatementPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        // Scoped to the operator's own company numbers so the waiver never reaches a customer's
        // filing once the activity lists on prod - blank everywhere except .env.prod.
        if (StringUtils.isNotBlank(props.companiesHouseCsFeeWaivedCompanyNumbers())) {
            companiesHouseConfirmationStatementPostLambdaEnv.with(
                    "COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS", props.companiesHouseCsFeeWaivedCompanyNumbers());
        }
        var companiesHouseConfirmationStatementPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementPostLambdaHttpMethod)
                        .urlPath(
                                props.sharedNames().companiesHouse.companiesHouseConfirmationStatementPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementPostLambdaCustomAuthorizer)
                        .environment(companiesHouseConfirmationStatementPostLambdaEnv)
                        .build());
        this.companiesHouseConfirmationStatementPostLambdaProps =
                companiesHouseConfirmationStatementPostLambdaUrlOrigin.apiProps;
        this.companiesHouseConfirmationStatementPostLambda =
                companiesHouseConfirmationStatementPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseConfirmationStatementPostLambdaLogGroup =
                companiesHouseConfirmationStatementPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseConfirmationStatementPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House confirmation statement submit with ingestHandler %s",
                this.companiesHouseConfirmationStatementPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseConfirmationStatementPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseConfirmationStatementPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseConfirmationStatementPostLambda, props);
        grantCodesEntryAccess(this.companiesHouseConfirmationStatementPostLambda, mcpSessionsTable, codesSealKeySecret);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseConfirmationStatementPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        activityChargesTable.grant(
                this.companiesHouseConfirmationStatementPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        var companiesHouseConfirmationStatementGetLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName())
                .with("ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME", activityChargesTable.getTableName())
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseConfirmationStatementGetLambdaEnv, props);
        var companiesHouseConfirmationStatementGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseConfirmationStatementGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseConfirmationStatementGetLambdaCustomAuthorizer)
                        .environment(companiesHouseConfirmationStatementGetLambdaEnv)
                        .build());
        this.companiesHouseConfirmationStatementGetLambdaProps =
                companiesHouseConfirmationStatementGetLambdaUrlOrigin.apiProps;
        this.companiesHouseConfirmationStatementGetLambda =
                companiesHouseConfirmationStatementGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseConfirmationStatementGetLambdaLogGroup =
                companiesHouseConfirmationStatementGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseConfirmationStatementGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House confirmation statement poll with ingestHandler %s",
                this.companiesHouseConfirmationStatementGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseConfirmationStatementGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseConfirmationStatementGetLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseConfirmationStatementGetLambda, props);
        receiptsTable.grant(
                this.companiesHouseConfirmationStatementGetLambda,
                "dynamodb:PutItem",
                "dynamodb:Query",
                "dynamodb:UpdateItem");
        activityChargesTable.grant(this.companiesHouseConfirmationStatementGetLambda, "dynamodb:UpdateItem");
        grantTokenCharge(this.companiesHouseConfirmationStatementGetLambda, bundlesTable);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseConfirmationStatementGetLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        var companiesHousePscVerificationStatementPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHousePscVerificationStatementPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHousePscVerificationStatementPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHousePscVerificationStatementPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHousePscVerificationStatementPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementPostLambdaCustomAuthorizer)
                        .environment(companiesHousePscVerificationStatementPostLambdaEnv)
                        .build());
        this.companiesHousePscVerificationStatementPostLambdaProps =
                companiesHousePscVerificationStatementPostLambdaUrlOrigin.apiProps;
        this.companiesHousePscVerificationStatementPostLambda =
                companiesHousePscVerificationStatementPostLambdaUrlOrigin.ingestLambda;
        this.companiesHousePscVerificationStatementPostLambdaLogGroup =
                companiesHousePscVerificationStatementPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePscVerificationStatementPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House PSC verification statement submit with ingestHandler %s",
                this.companiesHousePscVerificationStatementPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePscVerificationStatementPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHousePscVerificationStatementPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHousePscVerificationStatementPostLambda, props);
        // The filing route writes with UpdateItem and reads nothing back.
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscVerificationStatementPostLambda, "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHousePscVerificationStatementPostLambda);

        var companiesHousePscVerificationStatementGetLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName())
                .with("ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME", activityChargesTable.getTableName())
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHousePscVerificationStatementGetLambdaEnv, props);
        var companiesHousePscVerificationStatementGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscVerificationStatementGetLambdaCustomAuthorizer)
                        .environment(companiesHousePscVerificationStatementGetLambdaEnv)
                        .build());
        this.companiesHousePscVerificationStatementGetLambdaProps =
                companiesHousePscVerificationStatementGetLambdaUrlOrigin.apiProps;
        this.companiesHousePscVerificationStatementGetLambda =
                companiesHousePscVerificationStatementGetLambdaUrlOrigin.ingestLambda;
        this.companiesHousePscVerificationStatementGetLambdaLogGroup =
                companiesHousePscVerificationStatementGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePscVerificationStatementGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House PSC verification statement poll with ingestHandler %s",
                this.companiesHousePscVerificationStatementGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePscVerificationStatementGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHousePscVerificationStatementGetLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHousePscVerificationStatementGetLambda, props);
        receiptsTable.grant(
                this.companiesHousePscVerificationStatementGetLambda,
                "dynamodb:PutItem",
                "dynamodb:Query",
                "dynamodb:UpdateItem");
        grantTokenCharge(this.companiesHousePscVerificationStatementGetLambda, bundlesTable);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscVerificationStatementGetLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        var companiesHousePscCessationPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHousePscCessationPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHousePscCessationPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHousePscCessationPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHousePscCessationPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscCessationPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscCessationPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHousePscCessationPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHousePscCessationPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscCessationPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHousePscCessationPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHousePscCessationPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHousePscCessationPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHousePscCessationPostLambdaCustomAuthorizer)
                        .environment(companiesHousePscCessationPostLambdaEnv)
                        .build());
        this.companiesHousePscCessationPostLambdaProps = companiesHousePscCessationPostLambdaUrlOrigin.apiProps;
        this.companiesHousePscCessationPostLambda = companiesHousePscCessationPostLambdaUrlOrigin.ingestLambda;
        this.companiesHousePscCessationPostLambdaLogGroup = companiesHousePscCessationPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePscCessationPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House PSC cessation submit with ingestHandler %s",
                this.companiesHousePscCessationPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePscCessationPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHousePscCessationPostLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHousePscCessationPostLambda, props);
        // allocateSubmissionNumber, putAsyncRequest and putPendingFiling each write with UpdateItem; the
        // filing route reads nothing back.
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscCessationPostLambda, "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHousePscCessationPostLambda);

        var companiesHousePscChangeDetailsPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHousePscChangeDetailsPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHousePscChangeDetailsPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHousePscChangeDetailsPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHousePscChangeDetailsPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscChangeDetailsPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscChangeDetailsPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscChangeDetailsPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHousePscChangeDetailsPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscChangeDetailsPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(
                                props.sharedNames().companiesHouse.companiesHousePscChangeDetailsPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHousePscChangeDetailsPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscChangeDetailsPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscChangeDetailsPostLambdaCustomAuthorizer)
                        .environment(companiesHousePscChangeDetailsPostLambdaEnv)
                        .build());
        this.companiesHousePscChangeDetailsPostLambdaProps = companiesHousePscChangeDetailsPostLambdaUrlOrigin.apiProps;
        this.companiesHousePscChangeDetailsPostLambda = companiesHousePscChangeDetailsPostLambdaUrlOrigin.ingestLambda;
        this.companiesHousePscChangeDetailsPostLambdaLogGroup =
                companiesHousePscChangeDetailsPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePscChangeDetailsPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House PSC change of details submit with ingestHandler %s",
                this.companiesHousePscChangeDetailsPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePscChangeDetailsPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHousePscChangeDetailsPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHousePscChangeDetailsPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscChangeDetailsPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHousePscChangeDetailsPostLambda);

        var companiesHousePscStatementNotificationPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHousePscStatementNotificationPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHousePscStatementNotificationPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHousePscStatementNotificationPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHousePscStatementNotificationPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementNotificationPostLambdaCustomAuthorizer)
                        .environment(companiesHousePscStatementNotificationPostLambdaEnv)
                        .build());
        this.companiesHousePscStatementNotificationPostLambdaProps =
                companiesHousePscStatementNotificationPostLambdaUrlOrigin.apiProps;
        this.companiesHousePscStatementNotificationPostLambda =
                companiesHousePscStatementNotificationPostLambdaUrlOrigin.ingestLambda;
        this.companiesHousePscStatementNotificationPostLambdaLogGroup =
                companiesHousePscStatementNotificationPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePscStatementNotificationPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House PSC statement submit with ingestHandler %s",
                this.companiesHousePscStatementNotificationPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePscStatementNotificationPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHousePscStatementNotificationPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHousePscStatementNotificationPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscStatementNotificationPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHousePscStatementNotificationPostLambda);

        var companiesHousePscStatementWithdrawalPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHousePscStatementWithdrawalPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHousePscStatementWithdrawalPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHousePscStatementWithdrawalPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHousePscStatementWithdrawalPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscStatementWithdrawalPostLambdaCustomAuthorizer)
                        .environment(companiesHousePscStatementWithdrawalPostLambdaEnv)
                        .build());
        this.companiesHousePscStatementWithdrawalPostLambdaProps =
                companiesHousePscStatementWithdrawalPostLambdaUrlOrigin.apiProps;
        this.companiesHousePscStatementWithdrawalPostLambda =
                companiesHousePscStatementWithdrawalPostLambdaUrlOrigin.ingestLambda;
        this.companiesHousePscStatementWithdrawalPostLambdaLogGroup =
                companiesHousePscStatementWithdrawalPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePscStatementWithdrawalPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House PSC statement withdrawal submit with ingestHandler %s",
                this.companiesHousePscStatementWithdrawalPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePscStatementWithdrawalPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHousePscStatementWithdrawalPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHousePscStatementWithdrawalPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscStatementWithdrawalPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHousePscStatementWithdrawalPostLambda);

        var companiesHousePscNotificationPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHousePscNotificationPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHousePscNotificationPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHousePscNotificationPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHousePscNotificationPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscNotificationPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscNotificationPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHousePscNotificationPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHousePscNotificationPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscNotificationPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(
                                props.sharedNames().companiesHouse.companiesHousePscNotificationPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHousePscNotificationPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHousePscNotificationPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHousePscNotificationPostLambdaCustomAuthorizer)
                        .environment(companiesHousePscNotificationPostLambdaEnv)
                        .build());
        this.companiesHousePscNotificationPostLambdaProps = companiesHousePscNotificationPostLambdaUrlOrigin.apiProps;
        this.companiesHousePscNotificationPostLambda = companiesHousePscNotificationPostLambdaUrlOrigin.ingestLambda;
        this.companiesHousePscNotificationPostLambdaLogGroup =
                companiesHousePscNotificationPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHousePscNotificationPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House PSC notification submit with ingestHandler %s",
                this.companiesHousePscNotificationPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHousePscNotificationPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHousePscNotificationPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHousePscNotificationPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscNotificationPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHousePscNotificationPostLambda);

        // The shared filing route stores no fee charge and no token charge with a filing, so the poll
        // of one needs neither the activity charges table nor the token charge on the bundles table.
        var companiesHouseFormStatusGetLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName())
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseFormStatusGetLambdaEnv, props);
        var companiesHouseFormStatusGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().companiesHouse.companiesHouseFormStatusGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseFormStatusGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseFormStatusGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseFormStatusGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseFormStatusGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseFormStatusGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseFormStatusGetLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFormStatusGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseFormStatusGetLambdaCustomAuthorizer)
                        .environment(companiesHouseFormStatusGetLambdaEnv)
                        .build());
        this.companiesHouseFormStatusGetLambdaProps = companiesHouseFormStatusGetLambdaUrlOrigin.apiProps;
        this.companiesHouseFormStatusGetLambda = companiesHouseFormStatusGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseFormStatusGetLambdaLogGroup = companiesHouseFormStatusGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseFormStatusGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House form poll, every form on the shared filing route, with ingestHandler %s",
                this.companiesHouseFormStatusGetLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseFormStatusGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseFormStatusGetLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseFormStatusGetLambda, props);
        receiptsTable.grant(
                this.companiesHouseFormStatusGetLambda, "dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem");
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseFormStatusGetLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        var companiesHouseAccountingReferenceDatePostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseAccountingReferenceDatePostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseAccountingReferenceDatePostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseAccountingReferenceDatePostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseAccountingReferenceDatePostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostLambdaHttpMethod)
                        .urlPath(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAccountingReferenceDatePostLambdaCustomAuthorizer)
                        .environment(companiesHouseAccountingReferenceDatePostLambdaEnv)
                        .build());
        this.companiesHouseAccountingReferenceDatePostLambdaProps =
                companiesHouseAccountingReferenceDatePostLambdaUrlOrigin.apiProps;
        this.companiesHouseAccountingReferenceDatePostLambda =
                companiesHouseAccountingReferenceDatePostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseAccountingReferenceDatePostLambdaLogGroup =
                companiesHouseAccountingReferenceDatePostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseAccountingReferenceDatePostLambdaProps);
        infof(
                "Created Lambda %s for Companies House change of accounting reference date submit with ingestHandler %s",
                this.companiesHouseAccountingReferenceDatePostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseAccountingReferenceDatePostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAccountingReferenceDatePostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseAccountingReferenceDatePostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseAccountingReferenceDatePostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHouseAccountingReferenceDatePostLambda);

        var companiesHouseOfficerResignationPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseOfficerResignationPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseOfficerResignationPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseOfficerResignationPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseOfficerResignationPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerResignationPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerResignationPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerResignationPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseOfficerResignationPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerResignationPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(
                                props.sharedNames().companiesHouse.companiesHouseOfficerResignationPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseOfficerResignationPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerResignationPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerResignationPostLambdaCustomAuthorizer)
                        .environment(companiesHouseOfficerResignationPostLambdaEnv)
                        .build());
        this.companiesHouseOfficerResignationPostLambdaProps =
                companiesHouseOfficerResignationPostLambdaUrlOrigin.apiProps;
        this.companiesHouseOfficerResignationPostLambda =
                companiesHouseOfficerResignationPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseOfficerResignationPostLambdaLogGroup =
                companiesHouseOfficerResignationPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseOfficerResignationPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House officer resignation submit with ingestHandler %s",
                this.companiesHouseOfficerResignationPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseOfficerResignationPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseOfficerResignationPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseOfficerResignationPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseOfficerResignationPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHouseOfficerResignationPostLambda);

        var companiesHouseSailAddressPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        // The SAIL address is checked against the company's jurisdiction, read once through the
        // Companies House cache on the shared API key.
        companiesHouseSailAddressPostLambdaEnv
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("COMPANIES_HOUSE_CACHE_DYNAMODB_TABLE_NAME", companiesHouseCacheTable.getTableName())
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseSailAddressPostLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        withPresenterSecretArns(companiesHouseSailAddressPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseSailAddressPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseSailAddressPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseSailAddressPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseSailAddressPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseSailAddressPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseSailAddressPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseSailAddressPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseSailAddressPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseSailAddressPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseSailAddressPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseSailAddressPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseSailAddressPostLambdaCustomAuthorizer)
                        .environment(companiesHouseSailAddressPostLambdaEnv)
                        .build());
        this.companiesHouseSailAddressPostLambdaProps = companiesHouseSailAddressPostLambdaUrlOrigin.apiProps;
        this.companiesHouseSailAddressPostLambda = companiesHouseSailAddressPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseSailAddressPostLambdaLogGroup = companiesHouseSailAddressPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseSailAddressPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House SAIL address submit with ingestHandler %s",
                this.companiesHouseSailAddressPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseSailAddressPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseSailAddressPostLambda, bundlesTable, region, account, props, activityBusArn, true);
        companiesHouseCacheTable.grant(
                this.companiesHouseSailAddressPostLambda, "dynamodb:GetItem", "dynamodb:PutItem");
        securityStateTable.grant(
                this.companiesHouseSailAddressPostLambda,
                "dynamodb:UpdateItem",
                "dynamodb:GetItem",
                "dynamodb:PutItem");
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseSailAddressPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseSailAddressPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHouseSailAddressPostLambda);

        var companiesHouseRecordLocationPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseRecordLocationPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseRecordLocationPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseRecordLocationPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseRecordLocationPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRecordLocationPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRecordLocationPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseRecordLocationPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseRecordLocationPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRecordLocationPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseRecordLocationPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseRecordLocationPostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseRecordLocationPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseRecordLocationPostLambdaCustomAuthorizer)
                        .environment(companiesHouseRecordLocationPostLambdaEnv)
                        .build());
        this.companiesHouseRecordLocationPostLambdaProps = companiesHouseRecordLocationPostLambdaUrlOrigin.apiProps;
        this.companiesHouseRecordLocationPostLambda = companiesHouseRecordLocationPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseRecordLocationPostLambdaLogGroup = companiesHouseRecordLocationPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseRecordLocationPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House location of company records submit with ingestHandler %s",
                this.companiesHouseRecordLocationPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseRecordLocationPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseRecordLocationPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseRecordLocationPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseRecordLocationPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHouseRecordLocationPostLambda);

        var companiesHouseChangeOfNamePostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseChangeOfNamePostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseChangeOfNamePostLambdaEnv, codesSealKeySecret);
        companiesHouseChangeOfNamePostLambdaEnv.with(
                "ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME", activityChargesTable.getTableName());
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseChangeOfNamePostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseChangeOfNamePostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseChangeOfNamePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseChangeOfNamePostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseChangeOfNamePostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseChangeOfNamePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseChangeOfNamePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseChangeOfNamePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseChangeOfNamePostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseChangeOfNamePostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseChangeOfNamePostLambdaCustomAuthorizer)
                        .environment(companiesHouseChangeOfNamePostLambdaEnv)
                        .build());
        this.companiesHouseChangeOfNamePostLambdaProps = companiesHouseChangeOfNamePostLambdaUrlOrigin.apiProps;
        this.companiesHouseChangeOfNamePostLambda = companiesHouseChangeOfNamePostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseChangeOfNamePostLambdaLogGroup = companiesHouseChangeOfNamePostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseChangeOfNamePostLambdaProps);
        infof(
                "Created Lambda %s for Companies House change of company name submit with ingestHandler %s",
                this.companiesHouseChangeOfNamePostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseChangeOfNamePostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseChangeOfNamePostLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseChangeOfNamePostLambda, props);
        // The filing route writes with UpdateItem and reads nothing back.
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseChangeOfNamePostLambda, "dynamodb:UpdateItem");
        // Reads the filer's paid charge for the service chosen, and marks it used once the gateway takes the filing.
        activityChargesTable.grant(
                this.companiesHouseChangeOfNamePostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHouseChangeOfNamePostLambda);

        var companiesHouseOfficerAppointmentPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseOfficerAppointmentPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseOfficerAppointmentPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseOfficerAppointmentPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseOfficerAppointmentPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerAppointmentPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerAppointmentPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerAppointmentPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseOfficerAppointmentPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerAppointmentPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(
                                props.sharedNames().companiesHouse.companiesHouseOfficerAppointmentPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseOfficerAppointmentPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerAppointmentPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerAppointmentPostLambdaCustomAuthorizer)
                        .environment(companiesHouseOfficerAppointmentPostLambdaEnv)
                        .build());
        this.companiesHouseOfficerAppointmentPostLambdaProps =
                companiesHouseOfficerAppointmentPostLambdaUrlOrigin.apiProps;
        this.companiesHouseOfficerAppointmentPostLambda =
                companiesHouseOfficerAppointmentPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseOfficerAppointmentPostLambdaLogGroup =
                companiesHouseOfficerAppointmentPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseOfficerAppointmentPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House officer appointment submit with ingestHandler %s",
                this.companiesHouseOfficerAppointmentPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseOfficerAppointmentPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseOfficerAppointmentPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseOfficerAppointmentPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseOfficerAppointmentPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHouseOfficerAppointmentPostLambda);

        var companiesHouseOfficerChangePostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseOfficerChangePostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseOfficerChangePostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseOfficerChangePostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseOfficerChangePostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerChangePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerChangePostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseOfficerChangePostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseOfficerChangePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerChangePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouse.companiesHouseOfficerChangePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseOfficerChangePostLambdaUrlPath)
                        .jwtAuthorizer(
                                props.sharedNames().companiesHouse.companiesHouseOfficerChangePostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseOfficerChangePostLambdaCustomAuthorizer)
                        .environment(companiesHouseOfficerChangePostLambdaEnv)
                        .build());
        this.companiesHouseOfficerChangePostLambdaProps = companiesHouseOfficerChangePostLambdaUrlOrigin.apiProps;
        this.companiesHouseOfficerChangePostLambda = companiesHouseOfficerChangePostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseOfficerChangePostLambdaLogGroup = companiesHouseOfficerChangePostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseOfficerChangePostLambdaProps);
        infof(
                "Created Lambda %s for Companies House officer change of details submit with ingestHandler %s",
                this.companiesHouseOfficerChangePostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseOfficerChangePostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseOfficerChangePostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseOfficerChangePostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseOfficerChangePostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHouseOfficerChangePostLambda);

        var companiesHouseAllotmentOfSharesPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props))
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName());
        withPresenterSecretArns(companiesHouseAllotmentOfSharesPostLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseAllotmentOfSharesPostLambdaEnv, codesSealKeySecret);
        if (xmlGatewayPackageReference(props) != null) {
            companiesHouseAllotmentOfSharesPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", xmlGatewayPackageReference(props));
        }
        var companiesHouseAllotmentOfSharesPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAllotmentOfSharesPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAllotmentOfSharesPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAllotmentOfSharesPostIngestLambdaHandler)
                        .ingestLambdaArn(
                                props.sharedNames().companiesHouse.companiesHouseAllotmentOfSharesPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAllotmentOfSharesPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(
                                props.sharedNames().companiesHouse.companiesHouseAllotmentOfSharesPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouse.companiesHouseAllotmentOfSharesPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAllotmentOfSharesPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames()
                                .companiesHouse
                                .companiesHouseAllotmentOfSharesPostLambdaCustomAuthorizer)
                        .environment(companiesHouseAllotmentOfSharesPostLambdaEnv)
                        .build());
        this.companiesHouseAllotmentOfSharesPostLambdaProps =
                companiesHouseAllotmentOfSharesPostLambdaUrlOrigin.apiProps;
        this.companiesHouseAllotmentOfSharesPostLambda =
                companiesHouseAllotmentOfSharesPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseAllotmentOfSharesPostLambdaLogGroup =
                companiesHouseAllotmentOfSharesPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseAllotmentOfSharesPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House return of allotment of shares submit with ingestHandler %s",
                this.companiesHouseAllotmentOfSharesPostLambda.getNode().getId(),
                props.sharedNames().companiesHouse.companiesHouseAllotmentOfSharesPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAllotmentOfSharesPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseAllotmentOfSharesPostLambda, props);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseAllotmentOfSharesPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Seals the filer's sub into the filing state the presenter poll reads.
        codesSealKeySecret.grantRead(this.companiesHouseAllotmentOfSharesPostLambda);

        // The scheduled presenter poll: asks the XML Gateway for every submission of our presenter
        // that Companies House has accepted or rejected, records each against its filing as the page
        // poll does, then acknowledges the poll (GetSubmissionStatus option 2, then GetStatusAck).
        var companiesHouseSubmissionStatusPollLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName())
                .with("ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME", activityChargesTable.getTableName())
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHouseSubmissionStatusPollLambdaEnv, props);
        withFilerSealKeyEnv(companiesHouseSubmissionStatusPollLambdaEnv, codesSealKeySecret);
        var companiesHouseSubmissionStatusPollLambdaConstruct = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(
                                props.sharedNames().companiesHouse.companiesHouseSubmissionStatusPollLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouse.companiesHouseSubmissionStatusPollLambdaFunctionName)
                        .ingestHandler(
                                props.sharedNames().companiesHouse.companiesHouseSubmissionStatusPollLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouse.companiesHouseSubmissionStatusPollLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouse
                                .companiesHouseSubmissionStatusPollProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestMemorySize(256)
                        .ingestLambdaTimeout(Duration.minutes(2))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(companiesHouseSubmissionStatusPollLambdaEnv)
                        .build());
        this.companiesHouseSubmissionStatusPollLambda = companiesHouseSubmissionStatusPollLambdaConstruct.ingestLambda;
        this.companiesHouseSubmissionStatusPollLambdaLogGroup =
                companiesHouseSubmissionStatusPollLambdaConstruct.logGroup;
        // The salt to hash the filer's sub, PutEvents for the accepted event and the receipt email
        // request, and the bundles Query the token charge reads the filer's bundles with.
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseSubmissionStatusPollLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseSubmissionStatusPollLambda, props);
        codesSealKeySecret.grantRead(this.companiesHouseSubmissionStatusPollLambda);
        receiptsTable.grant(
                this.companiesHouseSubmissionStatusPollLambda,
                "dynamodb:PutItem",
                "dynamodb:Query",
                "dynamodb:UpdateItem");
        activityChargesTable.grant(this.companiesHouseSubmissionStatusPollLambda, "dynamodb:UpdateItem");
        grantTokenCharge(this.companiesHouseSubmissionStatusPollLambda, bundlesTable);
        // Reads the filing state and the filer's request by key, and writes them; no Query, no Scan.
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseSubmissionStatusPollLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Every 15 minutes from 07:00 to 18:45 UTC on weekdays: Companies House checks filings by hand
        // in office hours only, and this window covers office hours in GMT and in BST. The poll slot
        // in the async-requests table keeps the presenter at one poll per 10 minutes or more, however
        // many deployments of the environment share this schedule.
        this.companiesHouseSubmissionStatusPollSchedule = Rule.Builder.create(
                        this,
                        props.sharedNames().companiesHouse.companiesHouseSubmissionStatusPollLambdaFunctionName
                                + "-Schedule")
                .ruleName(props.sharedNames().companiesHouse.companiesHouseSubmissionStatusPollLambdaFunctionName
                        + "-schedule")
                .description("Poll Companies House for filings it has accepted or rejected, in office hours")
                .schedule(Schedule.cron(CronOptions.builder()
                        .minute("0/15")
                        .hour("7-18")
                        .weekDay("MON-FRI")
                        .build()))
                .targets(List.of(LambdaFunction.Builder.create(this.companiesHouseSubmissionStatusPollLambda)
                        .build()))
                .build();
        infof(
                "Created Lambda %s for the Companies House presenter poll with an office-hours schedule",
                this.companiesHouseSubmissionStatusPollLambda.getNode().getId());

        // A poll that records an accepted filing drops the company's cached register answers and marks
        // the acceptance (companiesHouseCacheDrop.js): dynamodb:Query for listCacheKeys,
        // dynamodb:DeleteItem for deleteCacheEntry, dynamodb:PutItem for markAcceptedFiling's marker.
        for (Function recordsAcceptedFiling : List.of(
                this.companiesHouseAccountsGetLambda,
                this.companiesHouseConfirmationStatementGetLambda,
                this.companiesHousePscVerificationStatementGetLambda,
                this.companiesHouseFormStatusGetLambda,
                this.companiesHouseSubmissionStatusPollLambda)) {
            recordsAcceptedFiling.addEnvironment(
                    "COMPANIES_HOUSE_CACHE_DYNAMODB_TABLE_NAME", companiesHouseCacheTable.getTableName());
            companiesHouseCacheTable.grant(
                    recordsAcceptedFiling, "dynamodb:Query", "dynamodb:DeleteItem", "dynamodb:PutItem");
        }

        // A poll that records Companies House's rejection of a filing whose fee the filer paid through
        // Stripe (a change of company name) refunds that payment: it reads the charge, asks Stripe for
        // the refund with the key of the mode it was paid in, and marks the charge refunded.
        for (Function refundsRejectedFee :
                List.of(this.companiesHouseFormStatusGetLambda, this.companiesHouseSubmissionStatusPollLambda)) {
            refundsRejectedFee.addEnvironment(
                    "ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME", activityChargesTable.getTableName());
            activityChargesTable.grant(refundsRejectedFee, "dynamodb:GetItem", "dynamodb:UpdateItem");
            if (!props.stripeSecretKeyArn().isBlank()) {
                refundsRejectedFee.addEnvironment("STRIPE_SECRET_KEY_ARN", props.stripeSecretKeyArn());
                grantSecretRead(refundsRejectedFee, props.stripeSecretKeyArn());
            }
            if (!props.stripeTestSecretKeyArn().isBlank()) {
                refundsRejectedFee.addEnvironment("STRIPE_TEST_SECRET_KEY_ARN", props.stripeTestSecretKeyArn());
                grantSecretRead(refundsRejectedFee, props.stripeTestSecretKeyArn());
            }
        }

        // Each signed-in lookup on the shared Companies House API key charges the account's counter in
        // one update, and reads and writes the stop a Companies House 429 sets; the last accounts
        // Lambda also reads and stores its answer for a filed set.
        for (Function lookup : List.of(
                this.companiesHouseSearchGetLambda,
                this.companiesHouseCompanyGetLambda,
                this.companiesHouseRegisteredOfficeAddressGetLambda,
                this.companiesHouseOfficersGetLambda,
                this.companiesHousePscGetLambda,
                this.companiesHouseFilingHistoryGetLambda,
                this.companiesHouseFiledAccountsGetLambda,
                this.companiesHouseFiledDocumentGetLambda,
                this.companiesHouseCompanyReportGetLambda)) {
            securityStateTable.grant(lookup, "dynamodb:UpdateItem", "dynamodb:GetItem", "dynamodb:PutItem");
        }
        // Each public lookup charges the counter of all public lookups on the same key in one update,
        // and reads and writes the same stop.
        for (Function publicLookup :
                List.of(this.companiesHousePublicDeadlinesGetLambda, this.companiesHousePublicRegisterGetLambda)) {
            securityStateTable.grant(publicLookup, "dynamodb:UpdateItem", "dynamodb:GetItem", "dynamodb:PutItem");
        }
        securityStateTable.grant(
                this.companiesHouseLastAccountsGetLambda,
                "dynamodb:UpdateItem",
                "dynamodb:GetItem",
                "dynamodb:PutItem");
        // The return of allotment reads the register's share capital before it files, and charges that read
        // to the account's share of the lookups in one update, after reading the stop.
        securityStateTable.grant(
                this.companiesHouseAllotmentOfSharesPostLambda, "dynamodb:UpdateItem", "dynamodb:GetItem");

        FphCheckAccess.wireSenders(this, props.sharedNames().hmrc.hmrcFphCheckQueueName, Set.of());

        Lambda.appStackHealthAlarm(
                this,
                props.envName(),
                props.resourceNamePrefix(),
                "companies-house",
                List.of(
                        companiesHouseSearchGetLambdaUrlOrigin,
                        companiesHouseCompanyGetLambdaUrlOrigin,
                        companiesHousePublicDeadlinesGetLambdaUrlOrigin,
                        companiesHousePublicRegisterGetLambdaUrlOrigin,
                        companiesHouseTokenPostLambdaUrlOrigin,
                        companiesHouseTransactionPostLambdaUrlOrigin,
                        companiesHouseTransactionGetLambdaUrlOrigin,
                        companiesHouseTransactionPutLambdaUrlOrigin,
                        companiesHouseRegisteredOfficeAddressGetLambdaUrlOrigin,
                        companiesHouseRegisteredOfficeAddressPostLambdaUrlOrigin,
                        companiesHouseRegisteredEmailEligibilityGetLambdaUrlOrigin,
                        companiesHouseRegisteredEmailAddressPostLambdaUrlOrigin,
                        companiesHouseAccountsRenderPostLambdaUrlOrigin,
                        companiesHouseAccountsPostLambdaUrlOrigin,
                        companiesHouseAccountsGetLambdaUrlOrigin,
                        hmrcCtReturnPreviewPostLambdaUrlOrigin,
                        hmrcCtReturnPostLambdaUrlOrigin,
                        hmrcCtReturnGetLambdaUrlOrigin,
                        hmrcCtReturnStatusCheckLambdaConstruct,
                        companiesHouseOfficersGetLambdaUrlOrigin,
                        companiesHousePscGetLambdaUrlOrigin,
                        companiesHouseFilingHistoryGetLambdaUrlOrigin,
                        companiesHouseCompanyReportGetLambdaUrlOrigin,
                        companiesHouseFiledAccountsGetLambdaUrlOrigin,
                        companiesHouseFiledDocumentGetLambdaUrlOrigin,
                        companiesHouseLastAccountsGetLambdaUrlOrigin,
                        companiesHouseFilingDataPostLambdaUrlOrigin,
                        companiesHouseConfirmationStatementRenderPostLambdaUrlOrigin,
                        companiesHouseConfirmationStatementPostLambdaUrlOrigin,
                        companiesHouseConfirmationStatementGetLambdaUrlOrigin,
                        companiesHousePscVerificationStatementPostLambdaUrlOrigin,
                        companiesHousePscVerificationStatementGetLambdaUrlOrigin,
                        companiesHousePscCessationPostLambdaUrlOrigin,
                        companiesHouseFormStatusGetLambdaUrlOrigin,
                        companiesHouseSubmissionStatusPollLambdaConstruct,
                        companiesHousePscChangeDetailsPostLambdaUrlOrigin,
                        companiesHouseAccountingReferenceDatePostLambdaUrlOrigin,
                        companiesHouseOfficerResignationPostLambdaUrlOrigin,
                        companiesHouseSailAddressPostLambdaUrlOrigin,
                        companiesHouseRecordLocationPostLambdaUrlOrigin,
                        companiesHouseChangeOfNamePostLambdaUrlOrigin,
                        companiesHousePscStatementNotificationPostLambdaUrlOrigin,
                        companiesHousePscStatementWithdrawalPostLambdaUrlOrigin,
                        companiesHousePscNotificationPostLambdaUrlOrigin,
                        companiesHouseOfficerAppointmentPostLambdaUrlOrigin,
                        companiesHouseOfficerChangePostLambdaUrlOrigin,
                        companiesHouseAllotmentOfSharesPostLambdaUrlOrigin));

        cfnOutput(this, "CompaniesHouseSearchGetLambdaArn", this.companiesHouseSearchGetLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseCompanyGetLambdaArn", this.companiesHouseCompanyGetLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseTokenPostLambdaArn", this.companiesHouseTokenPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseTransactionPostLambdaArn",
                this.companiesHouseTransactionPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseTransactionGetLambdaArn",
                this.companiesHouseTransactionGetLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseTransactionPutLambdaArn",
                this.companiesHouseTransactionPutLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseRegisteredOfficeAddressGetLambdaArn",
                this.companiesHouseRegisteredOfficeAddressGetLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseRegisteredOfficeAddressPostLambdaArn",
                this.companiesHouseRegisteredOfficeAddressPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseRegisteredEmailEligibilityGetLambdaArn",
                this.companiesHouseRegisteredEmailEligibilityGetLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseRegisteredEmailAddressPostLambdaArn",
                this.companiesHouseRegisteredEmailAddressPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseAccountsRenderPostLambdaArn",
                this.companiesHouseAccountsRenderPostLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseAccountsPostLambdaArn", this.companiesHouseAccountsPostLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseAccountsGetLambdaArn", this.companiesHouseAccountsGetLambda.getFunctionArn());
        cfnOutput(this, "HmrcCtReturnPreviewPostLambdaArn", this.hmrcCtReturnPreviewPostLambda.getFunctionArn());
        cfnOutput(this, "HmrcCtReturnPostLambdaArn", this.hmrcCtReturnPostLambda.getFunctionArn());
        cfnOutput(this, "HmrcCtReturnGetLambdaArn", this.hmrcCtReturnGetLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseOfficersGetLambdaArn", this.companiesHouseOfficersGetLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHousePscGetLambdaArn", this.companiesHousePscGetLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseFilingDataPostLambdaArn",
                this.companiesHouseFilingDataPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseConfirmationStatementRenderPostLambdaArn",
                this.companiesHouseConfirmationStatementRenderPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseConfirmationStatementPostLambdaArn",
                this.companiesHouseConfirmationStatementPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseConfirmationStatementGetLambdaArn",
                this.companiesHouseConfirmationStatementGetLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHousePscVerificationStatementPostLambdaArn",
                this.companiesHousePscVerificationStatementPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHousePscVerificationStatementGetLambdaArn",
                this.companiesHousePscVerificationStatementGetLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHousePscCessationPostLambdaArn",
                this.companiesHousePscCessationPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHousePscChangeDetailsPostLambdaArn",
                this.companiesHousePscChangeDetailsPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHousePscStatementNotificationPostLambdaArn",
                this.companiesHousePscStatementNotificationPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHousePscStatementWithdrawalPostLambdaArn",
                this.companiesHousePscStatementWithdrawalPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHousePscNotificationPostLambdaArn",
                this.companiesHousePscNotificationPostLambda.getFunctionArn());
        cfnOutput(
                this, "CompaniesHouseFormStatusGetLambdaArn", this.companiesHouseFormStatusGetLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseAccountingReferenceDatePostLambdaArn",
                this.companiesHouseAccountingReferenceDatePostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseOfficerResignationPostLambdaArn",
                this.companiesHouseOfficerResignationPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseSailAddressPostLambdaArn",
                this.companiesHouseSailAddressPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseRecordLocationPostLambdaArn",
                this.companiesHouseRecordLocationPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseChangeOfNamePostLambdaArn",
                this.companiesHouseChangeOfNamePostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseOfficerAppointmentPostLambdaArn",
                this.companiesHouseOfficerAppointmentPostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseOfficerChangePostLambdaArn",
                this.companiesHouseOfficerChangePostLambda.getFunctionArn());
        cfnOutput(
                this,
                "CompaniesHouseAllotmentOfSharesPostLambdaArn",
                this.companiesHouseAllotmentOfSharesPostLambda.getFunctionArn());

        infof(
                "CompaniesHouseStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }

    // grantApiKeyAccess is false for the six OAuth filing Lambdas: they authenticate with the
    // user's Companies House access token, never the API key, so they must not carry
    // secretsmanager:GetSecretValue on the API key ARN even though the stack-level prop is set for
    // the two read routes that need it. Only the registered office address read (the seventh
    // filing route) passes true, matching the two lookup Lambdas above.
    private static void grantCompaniesHouseLambdaAccess(
            Function fn,
            ITable bundlesTable,
            String region,
            String account,
            CompaniesHouseStackProps props,
            String activityBusArn,
            boolean grantApiKeyAccess) {
        // Query reads the caller's bundles; GetItem reads the caller's account settings, which
        // enforceBundles() reads to open an activity to an operator with preview features on.
        bundlesTable.grant(fn, "dynamodb:Query", "dynamodb:GetItem");

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

        // Grant access to the Companies House API key in Secrets Manager
        if (grantApiKeyAccess) {
            grantSecretRead(fn, props.companiesHouseApiKeyArn());
        }
    }

    // The environment a Lambda needs to take a codes entry: the table that holds it and the secret
    // that opens it.
    private static void withCodesEntryEnv(
            PopulatedMap<String, String> env, ITable mcpSessionsTable, ISecret codesSealKeySecret) {
        env.with("MCP_SESSIONS_DYNAMODB_TABLE_NAME", mcpSessionsTable.getTableName())
                .with("MCP_OAUTH_BLOB_KEY_SECRET_ARN", codesSealKeySecret.getSecretArn());
    }

    // The key that seals the filer's sub into a Companies House filing state: the submit Lambdas seal
    // it, the presenter poll opens it.
    private static void withFilerSealKeyEnv(PopulatedMap<String, String> env, ISecret codesSealKeySecret) {
        env.with("MCP_OAUTH_BLOB_KEY_SECRET_ARN", codesSealKeySecret.getSecretArn());
    }

    // chargeTokenOnSuccess reads the filer's bundle and decrements its tokens with a conditional
    // UpdateItem on the bundles table.
    private static void grantTokenCharge(Function fn, ITable bundlesTable) {
        bundlesTable.grant(fn, "dynamodb:GetItem", "dynamodb:UpdateItem");
    }

    // Taking an entry reads it and deletes it, in one conditional delete.
    private static void grantCodesEntryAccess(Function fn, ITable mcpSessionsTable, ISecret codesSealKeySecret) {
        mcpSessionsTable.grant(fn, "dynamodb:DeleteItem");
        codesSealKeySecret.grantRead(fn);
    }

    // A Companies House grant is written once by the token exchange Lambda.
    private static void grantGrantCreate(Function fn, ITable mcpSessionsTable, ISecret codesSealKeySecret) {
        mcpSessionsTable.grant(fn, "dynamodb:PutItem");
        codesSealKeySecret.grantRead(fn);
    }

    // Sign-out deletes a grant: one read to check its owner, then the delete.
    private static void grantGrantDelete(Function fn, ITable mcpSessionsTable) {
        mcpSessionsTable.grant(fn, "dynamodb:GetItem", "dynamodb:DeleteItem");
    }

    // A filing Lambda opens a grant: one read of the item and the sealing key.
    private static void grantGrantRead(Function fn, ITable mcpSessionsTable, ISecret codesSealKeySecret) {
        mcpSessionsTable.grant(fn, "dynamodb:GetItem");
        codesSealKeySecret.grantRead(fn);
    }

    private static void grantSecretRead(Function fn, String secretArn) {
        if (StringUtils.isBlank(secretArn)) {
            return;
        }
        String secretArnWithWildcard = secretArn.endsWith("-*") ? secretArn : secretArn + "-*";
        fn.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(secretArnWithWildcard))
                .build());
        infof(
                "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                fn.getFunctionName(), secretArn, secretArnWithWildcard);
    }

    // Shared environment for the six OAuth filing Lambdas: the bundles table, activity bus and
    // environment name every Companies House Lambda carries, plus the filing base URI, blank
    // until the operator has registered the developer-hub application (and, for prod, until the
    // ci-only gate lifts) - PopulatedMap rejects a blank value outright, so it is set only when
    // configured, the same guard the token Lambda's OAuth settings use above.
    private static PopulatedMap<String, String> filingLambdaEnv(CompaniesHouseStackProps props) {
        var env = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with(IntegrationCallAccess.ENV_NAME, props.sharedNames().data.integrationCallsTableName)
                .with(IntegrationCallAccess.DEPLOYMENT_ENV_NAME, props.deploymentName())
                .with("ENVIRONMENT_NAME", props.envName());
        if (StringUtils.isNotBlank(props.companiesHouseFilingBaseUri())) {
            env.with("COMPANIES_HOUSE_FILING_BASE_URI", props.companiesHouseFilingBaseUri());
        }
        return env;
    }

    // Kept separate from grantCompaniesHouseLambdaAccess rather than adding a boolean flag to it:
    // the token exchange Lambda needs the OAuth client secret and neither the bundles-table grant
    // nor the API key that method conditionally grants, so reusing it here would hand the token
    // Lambda an API key it never calls.
    private static void grantCompaniesHouseTokenLambdaAccess(
            Function fn, String region, String account, CompaniesHouseStackProps props, String activityBusArn) {
        // Grant access to user sub hash salt secret in Secrets Manager
        SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

        // Grant EventBridge PutEvents permission
        fn.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        // Grant access to the Companies House OAuth client secret in Secrets Manager
        if (StringUtils.isNotBlank(props.companiesHouseClientSecretArn())) {
            String secretArnWithWildcard = props.companiesHouseClientSecretArn().endsWith("-*")
                    ? props.companiesHouseClientSecretArn()
                    : props.companiesHouseClientSecretArn() + "-*";
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(secretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                    fn.getFunctionName(), props.companiesHouseClientSecretArn(), secretArnWithWildcard);
        }
    }

    // Shared environment for every Lambda that reaches the XML Gateway (the accounts and
    // confirmation statement render/submit/poll routes, plus the confirmation statement's filing
    // data lookup): the bundles table, activity bus and environment name every Companies House
    // Lambda carries, plus the XML Gateway URI, blank until B34.6b's sandbox proof lands (and, for
    // prod, until the ci-only gate lifts) - PopulatedMap rejects a blank value outright, so it is
    // set only when configured.
    private static PopulatedMap<String, String> xmlGatewayFilingLambdaEnv(CompaniesHouseStackProps props) {
        var env = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with(IntegrationCallAccess.ENV_NAME, props.sharedNames().data.integrationCallsTableName)
                .with(IntegrationCallAccess.DEPLOYMENT_ENV_NAME, props.deploymentName())
                .with("ENVIRONMENT_NAME", props.envName());
        if (StringUtils.isNotBlank(props.companiesHouseXmlGatewayUri())) {
            env.with("COMPANIES_HOUSE_XMLGW_URI", props.companiesHouseXmlGatewayUri());
        }
        return env;
    }

    // Shared environment for the Company Tax Return Lambdas: the bundles table, activity bus and
    // environment name. PopulatedMap rejects a blank value, so optional settings are added only
    // when configured.
    private static PopulatedMap<String, String> hmrcCtLambdaEnv(CompaniesHouseStackProps props) {
        return new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with(IntegrationCallAccess.ENV_NAME, props.sharedNames().data.integrationCallsTableName)
                .with(IntegrationCallAccess.DEPLOYMENT_ENV_NAME, props.deploymentName())
                .with("ENVIRONMENT_NAME", props.envName());
    }

    // Every route that posts an envelope to the gateway (accounts submit/poll, confirmation
    // statement filing data/submit/poll) sets GatewayTest on it while deployed to ci, the only
    // environment that talks to the XML Gateway's test service; every other environment reaches
    // the live gateway and must not set it.
    private static String gatewayTestFlag(CompaniesHouseStackProps props) {
        return XML_GATEWAY_TEST_ENV_NAME.equals(props.envName()) ? "true" : "false";
    }

    private static String xmlGatewayPackageReference(CompaniesHouseStackProps props) {
        if (XML_GATEWAY_TEST_ENV_NAME.equals(props.envName())) return XML_GATEWAY_TEST_PACKAGE_REFERENCE;
        if (XML_GATEWAY_LIVE_ENV_NAME.equals(props.envName())) return XML_GATEWAY_LIVE_PACKAGE_REFERENCE;
        return null;
    }

    // Every route that calls resolvePresenterCredentials() (accounts submit/poll, confirmation
    // statement filing data/submit/poll) calls grantCompaniesHousePresenterSecretsAccess: the two
    // render Lambdas render their form body and never reach the gateway, so neither must carry
    // secretsmanager:GetSecretValue on either presenter secret.
    private static void grantCompaniesHousePresenterSecretsAccess(Function fn, CompaniesHouseStackProps props) {
        grantWildcardSecretAccess(fn, props.companiesHousePresenterIdArn());
        grantWildcardSecretAccess(fn, props.companiesHousePresenterCodeArn());
    }

    // resolvePresenterCredentials() in companiesHouseXmlGateway.js reads the ARNs from
    // COMPANIES_HOUSE_PRESENTER_ID_ARN and COMPANIES_HOUSE_PRESENTER_CODE_ARN; without these the
    // IAM grant above is unreachable. PopulatedMap rejects a blank value outright, so each is set
    // only when configured.
    private static void withPresenterSecretArns(PopulatedMap<String, String> env, CompaniesHouseStackProps props) {
        if (StringUtils.isNotBlank(props.companiesHousePresenterIdArn())) {
            env.with("COMPANIES_HOUSE_PRESENTER_ID_ARN", props.companiesHousePresenterIdArn());
        }
        if (StringUtils.isNotBlank(props.companiesHousePresenterCodeArn())) {
            env.with("COMPANIES_HOUSE_PRESENTER_CODE_ARN", props.companiesHousePresenterCodeArn());
        }
    }

    private static void grantWildcardSecretAccess(Function fn, String secretArn) {
        if (StringUtils.isBlank(secretArn)) {
            return;
        }
        String secretArnWithWildcard = secretArn.endsWith("-*") ? secretArn : secretArn + "-*";
        fn.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(secretArnWithWildcard))
                .build());
        infof(
                "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                fn.getFunctionName(), secretArn, secretArnWithWildcard);
    }
}
