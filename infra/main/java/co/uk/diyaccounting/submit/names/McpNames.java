/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class McpNames {

    public String mcpOauthBlobKeySecretName;
    public String mcpOauthBlobKeySecretArnParameterName;

    public String mcpHttpIngestLambdaHandler;
    public String mcpHttpIngestLambdaFunctionName;
    public String mcpHttpIngestLambdaArn;
    public String mcpHttpIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod mcpHttpLambdaHttpMethod;
    public String mcpHttpLambdaUrlPath;
    public boolean mcpHttpLambdaJwtAuthorizer;
    public boolean mcpHttpLambdaCustomAuthorizer;

    public String mcpOauthIngestLambdaHandler;
    public String mcpOauthIngestLambdaFunctionName;
    public String mcpOauthIngestLambdaArn;
    public String mcpOauthIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod mcpOauthLambdaHttpMethod;
    public String mcpOauthLambdaUrlPath;
    public String mcpOauthProtectedResourceUrlPath;
    public String mcpOauthProtectedResourceMcpUrlPath;
    public String mcpOauthActionUrlPath;
    public boolean mcpOauthLambdaJwtAuthorizer;
    public boolean mcpOauthLambdaCustomAuthorizer;

    public String mcpCodesEntryIngestLambdaHandler;
    public String mcpCodesEntryIngestLambdaFunctionName;
    public String mcpCodesEntryIngestLambdaArn;
    public String mcpCodesEntryIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod mcpCodesEntryLambdaHttpMethod;
    public String mcpCodesEntryLambdaUrlPath;
    public String mcpCodesEntryItemUrlPath;
    public boolean mcpCodesEntryLambdaJwtAuthorizer;
    public boolean mcpCodesEntryLambdaCustomAuthorizer;
    public String mcpHmrcGrantIngestLambdaHandler;
    public String mcpHmrcGrantIngestLambdaFunctionName;
    public String mcpHmrcGrantIngestLambdaArn;
    public String mcpHmrcGrantIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod mcpHmrcGrantLambdaHttpMethod;
    public String mcpHmrcGrantLambdaUrlPath;
    public String mcpHmrcGrantItemUrlPath;
    public String mcpHmrcGrantCallbackUrlPath;
    public boolean mcpHmrcGrantLambdaJwtAuthorizer;
    public boolean mcpHmrcGrantLambdaCustomAuthorizer;

    public McpNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {
        this.mcpOauthBlobKeySecretName = "%s/submit/mcp/oauth-blob-key".formatted(props.envName);
        this.mcpOauthBlobKeySecretArnParameterName = "/submit/%s/mcp-oauth-blob-key-arn".formatted(props.envName);

        // Hosted MCP endpoint: verifies the bearer itself, so no API Gateway authoriser
        this.mcpHttpLambdaHttpMethod = HttpMethod.ANY;
        this.mcpHttpLambdaUrlPath = "/mcp";
        this.mcpHttpLambdaJwtAuthorizer = false;
        this.mcpHttpLambdaCustomAuthorizer = false;
        var mcpHttpLambdaHandlerName = "mcpHttp.ingestHandler";
        var mcpHttpLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(mcpHttpLambdaHandlerName);
        this.mcpHttpIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, mcpHttpLambdaHandlerDashed);
        this.mcpHttpIngestLambdaHandler = "%s/mcp/%s".formatted(root.appLambdaHandlerPrefix, mcpHttpLambdaHandlerName);
        this.mcpHttpIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, mcpHttpLambdaHandlerDashed);
        this.mcpHttpIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.mcpHttpIngestLambdaArn, root.provisionedConcurrencyAliasName);

        // Hosted MCP authorization server facade: public discovery, registration and token endpoints
        this.mcpOauthLambdaHttpMethod = HttpMethod.GET;
        this.mcpOauthLambdaUrlPath = "/.well-known/oauth-authorization-server";
        this.mcpOauthProtectedResourceUrlPath = "/.well-known/oauth-protected-resource";
        this.mcpOauthProtectedResourceMcpUrlPath = "/.well-known/oauth-protected-resource/mcp";
        this.mcpOauthActionUrlPath = "/mcp/oauth/{action}";
        this.mcpOauthLambdaJwtAuthorizer = false;
        this.mcpOauthLambdaCustomAuthorizer = false;
        var mcpOauthLambdaHandlerName = "mcpOauth.ingestHandler";
        var mcpOauthLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(mcpOauthLambdaHandlerName);
        this.mcpOauthIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, mcpOauthLambdaHandlerDashed);
        this.mcpOauthIngestLambdaHandler =
                "%s/mcp/%s".formatted(root.appLambdaHandlerPrefix, mcpOauthLambdaHandlerName);
        this.mcpOauthIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, mcpOauthLambdaHandlerDashed);
        this.mcpOauthIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.mcpOauthIngestLambdaArn, root.provisionedConcurrencyAliasName);

        // Companies House codes entry: a signed-in tool call mints an entry (POST); the page on the
        // returned link reads and fills it by its unguessable id, so the item routes carry no authoriser
        this.mcpCodesEntryLambdaHttpMethod = HttpMethod.POST;
        this.mcpCodesEntryLambdaUrlPath = "/api/v1/mcp/codes-entries";
        this.mcpCodesEntryItemUrlPath = "/api/v1/mcp/codes-entries/{entryId}";
        this.mcpCodesEntryLambdaJwtAuthorizer = true;
        this.mcpCodesEntryLambdaCustomAuthorizer = false;
        var mcpCodesEntryLambdaHandlerName = "mcpCodesEntry.ingestHandler";
        var mcpCodesEntryLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(mcpCodesEntryLambdaHandlerName);
        this.mcpCodesEntryIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, mcpCodesEntryLambdaHandlerDashed);
        this.mcpCodesEntryIngestLambdaHandler =
                "%s/mcp/%s".formatted(root.appLambdaHandlerPrefix, mcpCodesEntryLambdaHandlerName);
        this.mcpCodesEntryIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, mcpCodesEntryLambdaHandlerDashed);
        this.mcpCodesEntryIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.mcpCodesEntryIngestLambdaArn, root.provisionedConcurrencyAliasName);

        // HMRC grant an MCP tool starts: a signed-in tool call requests a grant (POST) and reads its
        // token back by id (GET); the web callback page posts HMRC's code and the grant's state to the
        // callback path, which carries no authoriser because the state is the capability
        this.mcpHmrcGrantLambdaHttpMethod = HttpMethod.POST;
        this.mcpHmrcGrantLambdaUrlPath = "/api/v1/mcp/hmrc-grants";
        this.mcpHmrcGrantItemUrlPath = "/api/v1/mcp/hmrc-grants/{grantId}";
        this.mcpHmrcGrantCallbackUrlPath = "/api/v1/mcp/hmrc-grants/callback";
        this.mcpHmrcGrantLambdaJwtAuthorizer = true;
        this.mcpHmrcGrantLambdaCustomAuthorizer = false;
        var mcpHmrcGrantLambdaHandlerName = "mcpHmrcGrant.ingestHandler";
        var mcpHmrcGrantLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(mcpHmrcGrantLambdaHandlerName);
        this.mcpHmrcGrantIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, mcpHmrcGrantLambdaHandlerDashed);
        this.mcpHmrcGrantIngestLambdaHandler =
                "%s/mcp/%s".formatted(root.appLambdaHandlerPrefix, mcpHmrcGrantLambdaHandlerName);
        this.mcpHmrcGrantIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, mcpHmrcGrantLambdaHandlerDashed);
        this.mcpHmrcGrantIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.mcpHmrcGrantIngestLambdaArn, root.provisionedConcurrencyAliasName);
    }
}
