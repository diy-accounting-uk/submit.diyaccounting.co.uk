/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import software.constructs.Construct;

public class ApiLambda extends Lambda {
    public final AbstractApiLambdaProps apiProps;

    public ApiLambda(final Construct scope, AbstractApiLambdaProps apiProps) {
        super(scope, apiProps);
        this.apiProps = apiProps;
    }
}
