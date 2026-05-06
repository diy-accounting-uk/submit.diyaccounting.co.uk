/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.events.EventBus;
import software.constructs.Construct;

public class ActivityStack extends Stack {

    public final EventBus activityBus;

    @Value.Immutable
    public interface ActivityStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        static ImmutableActivityStackProps.Builder builder() {
            return ImmutableActivityStackProps.builder();
        }
    }

    public ActivityStack(final Construct scope, final String id, final ActivityStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "ActivityStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // ============================================================================
        // EventBridge Custom Activity Bus
        // ============================================================================
        this.activityBus = EventBus.Builder.create(this, props.resourceNamePrefix() + "-ActivityBus")
                .eventBusName(props.sharedNames().activityBusName)
                .build();

        cfnOutput(this, "ActivityBusName", this.activityBus.getEventBusName());
        cfnOutput(this, "ActivityBusArn", this.activityBus.getEventBusArn());

        infof("ActivityStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
