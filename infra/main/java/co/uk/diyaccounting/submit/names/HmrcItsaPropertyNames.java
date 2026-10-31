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

public class HmrcItsaPropertyNames {

    public String hmrcItsaBsasForeignPropertyGetIngestLambdaHandler;
    public String hmrcItsaBsasForeignPropertyGetIngestLambdaFunctionName;
    public String hmrcItsaBsasForeignPropertyGetIngestLambdaArn;
    public String hmrcItsaBsasForeignPropertyGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasForeignPropertyGetWorkerLambdaHandler;
    public String hmrcItsaBsasForeignPropertyGetWorkerLambdaFunctionName;
    public String hmrcItsaBsasForeignPropertyGetWorkerLambdaArn;
    public String hmrcItsaBsasForeignPropertyGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasForeignPropertyGetLambdaQueueName;
    public String hmrcItsaBsasForeignPropertyGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaBsasForeignPropertyGetLambdaHttpMethod;
    public String hmrcItsaBsasForeignPropertyGetLambdaUrlPath;
    public boolean hmrcItsaBsasForeignPropertyGetLambdaJwtAuthorizer;
    public boolean hmrcItsaBsasForeignPropertyGetLambdaCustomAuthorizer;

    public String hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaHandler;
    public String hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaFunctionName;
    public String hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaArn;
    public String hmrcItsaBsasForeignPropertyAdjustPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaHandler;
    public String hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaFunctionName;
    public String hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaArn;
    public String hmrcItsaBsasForeignPropertyAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasForeignPropertyAdjustPostLambdaQueueName;
    public String hmrcItsaBsasForeignPropertyAdjustPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaBsasForeignPropertyAdjustPostLambdaHttpMethod;
    public String hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlPath;
    public boolean hmrcItsaBsasForeignPropertyAdjustPostLambdaJwtAuthorizer;
    public boolean hmrcItsaBsasForeignPropertyAdjustPostLambdaCustomAuthorizer;

    public HmrcItsaPropertyNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        this.hmrcItsaBsasForeignPropertyGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaBsasForeignPropertyGetLambdaUrlPath = "/api/v1/hmrc/itsa/bsas/foreign-property";
        this.hmrcItsaBsasForeignPropertyGetLambdaJwtAuthorizer = false;
        this.hmrcItsaBsasForeignPropertyGetLambdaCustomAuthorizer = true;
        var hmrcItsaBsasForeignPropertyGetLambdaHandlerName = "hmrcItsaBsasForeignPropertyGet.ingestHandler";
        var hmrcItsaBsasForeignPropertyGetLambdaWorkerHandlerName = "hmrcItsaBsasForeignPropertyGet.workerHandler";
        var hmrcItsaBsasForeignPropertyGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaBsasForeignPropertyGetLambdaHandlerName);
        this.hmrcItsaBsasForeignPropertyGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaBsasForeignPropertyGetLambdaHandlerDashed);
        this.hmrcItsaBsasForeignPropertyGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasForeignPropertyGetLambdaHandlerName);
        this.hmrcItsaBsasForeignPropertyGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaBsasForeignPropertyGetLambdaHandlerDashed);
        this.hmrcItsaBsasForeignPropertyGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaBsasForeignPropertyGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasForeignPropertyGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasForeignPropertyGetIngestLambdaFunctionName);
        this.hmrcItsaBsasForeignPropertyGetWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasForeignPropertyGetLambdaWorkerHandlerName);
        this.hmrcItsaBsasForeignPropertyGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasForeignPropertyGetIngestLambdaArn);
        this.hmrcItsaBsasForeignPropertyGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaBsasForeignPropertyGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasForeignPropertyGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasForeignPropertyGetIngestLambdaFunctionName);
        this.hmrcItsaBsasForeignPropertyGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasForeignPropertyGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaBsasForeignPropertyGetLambdaHttpMethod,
                this.hmrcItsaBsasForeignPropertyGetLambdaUrlPath,
                "Retrieve an ITSA foreign property business source adjustable summary",
                "Retrieves the income, expenses and resulting net profit or loss for a triggered summary",
                "getItsaBsasForeignProperty",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("calculationId", "query", true, "The calculation id from a triggered summary"),
                        new ApiParameter("taxYear", "query", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaBsasForeignPropertyAdjustPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlPath = "/api/v1/hmrc/itsa/bsas/foreign-property/adjust";
        this.hmrcItsaBsasForeignPropertyAdjustPostLambdaJwtAuthorizer = false;
        this.hmrcItsaBsasForeignPropertyAdjustPostLambdaCustomAuthorizer = true;
        var hmrcItsaBsasForeignPropertyAdjustPostLambdaHandlerName =
                "hmrcItsaBsasForeignPropertyAdjustPost.ingestHandler";
        var hmrcItsaBsasForeignPropertyAdjustPostLambdaWorkerHandlerName =
                "hmrcItsaBsasForeignPropertyAdjustPost.workerHandler";
        var hmrcItsaBsasForeignPropertyAdjustPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(
                                hmrcItsaBsasForeignPropertyAdjustPostLambdaHandlerName)
                        .replace("-adjust-post", "-adjust");
        this.hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaBsasForeignPropertyAdjustPostLambdaHandlerDashed);
        this.hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasForeignPropertyAdjustPostLambdaHandlerName);
        this.hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaBsasForeignPropertyAdjustPostLambdaHandlerDashed);
        this.hmrcItsaBsasForeignPropertyAdjustPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaArn,
                        root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaFunctionName);
        this.hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasForeignPropertyAdjustPostLambdaWorkerHandlerName);
        this.hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaArn);
        this.hmrcItsaBsasForeignPropertyAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaArn,
                        root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasForeignPropertyAdjustPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaFunctionName);
        this.hmrcItsaBsasForeignPropertyAdjustPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaBsasForeignPropertyAdjustPostLambdaHttpMethod,
                this.hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlPath,
                "Adjust an ITSA foreign property business source adjustable summary",
                "Submits income and expenses adjustments, or states there are none, for a triggered summary",
                "adjustItsaBsasForeignProperty",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("calculationId", "body", true, "The calculation id from a triggered summary"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter(
                                "foreignProperty",
                                "body",
                                false,
                                "One entry per country (countryCode) or property (propertyId from 2026-27), each with income and expenses adjustments"),
                        new ApiParameter(
                                "foreignFhlEea",
                                "body",
                                false,
                                "Furnished holiday lettings in the EEA adjustments, to tax year 2024-25"),
                        new ApiParameter("zeroAdjustments", "body", false, "True to state that nothing changes"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));
    }
}
