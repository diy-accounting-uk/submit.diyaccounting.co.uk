/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.Route53AliasUpsert;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.aws_apigatewayv2_integrations.HttpLambdaIntegration;
import software.amazon.awscdk.services.apigatewayv2.ApiMapping;
import software.amazon.awscdk.services.apigatewayv2.DomainName;
import software.amazon.awscdk.services.apigatewayv2.HttpApi;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
import software.amazon.awscdk.services.apigatewayv2.HttpRoute;
import software.amazon.awscdk.services.apigatewayv2.HttpRouteKey;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.constructs.Construct;

/**
 * Environment-level stack for the Stripe billing webhook endpoint.
 *
 * This stack is long-lived (never torn down) so Stripe webhook deliveries
 * always succeed, even when application stacks are destroyed. Uses 0
 * provisioned concurrency — Stripe's built-in retry handles cold starts.
 */
public class BillingWebhookStack extends Stack {

    @Value.Immutable
    public interface BillingWebhookStackProps extends StackProps, SubmitStackProps {

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

        /** Docker image tag for the Lambda (ECR image) */
        String baseImageTag();

        /** Hosted zone name for Route53 DNS records */
        String hostedZoneName();

        /** Hosted zone ID for Route53 DNS records */
        String hostedZoneId();

        /** Regional ACM certificate ARN (eu-west-2) for API Gateway custom domain */
        String regionalCertificateArn();

        /** Stripe secret key ARN (live mode) */
        @Value.Default
        default String stripeSecretKeyArn() {
            return "";
        }

        /** Stripe test secret key ARN */
        @Value.Default
        default String stripeTestSecretKeyArn() {
            return "";
        }

        /** Stripe webhook signing secret ARN (live mode) */
        @Value.Default
        default String stripeWebhookSecretArn() {
            return "";
        }

        /** Stripe test webhook signing secret ARN */
        @Value.Default
        default String stripeTestWebhookSecretArn() {
            return "";
        }

        static ImmutableBillingWebhookStackProps.Builder builder() {
            return ImmutableBillingWebhookStackProps.builder();
        }
    }

    public BillingWebhookStack(final Construct scope, final String id, final BillingWebhookStackProps props) {
        super(scope, id, props);

        String region = props.getEnv().getRegion();
        String account = props.getEnv().getAccount();

        // Tags
        Tags.of(this).add("Criticality", "high");

        // ============================================================================
        // Lambda function — Docker image from ECR, 0 provisioned concurrency
        // ============================================================================

        ITable bundlesTable = Table.fromTableName(this, "BundlesTable", props.sharedNames().bundlesTableName);
        ITable subscriptionsTable =
                Table.fromTableName(this, "SubscriptionsTable", props.sharedNames().subscriptionsTableName);
        String activityBusArn =
                "arn:aws:events:%s:%s:event-bus/%s".formatted(region, account, props.sharedNames().activityBusName);

        var lambdaEnv = new PopulatedMap<String, String>()
                .with("SUBSCRIPTIONS_DYNAMODB_TABLE_NAME", subscriptionsTable.getTableName())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.stripeSecretKeyArn() != null && !props.stripeSecretKeyArn().isBlank()) {
            lambdaEnv.with("STRIPE_SECRET_KEY_ARN", props.stripeSecretKeyArn());
        }
        if (props.stripeTestSecretKeyArn() != null
                && !props.stripeTestSecretKeyArn().isBlank()) {
            lambdaEnv.with("STRIPE_TEST_SECRET_KEY_ARN", props.stripeTestSecretKeyArn());
        }
        if (props.stripeWebhookSecretArn() != null
                && !props.stripeWebhookSecretArn().isBlank()) {
            lambdaEnv.with("STRIPE_WEBHOOK_SECRET_ARN", props.stripeWebhookSecretArn());
        }
        if (props.stripeTestWebhookSecretArn() != null
                && !props.stripeTestWebhookSecretArn().isBlank()) {
            lambdaEnv.with("STRIPE_TEST_WEBHOOK_SECRET_ARN", props.stripeTestWebhookSecretArn());
        }

        var webhookLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(props.sharedNames().envBillingWebhookLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().envBillingWebhookLambdaFunctionName)
                        .ingestHandler(props.sharedNames().envBillingWebhookLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().envBillingWebhookLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().envBillingWebhookProvisionedConcurrencyAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName("pc")
                        .ingestMemorySize(512)
                        .ingestLambdaTimeout(Duration.seconds(29))
                        .ingestArchitecture(Architecture.ARM_64)
                        .logGroupRetention(RetentionDays.ONE_MONTH)
                        .logGroupRemovalPolicy(RemovalPolicy.DESTROY)
                        .environment(lambdaEnv)
                        .build());
        var webhookFunction = webhookLambda.ingestLambda;
        infof(
                "Created env-level billing webhook Lambda %s",
                webhookFunction.getNode().getId());

        // Grant DynamoDB access
        subscriptionsTable.grant(webhookFunction, "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem");
        bundlesTable.grant(webhookFunction, "dynamodb:PutItem", "dynamodb:UpdateItem");

        // Grant sub hash salt access
        SubHashSaltHelper.grantSaltAccess(webhookFunction, region, account, props.envName());

        // Grant EventBridge access
        webhookFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        // Grant Secrets Manager access for Stripe secrets
        grantSecretAccess(webhookFunction, props.stripeSecretKeyArn());
        grantSecretAccess(webhookFunction, props.stripeTestSecretKeyArn());
        grantSecretAccess(webhookFunction, props.stripeWebhookSecretArn());
        grantSecretAccess(webhookFunction, props.stripeTestWebhookSecretArn());

        // ============================================================================
        // API Gateway HTTP API v2 — single POST route, no authorizer
        // ============================================================================

        HttpApi httpApi = HttpApi.Builder.create(this, props.resourceNamePrefix() + "-BillingWebhookApi")
                .apiName(props.resourceNamePrefix() + "-billing-webhook")
                .description("Stripe billing webhook endpoint for " + props.envName())
                .build();
        infof("Created API Gateway %s", httpApi.getHttpApiId());

        // Custom domain with regional certificate
        String billingDomainName = props.sharedNames().billingDomainName;
        ICertificate regionalCert = Certificate.fromCertificateArn(
                this, props.resourceNamePrefix() + "-RegionalCert", props.regionalCertificateArn());

        DomainName customDomain = DomainName.Builder.create(this, props.resourceNamePrefix() + "-BillingDomain")
                .domainName(billingDomainName)
                .certificate(regionalCert)
                .build();

        ApiMapping.Builder.create(this, props.resourceNamePrefix() + "-BillingApiMapping")
                .api(httpApi)
                .domainName(customDomain)
                .build();

        // Lambda integration
        HttpLambdaIntegration webhookIntegration = HttpLambdaIntegration.Builder.create(
                        props.resourceNamePrefix() + "-WebhookIntegration", webhookLambda.ingestLambdaAlias)
                .timeout(Duration.seconds(29))
                .build();

        // Route: POST /api/v1/billing/webhook (no authorizer)
        HttpRoute.Builder.create(this, props.resourceNamePrefix() + "-WebhookRoute")
                .httpApi(httpApi)
                .routeKey(HttpRouteKey.with("/api/v1/billing/webhook", HttpMethod.POST))
                .integration(webhookIntegration)
                .build();
        infof("Added POST /api/v1/billing/webhook route to billing webhook API");

        // Explicitly allow API Gateway to invoke the Lambda
        webhookLambda.ingestLambdaAlias.addPermission(
                props.resourceNamePrefix() + "-AllowInvokeFromHttpApi",
                Permission.builder()
                        .action("lambda:InvokeFunction")
                        .principal(new ServicePrincipal("apigateway.amazonaws.com"))
                        .sourceArn("arn:aws:execute-api:" + region + ":" + account + ":" + httpApi.getApiId() + "/*")
                        .build());

        // ============================================================================
        // Route53 DNS records — cross-account UPSERT via AwsCustomResource
        // Route53 hosted zone is in the management account, not this account.
        // Uses the same Route53AliasUpsert pattern as EdgeStack.
        // ============================================================================

        IHostedZone hostedZone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix() + "-HostedZone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId())
                        .zoneName(props.hostedZoneName())
                        .build());

        Route53AliasUpsert.upsertAliasToApiGatewayV2(
                this,
                "BillingAlias",
                hostedZone,
                billingDomainName,
                customDomain.getRegionalDomainName(),
                customDomain.getRegionalHostedZoneId());

        infof("Created Route53 UPSERT records for %s", billingDomainName);

        // Outputs
        cfnOutput(this, "BillingWebhookApiUrl", httpApi.getUrl());
        cfnOutput(this, "BillingWebhookDomainName", billingDomainName);
        cfnOutput(this, "BillingWebhookEndpoint", "https://%s/api/v1/billing/webhook".formatted(billingDomainName));
        cfnOutput(this, "BillingWebhookLambdaArn", webhookFunction.getFunctionArn());

        infof(
                "BillingWebhookStack %s created — endpoint: https://%s/api/v1/billing/webhook",
                this.getNode().getId(), billingDomainName);
    }

    /** Grant secretsmanager:GetSecretValue on a Stripe secret ARN (with wildcard suffix). */
    private void grantSecretAccess(software.amazon.awscdk.services.lambda.Function fn, String secretArn) {
        if (secretArn == null || secretArn.isBlank()) {
            return;
        }
        var arnWithWildcard = secretArn.endsWith("*") ? secretArn : secretArn + "-*";
        fn.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of(arnWithWildcard))
                .build());
    }
}
