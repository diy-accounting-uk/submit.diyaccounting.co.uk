/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public interface AbstractApiLambdaProps extends AbstractLambdaProps {

    HttpMethod httpMethod();

    String urlPath();

    boolean jwtAuthorizer();

    boolean customAuthorizer();

    /** True for a books route: authorised by the second, books-client-scoped JWT authoriser
     * instead of the main one, regardless of {@link #jwtAuthorizer()}. */
    @Value.Default
    default boolean booksJwtAuthorizer() {
        return false;
    }

    /** True to also create an unauthenticated OPTIONS route on the same path, for CORS
     * preflight, answered by the same integration as the primary route. */
    @Value.Default
    default boolean optionsPreflightRoute() {
        return false;
    }
}
