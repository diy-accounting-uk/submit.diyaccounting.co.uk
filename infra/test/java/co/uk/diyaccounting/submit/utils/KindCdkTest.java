/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;

class KindCdkTest {

    @Test
    void cfnOutputBuildsAndGetContextValueStringReadsContext() {
        App app = new App(
                AppProps.builder().context(Map.of("testKey", "testValue")).build());
        Stack stack = new Stack(app, "TestStack");

        var out = KindCdk.cfnOutput(stack, "Out1", "");
        assertNotNull(out);
        assertEquals("", out.getValue());

        String v = KindCdk.getContextValueString(stack, "testKey", "default");
        assertEquals("testValue", v);

        // Also ensure Template can synth without errors
        Template.fromStack(stack);
    }

    @Test
    void ensureTableTurnsOnPointInTimeRecovery() {
        App app = new App();
        Stack stack = new Stack(app, "TestStack");

        KindCdk.ensureTable(stack, "Widgets", "test-env-widgets", "pk", "sk");

        Template template = Template.fromStack(stack);

        // CreateTable is the only AwsCustomResource call left here; PITR now runs behind a
        // Provider-backed custom resource so its onEvent/isComplete handlers can wait out
        // ContinuousBackupsUnavailableException instead of failing the deployment.
        template.resourceCountIs("Custom::AWS", 1);
        template.resourceCountIs("Custom::EnsurePitr", 1);
        template.hasResourceProperties("Custom::EnsurePitr", Map.of("TableName", "test-env-widgets"));
    }

    @Test
    void ensureStreamEnablesNewAndOldImagesWithTablePhysicalResourceId() {
        App app = new App();
        Stack stack = new Stack(app, "TestStack");

        KindCdk.ensureTable(stack, "WidgetsTable", "test-env-widgets", "pk", null);
        String streamArn = KindCdk.ensureStream(stack, "Widgets", "test-env-widgets", "NEW_AND_OLD_IMAGES");

        assertNotNull(streamArn);

        Template template = Template.fromStack(stack);

        // CreateTable, the stream enable call, and the stream ARN read-back are AwsCustomResource
        // calls; PITR runs behind its own Provider-backed custom resource (see
        // ensureTableTurnsOnPointInTimeRecovery), because getResponseField cannot be combined with
        // ignoreErrorCodesMatching on the same call and the enable call must ignore
        // ValidationException to stay idempotent against an already-streaming table.
        template.resourceCountIs("Custom::AWS", 3);
        template.resourceCountIs("Custom::EnsurePitr", 1);
        // Map.of does not preserve key order, so the two StreamSpecification fields and TableName can
        // appear in either order in the serialized Create string - match each fact independently.
        template.hasResourceProperties(
                "Custom::AWS",
                Map.of(
                        "Create",
                        software.amazon.awscdk.assertions.Match.stringLikeRegexp(
                                ".*updateTable.*\"StreamEnabled\":true.*")));
        template.hasResourceProperties(
                "Custom::AWS",
                Map.of(
                        "Create",
                        software.amazon.awscdk.assertions.Match.stringLikeRegexp(
                                ".*updateTable.*\"StreamViewType\":\"NEW_AND_OLD_IMAGES\".*")));
        template.hasResourceProperties(
                "Custom::AWS",
                Map.of("Create", software.amazon.awscdk.assertions.Match.stringLikeRegexp(".*describeTable.*")));
    }
}
