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
 * Read-only Companies House company lookup: two synchronous Lambdas, no async worker, no
 * DynamoDB audit table. A separate stack from HmrcStack so a failed synth here never blocks the
 * VAT submission path, and so the Companies House API key never widens the HMRC Lambdas' IAM
 * surface.
 */
public class CompaniesHouseStack extends Stack {

    public AbstractApiLambdaProps companiesHouseSearchGetLambdaProps;
    public Function companiesHouseSearchGetLambda;
    public ILogGroup companiesHouseSearchGetLambdaLogGroup;

    public AbstractApiLambdaProps companiesHouseCompanyGetLambdaProps;
    public Function companiesHouseCompanyGetLambda;
    public ILogGroup companiesHouseCompanyGetLambdaLogGroup;

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
                this.companiesHouseSearchGetLambda, bundlesTable, region, account, props, activityBusArn);

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
                this.companiesHouseCompanyGetLambda, bundlesTable, region, account, props, activityBusArn);

        Lambda.stackHealthAlarm(
                this,
                props.resourceNamePrefix(),
                "companies-house",
                List.of(companiesHouseSearchGetLambdaUrlOrigin, companiesHouseCompanyGetLambdaUrlOrigin));

        cfnOutput(this, "CompaniesHouseSearchGetLambdaArn", this.companiesHouseSearchGetLambda.getFunctionArn());
        cfnOutput(this, "CompaniesHouseCompanyGetLambdaArn", this.companiesHouseCompanyGetLambda.getFunctionArn());

        infof(
                "CompaniesHouseStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }

    private static void grantCompaniesHouseLambdaAccess(
            Function fn,
            ITable bundlesTable,
            String region,
            String account,
            CompaniesHouseStackProps props,
            String activityBusArn) {
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
        if (StringUtils.isNotBlank(props.companiesHouseApiKeyArn())) {
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
}
