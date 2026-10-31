/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class StaticSiteStackTest {

    private static Template synth(List<String> domainNames, List<String> unmanagedPrefixes) {
        App app = new App();
        var stack = new StaticSiteStack(
                app,
                "test-env-DeveloperSiteStack",
                StaticSiteStack.StaticSiteStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("us-east-1")
                                .build())
                        .envName("test")
                        .siteName("developer")
                        .domainNames(domainNames)
                        .certificateArn(
                                "arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789012")
                        .docRootPath("./web/developer")
                        .unmanagedPrefixes(unmanagedPrefixes)
                        .build());
        return Template.fromStack(stack);
    }

    @Test
    void servesOneBucketBehindOneDistributionOnTheGivenHostNames() {
        Template template = synth(
                List.of("prod-developer.diyaccounting.co.uk", "developer.diyaccounting.co.uk"),
                List.of("reports/"));

        template.resourceCountIs("AWS::S3::Bucket", 1);
        template.resourceCountIs("AWS::CloudFront::Distribution", 1);
        template.hasResourceProperties(
                "AWS::CloudFront::Distribution",
                Match.objectLike(Map.of(
                        "DistributionConfig",
                        Match.objectLike(Map.of(
                                "Aliases",
                                List.of("prod-developer.diyaccounting.co.uk", "developer.diyaccounting.co.uk"))))));
    }

    @Test
    void publishesTheDistributionDomainNameAndTheBucketForTheRootRecordsAndTheReports() {
        Template template = synth(List.of("ci-developer.diyaccounting.co.uk"), List.of("reports/"));

        template.hasOutput("DistributionDomainName", Match.anyValue());
        template.hasOutput("DistributionId", Match.anyValue());
        template.hasOutput("BucketName", Match.anyValue());
    }

    @Test
    void writesNoRouteFiftyThreeRecordsBecauseTheRootAccountOwnsThem() {
        Template template = synth(List.of("ci-developer.diyaccounting.co.uk"), List.of());

        template.resourceCountIs("AWS::Route53::RecordSet", 0);
    }

    @Test
    void leavesUnmanagedPrefixesAloneWhenItPrunesTheDeployedFiles() {
        Template template = synth(List.of("ci-developer.diyaccounting.co.uk"), List.of("reports/"));

        template.hasResourceProperties(
                "Custom::CDKBucketDeployment",
                Match.objectLike(Map.of("Prune", true, "Exclude", List.of("reports/*"))));
    }
}
