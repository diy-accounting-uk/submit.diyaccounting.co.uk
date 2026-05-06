/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.Route53AliasUpsert;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Fn;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudfront.*;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.cloudfront.origins.HttpOriginProps;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionUrl;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.FunctionUrlCorsOptions;
import software.amazon.awscdk.services.lambda.FunctionUrlOptions;
import software.amazon.awscdk.services.lambda.HttpMethod;
import software.amazon.awscdk.services.lambda.LayerVersion;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.constructs.Construct;

/**
 * SimulatorStack - Deploys the public simulator as a Lambda with CloudFront distribution.
 *
 * <p>The simulator is a read-only demo of DIY Accounting Submit that:
 * - Has no access to production secrets or data
 * - Uses in-memory state only (resets on cold start)
 * - Is clearly labeled as demo mode
 * - Can be embedded via iframe on the main site
 *
 * <p>Architecture: Lambda (Web Adapter) → Function URL → CloudFront → custom domain
 * <p>Domain pattern: {env}-simulator.submit.diyaccounting.co.uk (covered by wildcard cert)
 */
public class SimulatorStack extends Stack {

    public final Function simulatorFunction;
    public final FunctionUrl functionUrl;
    public final Distribution distribution;

    @Value.Immutable
    public interface SimulatorStackProps extends StackProps, SubmitStackProps {

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

        /** Path to the bundled simulator code */
        String simulatorCodePath();

        /** Base URL for the simulator (for self-reference in submit.env) */
        String simulatorBaseUrl();

        /** Hosted zone name for Route53 DNS records */
        String hostedZoneName();

        /** Hosted zone ID for Route53 DNS records */
        String hostedZoneId();

        /** ACM certificate ARN (must be in us-east-1 for CloudFront) */
        String certificateArn();

        static ImmutableSimulatorStackProps.Builder builder() {
            return ImmutableSimulatorStackProps.builder();
        }
    }

    public SimulatorStack(final Construct scope, final String id, final SimulatorStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "SimulatorStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Simulator-specific tags
        Tags.of(this).add("BillingPurpose", "public-demo");
        Tags.of(this).add("ResourceType", "serverless-demo");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "false"); // No logging for simulator

        // Log group for simulator (minimal retention)
        LogGroup logGroup = LogGroup.Builder.create(this, props.resourceNamePrefix() + "-SimulatorLogGroup")
                .logGroupName("/aws/lambda/" + props.resourceNamePrefix() + "-simulator")
                .retention(RetentionDays.ONE_DAY) // Minimal retention - simulator has no important logs
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // Lambda Web Adapter layer ARN for eu-west-2
        // See: https://github.com/awslabs/aws-lambda-web-adapter
        String lambdaAdapterLayerArn = "arn:aws:lambda:eu-west-2:753240598075:layer:LambdaAdapterLayerX86:22";

        // Create the simulator Lambda function
        this.simulatorFunction = Function.Builder.create(this, props.resourceNamePrefix() + "-SimulatorFunction")
                .functionName(props.resourceNamePrefix() + "-simulator")
                .description("Public simulator for DIY Accounting Submit - demo mode only")
                .runtime(Runtime.NODEJS_24_X)
                .architecture(Architecture.X86_64)
                .handler("run.sh") // Lambda Web Adapter entrypoint - starts web server via run.sh
                .code(Code.fromAsset(props.simulatorCodePath()))
                .memorySize(512)
                .timeout(Duration.seconds(30))
                .environment(Map.of(
                        "AWS_LAMBDA_EXEC_WRAPPER", "/opt/bootstrap",
                        "AWS_LWA_INVOKE_MODE", "buffered",
                        "AWS_LWA_PORT", "8080",
                        "PORT", "8080",
                        "NODE_ENV", "production",
                        "DIY_SUBMIT_BASE_URL", props.simulatorBaseUrl(),
                        "SIMULATOR_MODE", "true"))
                .layers(List.of(LayerVersion.fromLayerVersionArn(
                        this, props.resourceNamePrefix() + "-LambdaAdapter", lambdaAdapterLayerArn)))
                .logGroup(logGroup)
                .build();

        // Create Function URL with public access (no auth required for simulator)
        this.functionUrl = this.simulatorFunction.addFunctionUrl(FunctionUrlOptions.builder()
                .authType(FunctionUrlAuthType.NONE) // Public access
                .cors(FunctionUrlCorsOptions.builder()
                        .allowedOrigins(List.of(
                                "https://submit.diyaccounting.co.uk",
                                "https://ci-submit.diyaccounting.co.uk",
                                "http://localhost:3000"))
                        .allowedMethods(List.of(HttpMethod.GET, HttpMethod.POST))
                        .allowedHeaders(List.of("Content-Type", "Authorization"))
                        .build())
                .build());

        // --- CloudFront distribution with custom domain ---

        // TLS certificate (must be in us-east-1 for CloudFront)
        ICertificate cert = Certificate.fromCertificateArn(
                this, props.resourceNamePrefix() + "-SimulatorCert", props.certificateArn());

        // Extract domain from Lambda Function URL (https://xxx.lambda-url.region.on.aws/)
        String lambdaDomain = Fn.select(2, Fn.split("/", this.functionUrl.getUrl()));

        // CloudFront origin pointing to the Lambda Function URL
        HttpOrigin lambdaOrigin = new HttpOrigin(
                lambdaDomain,
                HttpOriginProps.builder()
                        .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                        .build());

        // Response headers policy - allow iframe embedding from the parent site
        String simulatorDomainName = props.sharedNames().simulatorDomainName;
        String envDomainName = props.sharedNames().envDomainName;
        ResponseHeadersPolicy responseHeadersPolicy = ResponseHeadersPolicy.Builder.create(
                        this, props.resourceNamePrefix() + "-SimulatorResponseHeaders")
                .responseHeadersPolicyName(props.resourceNamePrefix() + "-simulator-headers")
                .securityHeadersBehavior(ResponseSecurityHeadersBehavior.builder()
                        .contentSecurityPolicy(ResponseHeadersContentSecurityPolicy.builder()
                                .contentSecurityPolicy("frame-ancestors https://" + envDomainName
                                        + " https://submit.diyaccounting.co.uk http://localhost:3000;")
                                .override(true)
                                .build())
                        .strictTransportSecurity(ResponseHeadersStrictTransportSecurity.builder()
                                .accessControlMaxAge(Duration.days(365))
                                .includeSubdomains(true)
                                .override(true)
                                .build())
                        .contentTypeOptions(ResponseHeadersContentTypeOptions.builder()
                                .override(true)
                                .build())
                        .build())
                .build();

        // CloudFront distribution
        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-SimulatorDistribution")
                .defaultBehavior(BehaviorOptions.builder()
                        .origin(lambdaOrigin)
                        .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                        .cachePolicy(CachePolicy.CACHING_DISABLED)
                        .originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
                        .responseHeadersPolicy(responseHeadersPolicy)
                        .allowedMethods(AllowedMethods.ALLOW_ALL)
                        .build())
                .domainNames(List.of(simulatorDomainName))
                .certificate(cert)
                .defaultRootObject("")
                .enableIpv6(true)
                .enableLogging(false)
                .sslSupportMethod(SSLMethod.SNI)
                .build();

        // --- Route53 DNS records ---

        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix() + "-SimulatorZone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId())
                        .zoneName(props.hostedZoneName())
                        .build());

        // Compute relative record name from the simulator domain name
        // e.g., "ci-simulator.submit.diyaccounting.co.uk" relative to "diyaccounting.co.uk" → "ci-simulator.submit"
        String recordName = simulatorDomainName.endsWith("." + props.hostedZoneName())
                ? simulatorDomainName.substring(
                        0,
                        simulatorDomainName.length() - (props.hostedZoneName().length() + 1))
                : simulatorDomainName;

        Route53AliasUpsert.upsertAliasToCloudFront(
                this,
                props.resourceNamePrefix() + "-SimulatorAlias",
                zone,
                recordName,
                this.distribution.getDomainName());

        // Outputs
        cfnOutput(this, "SimulatorFunctionArn", this.simulatorFunction.getFunctionArn());
        cfnOutput(this, "SimulatorFunctionUrl", this.functionUrl.getUrl());
        cfnOutput(this, "SimulatorDistributionDomainName", this.distribution.getDomainName());
        cfnOutput(this, "SimulatorCustomDomainName", simulatorDomainName);

        infof(
                "SimulatorStack %s created with CloudFront distribution at %s",
                this.getNode().getId(), simulatorDomainName);
    }
}
