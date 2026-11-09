/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

/** An ingest Lambda in HmrcItsaPropertyStack opens an HMRC grant, so it needs the grant table in its environment. */
class HmrcItsaPropertyStackTest {

    private static final SubmitSharedNames SHARED_NAMES = SubmitSharedNames.forDocs();
    private static Template TEMPLATE;

    @BeforeAll
    static void synthHmrcItsaPropertyStack() {
        App app = new App();
        HmrcItsaPropertyStack stack = new HmrcItsaPropertyStack(
                app,
                "TestHmrcItsaPropertyStack",
                HmrcItsaPropertyStack.HmrcItsaPropertyStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(SHARED_NAMES.appResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(SHARED_NAMES)
                        .baseImageTag("latest")
                        .hmrcBaseUri("https://test-api.service.hmrc.gov.uk")
                        .hmrcClientId("test-client-id")
                        .hmrcClientSecretArn("")
                        .hmrcSandboxBaseUri("https://test-api.service.hmrc.gov.uk")
                        .hmrcSandboxClientId("test-sandbox-client-id")
                        .hmrcSandboxClientSecretArn("")
                        .build());
        TEMPLATE = Template.fromStack(stack);
    }

    @Test
    void ingestLambdaCanOpenAnHmrcGrant() {
        TEMPLATE.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        SHARED_NAMES.hmrcItsaProperty.hmrcItsaBsasForeignPropertyGetIngestLambdaFunctionName,
                        "Environment",
                        Map.of(
                                "Variables",
                                Match.objectLike(Map.of("MCP_SESSIONS_DYNAMODB_TABLE_NAME", Match.anyValue()))))));
    }
}
