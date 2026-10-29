// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/operatorDashboard.browser.test.js
// Browser tests for the operator dashboard entry point

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { servePageScripts } from "./hmrcFieldTableAssets.js";
import {
  OBJECTIVE_DEFINITIONS,
  OBJECTIVE_GUIDANCE,
  measureDescription,
  betterDirection,
} from "@app/functions/analytics/operatorSnapshotPublish.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const FIXTURE_SNAPSHOT = {
  generatedAt: "2026-09-08T03:15:00.000Z",
  environment: "prod",
  reinvestment: { fraction: 0.2, trailing30IncomeGbp: 250, budgetGbp: 50 },
  objectives: [
    {
      id: "uptime",
      name: "Uptime",
      sli: "Share of synthetic probe runs that pass.",
      levers: "Fix the failing probe.",
      observations: [
        {
          id: "probe-pass-rate",
          label: "Probe pass rate",
          unit: "ratio",
          source: "v_availability_sli_daily",
          measure: "average of the days",
          better: "up",
          last30: { value: 0.999, trend: 0.001 },
          last90: { value: 0.998, trend: null },
          deepLink: "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#dashboards:name=prod-env-operations",
        },
        {
          id: "alarms-fired",
          label: "Alarms fired",
          unit: "count",
          source: "v_alarm_state_changes_daily",
          measure: "total of the days",
          better: "down",
          today: { value: 1 },
          previousDay: { value: 0 },
          last7: { value: 2 },
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
          today: { value: 2 },
          previousDay: { value: 30 },
          last7: { value: 90 },
          last30: { value: 210, trend: 0.05 },
          last90: { value: 600, trend: 0.02 },
          deepLink: "https://analytics.google.com/analytics/web/#/p523400333/reports/intelligenthome",
        },
        {
          id: "sessions-operator",
          label: "Sessions, operator visitors",
          unit: "count",
          last30: { value: 12, trend: 0 },
          last90: { value: 30, trend: 0 },
          deepLink: "https://analytics.google.com/analytics/web/#/p523400333/reports/intelligenthome",
        },
        {
          id: "sessions-bot",
          label: "Sessions, bot visitors",
          unit: "count",
          last30: { value: 40, trend: -0.1 },
          last90: { value: 130, trend: 0.01 },
          deepLink: "https://analytics.google.com/analytics/web/#/p523400333/reports/intelligenthome",
        },
        {
          id: "sessions-synthetic",
          label: "Sessions, synthetic visitors",
          unit: "count",
          today: { value: 60, asOf: "2026-10-28" },
          last30: { value: 60, trend: 0 },
          last90: { value: 180, trend: 0 },
          deepLink: "https://analytics.google.com/analytics/web/#/p523400333/reports/intelligenthome",
        },
      ],
    },
    { id: "conversion-to-paid", name: "Conversion to paid", observations: [] },
    { id: "low-running-cost", name: "AWS costs", observations: [] },
    { id: "security", name: "Security", observations: [] },
    { id: "retention", name: "Retention", observations: [] },
    { id: "operator-effort", name: "Operator effort", observations: [] },
    { id: "compliance", name: "Compliance", observations: [] },
    {
      id: "company-accounts",
      name: "Company accounts",
      observations: [
        {
          id: "company-cash-at-bank",
          label: "Cash at bank",
          unit: "gbp",
          last30: { value: 3500.5, trend: 0 },
          last90: { value: 3500.5, trend: 0 },
        },
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
          today: { value: 1 },
          previousDay: { value: 3 },
          last7: { value: 12 },
          last30: { value: 40, trend: 0.1 },
          last90: { value: 110, trend: 0.05 },
          dataSince: "2026-09-28",
        },
        {
          id: "submit-vat::completed",
          label: "Submit VAT (HMRC) — completed",
          unit: "count",
          today: { value: 0 },
          previousDay: { value: 2 },
          last7: { value: 8 },
          last30: { value: 22, trend: -0.05 },
          last90: { value: 60, trend: 0.02 },
          dataSince: "2026-09-03",
        },
        {
          id: "bundle::started",
          label: "View and edit your bundles — started",
          unit: "count",
          last30: { value: 4, trend: null, isNew: true },
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
    {
      id: "exp-2026-09-resident-price",
      objective: "conversion-to-paid",
      hypothesis: "",
      lever: "price",
      metric: "purchases-per-human-session",
      start: "2026-09-22",
    },
  ],
};

const CHART_DAYS = Array.from({ length: 90 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 8, 8));
  day.setUTCDate(day.getUTCDate() - (89 - index));
  return day.toISOString().slice(0, 10);
});

function chartSeries(id, label, scale, extra = {}) {
  return { id, label, values: CHART_DAYS.map((_, index) => Math.round(scale * (1 + Math.sin(index / 7 + scale)) * 100) / 100), ...extra };
}

function chartWithSeries(id, objectiveId, title, unit, seriesLabels, extra = {}) {
  const components = seriesLabels.map((label, index) =>
    chartSeries(`${id}-${index}`, label, 3 + index * 2, { description: `What ${label} measures.` }),
  );
  const total = {
    id: "total",
    label: "Total",
    isTotal: true,
    values: CHART_DAYS.map((_, day) => components.reduce((sum, series) => sum + series.values[day], 0)),
  };
  return { id, objectiveId, title, unit, modes: [{ id: "main", label: "Main", series: [total, ...components] }], ...extra };
}

const FIXTURE_DAILY_CHARTS = {
  days: CHART_DAYS,
  charts: [
    {
      ...chartWithSeries(
        "activity-started-and-completed",
        "activity-started-and-completed",
        "Activity started and completed",
        "count",
        Array.from({ length: 12 }, (_, index) => `Activity number ${index + 1}`),
      ),
      modes: [
        {
          id: "started",
          label: "Started",
          series: [
            chartSeries("total", "All activities", 20, { isTotal: true }),
            ...Array.from({ length: 12 }, (_, index) => chartSeries(`a${index}`, `Activity number ${index + 1}`, 2 + index)),
          ],
        },
        {
          id: "completed",
          label: "Completed",
          series: [chartSeries("total", "All activities", 9, { isTotal: true }), chartSeries("a0", "Submit VAT (HMRC)", 4)],
        },
      ],
    },
    chartWithSeries(
      "conversion-to-submission",
      "conversion-to-submission",
      "Conversion to submission",
      "count",
      ["Human sessions", "Active customers", "Submitted within 7 days"],
      {
        note: "Steps, left to right.",
      },
    ),
    {
      ...chartWithSeries("conversion-to-paid", "conversion-to-paid", "Conversion to paid", "gbp", [
        "Subscriptions",
        "Stripe donations",
        "PayPal donations",
      ]),
      modes: [
        {
          id: "revenue",
          label: "Revenue",
          series: [chartSeries("subscriptions", "Subscriptions", 5), chartSeries("stripe-donations", "Stripe donations", 3)],
        },
        { id: "passes", label: "Passes issued", unit: "count", series: [chartSeries("passes-issued", "Passes issued", 4)] },
      ],
    },
    chartWithSeries("low-running-cost", "low-running-cost", "AWS costs", "usd", [
      "Amazon CloudFront",
      "AWS Lambda",
      "Amazon DynamoDB",
      "Other services",
    ]),
    chartWithSeries(
      "retention",
      "retention",
      "Retention",
      "count",
      ["Submitters", "Returning submitters", "Renewals", "Cancellations", "Passes issued"],
      { note: "The 90-day windows roll.", reconciliation: "Last 90 days, customers: 12 distinct submitters made 90 completions." },
    ),
    chartWithSeries("visitors", "conversion-to-submission", "Visitors", "count", [
      "Operator",
      "Authenticated user",
      "Human",
      "Synthetic",
      "Bot",
    ]),
  ],
};

const FIXTURE_COST_DRIVERS = {
  days: 30,
  rows: [
    {
      charge: "$0.5985 per GB custom log data ingested in Standard log class - EU (London)",
      resource: "log-group:/aws/cloudtrail/prod-env-cloud-trail",
      resourceId: "arn:aws:logs:eu-west-2:972912397388:log-group:/aws/cloudtrail/prod-env-cloud-trail",
      costUsd: 67.862,
    },
    { charge: "$0.0015 per canary run per month - EU (London)", resource: "canary:prod-dbf4e0a-api", resourceId: "arn:x", costUsd: 3.795 },
  ],
};

const FIXTURE_SNAPSHOT_WITH_CHARTS = { ...FIXTURE_SNAPSHOT, dailyCharts: FIXTURE_DAILY_CHARTS };

const SAMPLE_VALUE_BY_UNIT = { count: 1234, gbp: 12345.67, usd: 123.45, ratio: 0.987, hours: 12.5, runs: 42 };

// Every observation the publisher defines, each with a value in every column, which is the
// most the page ever renders; the layout tests size the page's reserved heights against it.
function fullShapeSnapshot() {
  const context = {
    region: "eu-west-2",
    athenaWorkGroupName: "prod-env-analytics",
    githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
    ga4PropertyId: "523400333",
  };
  const windows = (unit) => ({
    last30: { value: SAMPLE_VALUE_BY_UNIT[unit], trend: 0.123 },
    last90: { value: SAMPLE_VALUE_BY_UNIT[unit], trend: 0.123 },
  });
  return {
    generatedAt: "2026-09-29T07:45:25.539Z",
    environment: "prod",
    objectives: OBJECTIVE_DEFINITIONS.map((objective) => ({
      id: objective.id,
      name: objective.name,
      ...OBJECTIVE_GUIDANCE[objective.id],
      observations: objective.observations.map((observation) => ({
        id: observation.id,
        label: observation.label,
        unit: observation.unit,
        source: observation.view,
        measure: measureDescription(observation),
        better: betterDirection(observation.id),
        ...windows(observation.unit),
        ...(observation.fastWindowView ? { today: { value: 12 }, previousDay: { value: 123 }, last7: { value: 1234 } } : {}),
        deepLink: observation.deepLink(context),
      })),
    })),
    costDrivers: FIXTURE_COST_DRIVERS,
    failedObservationCount: 0,
  };
}

// The real 403 body a signed-in caller without the operator bundle gets back from
// operatorSnapshotGet.js (app/functions/analytics/operatorSnapshotGet.js) - kept in sync with
// that handler's message so this fixture proves what the page does with the server's own words,
// not a placeholder.
const FORBIDDEN_BODY = {
  message: "Not authorised to view the operator dashboard. Ask the operator to issue you the operator pass for your sign-in email.",
  code: "BUNDLE_ENTITLEMENT_REQUIRED",
};

test.describe("Operator Dashboard", () => {
  let dashboardHtmlContent;
  let pageChromeJsContent;
  let authStatusJsContent;
  let submitCssContent;

  test.beforeAll(async () => {
    dashboardHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/operator/dashboard.html"), "utf-8");
    pageChromeJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/page-chrome.js"), "utf-8");
    authStatusJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/auth-status.js"), "utf-8");
    submitCssContent = fs.readFileSync(path.join(process.cwd(), "web/public/submit.css"), "utf-8");
  });

  async function setupRoutes(
    page,
    { snapshotStatus = 200, snapshotBody = FIXTURE_SNAPSHOT, experimentsStatus = 200, experimentsBody = FIXTURE_EXPERIMENTS } = {},
  ) {
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
      await route.fulfill({ status: experimentsStatus, contentType: "application/json", body: JSON.stringify(experimentsBody) });
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
    await servePageScripts(page);
    await page.route("**/dashboard.charts.js*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fs.readFileSync(path.join(process.cwd(), "web/public/operator/dashboard.charts.js"), "utf-8"),
      });
    });
    await page.route("**/widgets/page-chrome.js*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: pageChromeJsContent });
    });
    await page.route("**/submit.css*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/css", body: submitCssContent });
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

  test("colours a trend by whether the rise is good, and names its base", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const alarms = page.locator('.observation[data-observation-id="alarms-fired"]');
    await expect(alarms.locator("td").nth(5)).toHaveText("↓ 25.0%");
    await expect(alarms.locator("td").nth(5)).toHaveClass(/trend-good/);

    const passRate = page.locator('.observation[data-observation-id="probe-pass-rate"]');
    await expect(passRate.locator("td").nth(5)).toHaveClass(/trend-good/);

    const bot = page.locator('#visitorsPanel tr.visitors-kind[data-kind="bot"]');
    await expect(bot.locator("td").nth(5)).toHaveClass(/trend-flat/);

    await expect(page.locator('.objective[data-objective-id="uptime"] thead th').nth(5)).toHaveText("30 day trend");
  });

  test("states the source and how each window is built under the observation", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const row = page.locator('.observation[data-observation-id="alarms-fired"]');
    await expect(row.locator(".observation-source")).toHaveText("Source: v_alarm_state_changes_daily, total of the days");
  });

  test("names each link by what it opens", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await expect(page.locator('.observation[data-observation-id="probe-pass-rate"] a.deep-link')).toHaveText(
      "CloudWatch dashboard prod-env-operations",
    );
    await expect(page.locator('.observation[data-observation-id="alarms-fired"] a.deep-link')).toHaveText("CloudWatch alarms");
    await expect(page.locator("#visitorsPanel")).toBeVisible();
  });

  test("shows the objective's measure and levers", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const guidance = page.locator('.objective[data-objective-id="uptime"] .objective-guidance');
    await expect(guidance).toContainText("Share of synthetic probe runs that pass.");
    await expect(guidance).toContainText("Fix the failing probe.");
  });

  test("writes the snapshot time in en-GB, and warns when it is over 36 hours old", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await expect(page.locator("#snapshotMeta")).toHaveText("Generated 8 Sept 2026, 03:15 UTC for prod.");
    await expect(page.locator("#snapshotAge")).toBeVisible();
    await expect(page.locator("#snapshotAge")).toContainText("hours old");
  });

  test("does not warn about a snapshot generated an hour ago", async ({ page }) => {
    const recent = { ...FIXTURE_SNAPSHOT, generatedAt: new Date(Date.now() - 3600000).toISOString() };
    await setupRoutes(page, { snapshotBody: recent });
    await loadDashboard(page);

    await expect(page.locator("#snapshotAge")).toBeHidden();
  });

  test("marks ci figures as test data and prod figures as customer figures", async ({ page }) => {
    await setupRoutes(page, { snapshotBody: { ...FIXTURE_SNAPSHOT, environment: "ci" } });
    await loadDashboard(page);

    await expect(page.locator("#snapshotSource")).toContainText("ci test data");
  });

  test("groups thousands and names the currency in en-GB", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await expect(page.locator('.company-accounts-row[data-observation-id="company-turnover"]')).toContainText("£120,000.00");
  });

  test("renders the visitors panel as one row per kind with the activity table's windows", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const rows = page.locator("#visitorsPanel tr.visitors-kind");
    await expect(rows).toHaveCount(5);
    await expect(rows.locator("td:first-child")).toHaveText(["Operator", "Authenticated user", "Human", "Synthetic", "Bot"]);

    const human = page.locator('#visitorsPanel tr.visitors-kind[data-kind="human"]');
    await expect(human.locator("td").nth(1)).toHaveText("2");
    await expect(human.locator("td").nth(2)).toHaveText("30");
    await expect(human.locator("td").nth(3)).toHaveText("90");
    await expect(human.locator("td").nth(4)).toHaveText("210");
    await expect(human.locator("td").nth(5)).toHaveText("↑ 5.0%");
    await expect(human.locator("td").nth(6)).toHaveText("600");

    const bot = page.locator('#visitorsPanel tr.visitors-kind[data-kind="bot"]');
    await expect(bot.locator("td").nth(5)).toHaveText("↓ 10.0%");
  });

  test("explains why a visitor figure is missing only on the cells that have none, and which day a latest reading is for", async ({
    page,
  }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const headers = page.locator("#visitorsTable thead th");
    await expect(headers).toHaveText(["Kind", "Today", "Previous day", "Last 7 days", "Last 30 days", "30 day trend", "Last 90 days"]);
    await expect(headers.nth(2)).not.toHaveAttribute("title", /.+/);

    const human = page.locator('#visitorsPanel tr.visitors-kind[data-kind="human"]');
    await expect(human.locator("td").nth(1)).not.toHaveAttribute("title", /.+/);

    const synthetic = page.locator('#visitorsPanel tr.visitors-kind[data-kind="synthetic"]');
    await expect(synthetic.locator("td").nth(1)).toHaveText("60");
    await expect(synthetic.locator("td").nth(1)).toHaveAttribute("title", /Latest reading, reported for 2026-10-28/);

    const operator = page.locator('#visitorsPanel tr.visitors-kind[data-kind="operator"]');
    await expect(operator.locator("td").nth(1)).toHaveText("not measured");
    await expect(operator.locator("td").nth(1)).toHaveAttribute("title", /streaming export/);
    await expect(operator.locator("td").nth(4)).not.toHaveAttribute("title", /.+/);
  });

  test("says none for a window with no events and not measured for a figure the source did not report", async ({ page }) => {
    const objectives = FIXTURE_SNAPSHOT.objectives.map((objective) =>
      objective.id === "retention"
        ? {
            ...objective,
            observations: [
              { id: "quiet", label: "Quiet ratio", unit: "ratio", last30: { value: null, noEvents: true }, last90: { value: null } },
            ],
          }
        : objective,
    );
    await setupRoutes(page, { snapshotBody: { ...FIXTURE_SNAPSHOT, objectives } });
    await loadDashboard(page);

    const row = page.locator('tr.observation[data-observation-id="quiet"]');
    await expect(row.locator("td").nth(4)).toHaveText("none");
    await expect(row.locator("td").nth(6)).toHaveText("not measured");
  });

  test("lists the dearest CloudWatch charges under AWS costs, or says none are published", async ({ page }) => {
    await setupRoutes(page, { snapshotBody: { ...FIXTURE_SNAPSHOT, costDrivers: FIXTURE_COST_DRIVERS } });
    await loadDashboard(page);

    const section = page.locator('.objective[data-objective-id="low-running-cost"]');
    await expect(section.locator(".cost-drivers h3")).toHaveText("Top 2 CloudWatch charges, last 30 days");
    const rows = section.locator("tr.cost-driver");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator("td").nth(0)).toHaveText("log-group:/aws/cloudtrail/prod-env-cloud-trail");
    await expect(rows.nth(0).locator("td").nth(0)).toHaveAttribute("title", /arn:aws:logs:eu-west-2:972912397388/);
    await expect(rows.nth(0).locator("td").nth(2)).toHaveText("US$67.86");

    await setupRoutes(page);
    await loadDashboard(page);
    await expect(page.locator('.objective[data-objective-id="low-running-cost"] .cost-drivers')).toContainText(
      "No CloudWatch charges published yet.",
    );
  });

  test("shows n/a for the daily windows of a monthly figure", async ({ page }) => {
    const objectives = FIXTURE_SNAPSHOT.objectives.map((objective) =>
      objective.id === "retention"
        ? {
            ...objective,
            observations: [
              {
                id: "monthly",
                label: "Monthly figure",
                unit: "usd",
                description: "Cost for the month.",
                today: { value: null, notApplicable: true },
                previousDay: { value: null, notApplicable: true },
                last7: { value: 5 },
                last30: { value: 40 },
                last90: { value: 90 },
              },
            ],
          }
        : objective,
    );
    await setupRoutes(page, { snapshotBody: { ...FIXTURE_SNAPSHOT, objectives } });
    await loadDashboard(page);

    const row = page.locator('tr.observation[data-observation-id="monthly"]');
    await expect(row.locator("td").nth(1)).toHaveText("n/a");
    await expect(row.locator("td").nth(2)).toHaveText("n/a");
    await expect(row.locator("td").nth(3)).toHaveText("US$5.00");
    await expect(row.locator("td").nth(0)).toHaveAttribute("title", "Cost for the month.");
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
    await expect(turnoverRow.locator("td").nth(1)).toHaveText("£120,000.00");

    const profitRow = panel.locator('.company-accounts-row[data-observation-id="company-profit"]');
    await expect(profitRow.locator("td").nth(1)).toHaveText("£25,000.00");

    const capitalAndReservesRow = panel.locator('.company-accounts-row[data-observation-id="company-capital-and-reserves"]');
    await expect(capitalAndReservesRow.locator("td").nth(1)).toHaveText("£37,000.00");
  });

  test("shows the reinvestment fraction, trailing 30-day income and the budget", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const panel = page.locator("#reinvestmentPanel");
    await expect(panel).toBeVisible();
    await expect(panel.locator('tr[data-figure-id="reinvestment-fraction"] td').nth(1)).toHaveText("20.0%");
    await expect(panel.locator('tr[data-figure-id="trailing-30-income"] td').nth(1)).toHaveText("£250.00");
    await expect(panel.locator('tr[data-figure-id="reinvestment-budget"] td').nth(1)).toHaveText("£50.00");
  });

  test("hides the reinvestment panel when the snapshot carries no reinvestment figures", async ({ page }) => {
    const { reinvestment: _omitted, ...snapshotWithoutReinvestment } = FIXTURE_SNAPSHOT;
    await setupRoutes(page, { snapshotBody: snapshotWithoutReinvestment });
    await loadDashboard(page);

    await expect(page.locator("#reinvestmentPanel")).toBeHidden();
  });

  test("shows cash at bank against the reserve floor with the headroom", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const panel = page.locator("#reservePanel");
    await expect(panel).toBeVisible();
    await expect(panel.locator('tr[data-figure-id="reserve-cash-at-bank"] td').nth(1)).toHaveText("£3,500.50");
    await expect(panel.locator('tr[data-figure-id="reserve-floor"] td').nth(1)).toHaveText("£2,000.00");
    await expect(panel.locator('tr[data-figure-id="reserve-headroom"] td').nth(1)).toHaveText("£1,500.50");
    await expect(panel.locator("#reserveState")).toHaveAttribute("data-state", "above-floor");
  });

  test("marks the reserve block when cash at bank is below the floor", async ({ page }) => {
    const belowFloor = {
      ...FIXTURE_SNAPSHOT,
      objectives: FIXTURE_SNAPSHOT.objectives.map((objective) =>
        objective.id === "company-accounts"
          ? {
              ...objective,
              observations: objective.observations.map((observation) =>
                observation.id === "company-cash-at-bank" ? { ...observation, last30: { value: 1200, trend: null } } : observation,
              ),
            }
          : objective,
      ),
    };
    await setupRoutes(page, { snapshotBody: belowFloor });
    await loadDashboard(page);

    const panel = page.locator("#reservePanel");
    await expect(panel.locator("#reserveState")).toHaveAttribute("data-state", "below-floor");
    await expect(panel.locator("#reserveState")).toHaveText("Below the reserve floor.");
    await expect(panel.locator('tr[data-figure-id="reserve-headroom"] td').nth(1)).toHaveText("-£800.00");
  });

  test("says no book snapshot exists yet in the reserve block while the book pull job is off", async ({ page }) => {
    await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_NO_COMPANY_BOOK });
    await loadDashboard(page);

    const panel = page.locator("#reservePanel");
    await expect(panel).toBeVisible();
    await expect(panel.locator("#reserveState")).toHaveText("No book snapshot exists yet.");
    await expect(panel.locator("#reserveTable")).toBeHidden();
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

    const started = panel.locator('#activitiesStartedBody .activity-row[data-activity-id="submit-vat"]');
    await expect(started.locator("td").nth(0)).toHaveText("Submit VAT (HMRC)");
    await expect(started.locator("td").nth(1)).toHaveText("1"); // today
    await expect(started.locator("td").nth(2)).toHaveText("3"); // previous day
    await expect(started.locator("td").nth(3)).toHaveText("12"); // last 7 days
    await expect(started.locator("td").nth(4)).toHaveText("40"); // last 30
    await expect(started.locator("td").nth(5)).toHaveText("↑ 10.0%"); // trend
    await expect(started.locator("td").nth(6)).toHaveText("110"); // last 90

    const completed = panel.locator('#activitiesCompletedBody .activity-row[data-activity-id="submit-vat"]');
    await expect(completed.locator("td").nth(0)).toHaveText("Submit VAT (HMRC)");
    await expect(completed.locator("td").nth(1)).toHaveText("none");
    await expect(completed.locator("td").nth(2)).toHaveText("2");
    await expect(completed.locator("td").nth(3)).toHaveText("8");
    await expect(completed.locator("td").nth(4)).toHaveText("22");
    await expect(completed.locator("td").nth(5)).toHaveText("↓ 5.0%");
    await expect(completed.locator("td").nth(6)).toHaveText("60");

    const bundleRow = panel.locator('#activitiesStartedBody .activity-row[data-activity-id="bundle"]');
    await expect(bundleRow.locator("td").nth(0)).toHaveText("View and edit your bundles");
  });

  test("labels a non-zero window against an empty prior window as new", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    const bundleRow = page.locator('#activitiesStartedBody .activity-row[data-activity-id="bundle"]');
    await expect(bundleRow.locator("td").nth(5)).toHaveText("new");
  });

  test("says from which day the started and completed counts begin, derived from the snapshot", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await expect(page.locator("#activitiesDataSince")).toHaveText("Started counts begin 2026-09-28. Completed counts begin 2026-09-03");
  });

  test("explains what the Started and Completed columns count in the header tooltips", async ({ page }) => {
    await setupRoutes(page);
    await loadDashboard(page);

    await expect(page.locator("#activitiesStartedTable caption")).toHaveAttribute("title", /signed-in customer/);
    await expect(page.locator("#activitiesCompletedTable caption")).toHaveAttribute("title", /whether or not the customer clicked/);
  });

  test("hides the activities panel when the snapshot carries no activity observations", async ({ page }) => {
    await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_NO_ACTIVITIES });
    await loadDashboard(page);

    await expect(page.locator("#activitiesPanel")).toBeHidden();
  });

  test("leaves a 403 to the shared status message and draws no second notice", async ({ page }) => {
    await page.addInitScript(() => {
      window.shownFailures = [];
      window.showFailure = (error) => window.shownFailures.push(error);
    });
    await setupRoutes(page, { snapshotStatus: 403, snapshotBody: FORBIDDEN_BODY });
    await loadDashboard(page);

    await expect(page.locator("#snapshotError")).toHaveCount(0);
    await expect(page.locator("#visitorsPanel")).toBeHidden();
    await expect(page.locator(".objective[data-objective-id]")).toHaveCount(0);
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

  test("says no experiments are published when the file lists none", async ({ page }) => {
    await setupRoutes(page, { experimentsBody: {} });
    await loadDashboard(page);

    await expect(page.locator("#experimentsPanel")).toBeVisible();
    await expect(page.locator("#experimentsList")).toHaveText("No experiments published");
  });

  test("keeps the experiments panel and says so when the file does not load", async ({ page }) => {
    await setupRoutes(page, { experimentsStatus: 404, experimentsBody: {} });
    await loadDashboard(page);

    await expect(page.locator("#experimentsPanel")).toBeVisible();
    await expect(page.locator("#experimentsList")).toHaveText("Experiments did not load.");
  });

  test.describe("daily charts", () => {
    test("draws one chart for each of the six objectives, with a line for every series", async ({ page }) => {
      await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_WITH_CHARTS });
      await loadDashboard(page);

      await expect(page.locator("#chartsPanel")).toBeVisible();
      await expect(page.locator(".chart-card")).toHaveCount(6);
      await expect(page.locator(".chart-card h3")).toHaveText([
        "Activity started and completed",
        "Conversion to submission",
        "Conversion to paid",
        "AWS costs",
        "Retention",
        "Visitors",
      ]);
      const visitors = page.locator('.chart-card[data-chart-id="visitors"]');
      await expect(visitors.locator("polyline.chart-line")).toHaveCount(6);
      const points = await visitors.locator("polyline.chart-line").first().getAttribute("points");
      expect(points.trim().split(" ")).toHaveLength(90);
    });

    test("hides and shows a line from its legend button", async ({ page }) => {
      await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_WITH_CHARTS });
      await loadDashboard(page);

      const retention = page.locator('.chart-card[data-chart-id="retention"]');
      await retention.locator('.chart-legend-item[data-series-id="retention-0"]').click();
      await expect(retention.locator("polyline.chart-line")).toHaveCount(5);
      await expect(retention.locator('.chart-legend-item[data-series-id="retention-0"]')).toHaveAttribute("aria-pressed", "false");
      await retention.locator('.chart-legend-item[data-series-id="retention-0"]').click();
      await expect(retention.locator("polyline.chart-line")).toHaveCount(6);
    });

    test("switches the activities chart between started and completed", async ({ page }) => {
      await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_WITH_CHARTS });
      await loadDashboard(page);

      const activities = page.locator('.chart-card[data-chart-id="activity-started-and-completed"]');
      await expect(activities.locator("polyline.chart-line")).toHaveCount(13);
      await activities.locator('.chart-mode[data-mode-id="completed"]').click();
      await expect(activities.locator("polyline.chart-line")).toHaveCount(2);
    });

    test("shows all, hides all, isolates one line on a double-click and restores on a second", async ({ page }) => {
      await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_WITH_CHARTS });
      await loadDashboard(page);

      const card = page.locator('.chart-card[data-chart-id="retention"]');
      const lines = card.locator("polyline.chart-line");
      await expect(lines).toHaveCount(6);

      await card.locator('[data-action="hide-all"]').click();
      await expect(lines).toHaveCount(0);
      await card.locator('[data-action="show-all"]').click();
      await expect(lines).toHaveCount(6);

      await card.locator(".chart-legend-item", { hasText: "Renewals" }).click();
      await expect(lines).toHaveCount(5);
      await card.locator(".chart-legend-item", { hasText: "Renewals" }).click();
      await expect(lines).toHaveCount(6);

      await card.locator(".chart-legend-item", { hasText: "Cancellations" }).dblclick();
      await expect(lines).toHaveCount(1);
      await expect(card.locator('.chart-legend-item[aria-pressed="true"]')).toHaveCount(1);
      await card.locator(".chart-legend-item", { hasText: "Cancellations" }).dblclick();
      await expect(lines).toHaveCount(6);
    });

    test("shows the retention reconciliation line and counts Passes issued without a pound sign", async ({ page }) => {
      await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_WITH_CHARTS });
      await loadDashboard(page);

      const retention = page.locator('.chart-card[data-chart-id="retention"]');
      await expect(retention.locator(".chart-reconciliation")).toContainText("12 distinct submitters");
      await expect(retention.locator(".chart-legend-item", { hasText: "Passes issued" })).toBeVisible();

      const paid = page.locator('.chart-card[data-chart-id="conversion-to-paid"]');
      await expect(paid.locator(".chart-readout")).toContainText("£");
      await paid.locator('.chart-mode[data-mode-id="passes"]').click();
      await expect(paid.locator(".chart-readout")).toContainText("Passes issued");
      await expect(paid.locator(".chart-readout")).not.toContainText("£");
    });

    test("describes each line in its legend tooltip", async ({ page }) => {
      await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_WITH_CHARTS });
      await loadDashboard(page);

      const card = page.locator('.chart-card[data-chart-id="retention"]');
      await expect(card.locator(".chart-legend-item", { hasText: "Renewals" })).toHaveAttribute("title", "What Renewals measures.");
    });

    test("reads one day under the chart as the pointer moves over it", async ({ page }) => {
      await setupRoutes(page, { snapshotBody: FIXTURE_SNAPSHOT_WITH_CHARTS });
      await loadDashboard(page);

      const card = page.locator('.chart-card[data-chart-id="low-running-cost"]');
      await expect(card.locator(".chart-readout")).toContainText("8 Sept");
      await card.scrollIntoViewIfNeeded();
      const box = await card.locator(".chart-overlay").boundingBox();
      await page.mouse.move(box.x + 1, box.y + box.height / 2);
      await expect(card.locator(".chart-readout")).toContainText("11 Jun");
      await expect(card.locator(".chart-readout")).toContainText("$");
    });

    test("leaves out the charts panel when the snapshot carries no daily charts", async ({ page }) => {
      await setupRoutes(page);
      await loadDashboard(page);

      await expect(page.locator("#chartsPanel")).toBeHidden();
    });

    for (const [width, height] of [
      [390, 844],
      [1280, 900],
    ]) {
      for (const colorScheme of ["light", "dark"]) {
        test(`fits the page at ${width}px wide in ${colorScheme} mode and takes its line colours from the theme`, async ({ page }) => {
          await page.setViewportSize({ width, height });
          await page.emulateMedia({ colorScheme });
          await setupRoutes(page, {
            snapshotBody: { ...fullShapeSnapshot(), generatedAt: new Date().toISOString(), dailyCharts: FIXTURE_DAILY_CHARTS },
          });
          await loadDashboard(page);

          await expect(page.locator(".chart-card")).toHaveCount(6);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow).toBeLessThanOrEqual(0);
          const cardRight = await page.evaluate(() =>
            Math.max(...[...document.querySelectorAll(".chart-card svg")].map((svg) => svg.getBoundingClientRect().right)),
          );
          expect(cardRight).toBeLessThanOrEqual(width);
          const firstColour = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--chart-1").trim());
          expect(firstColour).toBe(colorScheme === "dark" ? "#56b4e9" : "#0072b2");
          await page.locator("#chartsPanel").screenshot({ path: `target/rook-screenshots/dash/charts-${width}-${colorScheme}.png` });
          await page.screenshot({ path: `target/rook-screenshots/dash/dashboard-${width}-${colorScheme}.png`, fullPage: true });
        });
      }
    }
  });

  test.describe("reserved heights", () => {
    for (const width of [390, 700, 900, 1280]) {
      test(`reserve at least the rendered height of each panel at ${width}px wide`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await setupRoutes(page, { snapshotBody: fullShapeSnapshot() });
        await loadDashboard(page);
        await expect(page.locator(".objective[data-objective-id]")).toHaveCount(8);

        const heights = await page.evaluate(() => {
          const panels = {
            visitorsPanel: document.getElementById("visitorsPanel"),
            experimentsPanel: document.getElementById("experimentsPanel"),
          };
          const result = {};
          for (const [name, element] of Object.entries(panels)) {
            result[name] = { reserved: parseFloat(getComputedStyle(element).minHeight), rendered: 0 };
          }
          for (const [name, element] of Object.entries(panels)) {
            element.style.minHeight = "0";
            result[name].rendered = element.getBoundingClientRect().height;
          }
          return result;
        });

        for (const [name, { reserved, rendered }] of Object.entries(heights)) {
          expect(reserved, `${name} reserves ${reserved}px for ${rendered}px of content`).toBeGreaterThanOrEqual(rendered);
        }
      });
    }
  });

  test.describe("released objectives reservation", () => {
    for (const width of [390, 700, 900, 1280]) {
      test(`leaves under 80px between the last objective and the Visitors panel at ${width}px wide`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await setupRoutes(page, { snapshotBody: fullShapeSnapshot() });
        await loadDashboard(page);
        await expect(page.locator(".objective[data-objective-id]")).toHaveCount(8);

        const gap = await page.evaluate(() => {
          const objectives = document.querySelectorAll(".objective[data-objective-id]");
          const lastBottom = objectives[objectives.length - 1].getBoundingClientRect().bottom;
          return document.getElementById("visitorsPanel").getBoundingClientRect().top - lastBottom;
        });
        expect(gap).toBeLessThan(80);
      });
    }
  });

  test.describe("wide-window layout", () => {
    async function eachObservationsTableFitsItsCard(page) {
      const tableCount = await page.locator("table.observations").count();
      for (let i = 0; i < tableCount; i++) {
        const table = page.locator("table.observations").nth(i);
        const card = table.locator("xpath=ancestor::*[contains(@class, 'objective')][1]");
        const tableBox = await table.boundingBox();
        const cardBox = await card.boundingBox();
        const cardScrolls = await card.evaluate((el) => el.scrollWidth > el.clientWidth);
        expect(tableBox.x + tableBox.width <= cardBox.x + cardBox.width + 1 || cardScrolls).toBe(true);
      }
    }

    test("keeps every activities table header on one line at 1920px wide", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await setupRoutes(page);
      await loadDashboard(page);

      const headerCells = page.locator(".activities-table thead th");
      const count = await headerCells.count();
      for (let i = 0; i < count; i++) {
        const cell = headerCells.nth(i);
        await expect(cell).toHaveCSS("white-space", "nowrap");
        const fontSize = await cell.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        const box = await cell.boundingBox();
        // A single nowrap line plus its 0.4em top/bottom padding; two lines would be roughly
        // double this, so the threshold sits well below a two-line height.
        expect(box.height).toBeLessThanOrEqual(fontSize * 2.5);
      }

      await eachObservationsTableFitsItsCard(page);
      await page.screenshot({ path: "target/dashboard-1920.png", fullPage: true });
    });

    test("keeps every table inside its card, scrolling instead of overflowing, at 390px wide", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await setupRoutes(page);
      await loadDashboard(page);

      await eachObservationsTableFitsItsCard(page);
      const scrollsSideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(scrollsSideways).toBe(false);
      await expect(page.locator("#activitiesStartedBody .activity-row td").nth(1)).toHaveAttribute("data-label", "Today");
      await page.screenshot({ path: "target/dashboard-390.png", fullPage: true });
    });
  });

  test.describe("sign-in navigation", () => {
    test("shows a signed-out header with a login link", async ({ page }) => {
      await setupRoutes(page, { snapshotStatus: 403, snapshotBody: FORBIDDEN_BODY });
      await loadDashboard(page);

      await expect(page.locator(".login-status")).toHaveText("Not logged in");
      await expect(page.locator(".login-link")).toHaveText("Log in");
      await expect(page.locator(".login-link")).toHaveAttribute("href", "/auth/login.html");
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
