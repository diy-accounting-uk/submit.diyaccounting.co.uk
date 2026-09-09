/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import org.immutables.value.Value;

@Value.Immutable
public interface LambdaProps extends AbstractLambdaProps {

    static ImmutableLambdaProps.Builder builder() {
        return ImmutableLambdaProps.builder();
    }
}
