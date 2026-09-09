/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.lambda.Runtime;

/**
 * Properties for creating a Lambda@Edge function.
 *
 * Lambda@Edge has specific constraints compared to regular Lambda:
 * - Must be deployed in us-east-1 (handled automatically by EdgeFunction)
 * - Cannot use environment variables
 * - Smaller size limits (50MB for origin-response triggers)
 * - Uses Code.fromAsset() instead of Docker images
 */
@Value.Immutable
public interface EdgeLambdaProps {

    /** Prefix for CDK construct IDs */
    String idPrefix();

    /** Lambda function name */
    String functionName();

    /** Handler in format "filename.exportedFunction" */
    String handler();

    /** Path to the directory containing the Lambda code */
    String assetPath();

    /** Lambda runtime - defaults to Node.js 24.x */
    @Value.Default
    default Runtime runtime() {
        return Runtime.NODEJS_24_X;
    }

    /** Memory size in MB - defaults to 128MB (Lambda@Edge has lower limits) */
    @Value.Default
    default int memorySize() {
        return 128;
    }

    /** Timeout - defaults to 5 seconds (origin-response max is 30s) */
    @Value.Default
    default Duration timeout() {
        return Duration.seconds(5);
    }

    /** Function description */
    @Value.Default
    default String description() {
        return "";
    }

    static ImmutableEdgeLambdaProps.Builder builder() {
        return ImmutableEdgeLambdaProps.builder();
    }
}
