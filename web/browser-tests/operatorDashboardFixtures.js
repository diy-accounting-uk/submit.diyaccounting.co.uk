// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/operatorDashboardFixtures.js
// Snapshot, chart, console and affiliate answers that the operator dashboard browser tests serve.

import {
  OBJECTIVE_DEFINITIONS,
  OBJECTIVE_GUIDANCE,
  measureDescription,
  betterDirection,
} from "@app/functions/analytics/operatorSnapshotPublish.js";
import { shapeDataSection } from "@app/lib/operatorSnapshot/dataSection.js";

export const FIXTURE_SNAPSHOT = {
  generatedAt: "2026-09-08T03:15:00.000Z",
  environment: "prod",
  monthlyMarketingBudget: {
    netIncomeLastMonthGbp: 600,
    netIncomeThreeMonthMeanGbp: 500,
    incomeUsedGbp: 500,
    gbpPerUsd: 0.75,
    fixedSuppliersMonthlyGbp: 20,
    runningCostsLastMonthGbp: 120,
    runningCostsThisMonthProjectedGbp: 130,
    costsUsedGbp: 130,
    share: 1,
    activePaidBase: 12,
    budgetBeforeCashGuardGbp: 370,
    cashAboveReserveGbp: null,
    budgetGbp: 370,
    spentThisMonthGbp: 70,
    leftToSpendGbp: 300,
    searchFloorMonthGbp: 31,
  },
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
          deepLink:
            "https://eu-west-2.console.aws.amazon.com/athena/home?region=eu-west-2#/query-editor/saved-queries?workgroup=prod-env-analytics",
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
          deepLink:
            "https://eu-west-2.console.aws.amazon.com/athena/home?region=eu-west-2#/query-editor/saved-queries?workgroup=prod-env-analytics",
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
          today: { value: 3500.5, asOf: "2026-09-07" },
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
        {
          id: "company-contribution-gbp",
          label: "Contribution",
          description: "Revenue less the AWS bill in pounds less Google Ads cost.",
          unit: "gbp",
          last30: { value: -42.5, trend: null },
          last90: { value: -90, trend: null },
        },
        {
          id: "company-net-monthly-burn-gbp",
          label: "Net monthly burn",
          description: "The period's costs less its turnover, per month.",
          unit: "gbp",
          last30: { value: 1250, trend: null },
          last90: { value: 1250, trend: null },
        },
        {
          id: "company-runway-months",
          label: "Runway",
          description: "Cash less creditors due within a year, over the net monthly burn.",
          unit: "months",
          last30: { value: 14.25, trend: null },
          last90: { value: 14.25, trend: null },
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

export const FIXTURE_SNAPSHOT_NO_ACTIVITIES = {
  ...FIXTURE_SNAPSHOT,
  objectives: FIXTURE_SNAPSHOT.objectives.map((objective) =>
    objective.id === "activity-started-and-completed" ? { ...objective, observations: [] } : objective,
  ),
};

export const FIXTURE_SNAPSHOT_NO_COMPANY_BOOK = {
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

export const CHART_DAYS = Array.from({ length: 90 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 8, 8));
  day.setUTCDate(day.getUTCDate() - (89 - index));
  return day.toISOString().slice(0, 10);
});

export const CHART_HOURS = Array.from(
  { length: 168 },
  (_, index) => new Date(Date.UTC(2026, 8, 8, 3) - (167 - index) * 3600000).toISOString().slice(0, 13) + ":00:00Z",
);

export function hourlySeries(id, label, scale, extra = {}) {
  return { id, label, values: CHART_HOURS.map((_, index) => Math.round(scale * (1 + Math.sin(index / 5 + scale)) * 100) / 100), ...extra };
}

export function chartSeries(id, label, scale, extra = {}) {
  return { id, label, values: CHART_DAYS.map((_, index) => Math.round(scale * (1 + Math.sin(index / 7 + scale)) * 100) / 100), ...extra };
}

export function chartWithSeries(id, objectiveId, title, unit, seriesLabels, extra = {}) {
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

export const FIXTURE_DAILY_CHARTS = {
  days: CHART_DAYS,
  hours: CHART_HOURS,
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
          hourly: {
            series: [
              hourlySeries("total", "All activities", 2, { isTotal: true }),
              hourlySeries("a0", "Submit VAT (HMRC)", 1),
              hourlySeries("bundle", "View and edit your bundles", 1),
            ],
          },
          series: [
            chartSeries("total", "All activities", 20, { isTotal: true }),
            ...Array.from({ length: 12 }, (_, index) => chartSeries(`a${index}`, `Activity number ${index + 1}`, 2 + index)),
            chartSeries("bundle", "View and edit your bundles", 3),
          ],
        },
        {
          id: "completed",
          label: "Completed",
          series: [
            chartSeries("total", "All activities", 9, { isTotal: true }),
            chartSeries("a0", "Submit VAT (HMRC)", 4),
            chartSeries("bundle", "View and edit your bundles", 2),
          ],
        },
        {
          id: "api-calls",
          label: "HMRC API calls",
          hourly: {
            series: [
              hourlySeries("all", "All APIs", 9),
              hourlySeries("all-test", "All APIs (test)", 14),
              hourlySeries("live:POST /organisations/vat/{vrn}/returns", "POST /organisations/vat/{vrn}/returns", 2),
            ],
          },
          series: [
            chartSeries("all", "All APIs", 30),
            chartSeries("all-test", "All APIs (test)", 45),
            chartSeries("live:POST /organisations/vat/{vrn}/returns", "POST /organisations/vat/{vrn}/returns", 6),
            chartSeries("live:GET /organisations/vat/{vrn}/obligations", "GET /organisations/vat/{vrn}/obligations", 12),
            chartSeries("live:POST /oauth/token", "POST /oauth/token", 9),
            chartSeries("test:POST /organisations/vat/{vrn}/returns", "POST /organisations/vat/{vrn}/returns (test)", 18),
            chartSeries("test:GET /organisations/vat/{vrn}/obligations", "GET /organisations/vat/{vrn}/obligations (test)", 24),
          ],
        },
      ],
    },
    {
      id: "integration-requests",
      objectiveId: "integrations",
      title: "API requests by organisation and status",
      unit: "count",
      note: "Live calls to HMRC, Companies House and Stripe.",
      modes: [
        {
          id: "all",
          label: "All",
          hourly: { series: [hourlySeries("total", "All requests", 12, { isTotal: true }), hourlySeries("hmrc 2xx", "HMRC 2xx", 8)] },
          series: [
            chartSeries("total", "All requests", 40, { isTotal: true }),
            chartSeries("hmrc 2xx", "HMRC 2xx", 20),
            chartSeries("hmrc 4xx", "HMRC 4xx", 3),
            chartSeries("hmrc failed", "HMRC failed", 1),
            chartSeries("stripe 2xx", "Stripe 2xx", 14),
            chartSeries("stripe 4xx", "Stripe 4xx", 2),
            chartSeries("companies-house 2xx", "Companies House 2xx", 4),
          ],
        },
        {
          id: "hmrc",
          label: "HMRC",
          series: [
            chartSeries("total", "All requests", 24, { isTotal: true }),
            chartSeries("200", "200", 20),
            chartSeries("400", "400", 3),
          ],
        },
      ],
    },
    {
      id: "integration-duration",
      objectiveId: "integrations",
      title: "Average API request duration",
      unit: "ms",
      note: "Live calls only.",
      modes: [
        {
          id: "organisation",
          label: "By organisation",
          hourly: { series: [hourlySeries("hmrc", "HMRC", 600), hourlySeries("stripe", "Stripe", 250)] },
          series: [
            chartSeries("hmrc", "HMRC", 700),
            chartSeries("stripe", "Stripe", 280),
            chartSeries("companies-house", "Companies House", 1400),
          ],
        },
      ],
    },
    (() => {
      const funnel = chartWithSeries(
        "conversion-to-submission",
        "conversion-to-submission",
        "Conversion to submission",
        "count",
        [
          "Submit sessions from the spreadsheets site",
          "Submit sessions from the gateway site",
          "Submit sessions from other sources",
          "Human sessions",
          "Active customers",
        ],
        { note: "Steps, left to right." },
      );
      funnel.modes[0].id = "funnel";
      funnel.modes[0].label = "Funnel";
      funnel.modes[0].series = funnel.modes[0].series.slice(1);
      ["sessions-from-spreadsheets", "sessions-from-www", "sessions-from-elsewhere", "human-sessions", "active-customers"].forEach(
        (id, index) => {
          funnel.modes[0].series[index].id = id;
        },
      );
      return funnel;
    })(),
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
        {
          id: "ads-ctr",
          label: "Ads click-through rate by campaign",
          unit: "ratio",
          series: [
            {
              ...chartSeries("search-mtd-vat", "Search: MTD VAT", 0.04),
              description: "The campaign's clicks over its impressions in a day.",
            },
          ],
        },
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
    (() => {
      const visitors = chartWithSeries("visitors", "conversion-to-submission", "Visitors", "count", [
        "Operator",
        "Authenticated user",
        "Human",
        "Synthetic",
        "Bot",
        "System",
      ]);
      visitors.modes[0].id = "sessions";
      ["operator", "authenticated", "human", "synthetic", "bot", "system"].forEach((kind, index) => {
        visitors.modes[0].series[index + 1].id = kind;
      });
      visitors.modes[0].hourly = {
        series: [
          hourlySeries("operator", "Operator", 1),
          hourlySeries("authenticated", "Authenticated user", 2),
          hourlySeries("human", "Human", 3),
        ],
      };
      return visitors;
    })(),
  ],
};

export const FIXTURE_COST_DRIVERS = {
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

export const FIXTURE_PAID_SUBSCRIBERS = {
  month: "2026-10-01",
  rows: [
    { source: "google-ads", bundleId: "resident-vat", subscribers: 3, mrrGbp: 27, arrGbp: 324 },
    { source: "unknown", bundleId: "resident-pro", subscribers: 1, mrrGbp: 19, arrGbp: 228 },
  ],
  totals: { subscribers: 4, mrrGbp: 46, arrGbp: 552 },
};

export const FIXTURE_PAGE_VISITORS = {
  days: 30,
  rows: [
    {
      page: "submit.diyaccounting.co.uk/index.html",
      signedInVisitors: 4,
      signedInEngagedMs: 500000,
      otherVisitors: 20,
      otherEngagedMs: 1000000,
      operatorVisitors: 6,
    },
    {
      page: "submit.diyaccounting.co.uk/pricing.html",
      signedInVisitors: 0,
      signedInEngagedMs: 0,
      otherVisitors: 3,
      otherEngagedMs: 45000,
      operatorVisitors: 0,
    },
  ],
};

export const integrationCall = (id, api, ms, status, rules = null, rulesFailed = []) => ({
  id,
  at: id.split("#")[0],
  api,
  method: api.split(" ")[0],
  ms,
  status,
  rules,
  rulesFailed,
});

// The Data tab's section as the publisher shapes it: a history of 30 and 7 days for some tables,
// none yet for 90 days, and a split for the tables the lake holds.
export const FIXTURE_DATA = shapeDataSection({
  envName: "prod",
  now: new Date("2026-11-07T10:00:00Z"),
  tables: [
    { name: "prod-env-receipts", items: 412, ttl: { enabled: false, attribute: null } },
    { name: "prod-env-bundles", items: 1296, ttl: { enabled: true, attribute: "ttl" } },
    { name: "prod-env-subscriptions", items: 188, ttl: { enabled: false, attribute: null } },
    { name: "prod-env-passes", items: 2431, ttl: { enabled: false, attribute: null } },
    { name: "prod-env-integration-calls", items: 18420, ttl: { enabled: true, attribute: "ttl" } },
    { name: "prod-env-mcp-sessions", items: 7, ttl: { enabled: true, attribute: "expiresAt" } },
  ],
  actorSplit: {
    receipts: { customer: 59, test: 330, synthetic: 12, other: 3, unknown: 8 },
    bundles: { customer: 410, test: 724, synthetic: 96, other: 6, unknown: 60 },
    subscriptions: { customer: 31, test: 120, synthetic: 30, other: 0, unknown: 7 },
    passes: { customer: 140, test: 2131, synthetic: 0, other: 0, unknown: 160 },
  },
  buckets: [
    { name: "prod-env-analytics-lake-972912397388", objects: 48210, history: { 90: null, 30: 31200, 7: 46100, 1: 47900 } },
    { name: "prod-env-analytics-results-972912397388", objects: 9120, history: { 90: null, 30: 6400, 7: 8800, 1: 9050 } },
    { name: "prod-env-diya-gl-972912397388", objects: 22, history: { 90: null, 30: 14, 7: 20, 1: 22 } },
  ],
  books: { books: 11, versions: 11, truncated: false },
  histories: {
    90: null,
    30: {
      tables: { "receipts": 300, "bundles": 900, "subscriptions": 120, "passes": 1800, "integration-calls": 9100, "mcp-sessions": 4 },
      books: { books: 7, versions: 7 },
    },
    7: {
      tables: { "receipts": 400, "bundles": 1250, "subscriptions": 180, "passes": 2380, "integration-calls": 17800, "mcp-sessions": 6 },
      books: { books: 10, versions: 10 },
    },
    1: {
      tables: { "receipts": 410, "bundles": 1290, "subscriptions": 187, "passes": 2425, "integration-calls": 18300, "mcp-sessions": 7 },
      books: { books: 11, versions: 11 },
    },
  },
});

export const FIXTURE_INTEGRATIONS = {
  table: "prod-env-integration-calls",
  region: "eu-west-2",
  summary: [
    { org: "hmrc", status: "200", ...sampleWindowsWithTrend(212, 0.12) },
    { org: "hmrc", status: "201", ...sampleWindowsWithTrend(41, 0.05) },
    { org: "hmrc", status: "400", ...sampleWindowsWithTrend(6, -0.2) },
    { org: "hmrc", status: "timeout", ...sampleWindowsWithTrend(2, null) },
    { org: "companies-house", status: "200", ...sampleWindowsWithTrend(9, 0.3) },
    { org: "stripe", status: "200", ...sampleWindowsWithTrend(64, 0.08) },
    { org: "stripe", status: "402", ...sampleWindowsWithTrend(3, null) },
  ].map((row) => ({ unit: "count", ...row })),
  calls: {
    "hmrc": [
      integrationCall("2026-11-04T10:15:30.123Z#a1b2c3d4", "POST /organisations/vat/{vrn}/returns", 1412, "201", "pass"),
      integrationCall("2026-11-04T10:12:02.004Z#b2c3d4e5", "GET /organisations/vat/{vrn}/obligations", 412, "200", "pass"),
      integrationCall("2026-11-04T09:58:41.870Z#c3d4e5f6", "POST /oauth/token", 306, "200"),
      integrationCall("2026-11-04T09:40:11.002Z#d4e5f6a7", "POST /organisations/vat/{vrn}/returns", 5000, "timeout", "pass"),
      integrationCall("2026-11-03T16:20:09.511Z#e5f6a7b8", "GET /organisations/vat/{vrn}/liabilities", 288, "400", "fail", [
        "Gov-Client-Device-ID",
        "Gov-Vendor-Version",
      ]),
      integrationCall("2025-07-01T09:00:00.000Z#f6a7b8c9", "GET /organisations/vat/{vrn}/payments", 301, "200", "pass"),
    ],
    "companies-house": [integrationCall("2026-11-04T08:30:00.250Z#a7b8c9d0", "XMLGW Accounts", 2210, "200")],
    "stripe": [integrationCall("2026-11-04T10:01:12.090Z#b8c9d0e1", "POST /v1/payment_intents", 640, "402")],
  },
  headerChecks: [
    {
      day: "2026-11-04",
      api: "GET /organisations/vat/{vrn}/obligations",
      connectionMethod: "WEB_APP_VIA_SERVER",
      result: "pass",
      hmrcCode: "VALID_HEADERS",
      message: null,
      headers: [],
      checkedAt: "2026-11-04T09:16:48.130Z",
    },
    {
      day: "2026-11-03",
      api: "POST /organisations/vat/{vrn}/returns",
      connectionMethod: "MOBILE_APP_VIA_SERVER",
      result: "fail",
      hmrcCode: "INVALID_HEADERS",
      message: "Header is missing or its value does not match the expected format",
      headers: ["Gov-Client-Device-ID", "Gov-Vendor-Version"],
      checkedAt: "2026-11-03T12:01:02.000Z",
    },
  ],
};

export const FIXTURE_SNAPSHOT_WITH_CHARTS = { ...FIXTURE_SNAPSHOT, dailyCharts: FIXTURE_DAILY_CHARTS };

// Thirty days of a small service: about 130 visits, 41 paid landings, £84 of ad spend over 96 clicks.
export const SAMPLE_VALUE_BY_UNIT = { count: 132, gbp: 84, usd: 18.6, ratio: 0.42, hours: 6.5, runs: 38, months: 14.25 };
export const SAMPLE_VALUE_BY_ID = {
  "ads-clicks": 96,
  "ads-impressions": 4180,
  "ads-ctr": 0.023,
  "ads-cost-gbp": 84,
  "ads-cost-per-click-gbp": 0.88,
  "paid-landings": 41,
  "ads-cost-per-paid-landing-gbp": 2.05,
  "revenue-gbp": 312,
  "revenue-net-gbp": 300,
  "revenue-subscriptions-gbp": 252,
  "revenue-donations-gbp": 40,
  "revenue-paypal-donations-gbp": 20,
  "probe-pass-rate": 0.994,
  "deploy-failure-rate": 0.06,
  "hmrc-submission-failure-rate": 0.02,
  "submission-failure-rate": 0.02,
  "alarms-fired": 3,
  "charges-without-activation": 0,
  "hmrc-submission-failures": 1,
  "company-turnover": 3800,
  "company-costs": 2650,
  "company-profit": 1150,
  "company-cash-at-bank": 18400,
};
// A sum covers three times as many days in ninety as in thirty; a rate or a median stays the same.
export const spreadOverNinety = (observation, thirtyDays) =>
  ["count", "gbp", "usd"].includes(observation.unit) ? Math.round(thirtyDays * 3 * 100) / 100 : thirtyDays;
export const sampleValue = (observation) =>
  observation.id.endsWith("::started")
    ? 40
    : observation.id.endsWith("::completed")
      ? 31
      : (SAMPLE_VALUE_BY_ID[observation.id] ?? SAMPLE_VALUE_BY_UNIT[observation.unit]);

// Every observation the publisher defines, each with a value in every column, which is the
// most the page ever renders; the layout tests size the page's reserved heights against it.
export function sampleWindowsWithTrend(value, trend) {
  return {
    today: { value },
    previousDay: { value: value + 3 },
    last7: { value: value * 6 },
    last30: { value: value * 26, trend, ...(trend === null ? { isNew: true } : {}) },
    last90: { value: value * 70, trend: null },
  };
}

export const sampleWindows = (value) => ({
  today: { value },
  previousDay: { value },
  last7: { value },
  last30: { value, trend: null },
  last90: { value, trend: null },
});

export const FIXTURE_AFFILIATE_SECTIONS = {
  operators: { emails: ["boss@example.com", "second@example.com"] },
  familyAffiliates: {
    measures: [
      { key: "passesGenerated", label: "Passes generated" },
      { key: "linkClicks", label: "Pass link clicks" },
      { key: "passesRedeemed", label: "Passes redeemed" },
      { key: "passesConverted", label: "Passes converted to paid" },
    ],
    affiliates: [
      {
        email: "sister@example.com",
        issuerFound: true,
        passesGenerated: sampleWindows(3),
        linkClicks: sampleWindows(8),
        passesRedeemed: sampleWindows(2),
        passesConverted: sampleWindows(1),
      },
      {
        email: "brother@example.com",
        issuerFound: false,
        passesGenerated: sampleWindows(0),
        linkClicks: sampleWindows(0),
        passesRedeemed: sampleWindows(0),
        passesConverted: sampleWindows(0),
      },
    ],
  },
  affiliateGroups: {
    familyPayableThisMonthPence: 1250,
    groups: [
      {
        id: "customers",
        label: "Customers with credit",
        referrers: [
          {
            referrerHash: "aaaaaaaa11112222",
            tier: "customer",
            latestLineState: "held",
            referrals: 2,
            payingAccounts: 1,
            heldPence: 300,
            payablePence: 0,
            paidPence: 0,
            payableThisMonthPence: 0,
          },
        ],
      },
      { id: "approved", label: "Approved affiliates", referrers: [] },
      {
        id: "family",
        label: "Family",
        referrers: [
          {
            referrerHash: "bbbbbbbb33334444",
            tier: "family",
            latestLineState: "payable",
            referrals: 1,
            payingAccounts: 1,
            heldPence: 0,
            payablePence: 1250,
            paidPence: 500,
            payableThisMonthPence: 1250,
          },
        ],
      },
    ],
  },
};

export function fullShapeSnapshot() {
  const context = {
    envName: "prod",
    region: "eu-west-2",
    athenaWorkGroupName: "prod-env-analytics",
    githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
    ga4PropertyId: "523400333",
  };
  const windows = (observation) => ({
    last30: { value: sampleValue(observation), trend: 0.08 },
    last90: { value: spreadOverNinety(observation, sampleValue(observation)), trend: 0.08 },
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
        ...windows(observation),
        ...(observation.fastWindowView ? { today: { value: 5 }, previousDay: { value: 4 }, last7: { value: 31 } } : {}),
        deepLink: observation.deepLink(context),
      })),
    })),
    costDrivers: FIXTURE_COST_DRIVERS,
    paidSubscribers: FIXTURE_PAID_SUBSCRIBERS,
    pageVisitors: FIXTURE_PAGE_VISITORS,
    integrations: FIXTURE_INTEGRATIONS,
    data: FIXTURE_DATA,
    ...FIXTURE_AFFILIATE_SECTIONS,
    failedObservationCount: 0,
  };
}

export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export const CAPTURED_AT = "2026-11-02T02:20:00.000Z";

// What consoleCapturePublish.js writes to snapshots/<env>/console/index.json and
// operatorSnapshotGet.js returns as snapshot.console.
export const FIXTURE_CONSOLE_INDEX = {
  generatedAt: CAPTURED_AT,
  environment: "prod",
  items: {
    "prod-lambda-errors": {
      id: "prod-lambda-errors",
      target: "prod",
      env: "prod",
      group: "operations",
      title: "Lambda errors by function",
      kind: "image",
      capturedAt: CAPTURED_AT,
      imageKey: "snapshots/prod/console/prod/prod-lambda-errors.png",
    },
    "prod-lambda-throttles": {
      id: "prod-lambda-throttles",
      target: "prod",
      env: "prod",
      group: "operations",
      title: "Lambda throttles by function",
      kind: "metric-search",
      capturedAt: CAPTURED_AT,
      error: "AccessDenied: not authorised",
    },
    "prod-alarms": {
      id: "prod-alarms",
      target: "prod",
      env: "prod",
      group: "operations",
      title: "Alarms",
      kind: "alarms",
      capturedAt: CAPTURED_AT,
      rows: [
        {
          name: "prod-env-hmrc-submission-failure",
          state: "ALARM",
          reason: "Threshold crossed: 1 datapoint was 2",
          stateUpdatedAt: "2026-11-02T01:00:00.000Z",
        },
        {
          name: "prod-env-stripe-webhook-errors",
          state: "OK",
          reason: "Threshold not crossed",
          stateUpdatedAt: "2026-11-01T10:00:00.000Z",
        },
      ],
    },
    "prod-bedrock": {
      id: "prod-bedrock",
      target: "prod",
      env: "prod",
      group: "operations",
      title: "Bedrock invocations by hour and model",
      kind: "bedrock",
      capturedAt: CAPTURED_AT,
      rows: [
        {
          bin: "2026-10-31 09:00:00.000",
          modelId: "arn:aws:bedrock:eu-west-2:972912397388:inference-profile/eu.amazon.nova-pro-v1:0",
          invocations: 4,
          inputTokens: 4000,
          outputTokens: 900,
        },
        {
          bin: "2026-11-01 09:00:00.000",
          modelId: "arn:aws:bedrock:eu-west-2:972912397388:inference-profile/eu.amazon.nova-pro-v1:0",
          invocations: 6,
          inputTokens: 6200,
          outputTokens: 1100,
        },
        {
          bin: "2026-11-02 01:00:00.000",
          modelId: "arn:aws:bedrock:eu-west-2:972912397388:inference-profile/eu.amazon.nova-pro-v1:0",
          invocations: 2,
          inputTokens: 2100,
          outputTokens: 400,
        },
        { bin: "2026-11-02 02:00:00.000", invocations: 9, inputTokens: 9000, outputTokens: 800 },
      ],
    },
    "prod-xray": {
      id: "prod-xray",
      target: "prod",
      env: "prod",
      group: "operations",
      title: "X-Ray services",
      kind: "service-graph",
      capturedAt: CAPTURED_AT,
      rows: [
        {
          name: "prod-env-hmrc-vat-return-post",
          type: "AWS::Lambda",
          requests: 4,
          errors: 1,
          faults: 2,
          throttles: 0,
          averageResponseMilliseconds: 250,
        },
        {
          name: "prod-env-bundle-get",
          type: "AWS::Lambda",
          requests: 10,
          errors: 0,
          faults: 0,
          throttles: 0,
          averageResponseMilliseconds: 80,
        },
      ],
    },
  },
};

// The real 403 body a signed-in caller without the operator bundle gets back from
// operatorSnapshotGet.js (app/functions/analytics/operatorSnapshotGet.js) - kept in sync with
// that handler's message so this fixture proves what the page does with the server's own words,
// not a placeholder.

export const FORBIDDEN_BODY = {
  message: "Not authorised to view the operator dashboard. Ask the operator to issue you the operator pass for your sign-in email.",
  code: "BUNDLE_ENTITLEMENT_REQUIRED",
};
