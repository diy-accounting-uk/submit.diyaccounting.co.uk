// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { parseArgs, planEnables, parseConfig, DEFAULT_PROJECT } from "../../../scripts/gcp-enable-apis.js";

const SAMPLE_SERVICES = [
  "serviceusage.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "analyticsadmin.googleapis.com",
  "cloudbilling.googleapis.com",
];

describe("gcp-enable-apis parseArgs", () => {
  it("defaults to the GA4 project and plan mode", () => {
    expect(parseArgs([])).toEqual({ apply: false, project: DEFAULT_PROJECT });
  });
  it("reads --apply and --project", () => {
    expect(parseArgs(["--apply", "--project", "other"])).toEqual({ apply: true, project: "other" });
  });
  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("gcp-enable-apis parseConfig", () => {
  it("reads the services list from [apis].services", () => {
    const toml = `[apis]\nservices = ["serviceusage.googleapis.com", "bigquery.googleapis.com"]\n`;
    expect(parseConfig(toml)).toEqual(["serviceusage.googleapis.com", "bigquery.googleapis.com"]);
  });
  it("throws when [apis].services is missing", () => {
    expect(() => parseConfig("[service_account]\nemail = \"a@b.iam.gserviceaccount.com\"\n")).toThrow(/apis\]\.services/);
  });
  it("throws when [apis].services is empty", () => {
    expect(() => parseConfig("[apis]\nservices = []\n")).toThrow(/apis\]\.services/);
  });
});

describe("gcp-enable-apis planEnables", () => {
  it("enables only the services that are not already enabled", () => {
    const states = Object.fromEntries(SAMPLE_SERVICES.map((s) => [s, "ENABLED"]));
    states["analyticsadmin.googleapis.com"] = "DISABLED";
    delete states["cloudbilling.googleapis.com"];
    const plan = planEnables(states, SAMPLE_SERVICES);
    expect(plan.filter((p) => p.enable).map((p) => p.service)).toEqual(["analyticsadmin.googleapis.com", "cloudbilling.googleapis.com"]);
    expect(plan.find((p) => p.service === "cloudbilling.googleapis.com").state).toBe("UNKNOWN");
  });
  it("plans nothing when everything is enabled", () => {
    const states = Object.fromEntries(SAMPLE_SERVICES.map((s) => [s, "ENABLED"]));
    expect(planEnables(states, SAMPLE_SERVICES).some((p) => p.enable)).toBe(false);
  });
});
