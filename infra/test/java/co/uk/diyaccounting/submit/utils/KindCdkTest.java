/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
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

        // One custom resource creates the table, a second turns PITR on. CreateTable takes no PITR
        // parameter and no-ops against a table that already exists, so the second call is what
        // reaches live tables.
        template.resourceCountIs("Custom::AWS", 2);
        template.hasResourceProperties(
                "Custom::AWS",
                Map.of(
                        "Create",
                        software.amazon.awscdk.assertions.Match.stringLikeRegexp(
                                ".*updateContinuousBackups.*PointInTimeRecoveryEnabled.*")));
    }

    @Test
    void ensureStreamEnablesNewAndOldImagesWithTablePhysicalResourceId() {
        App app = new App();
        Stack stack = new Stack(app, "TestStack");

        String streamArn = KindCdk.ensureStream(stack, "Widgets", "test-env-widgets", "NEW_AND_OLD_IMAGES");

        assertNotNull(streamArn);

        Template template = Template.fromStack(stack);

        // One call enables the stream, a second reads back the ARN: getResponseField cannot be
        // combined with ignoreErrorCodesMatching on the same call, and the enable call must ignore
        // ValidationException to stay idempotent against an already-streaming table.
        template.resourceCountIs("Custom::AWS", 2);
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
