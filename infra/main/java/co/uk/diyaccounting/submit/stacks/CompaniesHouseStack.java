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
import co.uk.diyaccounting.submit.utils.OperatorEmailsHelper;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
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
    // deployment environment that talks to the test service; the reference below is the one
    // Companies House's XML team issued for it. The live reference is not yet known, so it stays
    // unset for every other environment - the accounts Lambda's own validateEnv() then fails the
    // deployment's first filing attempt loudly rather than let one go out with a blank one.
    private static final String XML_GATEWAY_TEST_ENV_NAME = "ci";
    private static final String XML_GATEWAY_TEST_PACKAGE_REFERENCE = "0012";

    public AbstractApiLambdaProps companiesHouseSearchGetLambdaProps;
    public Function companiesHouseSearchGetLambda;
    public ILogGroup companiesHouseSearchGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseCompanyGetLambdaProps;
    public Function companiesHouseCompanyGetLambda;
    public ILogGroup companiesHouseCompanyGetLambdaLogGroup;

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

    public AbstractApiLambdaProps hmrcCtReturnPreviewPostLambdaProps;
    public Function hmrcCtReturnPreviewPostLambda;
    public ILogGroup hmrcCtReturnPreviewPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcCtReturnPostLambdaProps;
    public Function hmrcCtReturnPostLambda;
    public ILogGroup hmrcCtReturnPostLambdaLogGroup;

    public AbstractApiLambdaProps hmrcCtReturnGetLambdaProps;
    public Function hmrcCtReturnGetLambda;
    public ILogGroup hmrcCtReturnGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseOfficersGetLambdaProps;
    public Function companiesHouseOfficersGetLambda;
    public ILogGroup companiesHouseOfficersGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHousePscGetLambdaProps;
    public Function companiesHousePscGetLambda;
    public ILogGroup companiesHousePscGetLambdaLogGroup;

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

        String companiesHousePresenterIdArn();

        String companiesHousePresenterCodeArn();

        String companiesHouseCsFeeWaivedCompanyNumbers();

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
        // submission (activityCharges.js).
        ITable activityChargesTable = Table.fromTableName(
                this,
                "ImportedActivityChargesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.activityChargesTableName);

        // Lookup existing DynamoDB MCP sessions table and the key that seals the codes held in it:
        // the three Lambdas that read the codes a user typed on the codes page take their entry
        // from this table, once, and open it with this key.
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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
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

        // Companies House OAuth token exchange. The identity base URI, client id and client
        // secret ARN are blank until the operator has registered the developer-hub application
        // (and, for prod, until the ci-only gate lifts), so each is set only when configured -
        // PopulatedMap rejects a blank value outright.
        var companiesHouseTokenPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
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

        // The six OAuth filing Lambdas: they carry the user's Companies House access token as a
        // Bearer header (via the custom authorizer, matching the HMRC VAT routes) and call
        // COMPANIES_HOUSE_FILING_BASE_URI, blank until the operator has registered the
        // developer-hub application and, for prod, until the ci-only gate lifts.
        var companiesHouseTransactionPostLambdaEnv = filingLambdaEnv(props);
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

        var companiesHouseTransactionGetLambdaEnv = filingLambdaEnv(props);
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

        var companiesHouseTransactionPutLambdaEnv = filingLambdaEnv(props);
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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
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

        var companiesHouseRegisteredEmailEligibilityGetLambdaEnv = filingLambdaEnv(props);
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

        var companiesHouseRegisteredEmailAddressPostLambdaEnv = filingLambdaEnv(props);
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

        // The accounts filing route: render produces the iXBRL only, the other two reach the XML
        // Gateway with the presenter credentials, never the OAuth filing base URI or client secret
        // the six Lambdas above use.
        var companiesHouseAccountsRenderPostLambdaEnv = xmlGatewayFilingLambdaEnv(props);
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
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withCodesEntryEnv(companiesHouseAccountsPostLambdaEnv, mcpSessionsTable, codesSealKeySecret);
        withPresenterSecretArns(companiesHouseAccountsPostLambdaEnv, props);
        if (XML_GATEWAY_TEST_ENV_NAME.equals(props.envName())) {
            companiesHouseAccountsPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", XML_GATEWAY_TEST_PACKAGE_REFERENCE);
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
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAccountsPostLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseAccountsPostLambda, props);
        grantCodesEntryAccess(this.companiesHouseAccountsPostLambda, mcpSessionsTable, codesSealKeySecret);
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseAccountsPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");
        // Read-only: resolves a client-scoped request's client row when enforceBundles checks it.
        practiceClientsTable.grant(this.companiesHouseAccountsPostLambda, "dynamodb:GetItem");

        var companiesHouseAccountsGetLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName())
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
        receiptsTable.grant(this.companiesHouseAccountsGetLambda, "dynamodb:PutItem");
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
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.hmrcCtReturnPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        var hmrcCtReturnGetLambdaEnv = hmrcCtLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName());
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
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.hmrcCtReturnGetLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        // The confirmation statement route: two public-data lookups (officers, PSCs - the API-key
        // client, same setting as the two company lookup Lambdas above), a synchronous filing-data
        // read (CompanyDataRequest and PaymentPeriodsRequest, through the gateway with the
        // presenter credentials), and the render/submit/poll trio the accounts route's own async
        // pattern already established, sharing its async-requests table so one submission number
        // space serves every form.
        var companiesHouseOfficersGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
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
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().data.bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
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

        var companiesHouseConfirmationStatementRenderPostLambdaEnv = xmlGatewayFilingLambdaEnv(props);
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
        if (XML_GATEWAY_TEST_ENV_NAME.equals(props.envName())) {
            companiesHouseConfirmationStatementPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", XML_GATEWAY_TEST_PACKAGE_REFERENCE);
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
        receiptsTable.grant(this.companiesHouseConfirmationStatementGetLambda, "dynamodb:PutItem");
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHouseConfirmationStatementGetLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        var companiesHousePscVerificationStatementPostLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with(
                        "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
                        companiesHouseAccountsAsyncRequestsTable.getTableName())
                .with("COMPANIES_HOUSE_GATEWAY_TEST", gatewayTestFlag(props));
        withPresenterSecretArns(companiesHousePscVerificationStatementPostLambdaEnv, props);
        if (XML_GATEWAY_TEST_ENV_NAME.equals(props.envName())) {
            companiesHousePscVerificationStatementPostLambdaEnv.with(
                    "COMPANIES_HOUSE_PACKAGE_REFERENCE", XML_GATEWAY_TEST_PACKAGE_REFERENCE);
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
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscVerificationStatementPostLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        var companiesHousePscVerificationStatementGetLambdaEnv = xmlGatewayFilingLambdaEnv(props)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName())
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
        receiptsTable.grant(this.companiesHousePscVerificationStatementGetLambda, "dynamodb:PutItem");
        companiesHouseAccountsAsyncRequestsTable.grant(
                this.companiesHousePscVerificationStatementGetLambda, "dynamodb:GetItem", "dynamodb:UpdateItem");

        Lambda.appStackHealthAlarm(
                this,
                props.envName(),
                props.resourceNamePrefix(),
                "companies-house",
                List.of(
                        companiesHouseSearchGetLambdaUrlOrigin,
                        companiesHouseCompanyGetLambdaUrlOrigin,
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
                        companiesHouseOfficersGetLambdaUrlOrigin,
                        companiesHousePscGetLambdaUrlOrigin,
                        companiesHouseFilingDataPostLambdaUrlOrigin,
                        companiesHouseConfirmationStatementRenderPostLambdaUrlOrigin,
                        companiesHouseConfirmationStatementPostLambdaUrlOrigin,
                        companiesHouseConfirmationStatementGetLambdaUrlOrigin,
                        companiesHousePscVerificationStatementPostLambdaUrlOrigin,
                        companiesHousePscVerificationStatementGetLambdaUrlOrigin));

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
        bundlesTable.grant(fn, "dynamodb:Query");

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

    // Taking an entry reads it and deletes it, in one conditional delete.
    private static void grantCodesEntryAccess(Function fn, ITable mcpSessionsTable, ISecret codesSealKeySecret) {
        mcpSessionsTable.grant(fn, "dynamodb:DeleteItem");
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
                .with("ENVIRONMENT_NAME", props.envName());
    }

    // Every route that posts an envelope to the gateway (accounts submit/poll, confirmation
    // statement filing data/submit/poll) sets GatewayTest on it while deployed to ci, the only
    // environment that talks to the XML Gateway's test service; every other environment reaches
    // the live gateway and must not set it.
    private static String gatewayTestFlag(CompaniesHouseStackProps props) {
        return XML_GATEWAY_TEST_ENV_NAME.equals(props.envName()) ? "true" : "false";
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
    // IAM grant above is unreachable. Blank until B34.6b's sandbox proof lands, same as the XML
    // Gateway URI - PopulatedMap rejects a blank value outright, so each is set only when configured.
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
