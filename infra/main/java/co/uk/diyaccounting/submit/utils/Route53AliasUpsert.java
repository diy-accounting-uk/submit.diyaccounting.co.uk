/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.utils;

import java.util.List;
import java.util.Map;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.constructs.Construct;

/**
 * Utilities for idempotent Route53 UPSERT of alias records using AwsCustomResource.
 * This replaces deprecated deleteExisting(true) behaviour with a supported approach.
 */
public final class Route53AliasUpsert {
    private Route53AliasUpsert() {}

    // CloudFront hosted zone ID (well-known constant)
    public static final String CLOUDFRONT_HOSTED_ZONE_ID = "Z2FDTNDATAQYW2";

    /**
     * UPSERTs A and AAAA records with AliasTarget pointing to the given CloudFront DNS name.
     *
     * @param scope construct scope
     * @param idPrefix unique id prefix for custom resources
     * @param zone hosted zone where records should be created
     * @param relativeRecordName relative record name within the zone (null or "" for zone apex)
     * @param cloudFrontDnsName CloudFront distribution domain name (e.g. d111111abcdef8.cloudfront.net)
     */
    public static void upsertAliasToCloudFront(
            Construct scope, String idPrefix, IHostedZone zone, String relativeRecordName, String cloudFrontDnsName) {
        String fqdn = buildFqdn(zone, relativeRecordName);

        // Cross-account Route53: if ROOT_ROUTE53_ROLE_ARN is set, the Lambda assumes this role
        // before calling Route53. Used when the hosted zone is in a different account.
        String route53AssumedRoleArn = System.getenv("ROOT_ROUTE53_ROLE_ARN");
        boolean crossAccount = route53AssumedRoleArn != null && !route53AssumedRoleArn.isBlank();

        // Build the common ChangeResourceRecordSets payload for A or AAAA
        java.util.function.Function<String, Map<String, Object>> changeForType = (recordType) -> {
            Map<String, Object> aliasTarget = new java.util.HashMap<>();
            aliasTarget.put("DNSName", cloudFrontDnsName);
            aliasTarget.put("HostedZoneId", CLOUDFRONT_HOSTED_ZONE_ID);
            aliasTarget.put("EvaluateTargetHealth", false);

            Map<String, Object> rrset = new java.util.HashMap<>();
            rrset.put("Name", fqdn);
            rrset.put("Type", recordType);
            rrset.put("AliasTarget", aliasTarget);

            Map<String, Object> change = new java.util.HashMap<>();
            change.put("Action", "UPSERT");
            change.put("ResourceRecordSet", rrset);

            Map<String, Object> changeBatch = new java.util.HashMap<>();
            changeBatch.put("Changes", java.util.List.of(change));

            Map<String, Object> params = new java.util.HashMap<>();
            params.put("HostedZoneId", zone.getHostedZoneId());
            params.put("ChangeBatch", changeBatch);
            return params;
        };

        var statements =
                new java.util.ArrayList<>(List.of(software.amazon.awscdk.services.iam.PolicyStatement.Builder.create()
                        .actions(List.of("route53:ChangeResourceRecordSets"))
                        .resources(List.of("arn:aws:route53:::hostedzone/" + zone.getHostedZoneId()))
                        .build()));
        if (crossAccount) {
            statements.add(software.amazon.awscdk.services.iam.PolicyStatement.Builder.create()
                    .actions(List.of("sts:AssumeRole"))
                    .resources(List.of(route53AssumedRoleArn))
                    .build());
        }
        var grant = KindCdk.grantToAwsCustomResourceProvider(Stack.of(scope), statements);

        var upsertABuilder = AwsSdkCall.builder()
                .service("Route53")
                .action("changeResourceRecordSets")
                .parameters(changeForType.apply("A"))
                .physicalResourceId(PhysicalResourceId.of(idPrefix + "-A-" + fqdn));
        if (crossAccount) {
            upsertABuilder.assumedRoleArn(route53AssumedRoleArn);
        }
        AwsSdkCall upsertA = upsertABuilder.build();

        var upsertAAAABuilder = AwsSdkCall.builder()
                .service("Route53")
                .action("changeResourceRecordSets")
                .parameters(changeForType.apply("AAAA"))
                .physicalResourceId(PhysicalResourceId.of(idPrefix + "-AAAA-" + fqdn));
        if (crossAccount) {
            upsertAAAABuilder.assumedRoleArn(route53AssumedRoleArn);
        }
        AwsSdkCall upsertAAAA = upsertAAAABuilder.build();

        var stack = Stack.of(scope);

        AwsCustomResource aliasA = AwsCustomResource.Builder.create(scope, idPrefix + "-AliasA-Upsert")
                .onCreate(upsertA)
                .onUpdate(upsertA)
                .logGroup(KindCdk.ensureAwsCustomResourceProviderLogGroup(stack))
                .role(KindCdk.ensureAwsCustomResourceProviderRole(stack))
                .build();
        aliasA.getNode().addDependency(grant);

        AwsCustomResource aliasAAAA = AwsCustomResource.Builder.create(scope, idPrefix + "-AliasAAAA-Upsert")
                .onCreate(upsertAAAA)
                .onUpdate(upsertAAAA)
                .logGroup(KindCdk.ensureAwsCustomResourceProviderLogGroup(stack))
                .role(KindCdk.ensureAwsCustomResourceProviderRole(stack))
                .build();
        aliasAAAA.getNode().addDependency(grant);
    }

    /**
     * UPSERTs A and AAAA records with AliasTarget pointing to an API Gateway v2 custom domain.
     *
     * @param scope construct scope
     * @param idPrefix unique id prefix for custom resources
     * @param zone hosted zone where records should be created
     * @param fqdn fully qualified domain name for the record
     * @param apiGatewayDnsName API Gateway v2 regional domain name (e.g. d-abc123.execute-api.eu-west-2.amazonaws.com)
     * @param apiGatewayHostedZoneId API Gateway v2 regional hosted zone ID
     */
    public static void upsertAliasToApiGatewayV2(
            Construct scope,
            String idPrefix,
            IHostedZone zone,
            String fqdn,
            String apiGatewayDnsName,
            String apiGatewayHostedZoneId) {
        upsertAlias(scope, idPrefix, zone, fqdn, apiGatewayDnsName, apiGatewayHostedZoneId);
    }

    /** Shared implementation for UPSERT of A/AAAA alias records to any AWS target. */
    private static void upsertAlias(
            Construct scope,
            String idPrefix,
            IHostedZone zone,
            String fqdn,
            String targetDnsName,
            String targetHostedZoneId) {

        String route53AssumedRoleArn = System.getenv("ROOT_ROUTE53_ROLE_ARN");
        boolean crossAccount = route53AssumedRoleArn != null && !route53AssumedRoleArn.isBlank();

        java.util.function.Function<String, Map<String, Object>> changeForType = (recordType) -> {
            Map<String, Object> aliasTarget = new java.util.HashMap<>();
            aliasTarget.put("DNSName", targetDnsName);
            aliasTarget.put("HostedZoneId", targetHostedZoneId);
            aliasTarget.put("EvaluateTargetHealth", false);

            Map<String, Object> rrset = new java.util.HashMap<>();
            rrset.put("Name", fqdn);
            rrset.put("Type", recordType);
            rrset.put("AliasTarget", aliasTarget);

            Map<String, Object> change = new java.util.HashMap<>();
            change.put("Action", "UPSERT");
            change.put("ResourceRecordSet", rrset);

            Map<String, Object> changeBatch = new java.util.HashMap<>();
            changeBatch.put("Changes", java.util.List.of(change));

            Map<String, Object> params = new java.util.HashMap<>();
            params.put("HostedZoneId", zone.getHostedZoneId());
            params.put("ChangeBatch", changeBatch);
            return params;
        };

        var statements =
                new java.util.ArrayList<>(List.of(software.amazon.awscdk.services.iam.PolicyStatement.Builder.create()
                        .actions(List.of("route53:ChangeResourceRecordSets"))
                        .resources(List.of("arn:aws:route53:::hostedzone/" + zone.getHostedZoneId()))
                        .build()));
        if (crossAccount) {
            statements.add(software.amazon.awscdk.services.iam.PolicyStatement.Builder.create()
                    .actions(List.of("sts:AssumeRole"))
                    .resources(List.of(route53AssumedRoleArn))
                    .build());
        }
        var grant = KindCdk.grantToAwsCustomResourceProvider(Stack.of(scope), statements);

        var upsertABuilder = AwsSdkCall.builder()
                .service("Route53")
                .action("changeResourceRecordSets")
                .parameters(changeForType.apply("A"))
                .physicalResourceId(PhysicalResourceId.of(idPrefix + "-A-" + fqdn));
        if (crossAccount) {
            upsertABuilder.assumedRoleArn(route53AssumedRoleArn);
        }

        var upsertAAAABuilder = AwsSdkCall.builder()
                .service("Route53")
                .action("changeResourceRecordSets")
                .parameters(changeForType.apply("AAAA"))
                .physicalResourceId(PhysicalResourceId.of(idPrefix + "-AAAA-" + fqdn));
        if (crossAccount) {
            upsertAAAABuilder.assumedRoleArn(route53AssumedRoleArn);
        }

        var stack = Stack.of(scope);

        AwsCustomResource aliasA = AwsCustomResource.Builder.create(scope, idPrefix + "-AliasA-Upsert")
                .onCreate(upsertABuilder.build())
                .onUpdate(upsertABuilder.build())
                .logGroup(KindCdk.ensureAwsCustomResourceProviderLogGroup(stack))
                .role(KindCdk.ensureAwsCustomResourceProviderRole(stack))
                .build();
        aliasA.getNode().addDependency(grant);

        AwsCustomResource aliasAAAA = AwsCustomResource.Builder.create(scope, idPrefix + "-AliasAAAA-Upsert")
                .onCreate(upsertAAAABuilder.build())
                .onUpdate(upsertAAAABuilder.build())
                .logGroup(KindCdk.ensureAwsCustomResourceProviderLogGroup(stack))
                .role(KindCdk.ensureAwsCustomResourceProviderRole(stack))
                .build();
        aliasAAAA.getNode().addDependency(grant);
    }

    private static String buildFqdn(IHostedZone zone, String relativeRecordName) {
        if (relativeRecordName == null || relativeRecordName.isBlank()) {
            return zone.getZoneName();
        }
        if (relativeRecordName.endsWith("." + zone.getZoneName()) || relativeRecordName.equals(zone.getZoneName())) {
            // already an FQDN
            return relativeRecordName;
        }
        return relativeRecordName + "." + zone.getZoneName();
    }
}
