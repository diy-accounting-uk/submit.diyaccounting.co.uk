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
        {
          id: "sessions-human",
          label: "Sessions, human visitors",
          unit: "count",
          last30: { value: 210, trend: 0.05 },
          last90: { value: 600, trend: 0.02 },
          dailySeries: [
            { day: "2026-09-06", value: 30 },
            { day: "2026-09-07", value: 28 },
          ],
          deepLink: "https://analytics.google.com/analytics/web/#/p523400333/reports/intelligenthome",
        },
        {
          id: "sessions-bot",
          label: "Sessions, bot visitors",
          unit: "count",
          last30: { value: 40, trend: -0.1 },
          last90: { value: 130, trend: 0.01 },
          dailySeries: [
            { day: "2026-09-06", value: 5 },
            { day: "2026-09-07", value: 6 },
          ],
          deepLink: "https://analytics.google.com/analytics/web/#/p523400333/reports/intelligenthome",
        },
        {
          id: "sessions-synthetic",
          label: "Sessions, synthetic visitors",
          unit: "count",
          last30: { value: 60, trend: 0 },
          last90: { value: 180, trend: 0 },
          dailySeries: [
            { day: "2026-09-06", value: 8 },
            { day: "2026-09-07", value: 8 },
          ],
          deepLink: "https://analytics.google.com/analytics/web/#/p523400333/reports/intelligenthome",
        },
      ],
    },
    { id: "conversion-to-paid", name: "Conversion to paid", observations: [] },
    { id: "low-running-cost", name: "Low running cost", observations: [] },
    { id: "security", name: "Security", observations: [] },
    { id: "retention", name: "Retention", observations: [] },
    { id: "operator-effort", name: "Operator effort", observations: [] },
    { id: "compliance", name: "Compliance", observations: [] },
    {
      id: "company-accounts",
      name: "Company accounts",
      observations: [
        {
          id: "company-turnover",
          label: "Turnover",
          unit: "gbp",
          last30: { value: 120000, trend: 0.1 },
          last90: { value: 350000, trend: 0.05 },
        },
        { id: "company-costs", label: "Costs", unit: "gbp", last30: { value: 95000, trend: 0.02 }, last90: { value: 280000, trend: 0.01 } },
        { id: "company-profit", label: "Profit", unit: "gbp", last30: { value: 25000, trend: 0.2 }, last90: { value: 70000, trend: 0.1 } },
        {
          id: "company-fixed-assets",
          label: "Fixed assets",
          unit: "gbp",
          last30: { value: 5000, trend: 0 },
          last90: { value: 5000, trend: 0 },
        },
        {
          id: "company-current-assets",
          label: "Current assets",
          unit: "gbp",
          last30: { value: 40000, trend: 0 },
          last90: { value: 40000, trend: 0 },
        },
        {
          id: "company-creditors-within-one-year",
          label: "Creditors: within one year",
          unit: "gbp",
          last30: { value: 8000, trend: 0 },
          last90: { value: 8000, trend: 0 },
        },
        {
          id: "company-creditors-after-one-year",
          label: "Creditors: after one year",
          unit: "gbp",
          last30: { value: 0, trend: null },
          last90: { value: 0, trend: null },
        },
        {
          id: "company-called-up-share-capital",
          label: "Called up share capital",
          unit: "gbp",
          last30: { value: 100, trend: 0 },
          last90: { value: 100, trend: 0 },
        },
        {
          id: "company-profit-and-loss-account",
          label: "Profit and loss account",
          unit: "gbp",
          last30: { value: 36900, trend: 0.15 },
          last90: { value: 36900, trend: 0.15 },
        },
        {
          id: "company-capital-and-reserves",
          label: "Capital and reserves",
          unit: "gbp",
          last30: { value: 37000, trend: 0.15 },
          last90: { value: 37000, trend: 0.15 },
        },
      ],
    },
    {
      id: "activity-started-and-completed",
      name: "Activity started and completed",
      observations: [
        {
          id: "submit-vat::started",
          label: "Submit VAT (HMRC) — started",
          unit: "count",
          last30: { value: 40, trend: 0.1 },
          last90: { value: 110, trend: 0.05 },
        },
        {
          id: "submit-vat::completed",
          label: "Submit VAT (HMRC) — completed",
          unit: "count",
          last30: { value: 22, trend: -0.05 },
          last90: { value: 60, trend: 0.02 },
        },
        {
          id: "bundle::started",
          label: "View and edit your bundles — started",
          unit: "count",
          last30: { value: 31, trend: 0 },
          last90: { value: 90, trend: 0 },
        },
        {
          id: "bundle::completed",
          label: "View and edit your bundles — completed",
          unit: "count",
          last30: { value: 31, trend: 0 },
          last90: { value: 90, trend: 0 },
        },
      ],
    },
  ],
};

const FIXTURE_SNAPSHOT_NO_ACTIVITIES = {
  ...FIXTURE_SNAPSHOT,
  objectives: FIXTURE_SNAPSHOT.objectives.map((objective) =>
    objective.id === "activity-started-and-completed" ? { ...objective, observations: [] } : objective,
  ),
};

const FIXTURE_SNAPSHOT_NO_COMPANY_BOOK = {
  ...FIXTURE_SNAPSHOT,
  objectives: FIXTURE_SNAPSHOT.objectives.map((objective) =>
    objective.id === "company-accounts"
      ? {
          ...objective,
          observations: objective.observations.map((observation) => ({
            ...observation,
            last30: { value: null, trend: null },
            last90: { value: null, trend: null },
          })),
        }
      : objective,
  ),
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

  test("renders the visitors panel with human, bot and synthetic sessions per day", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const rows = page.locator("#visitorsPanel tr.visitors-day");
    await expect(rows).toHaveCount(2);

    const firstDay = page.locator('#visitorsPanel tr.visitors-day[data-day="2026-09-06"]');
    await expect(firstDay.locator("td").nth(0)).toHaveText("2026-09-06");
    await expect(firstDay.locator("td").nth(1)).toHaveText("30");
    await expect(firstDay.locator("td").nth(2)).toHaveText("5");
    await expect(firstDay.locator("td").nth(3)).toHaveText("8");
  });

  test("shows a placeholder for an objective with no observations yet", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const section = page.locator('.objective[data-objective-id="low-running-cost"]');
    await expect(section.locator(".objective-empty")).toHaveText("No observations yet.");
  });

  test("shows the company's turnover, profit and balance sheet lines above the eight objectives", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const panel = page.locator("#companyAccountsPanel");
    await expect(panel).toBeVisible();

    const turnoverRow = panel.locator('.company-accounts-row[data-observation-id="company-turnover"]');
    await expect(turnoverRow.locator("td").nth(1)).toHaveText("£120000.00");

    const profitRow = panel.locator('.company-accounts-row[data-observation-id="company-profit"]');
    await expect(profitRow.locator("td").nth(1)).toHaveText("£25000.00");

    const capitalAndReservesRow = panel.locator('.company-accounts-row[data-observation-id="company-capital-and-reserves"]');
    await expect(capitalAndReservesRow.locator("td").nth(1)).toHaveText("£37000.00");
  });

  test("hides the company accounts panel while the book pull job is off", async ({ page }) => {
    await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_NO_COMPANY_BOOK });
    await loadDashboard(page);

    await expect(page.locator("#companyAccountsPanel")).toBeHidden();
  });

  test("shows one row per activity, with the started and completed windows and trend", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const panel = page.locator("#activitiesPanel");
    await expect(panel).toBeVisible();

    const vatRow = panel.locator('.activity-row[data-activity-id="submit-vat"]');
    await expect(vatRow.locator("td").nth(0)).toHaveText("Submit VAT (HMRC)");
    await expect(vatRow.locator("td").nth(1)).toHaveText("40"); // started, last 30
    await expect(vatRow.locator("td").nth(2)).toHaveText("↑ 10.0%"); // started trend
    await expect(vatRow.locator("td").nth(3)).toHaveText("110"); // started, last 90
    await expect(vatRow.locator("td").nth(4)).toHaveText("22"); // completed, last 30
    await expect(vatRow.locator("td").nth(5)).toHaveText("↓ 5.0%"); // completed trend
    await expect(vatRow.locator("td").nth(6)).toHaveText("60"); // completed, last 90

    const bundleRow = panel.locator('.activity-row[data-activity-id="bundle"]');
    await expect(bundleRow.locator("td").nth(0)).toHaveText("View and edit your bundles");
  });

  test("hides the activities panel when the snapshot carries no activity observations", async ({ page }) => {
    await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_NO_ACTIVITIES });
    await loadDashboard(page);

    await expect(page.locator("#activitiesPanel")).toBeHidden();
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
