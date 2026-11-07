// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import { describe, test, expect } from "vitest";
import { readCriteria } from "../../../scripts/dashboard-review-criteria.mjs";
import { runCodeChecks, readHeadlines, readPath, HEADLINE_PATHS, CODE_CHECK_NUMBERS } from "../../../scripts/dashboard-review-checks.mjs";

const NOW = Date.parse("2026-11-03T10:00:00.000Z");

const SECTION_MAP = [
  { section: "`objectives[uptime]`", tabs: "ops", panels: "slot `uptime`" },
  { section: "`monthlyMarketingBudget`", tabs: "adoption", panels: "`monthlyMarketingBudgetPanel`" },
  { section: "`console` (API response only)", tabs: "aws-prod", panels: "`awsLinksPanel`, one `console-<link id>` section" },
  { section: "`generatedAt`, `environment`, `failedObservationCount`", tabs: "all", panels: "the header lines" },
];

function snapshot(overrides = {}) {
  return {
    generatedAt: "2026-11-03T09:30:00.000Z",
    environment: "prod",
    failedObservationCount: 0,
    monthlyMarketingBudget: { budgetGbp: 370, spentThisMonthGbp: 70 },
    objectives: [
      {
        id: "uptime",
        observations: [{ id: "alarms-fired", unit: "count", last30: { value: 3, trend: -0.25 }, last90: { value: 10 } }],
      },
    ],
    console: {
      generatedAt: "2026-11-03T02:20:00.000Z",
      items: {
        "prod-alarms": {
          id: "prod-alarms",
          kind: "alarms",
          capturedAt: "2026-11-03T02:20:00.000Z",
          rows: [{ name: "prod-env-hmrc-submission-failure", state: "ALARM" }],
        },
        "prod-lambda-errors": { id: "prod-lambda-errors", kind: "image", capturedAt: "2026-11-03T02:20:00.000Z", imageKey: "k" },
      },
    },
    ...overrides,
  };
}

function dom(overrides = {}) {
  return {
    tabs: ["main", "ops"],
    panels: [
      { id: "table-uptime", tabs: ["ops"], hidden: false, openOn: ["ops"] },
      { id: "monthlyMarketingBudgetPanel", tabs: ["adoption"], hidden: false, openOn: ["adoption"] },
      { id: "awsLinksPanel", tabs: ["aws-prod"], hidden: false, openOn: ["aws-prod"] },
      { id: "heldPassesPanel", tabs: ["affiliates"], hidden: false, openOn: ["affiliates"] },
    ],
    rows: [],
    captures: [],
    freshness: { meta: "", age: "", ageShown: false, source: "" },
    unansweredApis: [],
    requestOrigins: [],
    abortedOrigins: [],
    ...overrides,
  };
}

const run = (inputs = {}) => runCodeChecks({ snapshot: snapshot(), dom: dom(), alarms: [], sectionMap: SECTION_MAP, now: NOW, ...inputs });

const row = (cells, expectedLast30 = "3") => ({
  tabId: "ops",
  observationId: "alarms-fired",
  objectiveId: "uptime",
  cells,
  expected: { today: "none", previousDay: "none", last7: "none", last30: expectedLast30, trend: "↓ 25%", last90: "10" },
});

describe("dashboard review code checks", () => {
  test("the map as the skill's parser returns it names every key of a snapshot, so a clean render has no finding", () => {
    const { sectionMap } = readCriteria(fs.readFileSync(".claude/skills/dashboard-review/SKILL.md", "utf8"));
    const clean = snapshot({ objectives: [{ id: "uptime", observations: [] }] });
    expect(run({ snapshot: clean, sectionMap })).toEqual([]);
  });

  test("a clean render has no finding", () => {
    expect(run()).toEqual([]);
  });

  test("a snapshot 8 hours old is stale", () => {
    const found = run({ snapshot: snapshot({ generatedAt: "2026-11-03T02:00:00.000Z" }) });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: CODE_CHECK_NUMBERS.freshness, tag: "stale", list: "improvement", source: "code" });
    expect(found[0].finding).toContain("8 hours");
  });

  test("a missing snapshot is a fault", () => {
    const found = run({ snapshot: null });
    expect(found).toHaveLength(1);
    expect(found[0].tag).toBe("fault");
  });

  test("failed observation queries name the observations with every window null", () => {
    const withFailure = snapshot({
      failedObservationCount: 1,
      objectives: [{ id: "uptime", observations: [{ id: "alarms-fired", unit: "count" }] }],
    });
    const found = run({ snapshot: withFailure });
    expect(found[0].evidence).toContain("uptime.alarms-fired");
  });

  test("an API the run does not answer is a fault with the path", () => {
    const found = run({ dom: dom({ unansweredApis: ["/api/v1/other"] }) });
    expect(found[0]).toMatchObject({ tag: "fault", evidence: "path /api/v1/other" });
  });

  test("a cell that differs from formatValue is a fault", () => {
    const cells = ["Alarms fired", "none", "none", "none", "4", "↓ 25%", "10", ""];
    const found = run({ dom: dom({ rows: [row(cells)] }) });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: CODE_CHECK_NUMBERS.agreement, tag: "fault", tab: "ops", panel: "table-uptime" });
  });

  test("matching cells raise no agreement finding", () => {
    const cells = ["Alarms fired", "none", "none", "none", "3", "↓ 25%", "10", ""];
    expect(run({ dom: dom({ rows: [row(cells)] }) })).toEqual([]);
  });

  test("a not measured cell is a gap that names its source", () => {
    const cells = ["Alarms fired", "not measured", "none", "none", "3", "↓ 25%", "10", ""];
    const withSource = snapshot({
      objectives: [{ id: "uptime", observations: [{ id: "alarms-fired", unit: "count", source: "v_alarm_state_changes_daily" }] }],
    });
    const found = run({ snapshot: withSource, dom: dom({ rows: [{ ...row(cells), expected: null }] }) });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: CODE_CHECK_NUMBERS.notMeasured, tag: "gap" });
    expect(found[0].evidence).toContain("v_alarm_state_changes_daily");
  });

  test("a snapshot key and an objective that no map row names are gaps", () => {
    const found = run({
      snapshot: snapshot({
        newSection: { rows: [1] },
        objectives: [
          { id: "uptime", observations: [{ id: "a", unit: "count" }] },
          { id: "fresh", observations: [] },
        ],
      }),
    });
    const text = found.map((entry) => entry.finding).join("\n");
    expect(text).toContain("newSection");
    expect(text).toContain("objective fresh");
  });

  test("a panel hidden on every tab that shows it, with data present, is a fault", () => {
    const hidden = dom();
    hidden.panels[0] = { id: "table-uptime", tabs: ["ops"], hidden: true, openOn: [] };
    const found = run({ dom: hidden });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: CODE_CHECK_NUMBERS.hiddenPanels, tag: "fault", panel: "table-uptime", tab: "ops" });
  });

  test("a hidden panel whose snapshot section is empty is not a finding", () => {
    const hidden = dom();
    hidden.panels[1] = { id: "monthlyMarketingBudgetPanel", tabs: ["adoption"], hidden: true, openOn: [] };
    expect(run({ snapshot: snapshot({ monthlyMarketingBudget: null }), dom: hidden })).toEqual([]);
  });

  test("a panel that no map row names is a gap", () => {
    const extra = dom();
    extra.panels.push({ id: "extraPanel", tabs: ["main"], hidden: false, openOn: ["main"] });
    const found = run({ dom: extra });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ tag: "gap", panel: "extraPanel" });
  });

  test("a capture older than a day before the snapshot is stale", () => {
    const old = snapshot();
    old.console.items["prod-lambda-errors"].capturedAt = "2026-11-02T02:20:00.000Z";
    const captures = [
      { tabId: "aws-prod", captureId: "prod-lambda-errors", caption: "", error: null, empty: null, hasImage: true, imageLoaded: true },
    ];
    const found = run({ snapshot: old, dom: dom({ captures }) });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: CODE_CHECK_NUMBERS.captureState, tag: "stale", panel: "console-prod-lambda-errors" });
  });

  test.each([
    ["Capture failed: AccessDenied", { error: "Capture failed: AccessDenied" }],
    ["The image did not load.", { error: "The image did not load." }],
    ["Not captured yet", { empty: "Not captured yet" }],
  ])("the capture state %s is a fault", (_label, state) => {
    const captures = [
      {
        tabId: "aws-prod",
        captureId: "prod-lambda-errors",
        caption: "",
        error: null,
        empty: null,
        hasImage: false,
        imageLoaded: false,
        ...state,
      },
    ];
    const found = run({ dom: dom({ captures }) });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: CODE_CHECK_NUMBERS.captureState, tag: "fault", tab: "aws-prod" });
  });

  test("an open alarm with no row in the alarm table is a fault", () => {
    const found = run({ alarms: [{ number: 812, title: "[ALARM] prod-env-stripe-webhook-errors" }] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: CODE_CHECK_NUMBERS.alarms, tag: "fault", tab: "aws-prod", evidence: "issue 812" });
  });

  test("an open alarm that the table shows in ALARM raises no finding", () => {
    expect(run({ alarms: [{ number: 811, title: "[ALARM] prod-env-hmrc-submission-failure" }] })).toEqual([]);
  });

  test("an open alarm that the table shows as OK is a fault", () => {
    const cleared = snapshot();
    cleared.console.items["prod-alarms"].rows[0].state = "OK";
    const found = run({ snapshot: cleared, alarms: [{ number: 811, title: "[ALARM] prod-env-hmrc-submission-failure" }] });
    expect(found).toHaveLength(1);
    expect(found[0].finding).toContain("OK");
  });
});

describe("headline figures", () => {
  test("readPath picks array entries by id", () => {
    expect(readPath(snapshot(), "objectives[uptime].observations[alarms-fired].last30.value")).toBe(3);
    expect(readPath(snapshot(), "objectives[missing].observations[x].last30.value")).toBeUndefined();
  });

  test("readHeadlines returns one entry for each path, null when absent", () => {
    const headlines = readHeadlines(snapshot());
    expect(headlines).toHaveLength(HEADLINE_PATHS.length);
    expect(headlines.find((entry) => entry.label === "Marketing budget").value).toBe(370);
    expect(headlines.find((entry) => entry.label === "Revenue, gross").value).toBeNull();
  });
});
