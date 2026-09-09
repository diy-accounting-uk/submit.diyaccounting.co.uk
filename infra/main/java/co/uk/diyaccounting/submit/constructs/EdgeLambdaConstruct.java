/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import java.nio.file.Paths;
import java.util.List;
import software.amazon.awscdk.services.cloudfront.experimental.EdgeFunction;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.IVersion;
import software.constructs.Construct;

/**
 * Construct for creating Lambda@Edge functions.
 *
 * Key differences from regular Lambda:
 * - Uses Code.fromAsset() instead of Docker images
 * - Automatically deployed to us-east-1 by EdgeFunction construct
 * - No environment variables supported
 * - Smaller size limits (50MB for origin-response triggers)
 * - No aliases or provisioned concurrency
 */
public class EdgeLambdaConstruct {

    /** The EdgeFunction construct */
    public final EdgeFunction function;

    /** The current version of the function (needed for CloudFront association) */
    public final IVersion currentVersion;

    public EdgeLambdaConstruct(final Construct scope, EdgeLambdaProps props) {
        // Create execution role for Lambda@Edge
        // Must allow both lambda.amazonaws.com and edgelambda.amazonaws.com
        Role edgeLambdaRole = Role.Builder.create(scope, props.idPrefix() + "-Role")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(
                        List.of(ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")))
                .build();

        // Allow Lambda@Edge to assume the role
        edgeLambdaRole
                .getAssumeRolePolicy()
                .addStatements(PolicyStatement.Builder.create()
                        .principals(List.of(new ServicePrincipal("edgelambda.amazonaws.com")))
                        .actions(List.of("sts:AssumeRole"))
                        .build());

        // Resolve the asset path to an absolute path (handles relative paths from different working directories)
        var resolvedAssetPath =
                Paths.get(props.assetPath()).toAbsolutePath().normalize().toString();
        infof("Resolved edge function asset path: %s", resolvedAssetPath);

        // Create EdgeFunction (automatically handles us-east-1 deployment)
        this.function = EdgeFunction.Builder.create(scope, props.idPrefix() + "-Fn")
                .functionName(props.functionName())
                .runtime(props.runtime())
                .handler(props.handler())
                .code(Code.fromAsset(resolvedAssetPath))
                .memorySize(props.memorySize())
                .timeout(props.timeout())
                .description(props.description())
                .role(edgeLambdaRole)
                .build();

        this.currentVersion = this.function.getCurrentVersion();

        infof(
                "Created EdgeLambda %s with handler %s from asset %s",
                props.functionName(), props.handler(), props.assetPath());
    }
}
