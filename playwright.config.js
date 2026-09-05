// playwright.config.js
import { defineConfig } from "@playwright/test";

export default defineConfig({
  projects: [
    {
      name: "allBehaviour",
      testDir: "behaviour-tests",
      // testMatch: ["**/submitVat.behaviour.test.js", "**/bundles.behaviour.test.js"],
      testMatch: [
        "**/auth.behaviour.test.js",
        "**/bundles.behaviour.test.js",
        "**/compliance.behaviour.test.js",
        "**/submitVat.behaviour.test.js",
        "**/postVatReturn.behaviour.test.js",
        "**/getVatReturn.behaviour.test.js",
        "**/postVatReturnFraudPreventionHeaders.behaviour.test.js",
        "**/getVatObligations.behaviour.test.js",
        "**/getVatLiabilities.behaviour.test.js",
        "**/getVatPayments.behaviour.test.js",
        "**/getVatPenalties.behaviour.test.js",
        "**/itsaBusinessDetails.behaviour.test.js",
        "**/passRedemption.behaviour.test.js",
        "**/tokenEnforcement.behaviour.test.js",
      ],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "authBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/auth.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "bundleBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/bundles.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "submitVatBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/submitVat.behaviour.test.js"],
      workers: 1,
      // Overridable so two concurrent runs (see test:submitVatBehaviour-simulator) don't share
      // one outputDir, where one run's cleanup can delete the other's in-flight trace artifacts.
      outputDir: process.env.PLAYWRIGHT_SUBMITVAT_OUTPUT_DIR || "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "postVatReturnFraudPreventionHeadersBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/postVatReturnFraudPreventionHeaders.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "getVatObligationsBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/getVatObligations.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "getVatLiabilitiesBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/getVatLiabilities.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "getVatPaymentsBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/getVatPayments.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "itsaBusinessDetailsBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/itsaBusinessDetails.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "getVatPenaltiesBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/getVatPenalties.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "postVatReturnBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/postVatReturn.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "getVatReturnBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/getVatReturn.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "complianceBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/compliance.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "helpBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/help.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "vatValidationBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/vatValidation.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "vatSchemesBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/vatSchemes.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "passRedemptionBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/passRedemption.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "tokenEnforcementBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/tokenEnforcement.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 600_000,
    },
    {
      name: "generatePassActivityBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/generatePassActivity.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "tokenRefreshBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/tokenRefresh.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "paymentBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/payment.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 600_000,
    },
    {
      name: "simulatorBehaviour",
      testDir: "behaviour-tests",
      testMatch: ["**/simulator.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/behaviour-test-results/",
      timeout: 300_000,
    },
    {
      name: "captureDemo",
      testDir: "behaviour-tests",
      testMatch: ["**/captureDemo.behaviour.test.js"],
      workers: 1,
      outputDir: "./target/demo-videos/",
      timeout: 300_000,
    },
    {
      name: "browser-tests",
      testDir: "web/browser-tests",
      workers: 1, // throttle concurrency to 1
      outputDir: "./target/browser-test-results/",
    },
  ],

  // Output directory for all artifacts (screenshots, videos, traces, etc.)
  outputDir: "./target/test-results/",

  // Don't delete the output directory before running tests
  preserveOutput: "always",

  use: {
    // A real desktop Chrome UA with a marker appended, not replaced: the Cognito Hosted UI and
    // the site's own visitorClassifier both read the browser tokens. scanRate404Detect.js
    // excludes this marker from its 404-rate query, so behaviour-test traffic never raises a
    // scan alert against a real environment. This is a telemetry filter, not a security control
    // — anyone can send this user agent — see RUNBOOK_INFORMATION_SECURITY.md section 7.5.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 DIYAccountingSynthetic/1",
    // Save a video for every test
    video: {
      mode: "on", // 'on', 'retain-on-failure', or 'off'
      size: { width: 1280, height: 1446 }, // (optional)
      // Playwright always uses .webm for video
    },
    // Match viewport to video size so screenshots and recordings align
    viewport: { width: 1280, height: 1446 },
    // Screenshot options
    screenshot: "on",
    // Screenshots are png by default, but jpeg is also possible
    // To get jpeg: page.screenshot({ type: 'jpeg' }) in test code

    // Enable detailed logging
    trace: "on", // Enable tracing for detailed debugging

    // Anti-detection flags for headless Chrome in CI Docker environments.
    // Stripe's checkout SPA may detect automated browsers and silently block payment
    // processing. These flags make the browser appear more like a regular user session.
    launchOptions: {
      args: ["--disable-blink-features=AutomationControlled", "--disable-features=IsolateOrigins,site-per-process"],
    },
  },

  reporter: [
    [
      "html",
      {
        outputFolder: "target/test-reports/html-report",
        open: "never", // <-- prevent auto-serving and terminal blocking
      },
    ],
    ["list"],
    ["./scripts/playwright-video-reporter.js", { verbose: false }],
  ],

  // Optional: customize test timeout or other settings here
  timeout: 120_000,
});
