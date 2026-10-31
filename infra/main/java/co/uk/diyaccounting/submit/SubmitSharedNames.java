/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;

import co.uk.diyaccounting.submit.names.AccountNames;
import co.uk.diyaccounting.submit.names.ActivityNames;
import co.uk.diyaccounting.submit.names.AnalyticsNames;
import co.uk.diyaccounting.submit.names.AuthNames;
import co.uk.diyaccounting.submit.names.BillingNames;
import co.uk.diyaccounting.submit.names.CompaniesHouseNames;
import co.uk.diyaccounting.submit.names.DataNames;
import co.uk.diyaccounting.submit.names.DiyaGlNames;
import co.uk.diyaccounting.submit.names.EcrNames;
import co.uk.diyaccounting.submit.names.HmrcItsaNames;
import co.uk.diyaccounting.submit.names.HmrcItsaPropertyNames;
import co.uk.diyaccounting.submit.names.HmrcNames;
import co.uk.diyaccounting.submit.names.McpNames;
import co.uk.diyaccounting.submit.names.ObservabilityNames;
import co.uk.diyaccounting.submit.names.OpsNames;
import co.uk.diyaccounting.submit.names.SelfDestructNames;
import java.util.ArrayList;
import java.util.List;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class SubmitSharedNames {

    public static class PublishedLambda {
        public final HttpMethod method;
        public final String urlPath;
        public final String summary;
        public final String description;
        public final String operationId;
        public final List<ApiParameter> parameters;

        public PublishedLambda(
                HttpMethod method, String urlPath, String summary, String description, String operationId) {
            this(method, urlPath, summary, description, operationId, List.of());
        }

        public PublishedLambda(
                HttpMethod method,
                String urlPath,
                String summary,
                String description,
                String operationId,
                List<ApiParameter> parameters) {
            this.method = method;
            this.urlPath = urlPath;
            this.summary = summary;
            this.description = description;
            this.operationId = operationId;
            this.parameters = parameters != null ? parameters : List.of();
        }
    }

    public static class ApiParameter {
        public final String name;
        public final String in;
        public final boolean required;
        public final String description;

        public ApiParameter(String name, String in, boolean required, String description) {
            this.name = name;
            this.in = in;
            this.required = required;
            this.description = description;
        }
    }

    public final List<PublishedLambda> publishedApiLambdas = new ArrayList<>();

    public String hostedZoneName;
    public String deploymentDomainName;
    // Each ci slot host is registered by hand with Cognito, HMRC and Companies House, so a branch
    // deploy that claims a slot completes its sign-ins on its own host instead of the shared apex.
    // Two slots, because the HMRC and Companies House sandbox applications both reached their
    // redirect-URI cap at ci-set2. Keep in step with claim-ci-slot's slot-count default. Empty on
    // prod.
    public List<String> ciSlotHostNames;
    public String envDomainName;
    public String publicDomainName;
    public String cognitoDomainName;
    public String holdingDomainName;
    public String billingDomainName;
    public String baseUrl;
    public String envBaseUrl;
    public String publicBaseUrl;
    public String dashedDeploymentDomainName;
    public String cognitoBaseUri;
    public String provisionedConcurrencyAliasName;
    public String appLambdaHandlerPrefix;
    public String appLambdaArnPrefix;

    public String envResourceNamePrefix;
    public String observabilityStackId;
    public String observabilityUE1StackId;
    public String dataStackId;
    public String identityStackId;
    public String holdingStackId;
    public String backupStackId;
    public String activityStackId;
    public String billingWebhookStackId;
    public String ecrStackId;
    public String ue1EcrStackId;
    public String analyticsStackId;
    public String ingestionStackId;
    public String securityDetectionStackId;
    public String securityBaselineStackId;

    public String appResourceNamePrefix;
    public String authStackId;
    public String hmrcStackId;
    public String hmrcItsaStackId;
    public String hmrcItsaPropertyStackId;
    public String companiesHouseStackId;
    public String accountStackId;
    public String apiStackId;
    public String apiRoutesStackId;
    public String opsStackId;
    public String selfDestructStackId;

    public String billingStackId;

    // DIYA-GL Lambda names
    public String diyaGlStackId;

    // Hosted MCP Lambda names
    public String mcpStackId;

    public String edgeStackId;
    public String publishStackId;

    public final OpsNames ops;
    public final SelfDestructNames selfDestruct;
    public final BillingNames billing;
    public final AuthNames auth;
    public final McpNames mcp;
    public final DiyaGlNames diyaGl;
    public final AccountNames account;
    public final CompaniesHouseNames companiesHouse;
    public final HmrcItsaPropertyNames hmrcItsaProperty;
    public final HmrcNames hmrc;
    public final HmrcItsaNames hmrcItsa;
    public final DataNames data;
    public final ObservabilityNames observability;
    public final EcrNames ecr;
    public final AnalyticsNames analytics;
    public final ActivityNames activity;

    public static class SubmitSharedNamesProps {
        public String hostedZoneName;
        public String envName;
        public String subDomainName;
        public String deploymentName;
        public String regionName;
        public String awsAccount;
    }

    // Common HTTP response codes to be referenced across infra generators and stacks
    public static class Responses {
        public static final String OK = "200";
        public static final String ACCEPTED = "202";
        public static final String UNAUTHORIZED = "401";
        public static final String FORBIDDEN = "403";
        public static final String NOT_FOUND = "404";
        public static final String SERVER_ERROR = "500";
    }

    public static SubmitSharedNames forDocs() {
        SubmitSharedNamesProps p = new SubmitSharedNamesProps();
        p.hostedZoneName = "example.com";
        p.envName = "docs";
        p.subDomainName = "submit";
        p.deploymentName = "docs";
        p.regionName = "eu-west-2";
        p.awsAccount = "111111111111";
        return new SubmitSharedNames(p);
    }

    public SubmitSharedNames(SubmitSharedNamesProps props) {
        this.hostedZoneName = props.hostedZoneName;
        this.envDomainName = "%s-%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.cognitoDomainName = "%s-auth.%s".formatted(props.envName, props.hostedZoneName);
        this.holdingDomainName = "prod".equals(props.envName)
                ? "holding.%s.%s".formatted(props.subDomainName, props.hostedZoneName)
                : "%s-holding.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.billingDomainName = "%s-billing.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.deploymentDomainName = "%s.%s.%s"
                .formatted(
                        props.deploymentName,
                        props.subDomainName,
                        props.hostedZoneName); // TODO -> deploymentDomainName
        // Outside prod every deployment is proved on its own host, so that host is also the one
        // its Lambdas and its submit.env carry; the environment apex follows a proven set later.
        if ("prod".equals(props.envName)) {
            this.publicDomainName = "%s.%s".formatted(props.subDomainName, props.hostedZoneName);
            this.ciSlotHostNames = List.of();
        } else {
            this.publicDomainName = this.deploymentDomainName;
            // A slot is served at the same host shape as any other deployment.
            this.ciSlotHostNames = List.of(
                    "ci-set1.%s.%s".formatted(props.subDomainName, props.hostedZoneName),
                    "ci-set2.%s.%s".formatted(props.subDomainName, props.hostedZoneName));
        }
        // this.defaultAliasName = "zero";
        this.provisionedConcurrencyAliasName = "pc";
        this.baseUrl = "https://%s/".formatted(this.deploymentDomainName);
        this.dashedDeploymentDomainName = buildDashedDomainName(this.deploymentDomainName);

        this.envBaseUrl = "https://%s/".formatted(this.envDomainName);
        this.publicBaseUrl = "https://%s/".formatted(this.publicDomainName);
        // Use envName directly for consistency with stack IDs (e.g., ci-env-IdentityStack → ci-env-user-pool)
        this.envResourceNamePrefix = "%s-env".formatted(props.envName);
        this.observabilityStackId = "%s-env-ObservabilityStack".formatted(props.envName);
        this.securityDetectionStackId = "%s-env-SecurityDetectionStack".formatted(props.envName);
        this.securityBaselineStackId = "%s-env-SecurityBaselineStack".formatted(props.envName);
        this.observabilityUE1StackId = "%s-env-ObservabilityUE1Stack".formatted(props.envName);
        this.dataStackId = "%s-env-DataStack".formatted(props.envName);
        this.identityStackId = "%s-env-IdentityStack".formatted(props.envName);
        this.holdingStackId = "%s-env-HoldingStack".formatted(props.envName);
        this.backupStackId = "%s-env-BackupStack".formatted(props.envName);
        this.activityStackId = "%s-env-ActivityStack".formatted(props.envName);
        this.billingWebhookStackId = "%s-env-BillingWebhookStack".formatted(props.envName);
        this.ecrStackId = "%s-env-EcrStack".formatted(props.envName);
        this.ue1EcrStackId = "%s-env-EcrUE1Stack".formatted(props.envName);
        this.analyticsStackId = "%s-env-AnalyticsStack".formatted(props.envName);
        this.ingestionStackId = "%s-env-IngestionStack".formatted(props.envName);

        this.cognitoBaseUri = "https://%s".formatted(this.cognitoDomainName);

        this.appResourceNamePrefix = "%s-app".formatted(props.deploymentName);
        this.authStackId = "%s-app-AuthStack".formatted(props.deploymentName);
        this.hmrcStackId = "%s-app-HmrcStack".formatted(props.deploymentName);
        this.hmrcItsaStackId = "%s-app-HmrcItsaStack".formatted(props.deploymentName);
        this.hmrcItsaPropertyStackId = "%s-app-HmrcItsaPropertyStack".formatted(props.deploymentName);
        this.companiesHouseStackId = "%s-app-CompaniesHouseStack".formatted(props.deploymentName);
        this.accountStackId = "%s-app-AccountStack".formatted(props.deploymentName);
        this.billingStackId = "%s-app-BillingStack".formatted(props.deploymentName);
        this.diyaGlStackId = "%s-app-DiyaGlStack".formatted(props.deploymentName);
        this.mcpStackId = "%s-app-McpStack".formatted(props.deploymentName);
        this.apiStackId = "%s-app-ApiStack".formatted(props.deploymentName);
        this.apiRoutesStackId = "%s-app-ApiRoutesStack".formatted(props.deploymentName);
        this.opsStackId = "%s-app-OpsStack".formatted(props.deploymentName);
        this.selfDestructStackId = "%s-app-SelfDestructStack".formatted(props.deploymentName);

        this.edgeStackId = "%s-app-EdgeStack".formatted(props.deploymentName);
        this.publishStackId = "%s-app-PublishStack".formatted(props.deploymentName);

        this.appLambdaHandlerPrefix = "app/functions";
        this.appLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);
        this.ops = new OpsNames(props, this);
        this.selfDestruct = new SelfDestructNames(props, this);
        this.billing = new BillingNames(props, this);
        this.auth = new AuthNames(props, this);
        this.mcp = new McpNames(props, this);
        this.diyaGl = new DiyaGlNames(props, this);
        this.account = new AccountNames(props, this);
        this.companiesHouse = new CompaniesHouseNames(props, this);
        this.hmrcItsaProperty = new HmrcItsaPropertyNames(props, this);
        this.hmrc = new HmrcNames(props, this);
        this.hmrcItsa = new HmrcItsaNames(props, this);
        this.data = new DataNames(props, this);
        this.observability = new ObservabilityNames(props, this);
        this.ecr = new EcrNames(props, this);
        this.analytics = new AnalyticsNames(props, this);
        this.activity = new ActivityNames(props, this);
    }
}
