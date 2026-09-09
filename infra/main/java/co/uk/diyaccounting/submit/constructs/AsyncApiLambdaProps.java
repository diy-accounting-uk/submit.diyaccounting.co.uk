/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.lambda.Architecture;

@Value.Immutable
public interface AsyncApiLambdaProps extends AbstractApiLambdaProps {

    String workerFunctionName();

    String workerHandler();

    String workerLambdaArn();

    String workerProvisionedConcurrencyAliasArn();

    String workerQueueName();

    String workerDeadLetterQueueName();

    @Value.Default
    default int workerProvisionedConcurrency() {
        return 0;
    }

    @Value.Default
    default Duration workerLambdaTimeout() {
        return Duration.seconds(10);
    }

    @Value.Default
    default Duration queueVisibilityTimeout() {
        return Duration.seconds(30);
    }

    @Value.Default
    default int workerMaxReceiveCount() {
        return 3; // 2 retries + 1 initial attempt
    }

    @Value.Default
    default int workerMemorySize() {
        return 1024;
    }

    @Value.Default
    default Architecture workerArchitecture() {
        return Architecture.ARM_64;
    }

    static ImmutableAsyncApiLambdaProps.Builder builder() {
        return ImmutableAsyncApiLambdaProps.builder();
    }
}
