// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/toggle-cognito-native-auth.test.js

import { describe, test, expect } from "vitest";

import { parseArgs } from "../../../scripts/toggle-cognito-native-auth.js";

describe("parseArgs", () => {
  test("reads the action and environment with the default client", () => {
    const opts = parseArgs(["enable", "ci"]);
    expect(opts).toEqual({ action: "enable", environmentName: "ci", client: "both" });
  });

  test("defaults the environment to ci when omitted", () => {
    const opts = parseArgs(["disable"]);
    expect(opts.environmentName).toBe("ci");
  });

  test("reads --client diya-gl", () => {
    const opts = parseArgs(["enable", "prod", "--client", "diya-gl"]);
    expect(opts.client).toBe("diya-gl");
  });

  test("normalises --client books to diya-gl", () => {
    const opts = parseArgs(["enable", "prod", "--client", "books"]);
    expect(opts.client).toBe("diya-gl");
  });

  test("leaves --client app and --client both unchanged", () => {
    expect(parseArgs(["enable", "ci", "--client", "app"]).client).toBe("app");
    expect(parseArgs(["enable", "ci", "--client", "both"]).client).toBe("both");
  });
});
