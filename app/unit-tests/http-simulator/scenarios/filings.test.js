// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/filings.test.js

import { describe, test, expect } from "vitest";
import { openTransaction, closeTransaction, putResource } from "@app/http-simulator/scenarios/filings.js";

const COMPANIES_HOUSE_ID = /^\d{6}-\d{6}-\d{6}$/;

describe("the simulator's Companies House transactions", () => {
  test("a transaction and the submission it closes into carry ids in the shape Companies House gives", () => {
    const { id } = openTransaction({ companyNumber: "00000004", description: "Change of registered email address" });
    expect(id).toMatch(COMPANIES_HOUSE_ID);
    putResource(id, "registered-email-address", { registered_email_address: "eleanor.bramwell@test.diyaccounting.co.uk" });
    const { transaction } = closeTransaction(id);
    const [submissionId] = Object.keys(transaction.filings);
    expect(submissionId).toMatch(COMPANIES_HOUSE_ID);
  });
});
