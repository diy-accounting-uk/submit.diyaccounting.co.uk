// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readCriteria, CHECK_OWNERS } from "../../../scripts/dashboard-review-criteria.mjs";

const skillText = readFileSync(new URL("../../../.claude/skills/dashboard-review/SKILL.md", import.meta.url), "utf8");
const criteria = readCriteria(skillText);

describe("dashboard review criteria", () => {
  it("gives every numbered check an owner of code or model", () => {
    for (const check of criteria.checks) {
      expect(["code", "model"], check.title).toContain(CHECK_OWNERS[check.title]);
    }
  });

  it("names no owner for a check the skill does not have", () => {
    const titles = criteria.checks.map((check) => check.title).sort();
    expect(Object.keys(CHECK_OWNERS).sort()).toEqual(titles);
  });

  it("numbers the checks from 1 without a gap", () => {
    expect(criteria.checks.map((check) => check.number)).toEqual(criteria.checks.map((_, index) => index + 1));
  });

  it("reads each check's tabs", () => {
    const byTitle = Object.fromEntries(criteria.checks.map((check) => [check.title, check.tabs]));
    expect(byTitle.Freshness).toEqual(["all"]);
    expect(byTitle.Alarms).toEqual(["ops", "aws-prod", "aws-ci"]);
  });

  it("reads the tag table with each tag's list", () => {
    expect(criteria.tags).toEqual([
      { tag: "fault", list: "improvement" },
      { tag: "stale", list: "improvement" },
      { tag: "gap", list: "improvement" },
      { tag: "movement", list: "observation" },
      { tag: "target", list: "observation" },
    ]);
  });

  it("keeps the criteria text between the markers and drops the markers", () => {
    expect(criteria.criteriaText).toContain("Dashboard improvements");
    expect(criteria.criteriaText).toContain("**Freshness**");
    expect(criteria.criteriaText).not.toContain("review-criteria");
  });

  it("reads the snapshot-to-panel map", () => {
    expect(criteria.sectionMap.length).toBeGreaterThan(10);
    expect(criteria.sectionMap[0]).toEqual({ section: "dailyCharts", tabs: ["main"], panels: ["chartsPanel"] });
    const affiliates = criteria.sectionMap.find((row) => row.section === "affiliateGroups");
    expect(affiliates.tabs).toEqual(["affiliates"]);
  });

  it.each(["<!-- review-criteria:start -->", "<!-- review-criteria:end -->", "<!-- review-map:start -->", "<!-- review-map:end -->"])(
    "throws when the marker %s is missing",
    (marker) => {
      expect(() => readCriteria(skillText.replace(marker, ""))).toThrow(marker);
    },
  );
});
