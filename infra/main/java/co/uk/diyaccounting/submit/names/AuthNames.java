/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.SubmitSharedNames.PublishedLambda;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class AuthNames {

    public String cognitoTokenPostIngestLambdaHandler;
    public String cognitoTokenPostIngestLambdaFunctionName;
    public String cognitoTokenPostIngestLambdaArn;
    public String cognitoTokenPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod cognitoTokenPostLambdaHttpMethod;
    public String cognitoTokenPostLambdaUrlPath;
    public boolean cognitoTokenPostLambdaJwtAuthorizer;
    public boolean cognitoTokenPostLambdaCustomAuthorizer;

    public String customAuthorizerIngestLambdaHandler;
    public String customAuthorizerIngestLambdaFunctionName;
    public String customAuthorizerIngestLambdaArn;
    public String customAuthorizerIngestProvisionedConcurrencyLambdaAliasArn;

    public AuthNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        this.cognitoTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.cognitoTokenPostLambdaUrlPath = "/api/v1/cognito/token";
        this.cognitoTokenPostLambdaJwtAuthorizer = false;
        this.cognitoTokenPostLambdaCustomAuthorizer = false;
        var cognitoTokenPostLambdaHandlerName = "cognitoTokenPost.ingestHandler";
        var cognitoTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, cognitoTokenPostLambdaHandlerDashed);
        this.cognitoTokenPostIngestLambdaHandler =
                "%s/auth/%s".formatted(root.appLambdaHandlerPrefix, cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, cognitoTokenPostLambdaHandlerDashed);
        this.cognitoTokenPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.cognitoTokenPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.cognitoTokenPostLambdaHttpMethod,
                this.cognitoTokenPostLambdaUrlPath,
                "Exchange Cognito authorization code for access token",
                "Exchanges an authorization code for a Cognito access token",
                "exchangeCognitoToken"));

        // Custom authorizer for HMRC VAT endpoints
        var customAuthorizerHandlerName = "customAuthorizer.ingestHandler";
        var customAuthorizerHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(customAuthorizerHandlerName);
        this.customAuthorizerIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, customAuthorizerHandlerDashed);
        this.customAuthorizerIngestLambdaHandler =
                "%s/auth/%s".formatted(root.appLambdaHandlerPrefix, customAuthorizerHandlerName);
        this.customAuthorizerIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, customAuthorizerHandlerDashed);
        this.customAuthorizerIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.customAuthorizerIngestLambdaArn, root.provisionedConcurrencyAliasName);
    }
}
