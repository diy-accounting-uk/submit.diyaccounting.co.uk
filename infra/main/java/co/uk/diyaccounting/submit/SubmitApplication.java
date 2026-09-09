/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;

import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.stacks.AccountStack;
import co.uk.diyaccounting.submit.stacks.ApiStack;
import co.uk.diyaccounting.submit.stacks.AuthStack;
import co.uk.diyaccounting.submit.stacks.BillingStack;
import co.uk.diyaccounting.submit.stacks.BooksStack;
import co.uk.diyaccounting.submit.stacks.CompaniesHouseStack;
import co.uk.diyaccounting.submit.stacks.EdgeStack;
import co.uk.diyaccounting.submit.stacks.HmrcStack;
import co.uk.diyaccounting.submit.stacks.OpsStack;
import co.uk.diyaccounting.submit.stacks.PublishStack;
import co.uk.diyaccounting.submit.stacks.SelfDestructStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import java.lang.reflect.Field;
import java.nio.file.Paths;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

public class SubmitApplication {

    public final AuthStack authStack;
    public final HmrcStack hmrcStack;
    public final CompaniesHouseStack companiesHouseStack;
    public final AccountStack accountStack;
    public final BillingStack billingStack;
    public final BooksStack booksStack;
    public final ApiStack apiStack;
    public final OpsStack opsStack;
    public final EdgeStack edgeStack;
    public final PublishStack publishStack;
    public final SelfDestructStack selfDestructStack;

    public static class SubmitApplicationProps {
        // Fields match cdk.json context keys (camelCase). Environment overrides are applied in SubmitApplication
        public String envName;
        public String deploymentName;
        public String hostedZoneName;
        public String subDomainName;
        public String cloudTrailEnabled;
        public String hmrcClientId;
        public String hmrcClientSecretArn;
        public String hmrcBaseUri;
        public String hmrcSandboxClientId;
        public String hmrcSandboxClientSecretArn;
        public String hmrcSandboxBaseUri;
        public String companiesHouseBaseUri;
        public String companiesHouseApiKeyArn;
        public String companiesHouseFilingBaseUri;
        public String companiesHouseIdentityBaseUri;
        public String companiesHouseClientId;
        public String companiesHouseClientSecretArn;
        public String companiesHouseXmlGatewayUri;
        public String companiesHousePresenterIdArn;
        public String companiesHousePresenterCodeArn;
        public String baseImageTag;
        public String selfDestructDelayHours;
        public String userPoolArn;
        public String userPoolClientId;
        public String booksUserPoolClientId;
        public String bundlesTableArn;
        public String hostedZoneId;
        public String certificateArn;
        public String docRootPath;
        public String httpApiUrl;
        public String regionalCertificateArn;
        public String githubTokenSecretArn;
        public String feedbackEngagementEnabled;
        public String stripeSecretKeyArn;
        public String stripeTestSecretKeyArn;
        public String stripePriceIdResidentPro;
        public String stripeTestPriceIdResidentPro;
        public String stripePriceIdResidentVat;
        public String stripeTestPriceIdResidentVat;
        public String stripePriceIdResidentItsa;
        public String stripeTestPriceIdResidentItsa;
        public String stripePriceIdResidentLtd;
        public String stripeTestPriceIdResidentLtd;
        public String stripePriceIdResidentDiyaGl;
        public String stripeTestPriceIdResidentDiyaGl;
        public String stripeWebhookSecretArn;
        public String stripeTestWebhookSecretArn;
        public String opsGithubTokenSecretArn;
        // Comma-separated hand-applied IP block list for EdgeStack's WafManualBlock rule (issue
        // #9 phase 9.3); see wafManualBlockIps in cdk-application/cdk.json.
        public String wafManualBlockIps;

        public static class Builder {
            private final SubmitApplicationProps p = new SubmitApplicationProps();

            public static Builder create() {
                return new Builder();
            }

            public SubmitApplicationProps build() {
                return p;
            }

            public Builder set(String key, String value) {
                try {
                    var f = SubmitApplicationProps.class.getDeclaredField(key);
                    f.setAccessible(true);
                    f.set(p, value);
                } catch (Exception ignored) {
                }
                return this;
            }
        }
    }

    public static void main(final String[] args) {
        App app = new App();
        SubmitApplicationProps appProps = loadAppProps(app);
        var submitApplication = new SubmitApplication(app, appProps);
        app.synth();
        infof("CDK synth complete");
        if (submitApplication.selfDestructStack != null) {
            infof("Created stack: %s", submitApplication.selfDestructStack.getStackName());
        } else {
            infof("No SelfDestruct stack created for prod deployment");
        }
    }

    public SubmitApplication(App app, SubmitApplicationProps appProps) {

        // Determine environment and deployment name from env or appProps
        String envName = envOr("ENVIRONMENT_NAME", appProps.envName);
        String deploymentName = envOr("DEPLOYMENT_NAME", appProps.deploymentName);

        // Determine primary environment (account/region) from CDK env
        Environment primaryEnv = KindCdk.buildPrimaryEnvironment();
        Environment usEast1Env = Environment.builder()
                .region("us-east-1")
                .account(primaryEnv.getAccount())
                .build();

        var nameProps = new SubmitSharedNames.SubmitSharedNamesProps();
        nameProps.envName = envName;
        nameProps.deploymentName = deploymentName;
        nameProps.hostedZoneName = appProps.hostedZoneName;
        nameProps.subDomainName = appProps.subDomainName;
        nameProps.regionName = primaryEnv.getRegion();
        nameProps.awsAccount = primaryEnv.getAccount();
        var sharedNames = new SubmitSharedNames(nameProps);

        // Allow environment variables to override some appProps values
        var cognitoUserPoolArn = envOr("COGNITO_USER_POOL_ARN", appProps.userPoolArn, "(from userPoolArn in cdk.json)");
        var cognitoUserPoolClientId =
                envOr("COGNITO_CLIENT_ID", appProps.userPoolClientId, "(from userPoolClientId in cdk.json)");
        var cognitoBooksUserPoolClientId = envOr(
                "COGNITO_BOOKS_CLIENT_ID",
                appProps.booksUserPoolClientId,
                "(from booksUserPoolClientId in cdk.json)");
        // The books page runs on the spreadsheets site's own origins, not this deployment's;
        // prod is the one live spreadsheets domain, every other deployment uses the shared ci one
        // plus local dev.
        var booksAllowedOrigins = "prod".equals(envName)
                ? "https://spreadsheets.diyaccounting.co.uk,https://ci-spreadsheets.diyaccounting.co.uk"
                : "https://ci-spreadsheets.diyaccounting.co.uk,http://localhost:3000";
        // A checkout or portal returnTo is allowed from the DIYA-GL pages' origins (the same
        // list the books routes use) plus this deployment's own origin, since bundles.html lives
        // there too.
        var billingReturnUrlOrigins = booksAllowedOrigins + "," + sharedNames.publicBaseUrl.replaceAll("/$", "");
        var cognitoUserPoolId = cognitoUserPoolArn != null
                ? cognitoUserPoolArn.split("/")[1]
                : "(unknown cognitoUserPoolId because no cognitoUserPoolArn)";
        var hmrcClientSecretArn =
                envOr("HMRC_CLIENT_SECRET_ARN", appProps.hmrcClientSecretArn, "(from hmrcClientSecretArn in cdk.json)");
        var hmrcSandboxClientSecretArn = envOr(
                "HMRC_SANDBOX_CLIENT_SECRET_ARN",
                appProps.hmrcSandboxClientSecretArn,
                "(from hmrcSandboxClientSecretArn in cdk.json)");
        var companiesHouseBaseUri = envOr(
                "COMPANIES_HOUSE_BASE_URI", appProps.companiesHouseBaseUri, "(from companiesHouseBaseUri in cdk.json)");
        var companiesHouseApiKeyArn = envOr(
                "COMPANIES_HOUSE_API_KEY_ARN",
                appProps.companiesHouseApiKeyArn,
                "(from companiesHouseApiKeyArn in cdk.json)");
        var companiesHouseFilingBaseUri = envOr(
                "COMPANIES_HOUSE_FILING_BASE_URI",
                appProps.companiesHouseFilingBaseUri,
                "(from companiesHouseFilingBaseUri in cdk.json)");
        var companiesHouseIdentityBaseUri = envOr(
                "COMPANIES_HOUSE_IDENTITY_BASE_URI",
                appProps.companiesHouseIdentityBaseUri,
                "(from companiesHouseIdentityBaseUri in cdk.json)");
        var companiesHouseClientId = envOr(
                "COMPANIES_HOUSE_CLIENT_ID",
                appProps.companiesHouseClientId,
                "(from companiesHouseClientId in cdk.json)");
        var companiesHouseClientSecretArn = envOr(
                "COMPANIES_HOUSE_CLIENT_SECRET_ARN",
                appProps.companiesHouseClientSecretArn,
                "(from companiesHouseClientSecretArn in cdk.json)");
        var companiesHouseXmlGatewayUri = envOr(
                "COMPANIES_HOUSE_XMLGW_URI",
                appProps.companiesHouseXmlGatewayUri,
                "(from companiesHouseXmlGatewayUri in cdk.json)");
        var companiesHousePresenterIdArn = envOr(
                "COMPANIES_HOUSE_PRESENTER_ID_ARN",
                appProps.companiesHousePresenterIdArn,
                "(from companiesHousePresenterIdArn in cdk.json)");
        var companiesHousePresenterCodeArn = envOr(
                "COMPANIES_HOUSE_PRESENTER_CODE_ARN",
                appProps.companiesHousePresenterCodeArn,
                "(from companiesHousePresenterCodeArn in cdk.json)");
        var baseImageTag = envOr("BASE_IMAGE_TAG", appProps.baseImageTag, "(from baseImageTag in cdk.json)");
        var selfDestructDelayHoursString = envOr(
                "SELF_DESTRUCT_DELAY_HOURS",
                appProps.selfDestructDelayHours,
                "(from selfDestructDelayHours in cdk.json)");
        int selfDestructDelayHours = Integer.parseInt(selfDestructDelayHoursString);
        var selfDestructStartDatetimeIso = envOr(
                "SELF_DESTRUCT_START_DATETIME",
                ZonedDateTime.now().plusHours(selfDestructDelayHours).format(DateTimeFormatter.ISO_DATE_TIME),
                "(from current time plus delay hours)");
        ZonedDateTime selfDestructStartDatetime = ZonedDateTime.parse(selfDestructStartDatetimeIso);
        infof("Self-destruct start datetime: %s", selfDestructStartDatetime);
        var cloudTrailEnabled =
                envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled, "(from cloudTrailEnabled in cdk.json)");
        var httpApiUrl = envOr("HTTP_API_URL", appProps.httpApiUrl, "(from httpApiUrl in cdk.json)");
        var stripeSecretKeyArn =
                envOr("STRIPE_SECRET_KEY_ARN", appProps.stripeSecretKeyArn, "(from stripeSecretKeyArn in cdk.json)");
        var stripeTestSecretKeyArn = envOr(
                "STRIPE_TEST_SECRET_KEY_ARN",
                appProps.stripeTestSecretKeyArn,
                "(from stripeTestSecretKeyArn in cdk.json)");
        var stripePriceIdResidentPro = envOr(
                "STRIPE_PRICE_ID_RESIDENT_PRO",
                appProps.stripePriceIdResidentPro,
                "(from stripePriceIdResidentPro in cdk.json)");
        var stripeTestPriceIdResidentPro = envOr(
                "STRIPE_TEST_PRICE_ID_RESIDENT_PRO",
                appProps.stripeTestPriceIdResidentPro,
                "(from stripeTestPriceIdResidentPro in cdk.json)");
        var stripePriceIdResidentVat = envOr(
                "STRIPE_PRICE_ID_RESIDENT_VAT",
                appProps.stripePriceIdResidentVat,
                "(from stripePriceIdResidentVat in cdk.json)");
        var stripeTestPriceIdResidentVat = envOr(
                "STRIPE_TEST_PRICE_ID_RESIDENT_VAT",
                appProps.stripeTestPriceIdResidentVat,
                "(from stripeTestPriceIdResidentVat in cdk.json)");
        var stripePriceIdResidentItsa = envOr(
                "STRIPE_PRICE_ID_RESIDENT_ITSA",
                appProps.stripePriceIdResidentItsa,
                "(from stripePriceIdResidentItsa in cdk.json)");
        var stripeTestPriceIdResidentItsa = envOr(
                "STRIPE_TEST_PRICE_ID_RESIDENT_ITSA",
                appProps.stripeTestPriceIdResidentItsa,
                "(from stripeTestPriceIdResidentItsa in cdk.json)");
        var stripePriceIdResidentLtd = envOr(
                "STRIPE_PRICE_ID_RESIDENT_LTD",
                appProps.stripePriceIdResidentLtd,
                "(from stripePriceIdResidentLtd in cdk.json)");
        var stripeTestPriceIdResidentLtd = envOr(
                "STRIPE_TEST_PRICE_ID_RESIDENT_LTD",
                appProps.stripeTestPriceIdResidentLtd,
                "(from stripeTestPriceIdResidentLtd in cdk.json)");
        var stripePriceIdResidentDiyaGl = envOr(
                "STRIPE_PRICE_ID_RESIDENT_DIYA_GL",
                appProps.stripePriceIdResidentDiyaGl,
                "(from stripePriceIdResidentDiyaGl in cdk.json)");
        var stripeTestPriceIdResidentDiyaGl = envOr(
                "STRIPE_TEST_PRICE_ID_RESIDENT_DIYA_GL",
                appProps.stripeTestPriceIdResidentDiyaGl,
                "(from stripeTestPriceIdResidentDiyaGl in cdk.json)");
        var stripeWebhookSecretArn = envOr(
                "STRIPE_WEBHOOK_SECRET_ARN",
                appProps.stripeWebhookSecretArn,
                "(from stripeWebhookSecretArn in cdk.json)");
        var stripeTestWebhookSecretArn = envOr(
                "STRIPE_TEST_WEBHOOK_SECRET_ARN",
                appProps.stripeTestWebhookSecretArn,
                "(from stripeTestWebhookSecretArn in cdk.json)");
        var opsGithubTokenSecretArn = envOr(
                "OPS_GITHUB_TOKEN_SECRET_ARN",
                appProps.opsGithubTokenSecretArn,
                "(from opsGithubTokenSecretArn in cdk.json)");
        var certificateArn = envOr("CERTIFICATE_ARN", appProps.certificateArn, "(from certificateArn in cdk.json)");
        var regionalCertificateArn = envOr(
                "REGIONAL_CERTIFICATE_ARN",
                appProps.regionalCertificateArn,
                "(from regionalCertificateArn in cdk.json)");
        var commitHash = envOr("COMMIT_HASH", "local");
        var websiteHash = envOr("WEBSITE_HASH", "local");
        var buildNumber = envOr("BUILD_NUMBER", "local");
        var docRootPath = envOr("DOC_ROOT_PATH", appProps.docRootPath, "(from docRootPath in cdk.json)");

        // Create the AuthStack with resources used in authentication and authorisation
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.authStackId, deploymentName, envName);
        this.authStack = new AuthStack(
                app,
                sharedNames.authStackId,
                AuthStack.AuthStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .cognitoClientId(cognitoUserPoolClientId)
                        .cognitoUserPoolId(cognitoUserPoolId)
                        .cognitoUserPoolClientId(cognitoUserPoolClientId)
                        .build());

        // Create the HmrcStack
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.hmrcStackId, deploymentName, envName);
        this.hmrcStack = new HmrcStack(
                app,
                sharedNames.hmrcStackId,
                HmrcStack.HmrcStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .hmrcBaseUri(appProps.hmrcBaseUri)
                        .hmrcClientId(appProps.hmrcClientId)
                        .hmrcClientSecretArn(hmrcClientSecretArn)
                        .hmrcSandboxBaseUri(appProps.hmrcSandboxBaseUri)
                        .hmrcSandboxClientId(appProps.hmrcSandboxClientId)
                        .hmrcSandboxClientSecretArn(hmrcSandboxClientSecretArn)
                        .cognitoUserPoolId(cognitoUserPoolId)
                        .build());

        // Create the CompaniesHouseStack
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.companiesHouseStackId, deploymentName, envName);
        this.companiesHouseStack = new CompaniesHouseStack(
                app,
                sharedNames.companiesHouseStackId,
                CompaniesHouseStack.CompaniesHouseStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .companiesHouseBaseUri(companiesHouseBaseUri)
                        .companiesHouseApiKeyArn(companiesHouseApiKeyArn != null ? companiesHouseApiKeyArn : "")
                        .companiesHouseFilingBaseUri(companiesHouseFilingBaseUri != null ? companiesHouseFilingBaseUri : "")
                        .companiesHouseIdentityBaseUri(
                                companiesHouseIdentityBaseUri != null ? companiesHouseIdentityBaseUri : "")
                        .companiesHouseClientId(companiesHouseClientId != null ? companiesHouseClientId : "")
                        .companiesHouseClientSecretArn(
                                companiesHouseClientSecretArn != null ? companiesHouseClientSecretArn : "")
                        .companiesHouseXmlGatewayUri(
                                companiesHouseXmlGatewayUri != null ? companiesHouseXmlGatewayUri : "")
                        .companiesHousePresenterIdArn(
                                companiesHousePresenterIdArn != null ? companiesHousePresenterIdArn : "")
                        .companiesHousePresenterCodeArn(
                                companiesHousePresenterCodeArn != null ? companiesHousePresenterCodeArn : "")
                        .build());

        // Create the AccountStack
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.accountStackId, deploymentName, envName);
        var githubTokenSecretArn = envOr(
                "GITHUB_TOKEN_SECRET_ARN", appProps.githubTokenSecretArn, "(from githubTokenSecretArn in cdk.json)");
        this.accountStack = new AccountStack(
                app,
                sharedNames.accountStackId,
                AccountStack.AccountStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .cognitoUserPoolArn(cognitoUserPoolArn)
                        .githubTokenSecretArn(githubTokenSecretArn != null ? githubTokenSecretArn : "")
                        .feedbackEngagementEnabled("true".equalsIgnoreCase(appProps.feedbackEngagementEnabled))
                        .build());

        // Create the BillingStack
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.billingStackId, deploymentName, envName);
        this.billingStack = new BillingStack(
                app,
                sharedNames.billingStackId,
                BillingStack.BillingStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .stripeSecretKeyArn(stripeSecretKeyArn != null ? stripeSecretKeyArn : "")
                        .stripeTestSecretKeyArn(stripeTestSecretKeyArn != null ? stripeTestSecretKeyArn : "")
                        .stripePriceIdResidentPro(stripePriceIdResidentPro != null ? stripePriceIdResidentPro : "")
                        .stripeTestPriceIdResidentPro(
                                stripeTestPriceIdResidentPro != null ? stripeTestPriceIdResidentPro : "")
                        .stripePriceIdResidentVat(stripePriceIdResidentVat != null ? stripePriceIdResidentVat : "")
                        .stripeTestPriceIdResidentVat(
                                stripeTestPriceIdResidentVat != null ? stripeTestPriceIdResidentVat : "")
                        .stripePriceIdResidentItsa(stripePriceIdResidentItsa != null ? stripePriceIdResidentItsa : "")
                        .stripeTestPriceIdResidentItsa(
                                stripeTestPriceIdResidentItsa != null ? stripeTestPriceIdResidentItsa : "")
                        .stripePriceIdResidentLtd(stripePriceIdResidentLtd != null ? stripePriceIdResidentLtd : "")
                        .stripeTestPriceIdResidentLtd(
                                stripeTestPriceIdResidentLtd != null ? stripeTestPriceIdResidentLtd : "")
                        .stripePriceIdResidentDiyaGl(
                                stripePriceIdResidentDiyaGl != null ? stripePriceIdResidentDiyaGl : "")
                        .stripeTestPriceIdResidentDiyaGl(
                                stripeTestPriceIdResidentDiyaGl != null ? stripeTestPriceIdResidentDiyaGl : "")
                        .baseUrl(sharedNames.publicBaseUrl)
                        .billingReturnUrlOrigins(billingReturnUrlOrigins)
                        .build());

        // Create the BooksStack
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.booksStackId, deploymentName, envName);
        this.booksStack = new BooksStack(
                app,
                sharedNames.booksStackId,
                BooksStack.BooksStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .booksBucketName(sharedNames.booksBucketName)
                        .booksAllowedOrigins(booksAllowedOrigins)
                        .build());

        // Create the ApiStack with API Gateway v2 for all Lambda endpoints
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.apiStackId, deploymentName, envName);

        // The books authorizer's JWT audience cannot be blank (AWS::ApiGatewayV2::Authorizer
        // rejects an empty audience value at deploy time). Fail synth here instead, naming the
        // env var and the SSM parameter IdentityStack writes it to during the environment deploy.
        if (cognitoBooksUserPoolClientId == null || cognitoBooksUserPoolClientId.isBlank()) {
            throw new IllegalStateException(
                    "COGNITO_BOOKS_CLIENT_ID is not set and booksUserPoolClientId is blank in cdk.json. Set it "
                            + "from the /submit/" + envName + "/spreadsheets-books-app-client-id SSM parameter, "
                            + "written by IdentityStack during the environment deploy.");
        }

        // Create a map of Lambda function references from other stacks
        List<AbstractApiLambdaProps> lambdaFunctions = new java.util.ArrayList<>();
        lambdaFunctions.addAll(this.authStack.lambdaFunctionProps);
        lambdaFunctions.addAll(this.hmrcStack.lambdaFunctionProps);
        lambdaFunctions.addAll(this.companiesHouseStack.lambdaFunctionProps);
        lambdaFunctions.addAll(this.accountStack.lambdaFunctionProps);
        lambdaFunctions.addAll(this.billingStack.lambdaFunctionProps);
        lambdaFunctions.addAll(this.booksStack.lambdaFunctionProps);

        this.apiStack = new ApiStack(
                app,
                sharedNames.apiStackId,
                ApiStack.ApiStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .lambdaFunctions(lambdaFunctions)
                        .userPoolId(cognitoUserPoolId)
                        .userPoolClientId(cognitoUserPoolClientId)
                        .booksUserPoolClientId(cognitoBooksUserPoolClientId)
                        .customAuthorizerLambdaArn(authStack.customAuthorizerLambda.getFunctionArn())
                        .buildNumber(buildNumber)
                        .regionalCertificateArn(regionalCertificateArn)
                        .build());
        this.apiStack.addStackDependency(accountStack);
        this.apiStack.addStackDependency(hmrcStack);
        this.apiStack.addStackDependency(companiesHouseStack);
        this.apiStack.addStackDependency(authStack);
        this.apiStack.addStackDependency(billingStack);
        this.apiStack.addStackDependency(booksStack);

        // Get optional alert email from environment variable
        String alertEmail = envOr("ALERT_EMAIL", "");

        this.opsStack = new OpsStack(
                app,
                sharedNames.opsStackId,
                OpsStack.OpsStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .baseUrl(sharedNames.baseUrl)
                        .alertEmail(alertEmail)
                        .opsGithubTokenSecretArn(opsGithubTokenSecretArn != null ? opsGithubTokenSecretArn : "")
                        .build());
        // this.opsStack.addDependency(hmrcStack);
        // this.opsStack.addDependency(apiStack);

        // Create the Edge stack (CloudFront, Route53)
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.edgeStackId, deploymentName, envName);
        this.edgeStack = new EdgeStack(
                app,
                sharedNames.edgeStackId,
                EdgeStack.EdgeStackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(true)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .hostedZoneName(appProps.hostedZoneName)
                        .hostedZoneId(appProps.hostedZoneId)
                        .certificateArn(certificateArn)
                        .apiGatewayUrl(httpApiUrl)
                        .baseImageTag(baseImageTag)
                        .wafManualBlockIps(appProps.wafManualBlockIps != null ? appProps.wafManualBlockIps : "")
                        .build());

        // Create the Publish stack (Bucket Deployments to CloudFront)
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.publishStackId, deploymentName, envName);
        String distributionId = this.edgeStack.distribution.getDistributionId();
        String originBucketName = this.edgeStack.originBucket.getBucketName();
        this.publishStack = new PublishStack(
                app,
                sharedNames.publishStackId,
                PublishStack.PublishStackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .distributionId(distributionId)
                        .originBucketName(originBucketName)
                        .commitHash(commitHash)
                        .websiteHash(websiteHash)
                        .buildNumber(buildNumber)
                        .docRootPath(docRootPath)
                        .build());
        // this.publishStack.addDependency(this.edgeStack);

        // Create the SelfDestruct stack only for non-prod deployments
        if (!"prod".equals(envName)) {
            this.selfDestructStack = new SelfDestructStack(
                    app,
                    sharedNames.selfDestructStackId,
                    SelfDestructStack.SelfDestructStackProps.builder()
                            .env(primaryEnv)
                            .crossRegionReferences(false)
                            .envName(envName)
                            .deploymentName(deploymentName)
                            .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                            .cloudTrailEnabled(cloudTrailEnabled)
                            .sharedNames(sharedNames)
                            .baseImageTag(baseImageTag)
                            .selfDestructLogGroupName(sharedNames.ew2SelfDestructLogGroupName)
                            .selfDestructStartDatetime(selfDestructStartDatetime)
                            .selfDestructDelayHours(selfDestructDelayHours)
                            .isApplicationStack(true)
                            .originBucketName(originBucketName)
                            .build());
        } else {
            this.selfDestructStack = null;
        }

        CostAllocationTags.applyTo(app, envName, deploymentName);
    }

    // populate from cdk.json context using exact camelCase keys
    public static SubmitApplicationProps loadAppProps(Construct scope) {
        return loadAppProps(scope, null);
    }

    public static SubmitApplicationProps loadAppProps(Construct scope, String pathPrefix) {
        SubmitApplicationProps props = SubmitApplicationProps.Builder.create().build();
        var cdkPath =
                Paths.get((pathPrefix == null ? "" : pathPrefix) + "cdk.json").toAbsolutePath();
        if (!cdkPath.toFile().exists()) {
            warnf("Cannot find application properties (cdk.json) at %s", cdkPath);
        } else {
            infof("Loading application properties from cdk.json %s", cdkPath);
            for (Field f : SubmitApplicationProps.class.getDeclaredFields()) {
                if (f.getType() != String.class) continue;
                try {
                    f.setAccessible(true);
                    String current = (String) f.get(props);
                    String fieldName = f.getName();
                    String ctx = KindCdk.getContextValueString(scope, fieldName, current);
                    if (ctx != null) f.set(props, ctx);
                    infof("Load context %s=%s", fieldName, ctx);
                } catch (Exception e) {
                    warnf("Failed to read context for %s: %s", f.getName(), e.getMessage());
                }
            }
        }

        // default env to dev if not set
        if (props.envName == null || props.envName.isBlank()) props.envName = "dev";
        return props;
    }
}
