// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { loadFixedRunningCosts } from "../../lib/runningCosts.js";

describe("loadFixedRunningCosts", () => {
  test("reads running-costs.toml, which starts with no suppliers", () => {
    expect(loadFixedRunningCosts()).toEqual({ suppliers: [], monthlyTotalGbp: 0 });
  });
});
