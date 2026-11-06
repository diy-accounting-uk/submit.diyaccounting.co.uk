// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { figuresBlockSchema } from "../../lib/dashboardReviewSchema.js";
import {
  FIGURES_MARKER,
  HEADLINE_FIGURES,
  escapeText,
  figureKey,
  figuresFromSnapshot,
  parseFiguresBlock,
  renderReport,
} from "../../../scripts/dashboard-review-report.mjs";
import { fullShapeSnapshot } from "../../../web/browser-tests/operatorDashboardFixtures.js";

const TABS = [
  { tabId: "main", panels: ["chartsPanel", "companyAccountsPanel"], imageCount: 2 },
  { tabId: "adoption", panels: ["monthlyMarketingBudgetPanel"], imageCount: 1 },
  { tabId: "aws-prod", panels: ["awsLinksPanel", "console-prod-alarms"], imageCount: 2 },
];

const codeFinding = (overrides = {}) => ({
  check: 1,
  tab: "main",
  panel: "chartsPanel",
  tag: "fault",
  list: "improvement",
  finding: "A code finding",
  evidence: "key path",
  change: "Fix it",
  source: "code",
  ...overrides,
});

const modelFinding = (overrides = {}) => ({
  tab: "main",
  panel: "chartsPanel",
  tag: "gap",
  list: "improvement",
  finding: "A model finding",
  evidence: "what it read",
  change: "Add it",
  source: "model",
  ...overrides,
});

function render(overrides = {}) {
  return renderReport({
    date: "2026-11-06",
    liveSet: "ci-set1",
    generatedAt: "2026-11-06T02:15:00.000Z",
    modelId: "eu.anthropic.claude-sonnet-5-5",
    tabs: TABS,
    figures: { "revenue-gross": 100, "aws-cost": 20 },
    previous: null,
    codeFindings: [],
    modelFindings: [],
    modelRows: [],
    rejectedTabs: [],
    maskedTabs: [],
    injectionTabs: [],
    keptImages: {},
    notes: [],
    ...overrides,
  });
}

describe("headline figure keys", () => {
  test("every key fits the figures block and no two collide", () => {
    const keys = HEADLINE_FIGURES.map((headline) => headline.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(figuresBlockSchema.safeParse({ [key]: 1 }).success).toBe(true);
    expect(figureKey("Active customers, 7 days")).toBe("active-customers-7-days");
  });

  test("each headline path reads a number in the full-shape snapshot, except the two the fixture lacks", () => {
    const figures = figuresFromSnapshot(fullShapeSnapshot());
    const missing = HEADLINE_FIGURES.map((headline) => headline.key).filter((key) => figures[key] === undefined);
    expect(missing).toEqual(["marketing-budget", "marketing-spent-this-month"]);
  });

  test("the marketing figures come from the snapshot's own key, and the figures round trip the schema", () => {
    const snapshot = { ...fullShapeSnapshot(), monthlyMarketingBudget: { budgetGbp: 370, spentThisMonthGbp: 70 } };
    const figures = figuresFromSnapshot(snapshot);
    expect(figures["marketing-budget"]).toBe(370);
    expect(figures["marketing-spent-this-month"]).toBe(70);
    expect(figuresBlockSchema.parse(JSON.parse(JSON.stringify(figures)))).toEqual(figures);
    expect(figures["cash-at-bank"]).toBe(18400);
  });
});

describe("dashboard review report", () => {
  test("a section for every tab, in the page's order, with a link for each panel", () => {
    const { markdown } = render();
    const headings = [...markdown.matchAll(/^### Tab: (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual(["main", "adoption", "aws-prod"]);
    expect(markdown).toContain("(https://submit.diyaccounting.co.uk/operator/dashboard.html#console-prod-alarms)");
  });

  test("the sections come in the skill's order and the first line carries the counts", () => {
    const { markdown } = render({ codeFindings: [codeFinding()], modelFindings: [modelFinding({ tab: "adoption" })] });
    const order = [
      "# Dashboard review",
      "Snapshot ",
      "## Headline figures",
      "## Dashboard improvements",
      "## Changes the observations call for",
      "## Tab by tab",
    ];
    const at = order.map((text) => markdown.indexOf(text));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at.every((position) => position >= 0)).toBe(true);
    expect(markdown).toContain("live set ci-set1; findings as improvements/observations: all 0/0, main 1/0, adoption 1/0, aws-prod 0/0.");
  });

  test("both lists appear, code findings come first, and each row names its source", () => {
    const { markdown } = render({
      codeFindings: [codeFinding({ finding: "CODEFIRST" })],
      modelFindings: [
        modelFinding({ finding: "MODELSECOND" }),
        modelFinding({ tag: "movement", list: "observation", finding: "OBSERVED" }),
      ],
      modelRows: [
        { tab: "main", panel: "chartsPanel", prefix: "COST", title: "Cut the cost.", action: "Check the bill.", tag: "movement" },
      ],
    });
    expect(markdown.indexOf("CODEFIRST")).toBeLessThan(markdown.indexOf("MODELSECOND"));
    expect(markdown).toContain("| main | chartsPanel | fault, code | CODEFIRST |");
    expect(markdown).toContain("| main | chartsPanel | gap, model | MODELSECOND |");
    expect(markdown).toContain("Changes the observations call for:");
    expect(markdown).toContain(
      "- [ ] **COSTn. Cut the cost.** Check the bill. Tab main, tag movement. **Source**: nightly dashboard review 2026-11-06. **Owner**: Claude Code. **Model**: Sonnet. **Size**: unknown.",
    );
  });

  test("the figures block round trips through the next run's reader", () => {
    const figures = { "revenue-gross": 100.5, "aws-cost": 20 };
    const { markdown } = render({ figures });
    expect(markdown.trimEnd().endsWith("```")).toBe(true);
    expect(markdown).toContain(FIGURES_MARKER);
    expect(parseFiguresBlock(markdown)).toEqual(figures);
    expect(parseFiguresBlock("no block here")).toBeNull();
    expect(parseFiguresBlock(`${FIGURES_MARKER}\n\`\`\`json\n{"a b":1}\n\`\`\``)).toBeNull();
  });

  test("a 30% change is a movement, a 20% change is not, and a zero before is not judged", () => {
    const previous = { "revenue-gross": 100, "revenue-net": 100, "donations": 0 };
    const { markdown, movements } = render({ previous, figures: { "revenue-gross": 130, "revenue-net": 120, "donations": 5 } });
    expect(movements.map((movement) => movement.label)).toEqual(["Revenue, gross"]);
    expect(movements[0]).toMatchObject({ tag: "movement", list: "observation", source: "code", evidence: "revenue-gross 100 to 130" });
    expect(markdown).toContain("**MKTn. Revenue, gross moved.**");
    expect(markdown).toContain("| Revenue, gross | 130 | 100 | +30% |");
    expect(markdown).toContain("| Revenue, net | 120 | 100 | +20% |");
    expect(markdown).toContain("| Donations | 5 | 0 | from zero |");
    expect(markdown).toContain("main 0/0, adoption 0/1");
  });

  test("a figure that is not on the 30 day window never counts as a movement", () => {
    const { movements } = render({ previous: { "marketing-budget": 100 }, figures: { "marketing-budget": 300 } });
    expect(movements).toEqual([]);
  });

  test("the first run says it has no earlier figures", () => {
    const { markdown } = render();
    expect(markdown).toContain("No earlier nightly report holds a figures block, so no movement is judged this run.");
    expect(markdown).toContain("| Revenue, gross | 100 | none | no previous report |");
  });

  test("a pipe, a link, an image and markup in a finding cannot change the table", () => {
    const hostile = "a | b [link](https://x.example/p) ![i](http://x.example/i.png) <img src=x> `code`";
    const { markdown } = render({ codeFindings: [codeFinding({ finding: hostile, evidence: "www.x.example" })] });
    const row = markdown.split("\n").find((line) => line.startsWith("| main | chartsPanel | fault, code"));
    expect(row.replace(/\\\|/g, "").split("|")).toHaveLength(8);
    expect(row).not.toMatch(/(?<!\\)[[\]<>`]/);
    expect(row).not.toContain("://");
    expect(escapeText("a|b")).toBe("a\\|b");
  });

  test("a rejected tab lists schema issue paths and codes only", () => {
    const { markdown } = render({ rejectedTabs: [{ tabId: "main", issues: [{ path: "findings.0.finding", code: "custom" }] }] });
    expect(markdown).toContain(
      "The model's answer for this tab was rejected, so its text is dropped. Schema issues: findings.0.finding custom.",
    );
  });

  test("an injection flag puts a line naming the tab above the first line", () => {
    const { markdown } = render({ injectionTabs: ["adoption"] });
    expect(markdown.indexOf("text in the adoption tab tried to instruct it")).toBeLessThan(markdown.indexOf("Snapshot "));
  });

  test("a masked tab says so, a kept image is linked in its tab, and the method line names the skipped check", () => {
    const { markdown } = render({
      maskedTabs: ["main"],
      keptImages: { "main/chartsPanel": "main--chartsPanel.jpg" },
      notes: ["A fixed note."],
    });
    expect(markdown).toContain("The guardrail masked personal data in the model's text.");
    expect(markdown).toContain("![chartsPanel](2026-11-06-nightly/main--chartsPanel.jpg)");
    expect(markdown).toContain("Check 7 (AWS link hosts and accounts) did not run.");
    expect(markdown).toContain("A fixed note.");
  });
});
