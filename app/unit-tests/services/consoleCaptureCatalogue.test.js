// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { allCaptureIds, buildMetricWidget, itemsForTarget, regionForTarget, targetsForRun } from "@app/services/consoleCaptureCatalogue.js";

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

  test("a submit target has 7 analytics, 4 operations metric searches, the RUM pair, alarms, Bedrock and X-Ray", () => {
    const items = itemsForTarget("prod");
    expect(items.filter((item) => item.group === "analytics")).toHaveLength(7);
    expect(items.filter((item) => item.kind === "metric-search")).toHaveLength(11);
    expect(items.filter((item) => item.kind === "rum")).toHaveLength(2);
    expect(items.map((item) => item.kind)).toEqual(expect.arrayContaining(["alarms", "bedrock", "service-graph"]));
    expect(items.every((item) => item.id.startsWith("prod-"))).toBe(true);
  });

  test("sibling targets hold one RUM item each, read in us-east-1", () => {
    expect(itemsForTarget("spreadsheets").map((item) => item.id)).toEqual(["spreadsheets-rum-vitals"]);
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

  test("a RUM widget names its application dimension", () => {
    const item = itemsForTarget("ci").find((entry) => entry.slug === "rum-errors");
    const widget = buildMetricWidget(item, "eu-west-2");
    expect(widget.metrics[0]).toEqual(["AWS/RUM", "JsErrorCountPerSession", "application_name", "ci-env-rum", { stat: "Sum" }]);
  });

  test("an unknown target is an error", () => {
    expect(() => itemsForTarget("elsewhere")).toThrow(/Unknown console capture target/);
  });
});
