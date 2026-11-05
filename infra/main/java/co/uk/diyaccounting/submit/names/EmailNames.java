/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;

public class EmailNames {

    public static final String SENDER_LOCAL_PART = "support";
    public static final String MAIL_FROM_SUBDOMAIN = "bounce";

    public String configurationSetName;
    public String eventsTopicName;
    public String queueName;
    public String deadLetterQueueName;
    public String userPoolIdParameterName;

    public String sendLambdaHandler;
    public String sendLambdaFunctionName;
    public String sendLambdaArn;
    public String sendProvisionedConcurrencyLambdaAliasArn;

    public String eventLambdaHandler;
    public String eventLambdaFunctionName;
    public String eventLambdaArn;
    public String eventProvisionedConcurrencyLambdaAliasArn;

    public EmailNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {
        this.configurationSetName = "%s-customer-email".formatted(root.envResourceNamePrefix);
        this.eventsTopicName = "%s-customer-email-events".formatted(root.envResourceNamePrefix);
        this.queueName = "%s-customer-email".formatted(root.envResourceNamePrefix);
        this.deadLetterQueueName = "%s-customer-email-dlq".formatted(root.envResourceNamePrefix);
        this.userPoolIdParameterName = "/submit/%s/user-pool-id".formatted(props.envName);

        this.sendLambdaFunctionName = "%s-customer-email-send".formatted(root.envResourceNamePrefix);
        this.sendLambdaHandler = "app/functions/email/customerEmailSend.handler";
        this.sendLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.sendLambdaFunctionName);
        this.sendProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.sendLambdaArn, root.provisionedConcurrencyAliasName);

        this.eventLambdaFunctionName = "%s-customer-email-event".formatted(root.envResourceNamePrefix);
        this.eventLambdaHandler = "app/functions/email/customerEmailEvent.handler";
        this.eventLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.eventLambdaFunctionName);
        this.eventProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.eventLambdaArn, root.provisionedConcurrencyAliasName);
    }
}
