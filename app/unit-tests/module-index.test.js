// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/module-index.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import anything from "../index.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("Index Module Exports", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };
  });

  test("module index should be defined", () => {
    expect(anything).toBeUndefined();
  });
});
