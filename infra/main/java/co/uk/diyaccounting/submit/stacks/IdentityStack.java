/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cognito.AccountRecovery;
import software.amazon.awscdk.services.cognito.AttributeMapping;
import software.amazon.awscdk.services.cognito.AuthFlow;
import software.amazon.awscdk.services.cognito.CustomThreatProtectionMode;
import software.amazon.awscdk.services.cognito.FeaturePlan;
import software.amazon.awscdk.services.cognito.Mfa;
import software.amazon.awscdk.services.cognito.MfaSecondFactor;
import software.amazon.awscdk.services.cognito.OAuthFlows;
import software.amazon.awscdk.services.cognito.OAuthScope;
import software.amazon.awscdk.services.cognito.OAuthSettings;
import software.amazon.awscdk.services.cognito.ProviderAttribute;
import software.amazon.awscdk.services.cognito.SignInAliases;
import software.amazon.awscdk.services.cognito.StandardAttribute;
import software.amazon.awscdk.services.cognito.StandardAttributes;
import software.amazon.awscdk.services.cognito.StandardThreatProtectionMode;
import software.amazon.awscdk.services.cognito.StringAttribute;
import software.amazon.awscdk.services.cognito.UserPool;
import software.amazon.awscdk.services.cognito.UserPoolClient;
import software.amazon.awscdk.services.cognito.UserPoolClientIdentityProvider;
import software.amazon.awscdk.services.cognito.UserPoolDomain;
import software.amazon.awscdk.services.cognito.UserPoolIdentityProviderGoogle;
import software.amazon.awscdk.services.cognito.UserPoolOperation;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.WebIdentityPrincipal;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.amazon.awscdk.services.ssm.StringParameter;
import software.constructs.Construct;
import software.constructs.IDependable;

public class IdentityStack extends Stack {

    public ICertificate certificate;
    public ISecret googleClientSecretsManagerSecret;
    public UserPool userPool;
    public UserPoolClient userPoolClient;
    public UserPoolClient booksUserPoolClient;
    public UserPoolIdentityProviderGoogle googleIdentityProvider;
    public final HashMap<UserPoolClientIdentityProvider, IDependable> identityProviders = new HashMap<>();
    public final UserPoolDomain userPoolDomain;
    public final String userPoolDomainARecordName;
    public final String userPoolDomainAaaaRecordName;
    public final ICertificate authCertificate;

    @Value.Immutable
    public interface IdentityStackProps extends StackProps, SubmitStackProps {

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

        String hostedZoneName();

        String hostedZoneId();

        String certificateArn();

        String googleClientId();

        String googleClientSecretArn();

        static ImmutableIdentityStackProps.Builder builder() {
            return ImmutableIdentityStackProps.builder();
        }
    }

    public IdentityStack(Construct scope, String id, IdentityStackProps props) {
        this(scope, id, null, props);
    }

    public IdentityStack(Construct scope, String id, StackProps stackProps, IdentityStackProps props) {
        super(scope, id, stackProps);

        // Values are provided via SubmitApplication after context/env resolution

        var hostedZone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix() + "-HostedZone",
                HostedZoneAttributes.builder()
                        .zoneName(props.hostedZoneName())
                        .hostedZoneId(props.hostedZoneId())
                        .build());

        this.authCertificate = Certificate.fromCertificateArn(
                this, props.resourceNamePrefix() + "-AuthCertificate", props.certificateArn());

        // Create a secret for the Google client secret and set the ARN to be used in the Lambda

        // Look up the client secret by arn
        if (props.googleClientSecretArn() == null
                || props.googleClientSecretArn().isBlank()) {
            throw new IllegalArgumentException("GOOGLE_CLIENT_SECRET_ARN must be provided for env=" + props.envName());
        }
        this.googleClientSecretsManagerSecret = Secret.fromSecretPartialArn(
                this, props.resourceNamePrefix() + "-GoogleClientSecret", props.googleClientSecretArn());

        var googleClientSecretValue = this.googleClientSecretsManagerSecret.getSecretValue();

        // Create Cognito User Pool for authentication
        var standardAttributes = StandardAttributes.builder()
                .email(StandardAttribute.builder().required(false).mutable(true).build())
                .givenName(StandardAttribute.builder()
                        .required(false)
                        .mutable(true)
                        .build())
                .familyName(StandardAttribute.builder()
                        .required(false)
                        .mutable(true)
                        .build())
                .build();
        this.userPool = UserPool.Builder.create(this, props.resourceNamePrefix() + "-UserPool")
                .userPoolName(props.resourceNamePrefix() + "-user-pool")
                .selfSignUpEnabled(false)
                .signInAliases(SignInAliases.builder().email(true).build())
                .standardAttributes(standardAttributes)
                .customAttributes(Map.of(
                        "bundles",
                        StringAttribute.Builder.create()
                                .maxLen(2048)
                                .mutable(true)
                                .build()))
                // Phase 2.1: Enable Cognito Threat Protection (risk-based adaptive authentication)
                // FULL_FUNCTION mode blocks suspicious sign-ins and requires MFA for risky attempts
                // Provides: compromised credential detection, account takeover protection,
                // suspicious IP detection, and device fingerprinting
                // Requires PLUS tier for Threat Protection features
                .featurePlan(FeaturePlan.PLUS)
                .standardThreatProtectionMode(StandardThreatProtectionMode.FULL_FUNCTION)
                .customThreatProtectionMode(CustomThreatProtectionMode.FULL_FUNCTION)
                // Enable optional TOTP MFA for native auth users (test users, future native users)
                // Federated users (Google) bypass Cognito MFA — their IdP handles MFA independently
                .mfa(Mfa.OPTIONAL)
                .mfaSecondFactor(MfaSecondFactor.builder()
                        .otp(true) // TOTP via authenticator apps
                        .sms(false) // No SMS MFA (no phone numbers collected)
                        .build())
                .accountRecovery(AccountRecovery.NONE)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // Pre Token Generation trigger: injects custom:mfa_method claim for TOTP users.
        // Cognito doesn't populate the amr claim for native TOTP MFA, so this trigger
        // adds a custom claim that the frontend can use to detect MFA completion.
        // Resolve asset path from either project root (Maven test) or cdk-environment/ (cdk synth)
        var preTokenGenRelativePath = "app/functions/auth/preTokenGeneration";
        var preTokenGenAssetDir =
                Paths.get(preTokenGenRelativePath).toAbsolutePath().normalize();
        if (!preTokenGenAssetDir.toFile().isDirectory()) {
            preTokenGenAssetDir =
                    Paths.get("../" + preTokenGenRelativePath).toAbsolutePath().normalize();
        }
        // IdentityStack is env-scoped (one deployment per environment, redeployed indefinitely),
        // so this function name is stable forever, not per-deployment: it has already run in ci
        // and prod, and Lambda already auto-created its log group with no retention or removal
        // policy. A plain LogGroup construct here would fail at deploy with "already exists" - use
        // the idempotent create-if-missing path instead, the same one PublishStack and HoldingStack
        // use for their equally stable-named deployment Lambdas.
        var preTokenGenFunctionName = props.resourceNamePrefix() + "-pre-token-generation";
        var preTokenGenLogGroup = ensureLogGroupWithDependency(
                this,
                props.resourceNamePrefix() + "-PreTokenGenerationLogGroup",
                "/aws/lambda/" + preTokenGenFunctionName);

        var preTokenGenFunction = Function.Builder.create(this, props.resourceNamePrefix() + "-PreTokenGeneration")
                .functionName(preTokenGenFunctionName)
                .runtime(Runtime.NODEJS_24_X)
                .architecture(Architecture.ARM_64)
                .handler("index.handler")
                .code(Code.fromAsset(preTokenGenAssetDir.toString()))
                .timeout(Duration.seconds(5))
                .memorySize(128)
                .logGroup(preTokenGenLogGroup.logGroup())
                .build();
        preTokenGenFunction.getNode().addDependency(preTokenGenLogGroup.ensureResource());
        this.userPool.addTrigger(UserPoolOperation.PRE_TOKEN_GENERATION, preTokenGenFunction);
        // Grant AdminGetUser using a string ARN pattern to avoid circular dependency:
        // UserPool -> Lambda (trigger) -> IAM Policy (UserPool ARN) -> UserPool
        preTokenGenFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .actions(List.of("cognito-idp:AdminGetUser"))
                .resources(List.of(String.format(
                        "arn:aws:cognito-idp:%s:%s:userpool/*",
                        props.getEnv().getRegion(), props.getEnv().getAccount())))
                .build());

        // Google IdP
        this.googleIdentityProvider = UserPoolIdentityProviderGoogle.Builder.create(
                        this, props.resourceNamePrefix() + "-GoogleIdentityProvider")
                .userPool(this.userPool)
                .clientId(props.googleClientId())
                .clientSecretValue(googleClientSecretValue)
                .scopes(List.of("email", "openid", "profile"))
                .attributeMapping(AttributeMapping.builder()
                        .email(ProviderAttribute.GOOGLE_EMAIL)
                        .givenName(ProviderAttribute.GOOGLE_GIVEN_NAME)
                        .familyName(ProviderAttribute.GOOGLE_FAMILY_NAME)
                        .build())
                .build();
        this.identityProviders.put(UserPoolClientIdentityProvider.GOOGLE, this.googleIdentityProvider);

        // User Pool Client
        // Native Cognito login (COGNITO) is NOT included by default to hide the email/password
        // form on the Hosted UI. It is enabled dynamically during behaviour tests via
        // scripts/toggle-cognito-native-auth.js and disabled afterwards.
        var allProviders = new java.util.ArrayList<>(this.identityProviders.keySet());
        this.userPoolClient = UserPoolClient.Builder.create(this, props.resourceNamePrefix() + "-UserPoolClient")
                .userPool(userPool)
                .userPoolClientName(props.resourceNamePrefix() + "-client")
                .generateSecret(false)
                // Enable USER_PASSWORD_AUTH for native Cognito user authentication (used by behavior tests)
                .authFlows(AuthFlow.builder()
                        .userPassword(true) // ALLOW_USER_PASSWORD_AUTH for native users
                        .userSrp(true) // ALLOW_USER_SRP_AUTH for more secure native auth
                        .build())
                .oAuth(OAuthSettings.builder()
                        .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                        .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                        .callbackUrls(buildCallbackUrls(props.sharedNames()))
                        .logoutUrls(buildLogoutUrls(props.sharedNames()))
                        .build())
                .supportedIdentityProviders(allProviders)
                .build();
        this.identityProviders
                .values()
                .forEach(idp -> this.userPoolClient.getNode().addDependency(idp));

        // Books User Pool Client
        // A second client on the same pool for the spreadsheets site's DIYA-GL pages. Sign-in stays
        // on this pool's hosted UI (same Google IdP, no native Cognito login), then redirects back
        // to the spreadsheets host - so this client needs no USER_PASSWORD_AUTH/USER_SRP_AUTH flow,
        // only the authorization-code grant the hosted UI redirect uses.
        this.booksUserPoolClient = UserPoolClient.Builder.create(this, props.resourceNamePrefix() + "-BooksUserPoolClient")
                .userPool(userPool)
                .userPoolClientName(props.resourceNamePrefix() + "-books-client")
                .generateSecret(false)
                .preventUserExistenceErrors(true)
                .oAuth(OAuthSettings.builder()
                        .flows(OAuthFlows.builder().authorizationCodeGrant(true).build())
                        .scopes(List.of(OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE))
                        .callbackUrls(buildBooksUrls(props.envName()))
                        .logoutUrls(buildBooksUrls(props.envName()))
                        .build())
                .supportedIdentityProviders(allProviders)
                .build();
        this.identityProviders
                .values()
                .forEach(idp -> this.booksUserPoolClient.getNode().addDependency(idp));

        var booksUserPoolClientIdParameterName =
                "/submit/%s/spreadsheets-books-app-client-id".formatted(props.envName());
        StringParameter.Builder.create(this, props.resourceNamePrefix() + "-BooksUserPoolClientIdParameter")
                .parameterName(booksUserPoolClientIdParameterName)
                .stringValue(this.booksUserPoolClient.getUserPoolClientId())
                .build();

        // Create Cognito User Pool Domain
        this.userPoolDomain = UserPoolDomain.Builder.create(this, props.resourceNamePrefix() + "-UserPoolDomain")
                .userPool(userPool)
                .customDomain(software.amazon.awscdk.services.cognito.CustomDomainOptions.builder()
                        .domainName(props.sharedNames().cognitoDomainName)
                        .certificate(this.authCertificate)
                        .build())
                .build();

        // Create Route53 records for the Cognito UserPoolDomain as subdomains from the web domain.
        // Idempotent UPSERT of Route53 A/AAAA alias to Cognito User Pool Domain CloudFront endpoint
        co.uk.diyaccounting.submit.utils.Route53AliasUpsert.upsertAliasToCloudFront(
                this,
                props.resourceNamePrefix() + "-UserPoolDomainAlias",
                hostedZone,
                props.sharedNames().cognitoDomainName,
                this.userPoolDomain.getCloudFrontEndpoint());
        this.userPoolDomainARecordName = props.sharedNames().cognitoDomainName;
        this.userPoolDomainAaaaRecordName = props.sharedNames().cognitoDomainName;

        // Stack Outputs for Identity resources
        cfnOutput(this, "UserPoolId", this.userPool.getUserPoolId());
        cfnOutput(this, "UserPoolArn", this.userPool.getUserPoolArn());
        cfnOutput(this, "UserPoolClientId", this.userPoolClient.getUserPoolClientId());
        cfnOutput(this, "BooksUserPoolClientId", this.booksUserPoolClient.getUserPoolClientId());
        cfnOutput(this, "UserPoolDomainName", this.userPoolDomain.getDomainName());
        cfnOutput(this, "UserPoolDomainARecord", this.userPoolDomainARecordName);
        cfnOutput(this, "UserPoolDomainAaaaRecord", this.userPoolDomainAaaaRecordName);
        cfnOutput(this, "CognitoGoogleIdpId", this.googleIdentityProvider.getProviderName());

        // Role the spreadsheets repository's GitHub Actions assumes to mint and rotate its own
        // Cognito test user against this pool, and purge that user's DynamoDB data between runs,
        // the same two scripts (ensure-cognito-test-user.js, delete-user-data.js) this repository
        // runs on itself. The role name is fixed so the spreadsheets workflow can reference the
        // ARN without reading a CloudFormation output from this repository's stacks.
        var spreadsheetsBehaviourRoleName = props.envName() + "-env-spreadsheets-behaviour-role";
        var githubOidcProviderArn = "arn:aws:iam::" + props.getEnv().getAccount()
                + ":oidc-provider/token.actions.githubusercontent.com";
        var spreadsheetsBehaviourRole = Role.Builder.create(
                        this, props.resourceNamePrefix() + "-SpreadsheetsBehaviourRole")
                .roleName(spreadsheetsBehaviourRoleName)
                .assumedBy(new WebIdentityPrincipal(
                        githubOidcProviderArn,
                        Map.of(
                                "StringEquals",
                                Map.of("token.actions.githubusercontent.com:aud", "sts.amazonaws.com"),
                                "StringLike",
                                Map.of(
                                        "token.actions.githubusercontent.com:sub",
                                        "repo:diy-accounting-uk/spreadsheets.diyaccounting.co.uk:*"))))
                .build();

        // scripts/ensure-cognito-test-user.js: create the durable test user, rotate its password,
        // and enrol its TOTP device. It calls InitiateAuth, not AdminInitiateAuth, because the
        // user pool client has ALLOW_USER_PASSWORD_AUTH but not ALLOW_ADMIN_USER_PASSWORD_AUTH.
        spreadsheetsBehaviourRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "cognito-idp:AdminCreateUser",
                        "cognito-idp:AdminGetUser",
                        "cognito-idp:AdminSetUserPassword",
                        "cognito-idp:AdminSetUserMFAPreference",
                        "cognito-idp:AssociateSoftwareToken",
                        "cognito-idp:VerifySoftwareToken",
                        "cognito-idp:InitiateAuth"))
                .resources(List.of(this.userPool.getUserPoolArn()))
                .build());

        // The spreadsheets ci behaviour run toggles native sign-in on the DIYA-GL (books) app
        // client itself, the same way this repository's own toggle-cognito-native-auth.js does.
        spreadsheetsBehaviourRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("cognito-idp:DescribeUserPoolClient", "cognito-idp:UpdateUserPoolClient"))
                .resources(List.of(this.userPool.getUserPoolArn()))
                .build());

        // scripts/ensure-cognito-test-user.js looks up the pool and client ids from this stack's
        // outputs rather than hardcoding them.
        spreadsheetsBehaviourRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("cloudformation:DescribeStacks"))
                .resources(List.of(String.format(
                        "arn:aws:cloudformation:%s:%s:stack/%s/*",
                        props.getEnv().getRegion(),
                        props.getEnv().getAccount(),
                        props.sharedNames().identityStackId)))
                .build());

        // scripts/delete-user-data.js purges the eight tables it queries by hashedSub: a Query on
        // each, then a delete on seven and, on receipts, an anonymizing update before the delete.
        var purgedTableNames = List.of(
                props.sharedNames().receiptsTableName,
                props.sharedNames().bundlesTableName,
                props.sharedNames().hmrcApiRequestsTableName,
                props.sharedNames().bundlePostAsyncRequestsTableName,
                props.sharedNames().bundleDeleteAsyncRequestsTableName,
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName,
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName,
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName);
        var purgedTableArns = purgedTableNames.stream()
                .map(tableName -> String.format(
                        "arn:aws:dynamodb:%s:%s:table/%s",
                        props.getEnv().getRegion(), props.getEnv().getAccount(), tableName))
                .toList();

        spreadsheetsBehaviourRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("dynamodb:Query", "dynamodb:DeleteItem"))
                .resources(purgedTableArns)
                .build());

        spreadsheetsBehaviourRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("dynamodb:UpdateItem"))
                .resources(List.of(String.format(
                        "arn:aws:dynamodb:%s:%s:table/%s",
                        props.getEnv().getRegion(),
                        props.getEnv().getAccount(),
                        props.sharedNames().receiptsTableName)))
                .build());

        cfnOutput(this, "SpreadsheetsBehaviourRoleArn", spreadsheetsBehaviourRole.getRoleArn());

        infof(
                "IdentityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }

    private static List<String> buildCallbackUrls(SubmitSharedNames sharedNames) {
        var urls = new java.util.ArrayList<>(List.of(
                "https://" + sharedNames.publicDomainName + "/",
                "https://" + sharedNames.publicDomainName + "/auth/loginWithCognitoCallback.html"));
        if (!sharedNames.publicDomainName.equals(sharedNames.envDomainName)) {
            urls.add("https://" + sharedNames.envDomainName + "/");
            urls.add("https://" + sharedNames.envDomainName + "/auth/loginWithCognitoCallback.html");
        }
        return urls;
    }

    private static List<String> buildLogoutUrls(SubmitSharedNames sharedNames) {
        var urls = new java.util.ArrayList<>(List.of("https://" + sharedNames.publicDomainName + "/"));
        urls.add("https://" + sharedNames.publicDomainName + "/auth/signed-out.html");
        if (!sharedNames.publicDomainName.equals(sharedNames.envDomainName)) {
            urls.add("https://" + sharedNames.envDomainName + "/");
            urls.add("https://" + sharedNames.envDomainName + "/auth/signed-out.html");
        }
        return urls;
    }

    // The four DIYA-GL pages, one per spreadsheets product, all served under /books/ on the
    // spreadsheets site. Cognito requires an exact match per callback/logout URL, so both the
    // /books/ landing path and each page are listed.
    private static final List<String> BOOKS_PAGE_NAMES = List.of("bst.html", "se.html", "taxi.html", "ltd.html");

    private static List<String> buildBooksUrls(String envName) {
        // prod also lists the ci-spreadsheets host so the spreadsheets repository's ci
        // behaviour run can sign in and test its DIYA-GL pages against Submit's prod environment.
        var hosts = "prod".equals(envName)
                ? List.of("https://spreadsheets.diyaccounting.co.uk", "https://ci-spreadsheets.diyaccounting.co.uk")
                : List.of("https://ci-spreadsheets.diyaccounting.co.uk", "http://localhost:3000");
        var urls = new java.util.ArrayList<String>();
        for (var host : hosts) {
            urls.add(host + "/books/");
            for (var page : BOOKS_PAGE_NAMES) {
                urls.add(host + "/books/" + page);
            }
        }
        return urls;
    }
}
