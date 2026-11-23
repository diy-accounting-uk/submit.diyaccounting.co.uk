// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/testCompanyNumbers.test.js
// Tests invent companies under numbers the Companies House register does not hold (00000001 to
// 00000011, SC000001). These are numbers of companies the register holds, which tests once named
// with invented data; no test names them again.

import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";

const REGISTERED_COMPANY_NUMBERS = {
  "02706061": "SPECIALIST PENSION SERVICES LIMITED",
  "09876543": "SPECIALISED IN TAX ACCOUNTING LTD",
  "SC612345": "SASQUATCH MONITOR LIMITED",
  "07654321": "WEYMOUTH FENCING LTD",
};

const SEARCHED = ["app", "web", "mcp", "behaviour-tests", "scripts", "videos"];

describe("company numbers in tests", () => {
  test.each(Object.entries(REGISTERED_COMPANY_NUMBERS))("no test names %s, the register's %s", (number) => {
    let found = "";
    try {
      found = execFileSync("git", ["grep", "-l", "-w", number, "--", ...SEARCHED, ":!app/unit-tests/lib/testCompanyNumbers.test.js"], {
        encoding: "utf8",
      });
    } catch (error) {
      // git grep exits 1 when nothing matches.
      if (error.status !== 1) throw error;
    }
    expect(found.trim().split("\n").filter(Boolean)).toEqual([]);
  });
});
