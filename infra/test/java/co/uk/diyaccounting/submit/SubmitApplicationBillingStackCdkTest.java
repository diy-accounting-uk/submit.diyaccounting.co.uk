/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.SubmitApplicationCdkSupport.*;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.SetEnvironmentVariable;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.assertions.Template;

class SubmitApplicationBillingStackCdkTest extends SubmitApplicationCdkTestEnvironment {

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "STRIPE_PRICE_ID_RESIDENT_VAT_YEAR", value = "price_live_resident_vat_year"),
        @SetEnvironmentVariable(key = "STRIPE_PRICE_ID_RESIDENT_VAT_MONTH", value = "price_live_resident_vat_month"),
        @SetEnvironmentVariable(key = "STRIPE_TEST_PRICE_ID_RESIDENT_VAT_YEAR", value = "price_test_resident_vat_year"),
        @SetEnvironmentVariable(
                key = "STRIPE_TEST_PRICE_ID_RESIDENT_VAT_MONTH",
                value = "price_test_resident_vat_month"),
    })
    void residentVatBundlePriceIdsReachTheCheckoutLambdaWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template billingStackTemplate = Template.fromStack(submitApplication.billingStack);
        String checkoutFunctionName =
                submitApplication.billingStack.billingCheckoutPostLambdaProps.ingestFunctionName();

        assertHasEnvironmentVariable(billingStackTemplate, checkoutFunctionName, "STRIPE_PRICE_ID_RESIDENT_VAT_YEAR");
        assertHasEnvironmentVariable(billingStackTemplate, checkoutFunctionName, "STRIPE_PRICE_ID_RESIDENT_VAT_MONTH");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_TEST_PRICE_ID_RESIDENT_VAT_YEAR");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_TEST_PRICE_ID_RESIDENT_VAT_MONTH");
    }

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "STRIPE_PRICE_ID_RESIDENT_LTD_YEAR", value = "price_live_resident_ltd_year"),
        @SetEnvironmentVariable(key = "STRIPE_PRICE_ID_RESIDENT_LTD_MONTH", value = "price_live_resident_ltd_month"),
        @SetEnvironmentVariable(key = "STRIPE_TEST_PRICE_ID_RESIDENT_LTD_YEAR", value = "price_test_resident_ltd_year"),
        @SetEnvironmentVariable(
                key = "STRIPE_TEST_PRICE_ID_RESIDENT_LTD_MONTH",
                value = "price_test_resident_ltd_month"),
    })
    void residentLtdBundlePriceIdsReachTheCheckoutLambdaWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template billingStackTemplate = Template.fromStack(submitApplication.billingStack);
        String checkoutFunctionName =
                submitApplication.billingStack.billingCheckoutPostLambdaProps.ingestFunctionName();

        assertHasEnvironmentVariable(billingStackTemplate, checkoutFunctionName, "STRIPE_PRICE_ID_RESIDENT_LTD_YEAR");
        assertHasEnvironmentVariable(billingStackTemplate, checkoutFunctionName, "STRIPE_PRICE_ID_RESIDENT_LTD_MONTH");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_TEST_PRICE_ID_RESIDENT_LTD_YEAR");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_TEST_PRICE_ID_RESIDENT_LTD_MONTH");
    }

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(
                key = "STRIPE_PRICE_ID_RESIDENT_TAX_AGENT_YEAR",
                value = "price_live_resident_tax_agent_year"),
        @SetEnvironmentVariable(
                key = "STRIPE_PRICE_ID_RESIDENT_TAX_AGENT_MONTH",
                value = "price_live_resident_tax_agent_month"),
        @SetEnvironmentVariable(
                key = "STRIPE_TEST_PRICE_ID_RESIDENT_TAX_AGENT_YEAR",
                value = "price_test_resident_tax_agent_year"),
        @SetEnvironmentVariable(
                key = "STRIPE_TEST_PRICE_ID_RESIDENT_TAX_AGENT_MONTH",
                value = "price_test_resident_tax_agent_month"),
    })
    void residentTaxAgentBundlePriceIdsReachTheCheckoutLambdaWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template billingStackTemplate = Template.fromStack(submitApplication.billingStack);
        String checkoutFunctionName =
                submitApplication.billingStack.billingCheckoutPostLambdaProps.ingestFunctionName();

        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_PRICE_ID_RESIDENT_TAX_AGENT_YEAR");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_PRICE_ID_RESIDENT_TAX_AGENT_MONTH");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_TEST_PRICE_ID_RESIDENT_TAX_AGENT_YEAR");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_TEST_PRICE_ID_RESIDENT_TAX_AGENT_MONTH");
    }

    @Test
    @SetEnvironmentVariable.SetEnvironmentVariables({
        @SetEnvironmentVariable(key = "STRIPE_PRICE_ID_RESIDENT_PRO_YEAR", value = "price_live_resident_pro_year"),
        @SetEnvironmentVariable(key = "STRIPE_PRICE_ID_RESIDENT_PRO_MONTH", value = "price_live_resident_pro_month"),
        @SetEnvironmentVariable(key = "STRIPE_TEST_PRICE_ID_RESIDENT_PRO_YEAR", value = "price_test_resident_pro_year"),
        @SetEnvironmentVariable(
                key = "STRIPE_TEST_PRICE_ID_RESIDENT_PRO_MONTH",
                value = "price_test_resident_pro_month"),
    })
    void residentProBundlePriceIdsReachTheCheckoutLambdaWhenSet() throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");

        var submitApplication = new SubmitApplication(app, appProps);
        Template billingStackTemplate = Template.fromStack(submitApplication.billingStack);
        String checkoutFunctionName =
                submitApplication.billingStack.billingCheckoutPostLambdaProps.ingestFunctionName();

        assertHasEnvironmentVariable(billingStackTemplate, checkoutFunctionName, "STRIPE_PRICE_ID_RESIDENT_PRO_YEAR");
        assertHasEnvironmentVariable(billingStackTemplate, checkoutFunctionName, "STRIPE_PRICE_ID_RESIDENT_PRO_MONTH");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_TEST_PRICE_ID_RESIDENT_PRO_YEAR");
        assertHasEnvironmentVariable(
                billingStackTemplate, checkoutFunctionName, "STRIPE_TEST_PRICE_ID_RESIDENT_PRO_MONTH");
    }
}
