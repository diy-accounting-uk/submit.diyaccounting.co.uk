/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.SubmitSharedNames.ApiParameter;
import co.uk.diyaccounting.submit.SubmitSharedNames.PublishedLambda;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.List;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class BillingNames {

    // Env-level billing webhook Lambda
    public String envBillingWebhookLambdaFunctionName;
    public String envBillingWebhookLambdaHandler;
    public String envBillingWebhookLambdaArn;
    public String envBillingWebhookProvisionedConcurrencyAliasArn;

    // Billing Lambda names
    public String billingCheckoutPostIngestLambdaHandler;
    public String billingCheckoutPostIngestLambdaFunctionName;
    public String billingCheckoutPostIngestLambdaArn;
    public String billingCheckoutPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingCheckoutPostLambdaHttpMethod;
    public String billingCheckoutPostLambdaUrlPath;
    public boolean billingCheckoutPostLambdaJwtAuthorizer;
    public boolean billingCheckoutPostLambdaCustomAuthorizer;

    public String billingActivityCheckoutPostIngestLambdaHandler;
    public String billingActivityCheckoutPostIngestLambdaFunctionName;
    public String billingActivityCheckoutPostIngestLambdaArn;
    public String billingActivityCheckoutPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingActivityCheckoutPostLambdaHttpMethod;
    public String billingActivityCheckoutPostLambdaUrlPath;
    public boolean billingActivityCheckoutPostLambdaJwtAuthorizer;
    public boolean billingActivityCheckoutPostLambdaCustomAuthorizer;

    public String billingCheckoutSessionGetIngestLambdaHandler;
    public String billingCheckoutSessionGetIngestLambdaFunctionName;
    public String billingCheckoutSessionGetIngestLambdaArn;
    public String billingCheckoutSessionGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingCheckoutSessionGetLambdaHttpMethod;
    public String billingCheckoutSessionGetLambdaUrlPath;
    public boolean billingCheckoutSessionGetLambdaJwtAuthorizer;
    public boolean billingCheckoutSessionGetLambdaCustomAuthorizer;

    public String billingPortalGetIngestLambdaHandler;
    public String billingPortalGetIngestLambdaFunctionName;
    public String billingPortalGetIngestLambdaArn;
    public String billingPortalGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingPortalGetLambdaHttpMethod;
    public String billingPortalGetLambdaUrlPath;
    public boolean billingPortalGetLambdaJwtAuthorizer;
    public boolean billingPortalGetLambdaCustomAuthorizer;

    public String billingRecoverPostIngestLambdaHandler;
    public String billingRecoverPostIngestLambdaFunctionName;
    public String billingRecoverPostIngestLambdaArn;
    public String billingRecoverPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingRecoverPostLambdaHttpMethod;
    public String billingRecoverPostLambdaUrlPath;
    public boolean billingRecoverPostLambdaJwtAuthorizer;
    public boolean billingRecoverPostLambdaCustomAuthorizer;

    public String billingWebhookPostIngestLambdaHandler;
    public String billingWebhookPostIngestLambdaFunctionName;
    public String billingWebhookPostIngestLambdaArn;
    public String billingWebhookPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingWebhookPostLambdaHttpMethod;
    public String billingWebhookPostLambdaUrlPath;
    public boolean billingWebhookPostLambdaJwtAuthorizer;
    public boolean billingWebhookPostLambdaCustomAuthorizer;

    public BillingNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        // Env-level billing webhook Lambda
        this.envBillingWebhookLambdaFunctionName = "%s-billing-webhook".formatted(root.envResourceNamePrefix);
        this.envBillingWebhookLambdaHandler = "app/functions/billing/billingWebhookPost.ingestHandler";
        this.envBillingWebhookLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.envBillingWebhookLambdaFunctionName);
        this.envBillingWebhookProvisionedConcurrencyAliasArn =
                "%s:%s".formatted(this.envBillingWebhookLambdaArn, root.provisionedConcurrencyAliasName);

        // Billing Checkout POST Lambda (billing JWT auth: main and books client audiences)
        this.billingCheckoutPostLambdaHttpMethod = HttpMethod.POST;
        this.billingCheckoutPostLambdaUrlPath = "/api/v1/billing/checkout";
        this.billingCheckoutPostLambdaJwtAuthorizer = false;
        this.billingCheckoutPostLambdaCustomAuthorizer = false;
        var billingCheckoutPostLambdaHandlerName = "billingCheckoutPost.ingestHandler";
        var billingCheckoutPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingCheckoutPostLambdaHandlerName);
        this.billingCheckoutPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, billingCheckoutPostLambdaHandlerDashed);
        this.billingCheckoutPostIngestLambdaHandler =
                "%s/billing/%s".formatted(root.appLambdaHandlerPrefix, billingCheckoutPostLambdaHandlerName);
        this.billingCheckoutPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, billingCheckoutPostLambdaHandlerDashed);
        this.billingCheckoutPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingCheckoutPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.billingCheckoutPostLambdaHttpMethod,
                this.billingCheckoutPostLambdaUrlPath,
                "Create billing checkout session",
                "Creates a Stripe checkout session for subscription",
                "createCheckoutSession"));

        // Billing Activity Checkout POST Lambda (JWT auth) — a one-off `payment` mode charge for
        // an activity's per-filing price, distinct from billingCheckoutPost's `subscription` mode.
        this.billingActivityCheckoutPostLambdaHttpMethod = HttpMethod.POST;
        this.billingActivityCheckoutPostLambdaUrlPath = "/api/v1/billing/activity-checkout";
        this.billingActivityCheckoutPostLambdaJwtAuthorizer = false;
        this.billingActivityCheckoutPostLambdaCustomAuthorizer = false;
        var billingActivityCheckoutPostLambdaHandlerName = "billingActivityCheckoutPost.ingestHandler";
        var billingActivityCheckoutPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingActivityCheckoutPostLambdaHandlerName);
        this.billingActivityCheckoutPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, billingActivityCheckoutPostLambdaHandlerDashed);
        this.billingActivityCheckoutPostIngestLambdaHandler =
                "%s/billing/%s".formatted(root.appLambdaHandlerPrefix, billingActivityCheckoutPostLambdaHandlerName);
        this.billingActivityCheckoutPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, billingActivityCheckoutPostLambdaHandlerDashed);
        this.billingActivityCheckoutPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.billingActivityCheckoutPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.billingActivityCheckoutPostLambdaHttpMethod,
                this.billingActivityCheckoutPostLambdaUrlPath,
                "Create activity checkout session",
                "Creates a Stripe checkout session for a one-off activity charge",
                "createActivityCheckoutSession"));

        // Billing Checkout Session GET Lambda (JWT auth)
        this.billingCheckoutSessionGetLambdaHttpMethod = HttpMethod.GET;
        this.billingCheckoutSessionGetLambdaUrlPath = "/api/v1/billing/checkout/{id}";
        this.billingCheckoutSessionGetLambdaJwtAuthorizer = true;
        this.billingCheckoutSessionGetLambdaCustomAuthorizer = false;
        var billingCheckoutSessionGetLambdaHandlerName = "billingCheckoutSessionGet.ingestHandler";
        var billingCheckoutSessionGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingCheckoutSessionGetLambdaHandlerName);
        this.billingCheckoutSessionGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, billingCheckoutSessionGetLambdaHandlerDashed);
        this.billingCheckoutSessionGetIngestLambdaHandler =
                "%s/billing/%s".formatted(root.appLambdaHandlerPrefix, billingCheckoutSessionGetLambdaHandlerName);
        this.billingCheckoutSessionGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, billingCheckoutSessionGetLambdaHandlerDashed);
        this.billingCheckoutSessionGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingCheckoutSessionGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.billingCheckoutSessionGetLambdaHttpMethod,
                this.billingCheckoutSessionGetLambdaUrlPath,
                "Retrieve a billing checkout session",
                "Retrieves the amount, currency and bundle of a completed Stripe checkout session for the authenticated user",
                "getCheckoutSession",
                List.of(new ApiParameter("id", "path", true, "The Stripe checkout session id"))));

        // Billing Portal GET Lambda (billing JWT auth: main and books client audiences)
        this.billingPortalGetLambdaHttpMethod = HttpMethod.GET;
        this.billingPortalGetLambdaUrlPath = "/api/v1/billing/portal";
        this.billingPortalGetLambdaJwtAuthorizer = false;
        this.billingPortalGetLambdaCustomAuthorizer = false;
        var billingPortalGetLambdaHandlerName = "billingPortalGet.ingestHandler";
        var billingPortalGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingPortalGetLambdaHandlerName);
        this.billingPortalGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, billingPortalGetLambdaHandlerDashed);
        this.billingPortalGetIngestLambdaHandler =
                "%s/billing/%s".formatted(root.appLambdaHandlerPrefix, billingPortalGetLambdaHandlerName);
        this.billingPortalGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, billingPortalGetLambdaHandlerDashed);
        this.billingPortalGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingPortalGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.billingPortalGetLambdaHttpMethod,
                this.billingPortalGetLambdaUrlPath,
                "Get billing portal URL",
                "Creates a Stripe billing portal session URL",
                "getBillingPortal"));

        // Billing Recover POST Lambda (JWT auth)
        this.billingRecoverPostLambdaHttpMethod = HttpMethod.POST;
        this.billingRecoverPostLambdaUrlPath = "/api/v1/billing/recover";
        this.billingRecoverPostLambdaJwtAuthorizer = true;
        this.billingRecoverPostLambdaCustomAuthorizer = false;
        var billingRecoverPostLambdaHandlerName = "billingRecoverPost.ingestHandler";
        var billingRecoverPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingRecoverPostLambdaHandlerName);
        this.billingRecoverPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, billingRecoverPostLambdaHandlerDashed);
        this.billingRecoverPostIngestLambdaHandler =
                "%s/billing/%s".formatted(root.appLambdaHandlerPrefix, billingRecoverPostLambdaHandlerName);
        this.billingRecoverPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, billingRecoverPostLambdaHandlerDashed);
        this.billingRecoverPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingRecoverPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.billingRecoverPostLambdaHttpMethod,
                this.billingRecoverPostLambdaUrlPath,
                "Recover billing subscription",
                "Recovers or reconciles a billing subscription",
                "recoverBilling"));

        // Billing Webhook POST Lambda (NO auth - Stripe signature verification)
        this.billingWebhookPostLambdaHttpMethod = HttpMethod.POST;
        this.billingWebhookPostLambdaUrlPath = "/api/v1/billing/webhook";
        this.billingWebhookPostLambdaJwtAuthorizer = false;
        this.billingWebhookPostLambdaCustomAuthorizer = false;
        var billingWebhookPostLambdaHandlerName = "billingWebhookPost.ingestHandler";
        var billingWebhookPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingWebhookPostLambdaHandlerName);
        this.billingWebhookPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, billingWebhookPostLambdaHandlerDashed);
        this.billingWebhookPostIngestLambdaHandler =
                "%s/billing/%s".formatted(root.appLambdaHandlerPrefix, billingWebhookPostLambdaHandlerName);
        this.billingWebhookPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, billingWebhookPostLambdaHandlerDashed);
        this.billingWebhookPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingWebhookPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.billingWebhookPostLambdaHttpMethod,
                this.billingWebhookPostLambdaUrlPath,
                "Stripe webhook",
                "Receives Stripe webhook events for subscription lifecycle",
                "stripeWebhook"));
    }
}
