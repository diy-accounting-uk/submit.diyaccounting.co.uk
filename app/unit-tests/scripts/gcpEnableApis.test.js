// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect } from "vitest";
import { parseArgs, planEnables, REQUIRED_SERVICES, DEFAULT_PROJECT } from "../../../scripts/gcp-enable-apis.js";

describe("gcp-enable-apis parseArgs", () => {
  it("defaults to the GA4 project and a real run", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, project: DEFAULT_PROJECT });
  });
  it("reads --dry-run and --project", () => {
    expect(parseArgs(["--dry-run", "--project", "other"])).toEqual({ dryRun: true, project: "other" });
  });
  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("gcp-enable-apis planEnables", () => {
  it("enables only the services that are not already enabled", () => {
    const states = Object.fromEntries(REQUIRED_SERVICES.map((s) => [s, "ENABLED"]));
    states["analyticsadmin.googleapis.com"] = "DISABLED";
    delete states["cloudbilling.googleapis.com"];
    const plan = planEnables(states);
    expect(plan.filter((p) => p.enable).map((p) => p.service)).toEqual(["analyticsadmin.googleapis.com", "cloudbilling.googleapis.com"]);
    expect(plan.find((p) => p.service === "cloudbilling.googleapis.com").state).toBe("UNKNOWN");
  });
  it("plans nothing when everything is enabled", () => {
    const states = Object.fromEntries(REQUIRED_SERVICES.map((s) => [s, "ENABLED"]));
    expect(planEnables(states).some((p) => p.enable)).toBe(false);
  });
});
