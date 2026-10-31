/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
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
 * The hosted MCP surface: {@code mcpHttp} serves streamable HTTP at {@code /mcp} and verifies the
 * Cognito access token itself, and {@code mcpOauth} is the authorization server facade in front
 * of Cognito. Neither route has an API Gateway authoriser: the bearer check answers 401 with the
 * resource metadata challenge a chat client needs, which an authoriser's bare 401 cannot carry.
 */
public class McpStack extends Stack {

    private static final int MCP_HTTP_RESERVED_CONCURRENCY = 10;
    private static final int MCP_OAUTH_MEMORY_MB = 256;
    private static final int MCP_OAUTH_TIMEOUT_SECONDS = 8;
    private static final int MCP_CODES_ENTRY_RESERVED_CONCURRENCY = 5;
    private static final int MCP_HMRC_GRANT_RESERVED_CONCURRENCY = 5;

    public AbstractApiLambdaProps mcpHttpLambdaProps;
    public Function mcpHttpLambda;
    public ILogGroup mcpHttpLambdaLogGroup;

    public AbstractApiLambdaProps mcpOauthLambdaProps;
    public Function mcpOauthLambda;
    public ILogGroup mcpOauthLambdaLogGroup;

    public AbstractApiLambdaProps mcpCodesEntryLambdaProps;
    public Function mcpCodesEntryLambda;
    public ILogGroup mcpCodesEntryLambdaLogGroup;

    public AbstractApiLambdaProps mcpHmrcGrantLambdaProps;
    public Function mcpHmrcGrantLambda;
    public ILogGroup mcpHmrcGrantLambdaLogGroup;

    public ISecret oauthBlobKeySecret;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface McpStackProps extends StackProps, SubmitStackProps {

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

        String cognitoUserPoolId();

        String mcpUserPoolClientId();

        String hmrcBaseUri();

        String hmrcClientId();

        String hmrcClientSecretArn();

        String hmrcSandboxBaseUri();

        String hmrcSandboxClientId();

        String hmrcSandboxClientSecretArn();

        static ImmutableMcpStackProps.Builder builder() {
            return ImmutableMcpStackProps.builder();
        }
    }

    public McpStack(Construct scope, String id, McpStackProps props) {
        this(scope, id, null, props);
    }

    public McpStack(Construct scope, String id, StackProps stackProps, McpStackProps props) {
        super(scope, id, stackProps);

        var sharedNames = props.sharedNames();
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        ITable mcpSessionsTable = Table.fromTableName(
                this,
                "ImportedMcpSessionsTable-%s".formatted(props.deploymentName()),
                sharedNames.data.mcpSessionsTableName);

        this.oauthBlobKeySecret = Secret.fromSecretCompleteArn(
                this,
                props.resourceNamePrefix() + "-McpOauthBlobKey",
                StringParameter.valueForStringParameter(this, sharedNames.mcp.mcpOauthBlobKeySecretArnParameterName));

        var publicHosts = new LinkedHashSet<String>();
        publicHosts.add(sharedNames.deploymentDomainName);
        publicHosts.add(sharedNames.publicDomainName);
        publicHosts.add(sharedNames.envDomainName);
        publicHosts.addAll(sharedNames.ciSlotHostNames);
        var publicHostsCsv = String.join(",", publicHosts);

        var baseUrlWithoutSlash = sharedNames.baseUrl.replaceAll("/$", "");

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // ============================================================================
        // MCP streamable HTTP Lambda (verifies the bearer itself)
        // ============================================================================
        var issuer = "https://cognito-idp.%s.amazonaws.com/%s".formatted(region, props.cognitoUserPoolId());
        var mcpHttpEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("DIYA_SUBMIT_BASE_URL", sharedNames.baseUrl)
                .with("MCP_SESSIONS_DYNAMODB_TABLE_NAME", mcpSessionsTable.getTableName())
                .with("MCP_PUBLIC_HOSTS", publicHostsCsv)
                .with("MCP_ALLOWED_ORIGINS", "https://claude.ai,https://claude.com," + baseUrlWithoutSlash)
                .with("MCP_TOKEN_ISSUER", issuer)
                .with("MCP_TOKEN_JWKS_URI", issuer + "/.well-known/jwks.json")
                .with("MCP_TOKEN_CLIENT_ID", props.mcpUserPoolClientId());
        var mcpHttpApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(sharedNames.mcp.mcpHttpIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(sharedNames.ecr.ecrRepositoryName)
                        .ecrRepositoryArn(sharedNames.ecr.ecrRepositoryArn)
                        .ingestFunctionName(sharedNames.mcp.mcpHttpIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(sharedNames.mcp.mcpHttpIngestLambdaHandler)
                        .ingestLambdaArn(sharedNames.mcp.mcpHttpIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                sharedNames.mcp.mcpHttpIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestReservedConcurrentExecutions(Optional.of(MCP_HTTP_RESERVED_CONCURRENCY))
                        .provisionedConcurrencyAliasName(sharedNames.provisionedConcurrencyAliasName)
                        .httpMethod(sharedNames.mcp.mcpHttpLambdaHttpMethod)
                        .urlPath(sharedNames.mcp.mcpHttpLambdaUrlPath)
                        .jwtAuthorizer(sharedNames.mcp.mcpHttpLambdaJwtAuthorizer)
                        .customAuthorizer(sharedNames.mcp.mcpHttpLambdaCustomAuthorizer)
                        .environment(mcpHttpEnv)
                        .build());
        this.mcpHttpLambdaProps = mcpHttpApiLambda.apiProps;
        this.mcpHttpLambda = mcpHttpApiLambda.ingestLambda;
        this.mcpHttpLambdaLogGroup = mcpHttpApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.mcpHttpLambdaProps);
        mcpSessionsTable.grantReadWriteData(this.mcpHttpLambda);
        SubHashSaltHelper.grantSaltAccess(this.mcpHttpLambda, region, account, props.envName());
        infof("Created MCP HTTP Lambda %s", this.mcpHttpLambda.getNode().getId());

        // ============================================================================
        // MCP authorization server facade Lambda (public)
        // ============================================================================
        var cognitoOauthBase = sharedNames.cognitoBaseUri + "/oauth2";
        var mcpOauthEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("MCP_PUBLIC_HOSTS", publicHostsCsv)
                .with("MCP_UPSTREAM_AUTHORIZE_URL", cognitoOauthBase + "/authorize")
                .with("MCP_UPSTREAM_TOKEN_URL", cognitoOauthBase + "/token")
                .with("MCP_UPSTREAM_REVOKE_URL", cognitoOauthBase + "/revoke")
                .with("MCP_UPSTREAM_CLIENT_ID", props.mcpUserPoolClientId())
                .with("MCP_OAUTH_BLOB_KEY_SECRET_ARN", this.oauthBlobKeySecret.getSecretArn());
        var mcpOauthApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(sharedNames.mcp.mcpOauthIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(sharedNames.ecr.ecrRepositoryName)
                        .ecrRepositoryArn(sharedNames.ecr.ecrRepositoryArn)
                        .ingestFunctionName(sharedNames.mcp.mcpOauthIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(sharedNames.mcp.mcpOauthIngestLambdaHandler)
                        .ingestLambdaArn(sharedNames.mcp.mcpOauthIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                sharedNames.mcp.mcpOauthIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestMemorySize(MCP_OAUTH_MEMORY_MB)
                        .ingestLambdaTimeout(Duration.seconds(MCP_OAUTH_TIMEOUT_SECONDS))
                        .provisionedConcurrencyAliasName(sharedNames.provisionedConcurrencyAliasName)
                        .httpMethod(sharedNames.mcp.mcpOauthLambdaHttpMethod)
                        .urlPath(sharedNames.mcp.mcpOauthLambdaUrlPath)
                        .jwtAuthorizer(sharedNames.mcp.mcpOauthLambdaJwtAuthorizer)
                        .customAuthorizer(sharedNames.mcp.mcpOauthLambdaCustomAuthorizer)
                        .environment(mcpOauthEnv)
                        .build());
        this.mcpOauthLambdaProps = mcpOauthApiLambda.apiProps;
        this.mcpOauthLambda = mcpOauthApiLambda.ingestLambda;
        this.mcpOauthLambdaLogGroup = mcpOauthApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.mcpOauthLambdaProps);
        this.lambdaFunctionProps.add(onPublishedPath(
                this.mcpOauthLambdaProps, HttpMethod.GET, sharedNames.mcp.mcpOauthProtectedResourceUrlPath));
        this.lambdaFunctionProps.add(onPublishedPath(
                this.mcpOauthLambdaProps, HttpMethod.GET, sharedNames.mcp.mcpOauthProtectedResourceMcpUrlPath));
        this.lambdaFunctionProps.add(
                onPublishedPath(this.mcpOauthLambdaProps, HttpMethod.ANY, sharedNames.mcp.mcpOauthActionUrlPath));
        this.oauthBlobKeySecret.grantRead(this.mcpOauthLambda);
        infof("Created MCP OAuth Lambda %s", this.mcpOauthLambda.getNode().getId());

        // ============================================================================
        // Companies House codes entry Lambda: a signed-in POST mints an entry, and the codes
        // page reads and fills it by its id (no authoriser on the item routes). The codes are
        // sealed under a key derived from the blob key before they reach the sessions table.
        // ============================================================================
        ITable practiceClientsTable =
                Table.fromTableName(this, "PracticeClientsTable", sharedNames.data.practiceClientsTableName);
        var mcpCodesEntryEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("DIY_SUBMIT_BASE_URL", sharedNames.baseUrl)
                .with("MCP_SESSIONS_DYNAMODB_TABLE_NAME", mcpSessionsTable.getTableName())
                .with("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", practiceClientsTable.getTableName())
                .with("MCP_OAUTH_BLOB_KEY_SECRET_ARN", this.oauthBlobKeySecret.getSecretArn());
        var mcpCodesEntryApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(sharedNames.mcp.mcpCodesEntryIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(sharedNames.ecr.ecrRepositoryName)
                        .ecrRepositoryArn(sharedNames.ecr.ecrRepositoryArn)
                        .ingestFunctionName(sharedNames.mcp.mcpCodesEntryIngestLambdaFunctionName)
                        .ingestHandler(sharedNames.mcp.mcpCodesEntryIngestLambdaHandler)
                        .ingestLambdaArn(sharedNames.mcp.mcpCodesEntryIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                sharedNames.mcp.mcpCodesEntryIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestReservedConcurrentExecutions(Optional.of(MCP_CODES_ENTRY_RESERVED_CONCURRENCY))
                        .provisionedConcurrencyAliasName(sharedNames.provisionedConcurrencyAliasName)
                        .httpMethod(sharedNames.mcp.mcpCodesEntryLambdaHttpMethod)
                        .urlPath(sharedNames.mcp.mcpCodesEntryLambdaUrlPath)
                        .jwtAuthorizer(sharedNames.mcp.mcpCodesEntryLambdaJwtAuthorizer)
                        .customAuthorizer(sharedNames.mcp.mcpCodesEntryLambdaCustomAuthorizer)
                        .environment(mcpCodesEntryEnv)
                        .build());
        this.mcpCodesEntryLambdaProps = mcpCodesEntryApiLambda.apiProps;
        this.mcpCodesEntryLambda = mcpCodesEntryApiLambda.ingestLambda;
        this.mcpCodesEntryLambdaLogGroup = mcpCodesEntryApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.mcpCodesEntryLambdaProps);
        for (var itemMethod : List.of(HttpMethod.GET, HttpMethod.PUT)) {
            this.lambdaFunctionProps.add(ApiLambdaProps.builder()
                    .from(this.mcpCodesEntryLambdaProps)
                    .httpMethod(itemMethod)
                    .urlPath(sharedNames.mcp.mcpCodesEntryItemUrlPath)
                    .jwtAuthorizer(false)
                    .customAuthorizer(false)
                    .build());
        }
        mcpSessionsTable.grantReadWriteData(this.mcpCodesEntryLambda);
        practiceClientsTable.grant(this.mcpCodesEntryLambda, "dynamodb:GetItem");
        this.oauthBlobKeySecret.grantRead(this.mcpCodesEntryLambda);
        SubHashSaltHelper.grantSaltAccess(this.mcpCodesEntryLambda, region, account, props.envName());
        infof(
                "Created MCP codes entry Lambda %s",
                this.mcpCodesEntryLambda.getNode().getId());

        // ============================================================================
        // HMRC grant Lambda: a signed-in POST requests a grant and answers HMRC's authorisation
        // link; the web callback page posts HMRC's code with the grant's state to the callback
        // path (no authoriser); a signed-in GET reads the access token back, owner only. The
        // tokens are sealed under a key derived from the blob key before they reach the table.
        // ============================================================================
        ITable hmrcApiRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcApiRequestsTable-%s".formatted(props.deploymentName()),
                sharedNames.data.hmrcApiRequestsTableName);
        var mcpHmrcGrantEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("DIY_SUBMIT_BASE_URL", sharedNames.publicBaseUrl)
                .with("MCP_SESSIONS_DYNAMODB_TABLE_NAME", mcpSessionsTable.getTableName())
                .with("MCP_OAUTH_BLOB_KEY_SECRET_ARN", this.oauthBlobKeySecret.getSecretArn())
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_CLIENT_ID", props.hmrcClientId())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("HMRC_SANDBOX_CLIENT_ID", props.hmrcSandboxClientId());
        if (StringUtils.isNotBlank(props.hmrcClientSecretArn())) {
            mcpHmrcGrantEnv.with("HMRC_CLIENT_SECRET_ARN", props.hmrcClientSecretArn());
        }
        if (StringUtils.isNotBlank(props.hmrcSandboxClientSecretArn())) {
            mcpHmrcGrantEnv.with("HMRC_SANDBOX_CLIENT_SECRET_ARN", props.hmrcSandboxClientSecretArn());
        }
        var mcpHmrcGrantApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(sharedNames.mcp.mcpHmrcGrantIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(sharedNames.ecr.ecrRepositoryName)
                        .ecrRepositoryArn(sharedNames.ecr.ecrRepositoryArn)
                        .ingestFunctionName(sharedNames.mcp.mcpHmrcGrantIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(sharedNames.mcp.mcpHmrcGrantIngestLambdaHandler)
                        .ingestLambdaArn(sharedNames.mcp.mcpHmrcGrantIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                sharedNames.mcp.mcpHmrcGrantIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestReservedConcurrentExecutions(Optional.of(MCP_HMRC_GRANT_RESERVED_CONCURRENCY))
                        .provisionedConcurrencyAliasName(sharedNames.provisionedConcurrencyAliasName)
                        .httpMethod(sharedNames.mcp.mcpHmrcGrantLambdaHttpMethod)
                        .urlPath(sharedNames.mcp.mcpHmrcGrantLambdaUrlPath)
                        .jwtAuthorizer(sharedNames.mcp.mcpHmrcGrantLambdaJwtAuthorizer)
                        .customAuthorizer(sharedNames.mcp.mcpHmrcGrantLambdaCustomAuthorizer)
                        .environment(mcpHmrcGrantEnv)
                        .build());
        this.mcpHmrcGrantLambdaProps = mcpHmrcGrantApiLambda.apiProps;
        this.mcpHmrcGrantLambda = mcpHmrcGrantApiLambda.ingestLambda;
        this.mcpHmrcGrantLambdaLogGroup = mcpHmrcGrantApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.mcpHmrcGrantLambdaProps);
        this.lambdaFunctionProps.add(
                onPublishedPath(this.mcpHmrcGrantLambdaProps, HttpMethod.GET, sharedNames.mcp.mcpHmrcGrantItemUrlPath));
        this.lambdaFunctionProps.add(ApiLambdaProps.builder()
                .from(this.mcpHmrcGrantLambdaProps)
                .httpMethod(HttpMethod.POST)
                .urlPath(sharedNames.mcp.mcpHmrcGrantCallbackUrlPath)
                .jwtAuthorizer(false)
                .customAuthorizer(false)
                .build());
        mcpSessionsTable.grantReadWriteData(this.mcpHmrcGrantLambda);
        hmrcApiRequestsTable.grant(this.mcpHmrcGrantLambda, "dynamodb:PutItem");
        this.oauthBlobKeySecret.grantRead(this.mcpHmrcGrantLambda);
        SubHashSaltHelper.grantSaltAccess(this.mcpHmrcGrantLambda, region, account, props.envName());
        for (var hmrcSecretArn : List.of(props.hmrcClientSecretArn(), props.hmrcSandboxClientSecretArn())) {
            if (StringUtils.isBlank(hmrcSecretArn)) {
                continue;
            }
            this.mcpHmrcGrantLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(hmrcSecretArn.endsWith("-*") ? hmrcSecretArn : hmrcSecretArn + "-*"))
                    .build());
        }
        infof(
                "Created MCP HMRC grant Lambda %s",
                this.mcpHmrcGrantLambda.getNode().getId());

        Lambda.appStackHealthAlarm(
                this,
                props.envName(),
                props.resourceNamePrefix(),
                "mcp",
                List.of(mcpHttpApiLambda, mcpOauthApiLambda, mcpCodesEntryApiLambda, mcpHmrcGrantApiLambda));

        cfnOutput(this, "McpHttpLambdaArn", this.mcpHttpLambda.getFunctionArn());
        cfnOutput(this, "McpOauthLambdaArn", this.mcpOauthLambda.getFunctionArn());
        cfnOutput(this, "McpCodesEntryLambdaArn", this.mcpCodesEntryLambda.getFunctionArn());
        cfnOutput(this, "McpHmrcGrantLambdaArn", this.mcpHmrcGrantLambda.getFunctionArn());
        cfnOutput(this, "McpOauthBlobKeySecretArn", this.oauthBlobKeySecret.getSecretArn());

        infof(
                "McpStack %s created successfully for %s",
                this.getNode().getId(), sharedNames.dashedDeploymentDomainName);
    }

    /**
     * Builds a further route entry for an already-created Lambda, differing in urlPath and
     * method. ApiStack imports the function by ARN, so this adds a route and no Lambda resource.
     */
    private static AbstractApiLambdaProps onPublishedPath(
            AbstractApiLambdaProps primary, HttpMethod httpMethod, String urlPath) {
        return ApiLambdaProps.builder()
                .from(primary)
                .httpMethod(httpMethod)
                .urlPath(urlPath)
                .build();
    }
}
