/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import co.uk.diyaccounting.submit.utils.OperatorEmailsHelper;
import software.constructs.Construct;

public class ApiLambda extends Lambda {
    public final AbstractApiLambdaProps apiProps;

    public ApiLambda(final Construct scope, AbstractApiLambdaProps apiProps) {
        super(scope, apiProps);
        this.apiProps = apiProps;
        if (isBehindAnAuthorizer(apiProps)) {
            OperatorEmailsHelper.grantWhenAuthenticatingCallers(this.ingestLambda, apiProps.environment());
        }
    }

    public static boolean isBehindAnAuthorizer(AbstractApiLambdaProps apiProps) {
        return apiProps.jwtAuthorizer()
                || apiProps.customAuthorizer()
                || apiProps.booksJwtAuthorizer()
                || apiProps.billingJwtAuthorizer()
                || apiProps.allClientsJwtAuthorizer();
    }
}
