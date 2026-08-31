/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import software.amazon.awscdk.App;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.Tags;

/**
 * Applies the tag keys the AWS bill is split by.
 *
 * <p>Cost Explorer and the Cost and Usage Report can only group spend by a tag key that every
 * billable resource carries, so these are applied to the whole CDK app rather than stack by
 * stack. Applying them per stack let nine stacks ship with no tags at all, and those nine held
 * the largest line items on the bill.
 */
public final class CostAllocationTags {

    /** The repository that owns every resource these apps deploy. */
    public static final String APPLICATION = "@diy-accounting-uk/submit.diyaccounting.co.uk";

    private CostAllocationTags() {}

    public static void applyTo(final App app, final String envName, final String deploymentName) {
        Tags.of(app).add("Application", APPLICATION);
        Tags.of(app).add("CostCenter", APPLICATION);
        Tags.of(app).add("Owner", APPLICATION);
        Tags.of(app).add("Project", APPLICATION);
        Tags.of(app).add("Environment", envName);
        Tags.of(app).add("DeploymentName", deploymentName);
        Tags.of(app).add("ManagedBy", "aws-cdk");

        for (var construct : app.getNode().findAll()) {
            if (construct instanceof Stack stack) {
                Tags.of(stack).add("Stack", stack.getClass().getSimpleName());
            }
        }
    }
}
