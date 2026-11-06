// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  allCaptureIds,
  BEDROCK_QUERY,
  buildMetricWidget,
  itemsForTarget,
  regionForTarget,
  targetsForRun,
} from "@app/services/consoleCaptureCatalogue.js";

function loadDashboardLinkGroups() {
  const source = readFileSync(new URL("../../../web/public/operator/dashboard.awslinks.js", import.meta.url), "utf8");
  const window = {};
  vm.runInNewContext(source, { window, TextEncoder, Intl, document: {} });
  return window.awsLinkGroups();
}

describe("consoleCaptureCatalogue", () => {
  test("the dashboard page asks for exactly the capture ids the catalogue holds", () => {
    const requested = loadDashboardLinkGroups().flatMap((group) => group.links.flatMap((link) => link.captures));
    expect([...requested].sort()).toEqual([...allCaptureIds()].sort());
  });

  test("every dashboard link has a unique id", () => {
    const ids = loadDashboardLinkGroups().flatMap((group) => group.links.map((link) => link.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("prod-lambda-errors");
  });

  test("the prod run reads prod, ci and the two sibling accounts; the ci run reads ci only", () => {
    expect(targetsForRun("prod")).toEqual(["prod", "ci", "spreadsheets", "gateway"]);
    expect(targetsForRun("ci")).toEqual(["ci"]);
    expect(() => targetsForRun("test")).toThrow(/prod and ci only/);
  });

  test("a submit target has 10 analytics, 6 operations metric searches, the RUM set, alarms, Bedrock and X-Ray", () => {
    const items = itemsForTarget("prod");
    expect(items.filter((item) => item.group === "analytics")).toHaveLength(10);
    expect(items.filter((item) => item.kind === "metric-search")).toHaveLength(16);
    expect(items.filter((item) => item.kind === "rum")).toHaveLength(3);
    expect(items.map((item) => item.kind)).toEqual(expect.arrayContaining(["alarms", "bedrock", "service-graph"]));
    expect(items.every((item) => item.id.startsWith("prod-"))).toBe(true);
  });

  test("sibling targets hold a times graph and a score graph each, read in us-east-1", () => {
    expect(itemsForTarget("spreadsheets").map((item) => item.id)).toEqual(["spreadsheets-rum-vitals", "spreadsheets-rum-vitals-score"]);
    expect(itemsForTarget("gateway")[0].application).toBe("gateway-web");
    expect(regionForTarget("gateway")).toBe("us-east-1");
    expect(regionForTarget("prod")).toBe("eu-west-2");
  });

  test("a search widget wraps its search in SORT so more than 100 series cannot blank the graph", () => {
    const item = itemsForTarget("prod").find((entry) => entry.slug === "lambda-errors");
    const widget = buildMetricWidget(item, "eu-west-2");
    const expression = widget.metrics[0][0].expression;
    expect(expression).toBe("SORT(SEARCH('{AWS/Lambda,FunctionName} MetricName=\"Errors\" prod-env', 'Sum', 3600), SUM, DESC, 10)");
    expect(widget.region).toBe("eu-west-2");
  });

  test("the Lambda duration graphs split by rank: the slowest 6, ranks 7 to 11, then ranks 12 to 21", () => {
    const items = itemsForTarget("prod");
    const search = "SEARCH('{AWS/Lambda,FunctionName} MetricName=\"Duration\" prod-env', 'Average', 3600)";
    const slowest = buildMetricWidget(
      items.find((entry) => entry.slug === "lambda-duration-slowest"),
      "eu-west-2",
    );
    const rest = buildMetricWidget(
      items.find((entry) => entry.slug === "lambda-duration-rest"),
      "eu-west-2",
    );
    expect(slowest.metrics[0][0].expression).toBe("SORT(" + search + ", MAX, DESC, 6)");
    const tail = buildMetricWidget(
      items.find((entry) => entry.slug === "lambda-duration-tail"),
      "eu-west-2",
    );
    expect(rest.metrics[0][0].expression).toBe("SLICE(SORT(" + search + ", MAX, DESC), 6, 11)");
    expect(tail.metrics[0][0].expression).toBe("SLICE(SORT(" + search + ", MAX, DESC), 11, 21)");
    expect(items.some((entry) => entry.slug === "lambda-duration")).toBe(false);
  });

  test("the large series split by rank so the small ones stay readable", () => {
    const items = itemsForTarget("prod");
    const expressionOf = (slug) =>
      buildMetricWidget(
        items.find((entry) => entry.slug === slug),
        "eu-west-2",
      ).metrics[0][0].expression;
    const cognito = "SEARCH('{AWS/Cognito,UserPool,UserPoolClient} MetricName=\"SignInSuccesses\"', 'Sum', 86400)";
    expect(expressionOf("cognito-sign-ins")).toBe("SORT(" + cognito + ", SUM, DESC, 1)");
    expect(expressionOf("cognito-sign-ins-rest")).toBe("SLICE(SORT(" + cognito + ", SUM, DESC), 1, 11)");
    expect(expressionOf("analytics-all")).toBe("SORT(SEARCH('Submit/Analytics', 'Maximum', 86400), MAX, DESC, 4)");
    expect(expressionOf("analytics-all-middle")).toBe("SLICE(SORT(SEARCH('Submit/Analytics', 'Maximum', 86400), MAX, DESC), 4, 12)");
    expect(expressionOf("analytics-all-rest")).toBe("SLICE(SORT(SEARCH('Submit/Analytics', 'Maximum', 86400), MAX, DESC), 12, 20)");
  });

  test("every search graph starts its y axis at 0", () => {
    for (const item of itemsForTarget("ci").filter((entry) => entry.kind === "metric-search")) {
      expect(buildMetricWidget(item, "eu-west-2").yAxis.left.min).toBe(0);
    }
  });

  test("a search with one unit labels its y axis and drops the No unit label; a mixed-unit search sets none", () => {
    const items = itemsForTarget("prod");
    for (const slug of ["lambda-duration-slowest", "lambda-duration-rest"]) {
      const widget = buildMetricWidget(
        items.find((entry) => entry.slug === slug),
        "eu-west-2",
      );
      expect(widget.yAxis).toEqual({ left: { min: 0, label: "Milliseconds", showUnits: false } });
    }
    const leadTime = buildMetricWidget(
      items.find((entry) => entry.slug === "deploy-lead-time"),
      "eu-west-2",
    );
    expect(leadTime.yAxis.left.label).toBe("Hours");
    for (const slug of ["lambda-errors", "hmrc-authentications", "cognito-sign-ins-rest"]) {
      const widget = buildMetricWidget(
        items.find((entry) => entry.slug === slug),
        "eu-west-2",
      );
      expect(widget.yAxis).toEqual({ left: { min: 0, label: "Count", showUnits: false } });
    }
    const mixed = buildMetricWidget(
      items.find((entry) => entry.slug === "analytics-all"),
      "eu-west-2",
    );
    expect(mixed.yAxis).toEqual({ left: { min: 0 } });
  });

  test("every Submit/Analytics search plots a gauge with Maximum or Average, never Sum", () => {
    const searches = itemsForTarget("prod").filter((item) => item.kind === "metric-search" && item.query.includes("Submit/Analytics"));
    expect(searches.length).toBeGreaterThan(0);
    for (const item of searches) expect(["Maximum", "Average"]).toContain(item.stat);
  });

  test("a RUM widget names its application dimension", () => {
    const item = itemsForTarget("ci").find((entry) => entry.slug === "rum-errors");
    const widget = buildMetricWidget(item, "eu-west-2");
    expect(widget.metrics[0]).toEqual(["AWS/RUM", "JsErrorCountPerSession", "application_name", "ci-env-rum", { stat: "Sum" }]);
  });

  test("web vitals draw milliseconds and the unitless layout shift score on separate graphs at p75", () => {
    for (const targetKey of ["prod", "spreadsheets", "gateway"]) {
      const items = itemsForTarget(targetKey);
      const times = buildMetricWidget(
        items.find((entry) => entry.slug === "rum-vitals"),
        "eu-west-2",
      );
      const score = buildMetricWidget(
        items.find((entry) => entry.slug === "rum-vitals-score"),
        "eu-west-2",
      );
      expect(times.metrics.map((metric) => metric[1])).toEqual(["WebVitalsLargestContentfulPaint", "WebVitalsInteractionToNextPaint"]);
      expect(score.metrics.map((metric) => metric[1])).toEqual(["WebVitalsCumulativeLayoutShift"]);
      expect([...times.metrics, ...score.metrics].every((metric) => metric[4].stat === "p75")).toBe(true);
      expect(times.yAxis.left).toEqual({ min: 0, label: "Milliseconds", showUnits: false });
      expect(score.yAxis.left).toEqual({ min: 0, label: "Score", showUnits: false });
    }
  });

  test("an unknown target is an error", () => {
    expect(() => itemsForTarget("elsewhere")).toThrow(/Unknown console capture target/);
  });

  test("the Bedrock query keeps only log lines that name a model", () => {
    expect(BEDROCK_QUERY).toMatch(/^filter ispresent\(modelId\) \| stats /);
  });
});
