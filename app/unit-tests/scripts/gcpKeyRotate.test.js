// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { parseArgs, parseConfig, planRotation, keyId, writeSecret, PUT_SECRET_SCRIPT } from "../../../scripts/gcp-key-rotate.js";

const CONFIG = `
[service_account]
email = "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com"

  [service_account.key_rotation]
  max_age_days = 90
  secrets = ["ci/submit/ga4/service_account", "prod/submit/ga4/service_account"]
`;

const NOW = new Date("2026-09-16T05:23:00Z");
const daysAgo = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const key = (id, days, disabled = false) => ({
  name: `projects/diyaccounting-ga4/serviceAccounts/ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com/keys/${id}`,
  validAfterTime: daysAgo(days),
  disabled,
});

describe("gcp-key-rotate parseArgs", () => {
  it("defaults to plan mode", () => {
    expect(parseArgs([])).toEqual({ apply: false, secretName: null, maxAgeDays: null, now: null });
  });
  it("needs a secret name to apply", () => {
    expect(() => parseArgs(["--apply"])).toThrow(/--apply needs --secret-name/);
    expect(parseArgs(["--apply", "--secret-name", "prod/submit/ga4/service_account"]).secretName).toBe("prod/submit/ga4/service_account");
  });
  it("reads the age limit and a fixed clock", () => {
    const opts = parseArgs(["--max-age-days", "30", "--now", "2026-09-16T00:00:00Z"]);
    expect(opts.maxAgeDays).toBe(30);
    expect(opts.now.toISOString()).toBe("2026-09-16T00:00:00.000Z");
  });
  it("rejects a non-positive age limit and an unparseable clock", () => {
    expect(() => parseArgs(["--max-age-days", "0"])).toThrow(/positive whole number/);
    expect(() => parseArgs(["--now", "yesterday"])).toThrow(/ISO date/);
  });
});

describe("gcp-key-rotate parseConfig", () => {
  it("reads the email, the age limit and the secrets", () => {
    expect(parseConfig(CONFIG)).toEqual({
      email: "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com",
      maxAgeDays: 90,
      secrets: ["ci/submit/ga4/service_account", "prod/submit/ga4/service_account"],
    });
  });
  it("throws without an age limit", () => {
    expect(() => parseConfig(CONFIG.replace("max_age_days = 90\n", ""))).toThrow(/max_age_days/);
  });
  it("throws without the secrets list", () => {
    expect(() => parseConfig(CONFIG.replace(/secrets = .*\n/, ""))).toThrow(/key_rotation\]\.secrets/);
  });
});

describe("gcp-key-rotate planRotation", () => {
  it("always creates, and touches nothing younger than the limit", () => {
    const plan = planRotation([key("a", 10), key("b", 89)], { maxAgeDays: 90, now: NOW });
    expect(plan).toEqual({ create: true, disable: [], delete: [], keep: [key("a", 10).name, key("b", 89).name] });
  });
  it("disables a live key past the limit and deletes one already disabled", () => {
    const plan = planRotation([key("young", 5), key("old", 91), key("older", 200, true)], { maxAgeDays: 90, now: NOW });
    expect(plan.disable).toEqual([key("old", 91).name]);
    expect(plan.delete).toEqual([key("older", 200, true).name]);
    expect(plan.keep).toEqual([key("young", 5).name]);
  });
  it("never deletes a key it has not disabled first", () => {
    const plan = planRotation([key("old", 400)], { maxAgeDays: 90, now: NOW });
    expect(plan.delete).toEqual([]);
    expect(plan.disable).toEqual([key("old", 400).name]);
  });
});

describe("gcp-key-rotate writeSecret", () => {
  it("hands the secret name and the key to the tagging script, never a log line", () => {
    const calls = [];
    writeSecret("prod/submit/ga4/service_account", '{"private_key":"x"}', (file, args) => {
      calls.push([file, args]);
      return { status: 0 };
    });
    expect(calls).toEqual([["bash", [PUT_SECRET_SCRIPT, "prod/submit/ga4/service_account", '{"private_key":"x"}']]]);
  });
  it("throws when the tagging script fails", () => {
    expect(() => writeSecret("prod/submit/ga4/service_account", "{}", () => ({ status: 1 }))).toThrow(/exited 1/);
  });
});

describe("gcp-key-rotate keyId", () => {
  it("is the last segment of the resource name", () => {
    expect(keyId(key("abc123", 1).name)).toBe("abc123");
  });
});
