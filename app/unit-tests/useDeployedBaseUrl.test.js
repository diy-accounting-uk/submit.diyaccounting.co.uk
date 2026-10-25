// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { parseDeployedBaseUrl, resolveDeployedBaseUrl } from "../../scripts/use-deployed-base-url.js";

describe("use-deployed-base-url", () => {
  test("reads DIY_SUBMIT_BASE_URL from submit.env text", () => {
    const text = "ENVIRONMENT_NAME=ci\nDIY_SUBMIT_BASE_URL=https://ci-set1.submit.diyaccounting.co.uk/\nOTHER=1\n";
    expect(parseDeployedBaseUrl(text)).toBe("https://ci-set1.submit.diyaccounting.co.uk/");
  });

  test("returns null when the text has no base URL", () => {
    expect(parseDeployedBaseUrl("A=1\n")).toBeNull();
  });

  test("resolves the deployment host when the configured host is the apex alias", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, text: async () => "DIY_SUBMIT_BASE_URL=https://ci-set1.submit.diyaccounting.co.uk/\n" };
    };
    const deployed = await resolveDeployedBaseUrl("https://ci-submit.diyaccounting.co.uk/", fetchImpl);
    expect(calls).toEqual(["https://ci-submit.diyaccounting.co.uk/submit.env"]);
    expect(deployed).toBe("https://ci-set1.submit.diyaccounting.co.uk/");
  });

  test("throws when submit.env cannot be read", async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "" });
    await expect(resolveDeployedBaseUrl("https://ci-submit.diyaccounting.co.uk/", fetchImpl)).rejects.toThrow("404");
  });
});
