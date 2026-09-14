// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/operatorDashboard.browser.test.js
// Browser tests for the operator dashboard entry point

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const FIXTURE_SNAPSHOT = {
  generatedAt: "2026-09-08T03:15:00.000Z",
  environment: "prod",
  objectives: [
    {
      id: "uptime",
      name: "Uptime",
      observations: [
        {
          id: "probe-pass-rate",
          label: "Probe pass rate",
          unit: "ratio",
          last30: { value: 0.999, trend: 0.001 },
          last90: { value: 0.998, trend: null },
          deepLink: "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#dashboards:name=prod-env-operations",
        },
        {
          id: "alarms-fired",
          label: "Alarms fired",
          unit: "count",
          last30: { value: 3, trend: -0.25 },
          last90: { value: 10, trend: 0.1 },
          deepLink: "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#alarmsV2:",
        },
      ],
    },
    {
      id: "conversion-to-submission",
      name: "Conversion to submission",
      observations: [
        {
          id: "login-to-submission-conversion",
          label: "Login-to-submission conversion",
          unit: "ratio",
          last30: { value: 0.42, trend: 0 },
          last90: { value: 0.4, trend: 0.05 },
          deepLink: "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#dashboards:name=prod-env-analytics",
        },
      ],
    },
    { id: "conversion-to-paid", name: "Conversion to paid", observations: [] },
    { id: "low-running-cost", name: "Low running cost", observations: [] },
    { id: "security", name: "Security", observations: [] },
    { id: "retention", name: "Retention", observations: [] },
    { id: "operator-effort", name: "Operator effort", observations: [] },
    { id: "compliance", name: "Compliance", observations: [] },
  ],
};

const FIXTURE_EXPERIMENTS = {
  experiments: [
    {
      id: "exp-2026-09-uptime-baseline",
      objective: "uptime",
      hypothesis: "",
      lever: "baseline",
      metric: "probe-pass-rate",
      start: "2026-09-01",
      end: "2026-09-30",
    },
  ],
};

// The real 403 body a signed-in caller without the operator bundle gets back from
// operatorSnapshotGet.js (app/functions/analytics/operatorSnapshotGet.js) - kept in sync with
// that handler's message so this fixture proves what the page does with the server's own words,
// not a placeholder.
const FORBIDDEN_BODY = {
  message:
    "Not authorised to view the operator dashboard. Ask an admin to issue you the operator pass " +
    "(generate-pass.yml, pass-type=operator) restricted to your own sign-in email.",
  code: "BUNDLE_ENTITLEMENT_REQUIRED",
};

test.describe("Operator Dashboard", () => {
  let dashboardHtmlContent;
  let pageChromeJsContent;
  let authStatusJsContent;

  test.beforeAll(async () => {
    dashboardHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/operator/dashboard.html"), "utf-8");
    pageChromeJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/page-chrome.js"), "utf-8");
    authStatusJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/auth-status.js"), "utf-8");
  });

  async function setupRoutes(page, { snapshotStatus = 200, snapshotBody = FIXTURE_SNAPSHOT } = {}) {
    await page.route("**/dashboard.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: dashboardHtmlContent });
    });
    await page.route("**/api/v1/operator/snapshot*", async (route) => {
      await route.fulfill({
        status: snapshotStatus,
        contentType: "application/json",
        body: JSON.stringify(snapshotBody),
      });
    });
    await page.route("**/experiments.toml*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_EXPERIMENTS) });
    });
    await page.route("**/auth/login.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>login stub</body></html>" });
    });
    // Catch-all for every other script (submit.js, developer-mode.js, request-cache.js,
    // toml-parser.js, entitlement-status.js, status-messages.js, view-source-link.js): none of
    // it is exercised by these tests. Registered before the two widgets below so those more
    // specific routes - registered after - take precedence over this one, per Playwright's
    // last-registered-wins routing order.
    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await page.route("**/widgets/page-chrome.js*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: pageChromeJsContent });
    });
    await page.route("**/widgets/auth-status.js*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: authStatusJsContent });
    });
  }

  async function loadDashboard(page, { loggedIn = false } = {}) {
    if (loggedIn) {
      await page.addInitScript(() => {
        window.localStorage.setItem("userInfo", JSON.stringify({ given_name: "Operator", email: "operator@example.com", sub: "op-sub" }));
        window.localStorage.setItem("cognitoIdToken", "test-id-token");
      });
    }
    await page.goto("http://localhost:3000/operator/dashboard.html", { waitUntil: "domcontentloaded" });
    await delay(200);
  }

  test("renders the eight objectives in order", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const sections = page.locator(".objective[data-objective-id]");
    await expect(sections).toHaveCount(8);
    await expect(sections.nth(0)).toHaveAttribute("data-objective-id", "uptime");
    await expect(sections.nth(1)).toHaveAttribute("data-objective-id", "conversion-to-submission");
    await expect(sections.nth(2)).toHaveAttribute("data-objective-id", "conversion-to-paid");
    await expect(sections.nth(7)).toHaveAttribute("data-objective-id", "compliance");
  });

  test("shows each observation's value, trend and deep link", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const row = page.locator('.observation[data-observation-id="probe-pass-rate"]');
    await expect(row).toContainText("99.9%");
    await expect(row).toContainText("0.1%");
    await expect(row.locator("a.deep-link")).toHaveAttribute(
      "href",
      "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#dashboards:name=prod-env-operations",
    );
  });

  test("shows a placeholder for an objective with no observations yet", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const section = page.locator('.objective[data-objective-id="low-running-cost"]');
    await expect(section.locator(".objective-empty")).toHaveText("No observations yet.");
  });

  test("names the operator pass on a 403", async ({ page }) => {
    await setupRoutes(page, { snapshotStatus: 403, snapshotBody: FORBIDDEN_BODY });
    await loadDashboard(page);

    await expect(page.locator("#snapshotError")).toHaveText(/operator pass/);
    await expect(page.locator("#snapshotError")).toHaveText(/pass-type=operator/);
  });

  test("shows the no-snapshot message on a 404", async ({ page }) => {
    await setupRoutes(page, { snapshotStatus: 404, snapshotBody: { message: "snapshot-not-found" } });
    await loadDashboard(page);

    await expect(page.locator("#snapshotError")).toHaveText("No snapshot has been published yet.");
  });

  test("renders the first experiment with its baseline hypothesis placeholder", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const experiment = page.locator('.experiment[data-experiment-id="exp-2026-09-uptime-baseline"]');
    await expect(experiment).toContainText("(no hypothesis yet)");
    await expect(experiment).toContainText("2026-09-01");
    await expect(experiment).toContainText("2026-09-30");
  });

  test.describe("sign-in navigation", () => {
    test("shows a signed-out header with a login link", async ({ page }) => {
      await setupRoutes(page, { snapshotStatus: 403, snapshotBody: FORBIDDEN_BODY });
      await loadDashboard(page);

      await expect(page.locator(".login-status")).toHaveText("Not logged in");
      await expect(page.locator(".login-link")).toHaveText("Log in");
      await expect(page.locator(".login-link")).toHaveAttribute("href", "../auth/login.html");
    });

    test("carries a return-to the dashboard when a signed-out visitor logs in", async ({ page }) => {
      await setupRoutes(page, { snapshotStatus: 403, snapshotBody: FORBIDDEN_BODY });
      await loadDashboard(page);

      await Promise.all([page.waitForURL("**/auth/login.html*"), page.click(".login-link")]);

      const postLoginRedirect = await page.evaluate(() => sessionStorage.getItem("postLoginRedirect"));
      expect(postLoginRedirect).toBe("/operator/dashboard.html");
    });

    test("shows the signed-in header and the snapshot for an operator holding the bundle", async ({ page }) => {
      await setupRoutes(page);
      await loadDashboard(page, { loggedIn: true });

      await expect(page.locator(".login-status")).toHaveText("Logged in as Operator");
      await expect(page.locator(".login-link")).toHaveText("Logout");
      await expect(page.locator(".objective[data-objective-id]")).toHaveCount(8);
    });
  });
});
