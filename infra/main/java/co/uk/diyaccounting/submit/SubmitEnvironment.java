/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;

import co.uk.diyaccounting.submit.stacks.ActivityStack;
import co.uk.diyaccounting.submit.stacks.AnalyticsStack;
import co.uk.diyaccounting.submit.stacks.BackupStack;
import co.uk.diyaccounting.submit.stacks.BillingWebhookStack;
import co.uk.diyaccounting.submit.stacks.DataStack;
import co.uk.diyaccounting.submit.stacks.EcrStack;
import co.uk.diyaccounting.submit.stacks.HoldingStack;
import co.uk.diyaccounting.submit.stacks.IdentityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityStack;
import co.uk.diyaccounting.submit.stacks.ObservabilityUE1Stack;
import co.uk.diyaccounting.submit.stacks.SimulatorStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import java.lang.reflect.Field;
import java.nio.file.Paths;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.constructs.Construct;

public class SubmitEnvironment {

    public final ObservabilityStack observabilityStack;
    public final ObservabilityUE1Stack observabilityUE1Stack;
    public final DataStack dataStack;
    public final BackupStack backupStack;
    public final ActivityStack activityStack;
    public final AnalyticsStack analyticsStack;
    public final IdentityStack identityStack;
    public final HoldingStack holdingStack;
    public final SimulatorStack simulatorStack;
    public final BillingWebhookStack billingWebhookStack;
    public final EcrStack ecrStack;
    public final EcrStack ue1EcrStack;

    public static class SubmitEnvironmentProps {

        public String envName;
        public String hostedZoneName;
        public String hostedZoneId;
        public String certificateArn;
        public String deploymentDomainName;
        public String baseUrl;
        public String subDomainName;
        public String accessLogGroupRetentionPeriodDays;
        public String cloudTrailEnabled;
        public String cloudTrailLogGroupPrefix;
        public String cloudTrailLogGroupRetentionPeriodDays;
        public String holdingDocRootPath;
        public String googleClientId;
        public String googleClientSecretArn;
        public String securityServicesEnabled;
        public String authCertificateArn;
        public String holdingCertificateArn;
        public String simulatorCertificateArn;
        public String simulatorCodePath;
        public String regionalCertificateArn;
        public String stripeSecretKeyArn;
        public String stripeTestSecretKeyArn;
        public String stripeWebhookSecretArn;
        public String stripeTestWebhookSecretArn;
        public String baseImageTag;
        public String crossAccountBackupVaultArn;

        public static class Builder {
            private final SubmitEnvironmentProps p = new SubmitEnvironmentProps();

            public static Builder create() {
                return new Builder();
            }

            public SubmitEnvironmentProps build() {
                return p;
            }

            public Builder set(String key, String value) {
                try {
                    var f = SubmitEnvironmentProps.class.getDeclaredField(key);
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
        SubmitEnvironment.SubmitEnvironmentProps appProps = loadAppProps(app);
        var submitEnvironment = new SubmitEnvironment(app, appProps);
        app.synth();
        infof("CDK synth complete");
    }

    public SubmitEnvironment(App app, SubmitEnvironmentProps appProps) {

        // Determine environment and deployment name from env or appProps
        var envName = envOr("ENVIRONMENT_NAME", appProps.envName);
        var deploymentName = envOr("DEPLOYMENT_NAME", envName);

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

        // Load configuration from environment variables not defaulted in the cdk.json
        var googleClientSecretArn = envOr(
                "GOOGLE_CLIENT_SECRET_ARN", appProps.googleClientSecretArn, "(from googleClientSecretArn in cdk.json)");
        var cloudTrailEnabled =
                envOr("CLOUD_TRAIL_ENABLED", appProps.cloudTrailEnabled, "(from cloudTrailEnabled in cdk.json)");
        var accessLogGroupRetentionPeriodDays = Integer.parseInt(
                envOr("ACCESS_LOG_GROUP_RETENTION_PERIOD_DAYS", appProps.accessLogGroupRetentionPeriodDays, "30"));
        var securityServicesEnabled =
                Boolean.parseBoolean(envOr("SECURITY_SERVICES_ENABLED", appProps.securityServicesEnabled, "true"));
        var certificateArn = envOr("CERTIFICATE_ARN", appProps.certificateArn, "(from certificateArn in cdk.json)");
        var authCertificateArn =
                envOr("AUTH_CERTIFICATE_ARN", appProps.authCertificateArn, "(from authCertificateArn in cdk.json)");
        var holdingCertificateArn = envOr(
                "HOLDING_CERTIFICATE_ARN", appProps.holdingCertificateArn, "(from holdingCertificateArn in cdk.json)");
        var holdingDocRootPath =
                envOr("HOLDING_DOC_ROOT_PATH", appProps.holdingDocRootPath, "(from holdingDocRootPath in cdk.json)");
        var simulatorCertificateArn = envOr(
                "SIMULATOR_CERTIFICATE_ARN",
                appProps.simulatorCertificateArn,
                "(from simulatorCertificateArn in cdk.json)");
        var regionalCertificateArn = envOr(
                "REGIONAL_CERTIFICATE_ARN",
                appProps.regionalCertificateArn,
                "(from regionalCertificateArn in cdk.json)");
        var stripeSecretKeyArn =
                envOr("STRIPE_SECRET_KEY_ARN", appProps.stripeSecretKeyArn, "(from stripeSecretKeyArn in cdk.json)");
        var stripeTestSecretKeyArn = envOr(
                "STRIPE_TEST_SECRET_KEY_ARN",
                appProps.stripeTestSecretKeyArn,
                "(from stripeTestSecretKeyArn in cdk.json)");
        var stripeWebhookSecretArn = envOr(
                "STRIPE_WEBHOOK_SECRET_ARN",
                appProps.stripeWebhookSecretArn,
                "(from stripeWebhookSecretArn in cdk.json)");
        var stripeTestWebhookSecretArn = envOr(
                "STRIPE_TEST_WEBHOOK_SECRET_ARN",
                appProps.stripeTestWebhookSecretArn,
                "(from stripeTestWebhookSecretArn in cdk.json)");
        // envOr's third argument is only a log label, so the fallback has to be the second one.
        var baseImageTag = envOr(
                "BASE_IMAGE_TAG",
                appProps.baseImageTag == null || appProps.baseImageTag.isBlank() ? "latest" : appProps.baseImageTag);

        // Create ObservabilityStack with resources used in monitoring the application
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.observabilityStackId, deploymentName, envName);
        this.observabilityStack = new ObservabilityStack(
                app,
                sharedNames.observabilityStackId,
                ObservabilityStack.ObservabilityStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .cloudTrailLogGroupPrefix(appProps.cloudTrailLogGroupPrefix)
                        .cloudTrailLogGroupRetentionPeriodDays(appProps.cloudTrailLogGroupRetentionPeriodDays)
                        .accessLogGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                        .apexDomain(sharedNames.hostedZoneName)
                        .securityServicesEnabled(securityServicesEnabled)
                        .build());

        // Create ObservabilityUE1Stack with resources used in monitoring the application us-east-1
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.observabilityUE1StackId, deploymentName, envName);
        this.observabilityUE1Stack = new ObservabilityUE1Stack(
                app,
                sharedNames.observabilityUE1StackId,
                ObservabilityUE1Stack.ObservabilityUE1StackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .logGroupRetentionPeriodDays(accessLogGroupRetentionPeriodDays)
                        .build());

        // Create DataStack with shared persistence for all deployments
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.dataStackId, deploymentName, envName);
        this.dataStack = new DataStack(
                app,
                sharedNames.dataStackId,
                DataStack.DataStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .build());

        // Create BackupStack for AWS Backup infrastructure (depends on DataStack tables)
        // Note: alertTopic is configured at application level (OpsStack), not here
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.backupStackId, deploymentName, envName);
        var crossAccountBackupVaultArn = envOr(
                "CROSS_ACCOUNT_BACKUP_VAULT_ARN",
                appProps.crossAccountBackupVaultArn,
                "(from crossAccountBackupVaultArn in cdk.json)");
        this.backupStack = new BackupStack(
                app,
                sharedNames.backupStackId,
                BackupStack.BackupStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .crossAccountBackupVaultArn(java.util.Optional.ofNullable(crossAccountBackupVaultArn))
                        .build());
        this.backupStack.addStackDependency(this.dataStack);

        // Create ActivityStack with the shared EventBridge bus
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.activityStackId, deploymentName, envName);
        this.activityStack = new ActivityStack(
                app,
                sharedNames.activityStackId,
                ActivityStack.ActivityStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .build());

        // Create AnalyticsStack with the lake, the catalog and the activity-event delivery stream
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.analyticsStackId, deploymentName, envName);
        this.analyticsStack = new AnalyticsStack(
                app,
                sharedNames.analyticsStackId,
                AnalyticsStack.AnalyticsStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .baseImageTag(baseImageTag)
                        .build());
        this.analyticsStack.addStackDependency(this.activityStack);
        this.analyticsStack.addStackDependency(this.dataStack);

        // Create the identity stack before any user-aware services
        infof(
                "Synthesizing stack %s for deployment %s to environment %s",
                sharedNames.identityStackId, deploymentName, envName);
        this.identityStack = new IdentityStack(
                app,
                sharedNames.identityStackId,
                IdentityStack.IdentityStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .hostedZoneName(appProps.hostedZoneName)
                        .hostedZoneId(appProps.hostedZoneId)
                        .certificateArn(
                                authCertificateArn != null && !authCertificateArn.isBlank()
                                        ? authCertificateArn
                                        : certificateArn)
                        .googleClientId(appProps.googleClientId)
                        .googleClientSecretArn(googleClientSecretArn)
                        .build());

        // Create HoldingStack serving the maintenance page a failover points the live aliases at
        if (holdingCertificateArn != null
                && !holdingCertificateArn.isBlank()
                && !holdingCertificateArn.startsWith("(from")) {
            infof(
                    "Synthesizing stack %s for deployment %s to environment %s",
                    sharedNames.holdingStackId, deploymentName, envName);
            this.holdingStack = new HoldingStack(
                    app,
                    sharedNames.holdingStackId,
                    HoldingStack.HoldingStackProps.builder()
                            .env(usEast1Env)
                            .crossRegionReferences(false)
                            .envName(envName)
                            .deploymentName(envName)
                            .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                            .cloudTrailEnabled(cloudTrailEnabled)
                            .sharedNames(sharedNames)
                            .hostedZoneName(appProps.hostedZoneName)
                            .hostedZoneId(appProps.hostedZoneId)
                            .certificateArn(holdingCertificateArn)
                            .holdingDocRootPath(holdingDocRootPath)
                            .build());
        } else {
            warnf(
                    "Skipping HoldingStack synthesis: HOLDING_CERTIFICATE_ARN not set (issue it with request-holding-cert.yml)");
            this.holdingStack = null;
        }

        // Create SimulatorStack for public demo simulator (only if the code path exists)
        var simulatorCodePath = envOr("SIMULATOR_CODE_PATH", appProps.simulatorCodePath, "web/public-simulator");
        var simulatorBaseUrl = "https://%s".formatted(sharedNames.simulatorDomainName);
        var simulatorCodeDir = Paths.get(simulatorCodePath).toFile();
        if (simulatorCodeDir.exists() && simulatorCodeDir.isDirectory()) {
            infof(
                    "Synthesizing stack %s for deployment %s to environment %s",
                    sharedNames.simulatorStackId, deploymentName, envName);
            this.simulatorStack = new SimulatorStack(
                    app,
                    sharedNames.simulatorStackId,
                    SimulatorStack.SimulatorStackProps.builder()
                            .env(primaryEnv)
                            .crossRegionReferences(false)
                            .envName(envName)
                            .deploymentName(deploymentName)
                            .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                            .cloudTrailEnabled(cloudTrailEnabled)
                            .sharedNames(sharedNames)
                            .simulatorCodePath(simulatorCodePath)
                            .simulatorBaseUrl(simulatorBaseUrl)
                            .hostedZoneName(appProps.hostedZoneName)
                            .hostedZoneId(appProps.hostedZoneId)
                            .certificateArn(
                                    simulatorCertificateArn != null && !simulatorCertificateArn.isBlank()
                                            ? simulatorCertificateArn
                                            : certificateArn)
                            .build());
        } else {
            warnf(
                    "Skipping SimulatorStack synthesis - simulator code path %s does not exist (run 'npm run build:simulator' first)",
                    simulatorCodePath);
            this.simulatorStack = null;
        }

        // Create BillingWebhookStack for always-available Stripe webhook endpoint
        if (regionalCertificateArn != null
                && !regionalCertificateArn.isBlank()
                && !regionalCertificateArn.startsWith("(from")
                && baseImageTag != null
                && !baseImageTag.isBlank()
                && !baseImageTag.startsWith("(from")) {
            infof("Synthesizing stack %s for environment %s", sharedNames.billingWebhookStackId, envName);
            this.billingWebhookStack = new BillingWebhookStack(
                    app,
                    sharedNames.billingWebhookStackId,
                    BillingWebhookStack.BillingWebhookStackProps.builder()
                            .env(primaryEnv)
                            .crossRegionReferences(false)
                            .envName(envName)
                            .deploymentName(deploymentName)
                            .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                            .cloudTrailEnabled(cloudTrailEnabled)
                            .sharedNames(sharedNames)
                            .baseImageTag(baseImageTag)
                            .hostedZoneName(appProps.hostedZoneName)
                            .hostedZoneId(appProps.hostedZoneId)
                            .regionalCertificateArn(regionalCertificateArn)
                            .stripeSecretKeyArn(stripeSecretKeyArn != null ? stripeSecretKeyArn : "")
                            .stripeTestSecretKeyArn(stripeTestSecretKeyArn != null ? stripeTestSecretKeyArn : "")
                            .stripeWebhookSecretArn(stripeWebhookSecretArn != null ? stripeWebhookSecretArn : "")
                            .stripeTestWebhookSecretArn(
                                    stripeTestWebhookSecretArn != null ? stripeTestWebhookSecretArn : "")
                            .build());
        } else {
            warnf(
                    "Skipping BillingWebhookStack synthesis — REGIONAL_CERTIFICATE_ARN not set (required for API Gateway custom domain)");
            this.billingWebhookStack = null;
        }

        // Create EcrStack for ECR repositories (eu-west-2)
        infof(
                "Synthesizing stack %s for environment %s in region %s",
                sharedNames.ecrStackId, envName, primaryEnv.getRegion());
        this.ecrStack = new EcrStack(
                app,
                sharedNames.ecrStackId,
                EcrStack.EcrStackProps.builder()
                        .env(primaryEnv)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .build());

        // Create EcrStack for us-east-1 region (for edge Lambda images)
        infof("Synthesizing stack %s for environment %s in region us-east-1", sharedNames.ue1EcrStackId, envName);
        this.ue1EcrStack = new EcrStack(
                app,
                sharedNames.ue1EcrStackId,
                EcrStack.EcrStackProps.builder()
                        .env(usEast1Env)
                        .crossRegionReferences(false)
                        .envName(envName)
                        .deploymentName(deploymentName)
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled(cloudTrailEnabled)
                        .sharedNames(sharedNames)
                        .build());
    }

    // load context from cdk.json like existing apps
    public static SubmitEnvironmentProps loadAppProps(Construct scope) {
        return loadAppProps(scope, null);
    }

    public static SubmitEnvironmentProps loadAppProps(Construct scope, String pathPrefix) {
        SubmitEnvironmentProps props = SubmitEnvironmentProps.Builder.create().build();
        var cdkPath =
                Paths.get((pathPrefix == null ? "" : pathPrefix) + "cdk.json").toAbsolutePath();
        if (!cdkPath.toFile().exists()) {
            warnf("Cannot find application properties (cdk.json) at %s", cdkPath);
        } else {
            for (Field f : SubmitEnvironmentProps.class.getDeclaredFields()) {
                if (f.getType() != String.class) continue;
                try {
                    f.setAccessible(true);
                    String current = (String) f.get(props);
                    String fieldName = f.getName();
                    String ctx =
                            co.uk.diyaccounting.submit.utils.KindCdk.getContextValueString(scope, fieldName, current);
                    if (ctx != null) f.set(props, ctx);
                } catch (Exception ignored) {
                }
            }
        }
        if (props.envName == null || props.envName.isBlank()) props.envName = "dev";
        return props;
    }
}
