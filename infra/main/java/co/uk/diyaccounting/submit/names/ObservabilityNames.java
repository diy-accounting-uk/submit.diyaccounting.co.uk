/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;

import co.uk.diyaccounting.submit.SubmitSharedNames;

public class ObservabilityNames {

    public String trailName;
    public String originBucketName;
    public String originAccessLogBucketName;
    public String distributionAccessLogGroupName;
    public String distributionAccessLogDeliveryHoldingSourceName;
    public String distributionAccessLogDeliveryOriginSourceName;
    public String distributionAccessLogDeliveryHoldingDestinationName;
    public String distributionAccessLogDeliveryOriginDestinationName;
    public String ew2SelfDestructLogGroupName;
    public String ue1SelfDestructLogGroupName;
    public String apiAccessLogGroupName;

    public String alarmTriageRoleName;
    public String supportAcceptanceRoleName;
    public String quarantineReaderRoleName;
    public String alarmTriageGuardrailName;
    public String alarmTriageGuardrailIdParameterName;
    public String alarmTriageGuardrailVersionParameterName;
    public String agentKillSwitchParameterName;

    public ObservabilityNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {
        this.distributionAccessLogGroupName = "distribution-%s-logs".formatted(root.envResourceNamePrefix);
        this.distributionAccessLogDeliveryHoldingSourceName =
                "%s-holding-dist-logs-src".formatted(root.envResourceNamePrefix);
        this.distributionAccessLogDeliveryOriginSourceName = "%s-orig-dist-l-src".formatted(props.deploymentName); // x
        this.distributionAccessLogDeliveryHoldingDestinationName =
                "%s-holding-logs-dest".formatted(root.envResourceNamePrefix);
        this.distributionAccessLogDeliveryOriginDestinationName = "%s-orig-l-dst".formatted(props.deploymentName); // x

        this.ew2SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-eu-west-2".formatted(root.envResourceNamePrefix);
        this.ue1SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-us-east-1".formatted(root.envResourceNamePrefix);
        this.apiAccessLogGroupName = "/aws/apigw/%s/access".formatted(root.envResourceNamePrefix);

        this.trailName = "%s-trail".formatted(root.envResourceNamePrefix);
        this.originBucketName =
                convertDotSeparatedToDashSeparated("%s-origin-us-east-1".formatted(root.appResourceNamePrefix));
        this.originAccessLogBucketName = "%s-origin-access-logs".formatted(root.appResourceNamePrefix);

        this.alarmTriageRoleName = "%s-alarm-triage-role".formatted(root.envResourceNamePrefix);
        this.supportAcceptanceRoleName = "%s-support-acceptance-role".formatted(root.envResourceNamePrefix);
        this.quarantineReaderRoleName = "%s-quarantine-reader-role".formatted(root.envResourceNamePrefix);
        this.alarmTriageGuardrailName = "%s-alarm-triage-guardrail".formatted(root.envResourceNamePrefix);
        this.alarmTriageGuardrailIdParameterName = "/submit/%s/alarm-triage/guardrail-id".formatted(props.envName);
        this.alarmTriageGuardrailVersionParameterName =
                "/submit/%s/alarm-triage/guardrail-version".formatted(props.envName);
        this.agentKillSwitchParameterName = "/submit/%s/agents/kill-switch".formatted(props.envName);
    }
}
