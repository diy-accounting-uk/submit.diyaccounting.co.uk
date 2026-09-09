/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import org.immutables.value.Value;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

@Value.Immutable
public interface LambdaNameProps {

    HttpMethod apiHttpMethod();

    String handlerPath();

    String apiUrlPath();

    boolean apiJwtAuthorizer();

    boolean apiCustomAuthorizer();

    String resourceNamePrefix();

    String lambdaArnPrefix();

    String ingestHandlerName();

    String workerHandlerName();

    String provisionedConcurrencyAliasName();

    @Value.Default
    default String handlerPrefix() {
        return "app/functions";
    }

    @Value.Default
    default String defaultAliasName() {
        return "hot";
    }

    @Value.Default
    default String workerPostfix() {
        return "worker";
    }

    @Value.Default
    default String queuePostfix() {
        return "queue";
    }

    @Value.Default
    default String deadLetterQueuePostfix() {
        return "dlq";
    }

    static ImmutableLambdaNameProps.Builder builder() {
        return ImmutableLambdaNameProps.builder();
    }
}
