/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
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
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.secretsmanager.ISecret;
import software.amazon.awscdk.services.secretsmanager.Secret;
import software.constructs.Construct;
import software.constructs.IDependable;

public class IdentityStack extends Stack {

    public ICertificate certificate;
    public ISecret googleClientSecretsManagerSecret;
    public UserPool userPool;
    public UserPoolClient userPoolClient;
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
                .runtime(Runtime.NODEJS_22_X)
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
        cfnOutput(this, "UserPoolDomainName", this.userPoolDomain.getDomainName());
        cfnOutput(this, "UserPoolDomainARecord", this.userPoolDomainARecordName);
        cfnOutput(this, "UserPoolDomainAaaaRecord", this.userPoolDomainAaaaRecordName);
        cfnOutput(this, "CognitoGoogleIdpId", this.googleIdentityProvider.getProviderName());

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
}
