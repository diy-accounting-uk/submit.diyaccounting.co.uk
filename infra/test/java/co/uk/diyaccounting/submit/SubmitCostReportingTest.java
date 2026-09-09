/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

@SetEnvironmentVariable.SetEnvironmentVariables({
    @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "887764105431"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
})
class SubmitCostReportingTest {

    @Test
    void readsTheReaderRoleArnsFromCdkJsonAndDeploysOneStack() {
        App app = new App(AppProps.builder()
                .context(Map.of(
                        "bucketName",
                        "diy-accounting-cost-focus-887764105431",
                        "exportName",
                        "diy-focus-1-2",
                        "readerRoleArns",
                        "arn:aws:iam::972912397388:role/prod-env-cost-focus-copy-role,"
                                + "arn:aws:iam::367191799875:role/ci-env-cost-focus-copy-role"))
                .build());
        var reporting = new SubmitCostReporting(app);
        app.synth();

        Template template = Template.fromStack(reporting.costExportStack);
        template.resourceCountIs("AWS::S3::Bucket", 1);
        template.resourceCountIs("AWS::BCMDataExports::Export", 1);
        template.hasResourceProperties(
                "AWS::S3::BucketPolicy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(java.util.List.of(Match.objectLike(
                                        Map.of("Sid", "AllowDeploymentAccountsToReadTheExport")))))))));
    }

    @Test
    void appliesTheStandardCostAllocationTags() {
        App app = new App(AppProps.builder()
                .context(Map.of(
                        "bucketName", "diy-accounting-cost-focus-887764105431",
                        "exportName", "diy-focus-1-2",
                        "readerRoleArns", "arn:aws:iam::972912397388:role/prod-env-cost-focus-copy-role"))
                .build());
        var reporting = new SubmitCostReporting(app);

        Template template = Template.fromStack(reporting.costExportStack);
        // Tags.of(app) sorts by key alphabetically at synth, so DeploymentName precedes
        // Environment here rather than the order CostAllocationTags.applyTo adds them in.
        template.hasResourceProperties(
                "AWS::S3::Bucket",
                Match.objectLike(Map.of(
                        "Tags",
                        Match.arrayWith(java.util.List.of(
                                Match.objectLike(Map.of("Key", "DeploymentName", "Value", "cost")),
                                Match.objectLike(Map.of("Key", "Environment", "Value", "management")))))));
    }
}
