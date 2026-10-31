/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;

public class ActivityNames {

    public String activityBusName;

    // Env-level Telegram forwarder Lambda (EventBridge target, not API): one per environment,
    // shared by every deployment's OpsStack rules instead of each deployment building its own.
    public String activityTelegramForwarderLambdaHandler;
    public String activityTelegramForwarderLambdaFunctionName;
    public String activityTelegramForwarderLambdaArn;
    public String activityTelegramForwarderProvisionedConcurrencyLambdaAliasArn;

    // Env-level sign-in activity publish Lambda: the Pre Token Generation trigger's
    // fire-and-forget invoke target, one per environment.
    public String signInActivityPublishLambdaHandler;
    public String signInActivityPublishLambdaFunctionName;
    public String signInActivityPublishLambdaArn;
    public String signInActivityPublishProvisionedConcurrencyLambdaAliasArn;

    public ActivityNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        // Env-level Telegram forwarder Lambda: one instance shared by every deployment's OpsStack
        // rules, instead of each deployment building its own copy of the same catch-all rule.
        this.activityTelegramForwarderLambdaFunctionName =
                "%s-activity-telegram-forwarder".formatted(root.envResourceNamePrefix);
        this.activityTelegramForwarderLambdaHandler = "app/functions/ops/activityTelegramForwarder.handler";
        this.activityTelegramForwarderLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.activityTelegramForwarderLambdaFunctionName);
        this.activityTelegramForwarderProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.activityTelegramForwarderLambdaArn, root.provisionedConcurrencyAliasName);

        // Env-level sign-in activity publish Lambda: enriches and publishes the sign-in and
        // refresh event the Pre Token Generation trigger hands off for every app client.
        this.signInActivityPublishLambdaFunctionName =
                "%s-sign-in-activity-publish".formatted(root.envResourceNamePrefix);
        this.signInActivityPublishLambdaHandler = "app/functions/auth/signInActivityPublish.handler";
        this.signInActivityPublishLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.signInActivityPublishLambdaFunctionName);
        this.signInActivityPublishProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.signInActivityPublishLambdaArn, root.provisionedConcurrencyAliasName);
        this.activityBusName = "%s-activity-bus".formatted(root.envResourceNamePrefix);
    }
}
