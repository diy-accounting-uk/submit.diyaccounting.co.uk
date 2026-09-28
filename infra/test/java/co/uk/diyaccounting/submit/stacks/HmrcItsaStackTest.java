/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Template;

/**
 * A worker Lambda that charges a token via tokenEnforcement.chargeTokenOnSuccess must be granted
 * dynamodb:UpdateItem on the bundles table, not just dynamodb:Query. HmrcItsaStack.java grants both
 * Lambdas of each feature (ingest and worker) the same permission set in one bundlesTable.grant(fn,
 * ...) call, so this checks the worker, which is where the charge runs.
 */
class HmrcItsaStackTest {

    private static final SubmitSharedNames SHARED_NAMES = SubmitSharedNames.forDocs();
    private static Template TEMPLATE;

    @BeforeAll
    static void synthHmrcItsaStack() {
        App app = new App();
        HmrcItsaStack stack = new HmrcItsaStack(
                app,
                "TestHmrcItsaStack",
                HmrcItsaStack.HmrcItsaStackProps.builder()
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
                        .hmrcSandboxBaseUri("https://test-api.service.hmrc.gov.uk")
                        .build());
        TEMPLATE = Template.fromStack(stack);
    }

    // Every worker Lambda in this stack whose handler calls tokenEnforcement's
    // consumeTokenForActivity or chargeTokenOnSuccess (as opposed to only hasTokensForActivity,
    // which needs Query alone).
    private static Stream<String> chargingWorkerFunctionNames() {
        return Stream.of(
                SHARED_NAMES.hmrcItsaUkPropertyPeriodPostWorkerLambdaFunctionName,
                SHARED_NAMES.hmrcItsaUkPropertyPeriodPutWorkerLambdaFunctionName,
                SHARED_NAMES.hmrcItsaUkPropertyAnnualPutWorkerLambdaFunctionName,
                SHARED_NAMES.hmrcItsaLossesAndClaimsPutWorkerLambdaFunctionName,
                SHARED_NAMES.hmrcItsaLossesAndClaimsDeleteWorkerLambdaFunctionName,
                SHARED_NAMES.hmrcItsaTaxLiabilityAdjustmentsPutWorkerLambdaFunctionName,
                SHARED_NAMES.hmrcItsaTaxLiabilityAdjustmentsDeleteWorkerLambdaFunctionName);
    }

    @ParameterizedTest
    @MethodSource("chargingWorkerFunctionNames")
    void chargingWorkerCanUpdateBundlesTable(String workerFunctionName) {
        assertTrue(
                BundlesTableIamAssertions.lambdaRoleCanUpdateBundlesTable(TEMPLATE, workerFunctionName),
                "worker Lambda " + workerFunctionName
                        + " charges a token on success and must be granted dynamodb:UpdateItem on the bundles table");
    }
}
