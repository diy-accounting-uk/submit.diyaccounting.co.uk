// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import { describe, it, expect } from "vitest";
import {
  parseArgs,
  parseConfig,
  restrictionsFor,
  restrictionsMatch,
  planKey,
  applyGithubVariable,
} from "../../../infra/google/gcp/google-api-keys.js";

const TOML = `
[project]
id = "p"
number = 1

[[key]]
id = "k"
display_name = "Key"
github_variable = "VAR"
api_services = ["drive.googleapis.com", "picker.googleapis.com"]
allowed_referrers = ["https://a.example/*", "https://b.example/*"]
`;

const key = parseConfig(TOML).keys[0];

function liveKey(overrides = {}) {
  return {
    name: "projects/1/locations/global/keys/k",
    displayName: "Key",
    restrictions: {
      browserKeyRestrictions: { allowedReferrers: ["https://b.example/*", "https://a.example/*"] },
      apiTargets: [{ service: "picker.googleapis.com" }, { service: "drive.googleapis.com" }],
    },
    ...overrides,
  };
}

describe("google-api-keys parseArgs", () => {
  it("defaults to plan mode and reads --apply", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseArgs(["--x"])).toThrow(/Unknown argument/);
  });
});

describe("google-api-keys parseConfig", () => {
  it("reads the project and keys", () => {
    expect(parseConfig(TOML).projectNumber).toBe("1");
    expect(key.apiServices).toHaveLength(2);
  });
  it("refuses a key with no referrers or no API targets", () => {
    expect(() => parseConfig(TOML.replace(/allowed_referrers = .*/, "allowed_referrers = []"))).toThrow(/unrestricted/);
    expect(() => parseConfig(TOML.replace(/api_services = .*/, "api_services = []"))).toThrow(/unrestricted/);
  });
  it("declares Drive and Picker with the site, ci, diya-gl and docs referrers", () => {
    const declared = parseConfig(fs.readFileSync("infra/google/gcp/api-keys.toml", "utf-8")).keys[0];
    expect(declared.apiServices).toEqual(["drive.googleapis.com", "picker.googleapis.com"]);
    expect(declared.allowedReferrers).toEqual(
      expect.arrayContaining([
        "https://submit.diyaccounting.co.uk/*",
        "https://ci-set1.submit.diyaccounting.co.uk/*",
        "https://ci-set2.submit.diyaccounting.co.uk/*",
        "https://diya-gl.co.uk/*",
        "https://ci.diya-gl.co.uk/*",
        "https://docs.google.com/*",
      ]),
    );
  });
});

describe("google-api-keys restrictions", () => {
  it("builds browser referrer and API target restrictions", () => {
    expect(restrictionsFor(key)).toEqual({
      browserKeyRestrictions: { allowedReferrers: ["https://a.example/*", "https://b.example/*"] },
      apiTargets: [{ service: "drive.googleapis.com" }, { service: "picker.googleapis.com" }],
    });
  });
  it("matches a live key regardless of order", () => {
    expect(restrictionsMatch(key, liveKey())).toBe(true);
  });
  it("differs on a missing referrer, an extra API, a method narrowing, another restriction type or a name", () => {
    const base = liveKey();
    expect(
      restrictionsMatch(
        key,
        liveKey({ restrictions: { ...base.restrictions, browserKeyRestrictions: { allowedReferrers: ["https://a.example/*"] } } }),
      ),
    ).toBe(false);
    expect(
      restrictionsMatch(
        key,
        liveKey({
          restrictions: { ...base.restrictions, apiTargets: [...base.restrictions.apiTargets, { service: "gmail.googleapis.com" }] },
        }),
      ),
    ).toBe(false);
    expect(
      restrictionsMatch(
        key,
        liveKey({
          restrictions: {
            ...base.restrictions,
            apiTargets: [{ service: "drive.googleapis.com", methods: ["x"] }, { service: "picker.googleapis.com" }],
          },
        }),
      ),
    ).toBe(false);
    expect(
      restrictionsMatch(key, liveKey({ restrictions: { ...base.restrictions, serverKeyRestrictions: { allowedIps: ["1.1.1.1"] } } })),
    ).toBe(false);
    expect(restrictionsMatch(key, liveKey({ displayName: "Other" }))).toBe(false);
    expect(restrictionsMatch(key, liveKey({ restrictions: {} }))).toBe(false);
  });
});

describe("google-api-keys planKey", () => {
  it("creates a key that is not live", () => {
    expect(planKey(key, []).action).toBe("create");
    expect(planKey(key, [{ name: "projects/1/locations/global/keys/other" }]).action).toBe("create");
  });
  it("leaves a matching key alone and updates a differing one", () => {
    expect(planKey(key, [liveKey()])).toMatchObject({ action: "noop", liveName: "projects/1/locations/global/keys/k" });
    expect(planKey(key, [liveKey({ displayName: "Other" })]).action).toBe("update");
  });
});

describe("google-api-keys applyGithubVariable", () => {
  it("sets the variable and returns no finding", () => {
    const calls = [];
    expect(applyGithubVariable(key, "1", "SECRET", (name, value) => calls.push([name, value]))).toBeNull();
    expect(calls).toEqual([["VAR", "SECRET"]]);
  });
  it("returns a finding that never contains the key string when the token is forbidden", () => {
    const forbidden = () => {
      throw Object.assign(new Error("HTTP 403: Resource not accessible by integration"), { stderr: "" });
    };
    const finding = applyGithubVariable(key, "1", "SECRET", forbidden);
    expect(finding).toContain("VAR");
    expect(finding).not.toContain("SECRET");
  });
  it("rethrows any other failure", () => {
    expect(() =>
      applyGithubVariable(key, "1", "SECRET", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
  });
});
