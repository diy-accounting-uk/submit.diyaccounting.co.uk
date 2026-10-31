/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability DATA-17 Export AWS billing data in FOCUS format
// - **Use when:** the management account's billing export must be created or changed for downstream cost copy.
// - **Does:** SubmitCostReporting.java is a fourth, standalone CDK app deployed into the management account. It runs under separate credentials from the environment and application apps. CostExportStack.java deploys the export bucket and the BCMDataExports::Export resource, in FOCUS 1.2 Parquet format.
// - **Run:** no command; see Does and Entry
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/SubmitCostReporting.java:main`; `infra/main/java/co/uk/diyaccounting/submit/stacks/CostExportStack.java:CostExportStack`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/SubmitCostReporting.java, infra/test/java/co/uk/diyaccounting/submit/SubmitCostReportingTest.java, infra/main/java/co/uk/diyaccounting/submit/stacks/CostExportStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/CostExportStackTest.java
// - **Keywords:** focus format, bcmdataexports, management account, standalone cdk app, cost export bucket, cost-copy role
// - **Related:** DATA-08
// @end-capability
// spotless:on

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.stacks.CostExportStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import java.util.Arrays;
import java.util.List;
import software.amazon.awscdk.App;
import software.constructs.Construct;

/**
 * CDK app for the FOCUS 1.2 cost export, which lives in the management account (887764105431)
 * alongside {@code root.diyaccounting.co.uk}'s stacks rather than in a deployment account.
 *
 * <p>A fourth app alongside {@code SubmitEnvironment}, {@code SubmitApplication} and
 * {@code SubmitBackupAccount} for the same reason as the last of those: it deploys into a
 * different account under different credentials, and folding it into either environment app
 * would put the export inside a blast radius it exists to sit outside of.
 */
public class SubmitCostReporting {

    public static final String DEFAULT_BUCKET_NAME = "diy-accounting-cost-focus-887764105431";
    public static final String DEFAULT_EXPORT_NAME = "diy-focus-1-2";

    public final CostExportStack costExportStack;

    public static void main(final String[] args) {
        App app = new App();
        new SubmitCostReporting(app);
        app.synth();
        infof("CDK synth complete");
    }

    public SubmitCostReporting(App app) {
        var primaryEnv = KindCdk.buildPrimaryEnvironment();

        var bucketName = envOr(
                "COST_FOCUS_BUCKET_NAME",
                KindCdk.getContextValueString(app, "bucketName", DEFAULT_BUCKET_NAME),
                "(from bucketName in cdk.json)");

        var exportName = envOr(
                "COST_FOCUS_EXPORT_NAME",
                KindCdk.getContextValueString(app, "exportName", DEFAULT_EXPORT_NAME),
                "(from exportName in cdk.json)");

        var readerRoleArns = readReaderRoleArns(app);

        this.costExportStack = new CostExportStack(
                app,
                "cost-CostExportStack",
                CostExportStack.CostExportStackProps.builder()
                        .env(primaryEnv)
                        .bucketName(bucketName)
                        .exportName(exportName)
                        .readerRoleArns(readerRoleArns)
                        .build());

        CostAllocationTags.applyTo(app, "management", "cost");
    }

    /** Reads the comma-separated list of deployment-account cost-focus-copy role ARNs. */
    private static List<String> readReaderRoleArns(Construct scope) {
        var raw = envOr(
                "COST_FOCUS_READER_ROLE_ARNS",
                KindCdk.getContextValueString(scope, "readerRoleArns", ""),
                "(from readerRoleArns in cdk.json)");
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(arn -> !arn.isEmpty())
                .toList();
    }
}
