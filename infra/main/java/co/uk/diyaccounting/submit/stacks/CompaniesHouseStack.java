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
import co.uk.diyaccounting.submit.constructs.Lambda;
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
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

/**
 * The read-only Companies House company lookup, plus the OAuth-authorised filing Lambdas, all
 * synchronous with no async worker and no DynamoDB audit table. A separate stack from HmrcStack
 * so a failed synth here never blocks the VAT submission path, and so the Companies House API
 * key and OAuth client secret never widen the HMRC Lambdas' IAM surface.
 */
public class CompaniesHouseStack extends Stack {

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

    public AbstractApiLambdaProps companiesHouseAccountsPreviewPostLambdaProps;
    public Function companiesHouseAccountsPreviewPostLambda;
    public ILogGroup companiesHouseAccountsPreviewPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseAccountsPostLambdaProps;
    public Function companiesHouseAccountsPostLambda;
    public ILogGroup companiesHouseAccountsPostLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseAccountsGetLambdaProps;
    public Function companiesHouseAccountsGetLambda;
    public ILogGroup companiesHouseAccountsGetLambdaLogGroup;

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

        String companiesHouseIdentityBaseUri();

        String companiesHouseClientId();

        String companiesHouseClientSecretArn();

        String companiesHouseXmlGatewayUri();

        String companiesHousePresenterIdArn();

        String companiesHousePresenterCodeArn();

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
                props.sharedNames().bundlesTableName);

        // Lookup existing DynamoDB Receipts Table - only the accounts poll Lambda writes to it,
        // for the accepted filing receipt.
        ITable receiptsTable = Table.fromTableName(
                this,
                "ImportedReceiptsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().receiptsTableName);

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for Secrets Manager access
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activityBusName);

        // Companies House search
        var companiesHouseSearchGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseSearchGetLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }

        var companiesHouseSearchGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseSearchGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseSearchGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseSearchGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseSearchGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().companiesHouseSearchGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseSearchGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseSearchGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseSearchGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseSearchGetLambdaCustomAuthorizer)
                        .environment(companiesHouseSearchGetLambdaEnv)
                        .build());
        this.companiesHouseSearchGetLambdaProps = companiesHouseSearchGetLambdaUrlOrigin.apiProps;
        this.companiesHouseSearchGetLambda = companiesHouseSearchGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseSearchGetLambdaLogGroup = companiesHouseSearchGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseSearchGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House search with ingestHandler %s",
                this.companiesHouseSearchGetLambda.getNode().getId(),
                props.sharedNames().companiesHouseSearchGetIngestLambdaHandler);

        grantCompaniesHouseLambdaAccess(
                this.companiesHouseSearchGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        // Companies House company profile
        var companiesHouseCompanyGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseCompanyGetLambdaEnv.with("COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }

        var companiesHouseCompanyGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseCompanyGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseCompanyGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseCompanyGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseCompanyGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().companiesHouseCompanyGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseCompanyGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseCompanyGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseCompanyGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseCompanyGetLambdaCustomAuthorizer)
                        .environment(companiesHouseCompanyGetLambdaEnv)
                        .build());
        this.companiesHouseCompanyGetLambdaProps = companiesHouseCompanyGetLambdaUrlOrigin.apiProps;
        this.companiesHouseCompanyGetLambda = companiesHouseCompanyGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseCompanyGetLambdaLogGroup = companiesHouseCompanyGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseCompanyGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House company profile with ingestHandler %s",
                this.companiesHouseCompanyGetLambda.getNode().getId(),
                props.sharedNames().companiesHouseCompanyGetIngestLambdaHandler);

        grantCompaniesHouseLambdaAccess(
                this.companiesHouseCompanyGetLambda, bundlesTable, region, account, props, activityBusArn, true);

        // Companies House OAuth token exchange. The identity base URI, client id and client
        // secret ARN are blank until the operator has registered the developer-hub application
        // (and, for prod, until the ci-only gate lifts), so each is set only when configured -
        // PopulatedMap rejects a blank value outright.
        var companiesHouseTokenPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
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
                        .idPrefix(props.sharedNames().companiesHouseTokenPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseTokenPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseTokenPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseTokenPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().companiesHouseTokenPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseTokenPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseTokenPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseTokenPostLambdaCustomAuthorizer)
                        .environment(companiesHouseTokenPostLambdaEnv)
                        .build());
        this.companiesHouseTokenPostLambdaProps = companiesHouseTokenPostLambdaUrlOrigin.apiProps;
        this.companiesHouseTokenPostLambda = companiesHouseTokenPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseTokenPostLambdaLogGroup = companiesHouseTokenPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseTokenPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House token exchange with ingestHandler %s",
                this.companiesHouseTokenPostLambda.getNode().getId(),
                props.sharedNames().companiesHouseTokenPostIngestLambdaHandler);

        // Its own grant, not grantCompaniesHouseLambdaAccess: the token exchange authenticates
        // with the OAuth client secret, not the public data API key, and does not gate on a
        // bundle entitlement (no authorizer runs on this route, so there is no user to check -
        // the same reason HmrcStack's own token exchange Lambda carries no bundles grant).
        grantCompaniesHouseTokenLambdaAccess(this.companiesHouseTokenPostLambda, region, account, props, activityBusArn);

        // The six OAuth filing Lambdas: they carry the user's Companies House access token as a
        // Bearer header (via the custom authorizer, matching the HMRC VAT routes) and call
        // COMPANIES_HOUSE_FILING_BASE_URI, blank until the operator has registered the
        // developer-hub application and, for prod, until the ci-only gate lifts.
        var companiesHouseTransactionPostLambdaEnv = filingLambdaEnv(props);
        var companiesHouseTransactionPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseTransactionPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseTransactionPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseTransactionPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseTransactionPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouseTransactionPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseTransactionPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseTransactionPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseTransactionPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseTransactionPostLambdaCustomAuthorizer)
                        .environment(companiesHouseTransactionPostLambdaEnv)
                        .build());
        this.companiesHouseTransactionPostLambdaProps = companiesHouseTransactionPostLambdaUrlOrigin.apiProps;
        this.companiesHouseTransactionPostLambda = companiesHouseTransactionPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseTransactionPostLambdaLogGroup = companiesHouseTransactionPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseTransactionPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House transaction open with ingestHandler %s",
                this.companiesHouseTransactionPostLambda.getNode().getId(),
                props.sharedNames().companiesHouseTransactionPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseTransactionPostLambda, bundlesTable, region, account, props, activityBusArn, false);

        var companiesHouseTransactionGetLambdaEnv = filingLambdaEnv(props);
        var companiesHouseTransactionGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseTransactionGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseTransactionGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseTransactionGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseTransactionGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouseTransactionGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseTransactionGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseTransactionGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseTransactionGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseTransactionGetLambdaCustomAuthorizer)
                        .environment(companiesHouseTransactionGetLambdaEnv)
                        .build());
        this.companiesHouseTransactionGetLambdaProps = companiesHouseTransactionGetLambdaUrlOrigin.apiProps;
        this.companiesHouseTransactionGetLambda = companiesHouseTransactionGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseTransactionGetLambdaLogGroup = companiesHouseTransactionGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseTransactionGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House transaction get with ingestHandler %s",
                this.companiesHouseTransactionGetLambda.getNode().getId(),
                props.sharedNames().companiesHouseTransactionGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseTransactionGetLambda, bundlesTable, region, account, props, activityBusArn, false);

        var companiesHouseTransactionPutLambdaEnv = filingLambdaEnv(props);
        var companiesHouseTransactionPutLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseTransactionPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseTransactionPutIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseTransactionPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseTransactionPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouseTransactionPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseTransactionPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseTransactionPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseTransactionPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseTransactionPutLambdaCustomAuthorizer)
                        .environment(companiesHouseTransactionPutLambdaEnv)
                        .build());
        this.companiesHouseTransactionPutLambdaProps = companiesHouseTransactionPutLambdaUrlOrigin.apiProps;
        this.companiesHouseTransactionPutLambda = companiesHouseTransactionPutLambdaUrlOrigin.ingestLambda;
        this.companiesHouseTransactionPutLambdaLogGroup = companiesHouseTransactionPutLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseTransactionPutLambdaProps);
        infof(
                "Created Lambda %s for Companies House transaction close with ingestHandler %s",
                this.companiesHouseTransactionPutLambda.getNode().getId(),
                props.sharedNames().companiesHouseTransactionPutIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseTransactionPutLambda, bundlesTable, region, account, props, activityBusArn, false);

        // Registered office address read: the API-key public register client, same setting as
        // the two lookup Lambdas above - it needs no Companies House user token.
        var companiesHouseRegisteredOfficeAddressGetLambdaEnv = new PopulatedMap<String, String>()
                .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            companiesHouseRegisteredOfficeAddressGetLambdaEnv.with(
                    "COMPANIES_HOUSE_API_KEY_ARN", props.companiesHouseApiKeyArn());
        }
        var companiesHouseRegisteredOfficeAddressGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseRegisteredOfficeAddressGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouseRegisteredOfficeAddressGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseRegisteredOfficeAddressGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseRegisteredOfficeAddressGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouseRegisteredOfficeAddressGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseRegisteredOfficeAddressGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseRegisteredOfficeAddressGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseRegisteredOfficeAddressGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouseRegisteredOfficeAddressGetLambdaCustomAuthorizer)
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
                props.sharedNames().companiesHouseRegisteredOfficeAddressGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseRegisteredOfficeAddressGetLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                true);

        var companiesHouseRegisteredOfficeAddressPostLambdaEnv = filingLambdaEnv(props);
        var companiesHouseRegisteredOfficeAddressPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseRegisteredOfficeAddressPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouseRegisteredOfficeAddressPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseRegisteredOfficeAddressPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseRegisteredOfficeAddressPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouseRegisteredOfficeAddressPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseRegisteredOfficeAddressPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseRegisteredOfficeAddressPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseRegisteredOfficeAddressPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouseRegisteredOfficeAddressPostLambdaCustomAuthorizer)
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
                props.sharedNames().companiesHouseRegisteredOfficeAddressPostIngestLambdaHandler);
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
                        .idPrefix(props.sharedNames().companiesHouseRegisteredEmailEligibilityGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouseRegisteredEmailEligibilityGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseRegisteredEmailEligibilityGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseRegisteredEmailEligibilityGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouseRegisteredEmailEligibilityGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseRegisteredEmailEligibilityGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseRegisteredEmailEligibilityGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseRegisteredEmailEligibilityGetLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouseRegisteredEmailEligibilityGetLambdaCustomAuthorizer)
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
                props.sharedNames().companiesHouseRegisteredEmailEligibilityGetIngestLambdaHandler);
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
                        .idPrefix(props.sharedNames().companiesHouseRegisteredEmailAddressPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().companiesHouseRegisteredEmailAddressPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseRegisteredEmailAddressPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseRegisteredEmailAddressPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouseRegisteredEmailAddressPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseRegisteredEmailAddressPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseRegisteredEmailAddressPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseRegisteredEmailAddressPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().companiesHouseRegisteredEmailAddressPostLambdaCustomAuthorizer)
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
                props.sharedNames().companiesHouseRegisteredEmailAddressPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseRegisteredEmailAddressPostLambda,
                bundlesTable,
                region,
                account,
                props,
                activityBusArn,
                false);

        // The accounts filing route: preview renders the iXBRL only, the other two reach the XML
        // Gateway with the presenter credentials, never the OAuth filing base URI or client secret
        // the six Lambdas above use.
        var companiesHouseAccountsPreviewPostLambdaEnv = accountsFilingLambdaEnv(props);
        var companiesHouseAccountsPreviewPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseAccountsPreviewPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseAccountsPreviewPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseAccountsPreviewPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseAccountsPreviewPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .companiesHouseAccountsPreviewPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseAccountsPreviewPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseAccountsPreviewPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseAccountsPreviewPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseAccountsPreviewPostLambdaCustomAuthorizer)
                        .environment(companiesHouseAccountsPreviewPostLambdaEnv)
                        .build());
        this.companiesHouseAccountsPreviewPostLambdaProps = companiesHouseAccountsPreviewPostLambdaUrlOrigin.apiProps;
        this.companiesHouseAccountsPreviewPostLambda = companiesHouseAccountsPreviewPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseAccountsPreviewPostLambdaLogGroup = companiesHouseAccountsPreviewPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseAccountsPreviewPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House accounts preview with ingestHandler %s",
                this.companiesHouseAccountsPreviewPostLambda.getNode().getId(),
                props.sharedNames().companiesHouseAccountsPreviewPostIngestLambdaHandler);
        // No presenter secret grant: preview never reaches the gateway.
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAccountsPreviewPostLambda, bundlesTable, region, account, props, activityBusArn, false);

        var companiesHouseAccountsPostLambdaEnv = accountsFilingLambdaEnv(props);
        var companiesHouseAccountsPostLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseAccountsPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseAccountsPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseAccountsPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseAccountsPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().companiesHouseAccountsPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseAccountsPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseAccountsPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseAccountsPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseAccountsPostLambdaCustomAuthorizer)
                        .environment(companiesHouseAccountsPostLambdaEnv)
                        .build());
        this.companiesHouseAccountsPostLambdaProps = companiesHouseAccountsPostLambdaUrlOrigin.apiProps;
        this.companiesHouseAccountsPostLambda = companiesHouseAccountsPostLambdaUrlOrigin.ingestLambda;
        this.companiesHouseAccountsPostLambdaLogGroup = companiesHouseAccountsPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseAccountsPostLambdaProps);
        infof(
                "Created Lambda %s for Companies House accounts submit with ingestHandler %s",
                this.companiesHouseAccountsPostLambda.getNode().getId(),
                props.sharedNames().companiesHouseAccountsPostIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAccountsPostLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseAccountsPostLambda, props);

        var companiesHouseAccountsGetLambdaEnv =
                accountsFilingLambdaEnv(props).with("RECEIPTS_DYNAMODB_TABLE_NAME", receiptsTable.getTableName());
        var companiesHouseAccountsGetLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().companiesHouseAccountsGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().companiesHouseAccountsGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().companiesHouseAccountsGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().companiesHouseAccountsGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().companiesHouseAccountsGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().companiesHouseAccountsGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().companiesHouseAccountsGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().companiesHouseAccountsGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().companiesHouseAccountsGetLambdaCustomAuthorizer)
                        .environment(companiesHouseAccountsGetLambdaEnv)
                        .build());
        this.companiesHouseAccountsGetLambdaProps = companiesHouseAccountsGetLambdaUrlOrigin.apiProps;
        this.companiesHouseAccountsGetLambda = companiesHouseAccountsGetLambdaUrlOrigin.ingestLambda;
        this.companiesHouseAccountsGetLambdaLogGroup = companiesHouseAccountsGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.companiesHouseAccountsGetLambdaProps);
        infof(
                "Created Lambda %s for Companies House accounts poll with ingestHandler %s",
                this.companiesHouseAccountsGetLambda.getNode().getId(),
                props.sharedNames().companiesHouseAccountsGetIngestLambdaHandler);
        grantCompaniesHouseLambdaAccess(
                this.companiesHouseAccountsGetLambda, bundlesTable, region, account, props, activityBusArn, false);
        grantCompaniesHousePresenterSecretsAccess(this.companiesHouseAccountsGetLambda, props);
        receiptsTable.grant(this.companiesHouseAccountsGetLambda, "dynamodb:PutItem");

        Lambda.stackHealthAlarm(
                this,
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
                        companiesHouseAccountsPreviewPostLambdaUrlOrigin,
                        companiesHouseAccountsPostLambdaUrlOrigin,
                        companiesHouseAccountsGetLambdaUrlOrigin));

        cfnOutput(this, "CompaniesHouseSearchGetLambdaArn", this.companiesHouseSearchGetLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseCompanyGetLambdaArn", this.companiesHouseCompanyGetLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseTokenPostLambdaArn", this.companiesHouseTokenPostLambda.getFunctionArn());
        cfnOutput(
                this, "CompaniesHouseTransactionPostLambdaArn", this.companiesHouseTransactionPostLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseTransactionGetLambdaArn", this.companiesHouseTransactionGetLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseTransactionPutLambdaArn", this.companiesHouseTransactionPutLambda.getFunctionArn());
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
                "CompaniesHouseAccountsPreviewPostLambdaArn",
                this.companiesHouseAccountsPreviewPostLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseAccountsPostLambdaArn", this.companiesHouseAccountsPostLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseAccountsGetLambdaArn", this.companiesHouseAccountsGetLambda.getFunctionArn());

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

        // Grant EventBridge PutEvents permission
        fn.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        // Grant access to the Companies House API key in Secrets Manager
        if (grantApiKeyAccess && StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
            String secretArnWithWildcard = props.companiesHouseApiKeyArn().endsWith("-*")
                    ? props.companiesHouseApiKeyArn()
                    : props.companiesHouseApiKeyArn() + "-*";
            fn.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(secretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for secret %s (with wildcard: %s)",
                    fn.getFunctionName(), props.companiesHouseApiKeyArn(), secretArnWithWildcard);
        }
    }

    // Shared environment for the six OAuth filing Lambdas: the bundles table, activity bus and
    // environment name every Companies House Lambda carries, plus the filing base URI, blank
    // until the operator has registered the developer-hub application (and, for prod, until the
    // ci-only gate lifts) - PopulatedMap rejects a blank value outright, so it is set only when
    // configured, the same guard the token Lambda's OAuth settings use above.
    private static PopulatedMap<String, String> filingLambdaEnv(CompaniesHouseStackProps props) {
        var env = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
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

    // Shared environment for the three accounts filing Lambdas: the bundles table, activity bus
    // and environment name every Companies House Lambda carries, plus the XML Gateway URI, blank
    // until B34.6b's sandbox proof lands (and, for prod, until the ci-only gate lifts) -
    // PopulatedMap rejects a blank value outright, so it is set only when configured.
    private static PopulatedMap<String, String> accountsFilingLambdaEnv(CompaniesHouseStackProps props) {
        var env = new PopulatedMap<String, String>()
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (StringUtils.isNotBlank(props.companiesHouseXmlGatewayUri())) {
            env.with("COMPANIES_HOUSE_XMLGW_URI", props.companiesHouseXmlGatewayUri());
        }
        return env;
    }

    // Only the submit and poll Lambdas call grantCompaniesHousePresenterSecretsAccess: the preview
    // Lambda renders the iXBRL and never reaches the gateway, so it must not carry
    // secretsmanager:GetSecretValue on either presenter secret.
    private static void grantCompaniesHousePresenterSecretsAccess(Function fn, CompaniesHouseStackProps props) {
        grantWildcardSecretAccess(fn, props.companiesHousePresenterIdArn());
        grantWildcardSecretAccess(fn, props.companiesHousePresenterCodeArn());
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
