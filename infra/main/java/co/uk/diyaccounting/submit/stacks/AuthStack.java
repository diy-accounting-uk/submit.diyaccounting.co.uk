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
import java.util.Optional;
import org.immutables.value.Value;
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
import software.amazon.awssdk.utils.StringUtils;
import software.constructs.Construct;

public class AuthStack extends Stack {

    //    public AbstractApiLambdaProps cognitoAuthUrlGetLambdaProps;
    //    public Function cognitoAuthUrlGetLambda;
    //    public ILogGroup cognitoAuthUrlGetLambdaLogGroup;
    public AbstractApiLambdaProps cognitoTokenPostLambdaProps;
    public Function cognitoTokenPostLambda;
    public ILogGroup cognitoTokenPostLambdaLogGroup;
    public AbstractApiLambdaProps customAuthorizerLambdaProps;
    public Function customAuthorizerLambda;
    public ILogGroup customAuthorizerLambdaLogGroup;
    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface AuthStackProps extends StackProps, SubmitStackProps {

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

        String cognitoClientId();

        String cognitoUserPoolId();

        String cognitoUserPoolClientId();

        // Optional test access token for local/dev testing without real Cognito interaction
        Optional<String> optionalTestAccessToken(); //

        static ImmutableAuthStackProps.Builder builder() {
            return ImmutableAuthStackProps.builder();
        }
    }

    public AuthStack(Construct scope, String id, AuthStackProps props) {
        this(scope, id, null, props);
    }

    public AuthStack(Construct scope, String id, StackProps stackProps, AuthStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lookup existing DynamoDB Security State Table (issue #10 mid-session country check)
        ITable securityStateTable = Table.fromTableName(
                this,
                "ImportedSecurityStateTable-%s".formatted(props.deploymentName()),
                props.sharedNames().securityStateTableName);

        // Lookup existing DynamoDB HMRC API requests Table
        ITable hmrcApiRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcApiRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcApiRequestsTableName);

        // Lambdas

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for IAM policies and Secrets Manager access
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activityBusName);

        // exchangeToken - Google via Cognito
        var exchangeCognitoTokenLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("COGNITO_BASE_URI", props.sharedNames().cognitoBaseUri)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with("COGNITO_CLIENT_ID", props.cognitoClientId())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.optionalTestAccessToken().isPresent()
                && StringUtils.isNotBlank(props.optionalTestAccessToken().get())) {
            exchangeCognitoTokenLambdaEnv.with(
                    "TEST_ACCESS_TOKEN", props.optionalTestAccessToken().get());
        }
        var exchangeCognitoTokenLambdaUrlOrigin = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().cognitoTokenPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().cognitoTokenPostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().cognitoTokenPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().cognitoTokenPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().cognitoTokenPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().cognitoTokenPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().cognitoTokenPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().cognitoTokenPostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().cognitoTokenPostLambdaCustomAuthorizer)
                        .environment(exchangeCognitoTokenLambdaEnv)
                        .build());
        this.cognitoTokenPostLambdaProps = exchangeCognitoTokenLambdaUrlOrigin.apiProps;
        this.cognitoTokenPostLambda = exchangeCognitoTokenLambdaUrlOrigin.ingestLambda;
        this.cognitoTokenPostLambdaLogGroup = exchangeCognitoTokenLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.cognitoTokenPostLambdaProps);
        infof(
                "Created Lambda %s for Cognito exchange token with ingestHandler %s",
                this.cognitoTokenPostLambda.getNode().getId(), props.sharedNames().cognitoTokenPostIngestLambdaHandler);

        // No bundles grant: cognitoTokenPost exchanges a Cognito code for tokens and touches no bundle.

        // Allow the token exchange Lambda to write HMRC API request audit records to DynamoDB
        hmrcApiRequestsTable.grant(this.cognitoTokenPostLambda, "dynamodb:PutItem");

        // Grant access to user sub hash salt secret in Secrets Manager
        SubHashSaltHelper.grantSaltAccess(this.cognitoTokenPostLambda, region, account, props.envName());
        infof("Granted Secrets Manager salt access to %s", this.cognitoTokenPostLambda.getFunctionName());

        // Grant EventBridge PutEvents permission
        this.cognitoTokenPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        // Custom authorizer Lambda for X-Authorization header
        var customAuthorizerLambdaEnv = new PopulatedMap<String, String>()
                .with("COGNITO_USER_POOL_ID", props.cognitoUserPoolId())
                .with("COGNITO_USER_POOL_CLIENT_ID", props.cognitoUserPoolClientId())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("SECURITY_STATE_DYNAMODB_TABLE_NAME", securityStateTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        var customAuthorizerLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().customAuthorizerIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().customAuthorizerIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().customAuthorizerIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().customAuthorizerIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().customAuthorizerIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(1)
                        .ingestMemorySize(256)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(HttpMethod.GET) // Not used for authorizers but required by props
                        .urlPath("/") // Not used for authorizers but required by props
                        .jwtAuthorizer(false)
                        .customAuthorizer(false)
                        .environment(customAuthorizerLambdaEnv)
                        .build());
        this.customAuthorizerLambdaProps = customAuthorizerLambda.apiProps;
        this.customAuthorizerLambda = customAuthorizerLambda.ingestLambda;
        this.customAuthorizerLambdaLogGroup = customAuthorizerLambda.logGroup;
        infof(
                "Created Custom Authorizer Lambda %s with ingestHandler %s",
                this.customAuthorizerLambda.getNode().getId(), props.sharedNames().customAuthorizerIngestLambdaHandler);

        // No bundles grant: the authorizer validates the JWT and loads the salt, and reads no table.

        // Grant Custom Authorizer Lambda access to user sub hash salt secret
        SubHashSaltHelper.grantSaltAccess(this.customAuthorizerLambda, region, account, props.envName());
        infof("Granted Secrets Manager salt access to %s", this.customAuthorizerLambda.getFunctionName());

        // Grant EventBridge PutEvents permission to custom authorizer
        this.customAuthorizerLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        // Mid-session country-change check (issue #10 acceptance criterion 4): read and write
        // the geo#{hashedSub} item, and force a global sign-out when the country changes.
        // PutItem, not UpdateItem: putSessionGeo always replaces the whole item (country,
        // revokedAt, ttl) in one call rather than patching individual attributes.
        securityStateTable.grant(this.customAuthorizerLambda, "dynamodb:GetItem", "dynamodb:PutItem");
        var userPoolArn = String.format("arn:aws:cognito-idp:%s:%s:userpool/%s", region, account, props.cognitoUserPoolId());
        this.customAuthorizerLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("cognito-idp:AdminUserGlobalSignOut"))
                .resources(List.of(userPoolArn))
                .build());
        infof(
                "Granted Security State Table read/write and AdminUserGlobalSignOut to %s",
                this.customAuthorizerLambda.getFunctionName());

        Lambda.stackHealthAlarm(
                this,
                props.resourceNamePrefix(),
                "auth",
                List.of(exchangeCognitoTokenLambdaUrlOrigin, customAuthorizerLambda));

        // cfnOutput(this, "AuthUrlCognitoLambdaArn", this.cognitoAuthUrlGetLambda.getFunctionArn());
        cfnOutput(this, "ExchangeCognitoTokenLambdaArn", this.cognitoTokenPostLambda.getFunctionArn());
        cfnOutput(this, "CustomAuthorizerLambdaArn", this.customAuthorizerLambda.getFunctionArn());

        infof("AuthStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
