/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.SubmitApplicationCdkSupport.*;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class SubmitApplicationPublishStackCdkTest extends SubmitApplicationCdkTestEnvironment {

    @Test
    void publishOntoAnExistingSetInvalidatesOneWildcardPath() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template.fromStack(submitApplication.publishStack)
                .hasResourceProperties(
                        "Custom::CDKBucketDeployment",
                        Match.objectLike(
                                Map.of("DistributionId", Match.anyValue(), "DistributionPaths", List.of("/*"))));
    }

    @Test
    @SetEnvironmentVariable(key = "PUBLISH_INVALIDATES_DISTRIBUTION", value = "false")
    void firstPublishOfANewSetInvalidatesNothing() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template.fromStack(submitApplication.publishStack)
                .hasResourceProperties(
                        "Custom::CDKBucketDeployment",
                        Match.objectLike(
                                Map.of("DistributionId", Match.absent(), "DistributionPaths", Match.absent())));
    }
}
