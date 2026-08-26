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
import software.constructs.Construct;

public class BillingStack extends Stack {

    public AbstractApiLambdaProps billingCheckoutPostLambdaProps;
    public Function billingCheckoutPostLambda;
    public ILogGroup billingCheckoutPostLambdaLogGroup;

    public AbstractApiLambdaProps billingPortalGetLambdaProps;
    public Function billingPortalGetLambda;
    public ILogGroup billingPortalGetLambdaLogGroup;

    public AbstractApiLambdaProps billingRecoverPostLambdaProps;
    public Function billingRecoverPostLambda;
    public ILogGroup billingRecoverPostLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface BillingStackProps extends StackProps, SubmitStackProps {

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

        @Value.Default
        default String stripeSecretKeyArn() {
            return "";
        }

        @Value.Default
        default String stripePriceIdResidentPro() {
            return "";
        }

        @Value.Default
        default String stripeTestSecretKeyArn() {
            return "";
        }

        @Value.Default
        default String stripeTestPriceIdResidentPro() {
            return "";
        }

        @Value.Default
        default String baseUrl() {
            return "";
        }

        @Value.Default
        default String stripePriceIdResidentVat() {
            return "";
        }

        @Value.Default
        default String stripeTestPriceIdResidentVat() {
            return "";
        }

        static ImmutableBillingStackProps.Builder builder() {
            return ImmutableBillingStackProps.builder();
        }
    }

    public BillingStack(Construct scope, String id, BillingStackProps props) {
        this(scope, id, null, props);
    }

    public BillingStack(Construct scope, String id, StackProps stackProps, BillingStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing DynamoDB Subscriptions Table
        ITable subscriptionsTable = Table.fromTableName(
                this,
                "ImportedSubscriptionsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().subscriptionsTableName);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for IAM policies
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activityBusName);

        // ============================================================================
        // Billing Checkout POST Lambda (JWT auth)
        // ============================================================================
        var billingCheckoutPostLambdaEnv = new PopulatedMap<String, String>()
                .with("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME", subscriptionsTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.stripeSecretKeyArn() != null && !props.stripeSecretKeyArn().isBlank()) {
            billingCheckoutPostLambdaEnv.with("STRIPE_SECRET_KEY_ARN", props.stripeSecretKeyArn());
        }
        if (props.stripeTestSecretKeyArn() != null
                && !props.stripeTestSecretKeyArn().isBlank()) {
            billingCheckoutPostLambdaEnv.with("STRIPE_TEST_SECRET_KEY_ARN", props.stripeTestSecretKeyArn());
        }
        if (props.stripePriceIdResidentPro() != null
                && !props.stripePriceIdResidentPro().isBlank()) {
            billingCheckoutPostLambdaEnv.with("STRIPE_PRICE_ID_RESIDENT_PRO", props.stripePriceIdResidentPro());
        }
        if (props.stripeTestPriceIdResidentPro() != null
                && !props.stripeTestPriceIdResidentPro().isBlank()) {
            billingCheckoutPostLambdaEnv.with(
                    "STRIPE_TEST_PRICE_ID_RESIDENT_PRO", props.stripeTestPriceIdResidentPro());
        }
        if (props.stripePriceIdResidentVat() != null
                && !props.stripePriceIdResidentVat().isBlank()) {
            billingCheckoutPostLambdaEnv.with("STRIPE_PRICE_ID_RESIDENT_VAT", props.stripePriceIdResidentVat());
        }
        if (props.stripeTestPriceIdResidentVat() != null
                && !props.stripeTestPriceIdResidentVat().isBlank()) {
            billingCheckoutPostLambdaEnv.with(
                    "STRIPE_TEST_PRICE_ID_RESIDENT_VAT", props.stripeTestPriceIdResidentVat());
        }
        if (props.baseUrl() != null && !props.baseUrl().isBlank()) {
            billingCheckoutPostLambdaEnv.with("DIY_SUBMIT_BASE_URL", props.baseUrl());
        }
        var billingCheckoutPostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().billingCheckoutPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().billingCheckoutPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().billingCheckoutPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().billingCheckoutPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().billingCheckoutPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().billingCheckoutPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().billingCheckoutPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().billingCheckoutPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().billingCheckoutPostLambdaCustomAuthorizer)
                        .environment(billingCheckoutPostLambdaEnv)
                        .build());
        this.billingCheckoutPostLambdaProps = billingCheckoutPostApiLambda.apiProps;
        this.billingCheckoutPostLambda = billingCheckoutPostApiLambda.ingestLambda;
        this.billingCheckoutPostLambdaLogGroup = billingCheckoutPostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.billingCheckoutPostLambdaProps);
        subscriptionsTable.grantReadWriteData(this.billingCheckoutPostLambda);
        bundlesTable.grant(this.billingCheckoutPostLambda, "dynamodb:Query");
        SubHashSaltHelper.grantSaltAccess(this.billingCheckoutPostLambda, region, account, props.envName());
        this.billingCheckoutPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        if (props.stripeSecretKeyArn() != null && !props.stripeSecretKeyArn().isBlank()) {
            var stripeSecretArnWithWildcard = props.stripeSecretKeyArn().endsWith("*")
                    ? props.stripeSecretKeyArn()
                    : props.stripeSecretKeyArn() + "-*";
            this.billingCheckoutPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(stripeSecretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for Stripe secret %s",
                    this.billingCheckoutPostLambda.getFunctionName(), props.stripeSecretKeyArn());
        }
        if (props.stripeTestSecretKeyArn() != null
                && !props.stripeTestSecretKeyArn().isBlank()) {
            var stripeTestSecretArnWithWildcard = props.stripeTestSecretKeyArn().endsWith("*")
                    ? props.stripeTestSecretKeyArn()
                    : props.stripeTestSecretKeyArn() + "-*";
            this.billingCheckoutPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(stripeTestSecretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for Stripe test secret %s",
                    this.billingCheckoutPostLambda.getFunctionName(), props.stripeTestSecretKeyArn());
        }
        infof(
                "Created Billing Checkout POST Lambda %s",
                this.billingCheckoutPostLambda.getNode().getId());

        // ============================================================================
        // Billing Portal GET Lambda (JWT auth)
        // ============================================================================
        var billingPortalGetLambdaEnv = new PopulatedMap<String, String>()
                .with("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME", subscriptionsTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.stripeSecretKeyArn() != null && !props.stripeSecretKeyArn().isBlank()) {
            billingPortalGetLambdaEnv.with("STRIPE_SECRET_KEY_ARN", props.stripeSecretKeyArn());
        }
        if (props.stripeTestSecretKeyArn() != null
                && !props.stripeTestSecretKeyArn().isBlank()) {
            billingPortalGetLambdaEnv.with("STRIPE_TEST_SECRET_KEY_ARN", props.stripeTestSecretKeyArn());
        }
        if (props.baseUrl() != null && !props.baseUrl().isBlank()) {
            billingPortalGetLambdaEnv.with("DIY_SUBMIT_BASE_URL", props.baseUrl());
        }
        var billingPortalGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().billingPortalGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().billingPortalGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().billingPortalGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().billingPortalGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().billingPortalGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().billingPortalGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().billingPortalGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().billingPortalGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().billingPortalGetLambdaCustomAuthorizer)
                        .environment(billingPortalGetLambdaEnv)
                        .build());
        this.billingPortalGetLambdaProps = billingPortalGetApiLambda.apiProps;
        this.billingPortalGetLambda = billingPortalGetApiLambda.ingestLambda;
        this.billingPortalGetLambdaLogGroup = billingPortalGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.billingPortalGetLambdaProps);
        subscriptionsTable.grantReadData(this.billingPortalGetLambda);
        bundlesTable.grant(this.billingPortalGetLambda, "dynamodb:Query");
        SubHashSaltHelper.grantSaltAccess(this.billingPortalGetLambda, region, account, props.envName());
        this.billingPortalGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        if (props.stripeSecretKeyArn() != null && !props.stripeSecretKeyArn().isBlank()) {
            var stripeSecretArnWithWildcard = props.stripeSecretKeyArn().endsWith("*")
                    ? props.stripeSecretKeyArn()
                    : props.stripeSecretKeyArn() + "-*";
            this.billingPortalGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(stripeSecretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for Stripe secret %s",
                    this.billingPortalGetLambda.getFunctionName(), props.stripeSecretKeyArn());
        }
        if (props.stripeTestSecretKeyArn() != null
                && !props.stripeTestSecretKeyArn().isBlank()) {
            var stripeTestSecretArnWithWildcard = props.stripeTestSecretKeyArn().endsWith("*")
                    ? props.stripeTestSecretKeyArn()
                    : props.stripeTestSecretKeyArn() + "-*";
            this.billingPortalGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(stripeTestSecretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for Stripe test secret %s",
                    this.billingPortalGetLambda.getFunctionName(), props.stripeTestSecretKeyArn());
        }
        infof(
                "Created Billing Portal GET Lambda %s",
                this.billingPortalGetLambda.getNode().getId());

        // ============================================================================
        // Billing Recover POST Lambda (JWT auth)
        // ============================================================================
        var billingRecoverPostLambdaEnv = new PopulatedMap<String, String>()
                .with("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME", subscriptionsTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var billingRecoverPostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().billingRecoverPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().billingRecoverPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().billingRecoverPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().billingRecoverPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().billingRecoverPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().billingRecoverPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().billingRecoverPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().billingRecoverPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().billingRecoverPostLambdaCustomAuthorizer)
                        .environment(billingRecoverPostLambdaEnv)
                        .build());
        this.billingRecoverPostLambdaProps = billingRecoverPostApiLambda.apiProps;
        this.billingRecoverPostLambda = billingRecoverPostApiLambda.ingestLambda;
        this.billingRecoverPostLambdaLogGroup = billingRecoverPostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.billingRecoverPostLambdaProps);
        subscriptionsTable.grantReadWriteData(this.billingRecoverPostLambda);
        bundlesTable.grantReadWriteData(this.billingRecoverPostLambda);
        SubHashSaltHelper.grantSaltAccess(this.billingRecoverPostLambda, region, account, props.envName());
        this.billingRecoverPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());
        infof(
                "Created Billing Recover POST Lambda %s",
                this.billingRecoverPostLambda.getNode().getId());

        // Billing Webhook POST Lambda has been moved to the env-level BillingWebhookStack
        // (always available, independent of app deployments). See PLAN_BILLING_WEBHOOK_TO_ENV.md.

        cfnOutput(this, "BillingCheckoutPostLambdaArn", this.billingCheckoutPostLambda.getFunctionArn());
        cfnOutput(this, "BillingPortalGetLambdaArn", this.billingPortalGetLambda.getFunctionArn());
        cfnOutput(this, "BillingRecoverPostLambdaArn", this.billingRecoverPostLambda.getFunctionArn());

        infof(
                "BillingStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
