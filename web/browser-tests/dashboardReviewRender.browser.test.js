// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/dashboardReviewRender.browser.test.js
// The dashboard review's render: the page drawn from stored data, with no sign-in and no write.

import { test, expect } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import { renderDashboard } from "../../scripts/dashboard-review-render.mjs";
import { runCodeChecks } from "../../scripts/dashboard-review-checks.mjs";
import { snapshotAnswer } from "../../scripts/dashboard-review-data.mjs";
import { fullShapeSnapshot, FIXTURE_CONSOLE_INDEX, PIXEL_PNG } from "./operatorDashboardFixtures.js";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const TABS = ["main", "adoption", "behaviour", "integrations", "data", "ops", "affiliates", "aws-prod", "aws-ci"];

function fixtureData() {
  const images = new Map();
  for (const [id, item] of Object.entries(FIXTURE_CONSOLE_INDEX.items)) {
    if (item.imageKey) images.set(id, PIXEL_PNG);
  }
  return {
    snapshot: fullShapeSnapshot(),
    consoleIndex: FIXTURE_CONSOLE_INDEX,
    images,
    heldPasses: [
      {
        code: "tiger-happy-mountain-silver",
        issuedBy: "9f2c4e7a1b3d",
        useCount: 1000,
        reviewLimit: 1000,
        heldAt: "2026-10-30T09:15:00.000Z",
      },
    ],
  };
}

// A copy of web/public whose operator/dashboard.html is changed by `change`; every other file is a link.
function publicCopy(change) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-public-"));
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    if (name !== "operator") fs.symlinkSync(path.join(PUBLIC_DIR, name), path.join(root, name));
  }
  fs.mkdirSync(path.join(root, "operator"));
  for (const name of fs.readdirSync(path.join(PUBLIC_DIR, "operator"))) {
    if (name !== "dashboard.html") fs.symlinkSync(path.join(PUBLIC_DIR, "operator", name), path.join(root, "operator", name));
  }
  const html = fs.readFileSync(path.join(PUBLIC_DIR, "operator/dashboard.html"), "utf-8");
  fs.writeFileSync(path.join(root, "operator/dashboard.html"), change(html));
  return root;
}

test.describe("Dashboard review render", () => {
  test.setTimeout(120000);

  test("finds the nine tabs, their panels, one image for each capture item, and no request outside localhost", async () => {
    const { dom, screenshots } = await renderDashboard({ publicDir: PUBLIC_DIR, data: fixtureData() });

    expect(dom.tabs).toEqual(TABS);
    expect(dom.panels.map((panel) => panel.id)).toEqual(
      expect.arrayContaining(["chartsPanel", "table-uptime", "awsLinksPanel", "heldPassesPanel"]),
    );
    expect(dom.rows.length).toBeGreaterThan(0);
    for (const tab of TABS.slice(0, 7)) {
      expect(screenshots.some((shot) => shot.tabId === tab && shot.kind === "panel")).toBe(true);
    }

    const captureShots = screenshots.filter((shot) => shot.kind === "capture");
    const captureIdsOnPage = dom.captures.map((capture) => `${capture.tabId}/${capture.captureId}`);
    expect(captureShots.map((shot) => `${shot.tabId}/${shot.captureId}`).sort()).toEqual([...captureIdsOnPage].sort());
    expect(captureShots.length).toBeGreaterThan(0);
    for (const shot of screenshots) {
      expect(shot.png.subarray(1, 4).toString()).toBe("PNG");
    }

    expect(dom.requestOrigins).toEqual(["http://localhost:3000"]);
    expect(dom.abortedOrigins).toEqual([]);
    expect(dom.unansweredApis).toEqual([]);
    expect(dom.freshness.meta).toContain("Generated");
  });

  test("checks its expected cell texts against the page", async () => {
    const { dom } = await renderDashboard({ publicDir: PUBLIC_DIR, data: fixtureData() });
    const checked = dom.rows.filter((row) => row.expected && row.cells.length === 8);
    expect(checked.length).toBeGreaterThan(0);
    const disagreements = runCodeChecks({
      snapshot: snapshotAnswer(fixtureData()),
      dom,
      alarms: [],
      sectionMap: [],
      now: Date.parse("2026-09-29T08:00:00.000Z"),
    }).filter((found) => found.check === 2);
    expect(disagreements).toEqual([]);
  });

  test("a snapshot answer matches the Lambda's shape", () => {
    const data = fixtureData();
    expect(snapshotAnswer(data).console).toBe(FIXTURE_CONSOLE_INDEX);
    expect(snapshotAnswer({ ...data, consoleIndex: null })).toBe(data.snapshot);
  });

  test("a page write fails the render", async () => {
    const root = publicCopy((html) =>
      html.replace("</body>", '<script>fetch("/api/v1/pass/release", { method: "POST", body: "{}" }).catch(() => {});</script></body>'),
    );
    try {
      await expect(renderDashboard({ publicDir: root, data: fixtureData() })).rejects.toThrow("refused-write");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a request to another origin is aborted", async () => {
    const root = publicCopy((html) =>
      html.replace("</body>", '<script>fetch("https://example.invalid/x").catch(() => {});</script></body>'),
    );
    try {
      const { dom } = await renderDashboard({ publicDir: root, data: fixtureData() });
      expect(dom.abortedOrigins).toEqual(["https://example.invalid"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a tab added to the page is read with no change to the render", async () => {
    const root = publicCopy((html) =>
      html
        .replace(
          '<button type="button" class="dashboard-tab" data-tab-id="aws-ci"',
          '<button type="button" class="dashboard-tab" data-tab-id="extra" aria-pressed="false">Extra</button>\n        <button type="button" class="dashboard-tab" data-tab-id="aws-ci"',
        )
        .replace(
          '<div id="objectivesContainer">',
          '<section id="extraPanel" class="objective" data-tab="extra"><h2>Extra panel</h2><p>Added panel.</p></section>\n      <div id="objectivesContainer">',
        ),
    );
    try {
      const { dom, screenshots } = await renderDashboard({ publicDir: root, data: fixtureData() });
      expect(dom.tabs).toHaveLength(TABS.length + 1);
      expect(dom.tabs).toContain("extra");
      expect(screenshots.some((shot) => shot.tabId === "extra" && shot.panelId === "extraPanel")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
