/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;

public class SelfDestructNames {

    public String selfDestructLambdaHandler;
    public String selfDestructLambdaFunctionName;
    public String selfDestructLambdaArn;
    public String selfDestructProvisionedConcurrencyLambdaAliasArn;

    public SelfDestructNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        var appSelfDestructLambdaHandlerName = "selfDestruct.ingestHandler";
        var appSelfDestructLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(appSelfDestructLambdaHandlerName);
        this.selfDestructLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, appSelfDestructLambdaHandlerDashed);
        this.selfDestructLambdaHandler =
                "%s/infra/%s".formatted(root.appLambdaHandlerPrefix, appSelfDestructLambdaHandlerName);
        this.selfDestructLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, appSelfDestructLambdaHandlerDashed);
        this.selfDestructProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.selfDestructLambdaArn, root.provisionedConcurrencyAliasName);
    }
}
