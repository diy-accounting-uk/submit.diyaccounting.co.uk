/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;

public class OpsNames {

    // Alarm-to-GitHub-issue Lambda (EventBridge target, not API)
    public String alarmToGithubIssueLambdaHandler;
    public String alarmToGithubIssueLambdaFunctionName;
    public String alarmToGithubIssueLambdaArn;
    public String alarmToGithubIssueProvisionedConcurrencyLambdaAliasArn;

    // Alarm-to-operator-SMS Lambda (SNS subscriber on OpsStack's alertTopic, not API)
    public String alarmSmsForwardLambdaHandler;
    public String alarmSmsForwardLambdaFunctionName;
    public String alarmSmsForwardLambdaArn;
    public String alarmSmsForwardProvisionedConcurrencyLambdaAliasArn;

    public OpsNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        // Alarm-to-GitHub-issue Lambda (EventBridge target, not API)
        var alarmToGithubIssueLambdaHandlerName = "alarmToGithubIssue.handler";
        var alarmToGithubIssueLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(alarmToGithubIssueLambdaHandlerName);
        this.alarmToGithubIssueLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, alarmToGithubIssueLambdaHandlerDashed);
        this.alarmToGithubIssueLambdaHandler =
                "%s/ops/%s".formatted(root.appLambdaHandlerPrefix, alarmToGithubIssueLambdaHandlerName);
        this.alarmToGithubIssueLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, alarmToGithubIssueLambdaHandlerDashed);
        this.alarmToGithubIssueProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.alarmToGithubIssueLambdaArn, root.provisionedConcurrencyAliasName);

        // Alarm-to-operator-SMS Lambda (SNS subscriber, not API)
        var alarmSmsForwardLambdaHandlerName = "alarmSmsForward.handler";
        var alarmSmsForwardLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(alarmSmsForwardLambdaHandlerName);
        this.alarmSmsForwardLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, alarmSmsForwardLambdaHandlerDashed);
        this.alarmSmsForwardLambdaHandler =
                "%s/ops/%s".formatted(root.appLambdaHandlerPrefix, alarmSmsForwardLambdaHandlerName);
        this.alarmSmsForwardLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, alarmSmsForwardLambdaHandlerDashed);
        this.alarmSmsForwardProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.alarmSmsForwardLambdaArn, root.provisionedConcurrencyAliasName);
    }
}
