// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { AWS_ACCOUNT_NAMES_BY_ID, AWS_ACCOUNT_IDS_BY_NAME } from "@app/lib/operatorSnapshot/awsAccounts.js";

describe("awsAccounts", () => {
  test("the id lookup inverts the name lookup", () => {
    for (const [id, name] of Object.entries(AWS_ACCOUNT_NAMES_BY_ID)) {
      expect(AWS_ACCOUNT_IDS_BY_NAME[name]).toBe(id);
    }
    expect(AWS_ACCOUNT_IDS_BY_NAME["submit-prod"]).toBe("972912397388");
  });
});
