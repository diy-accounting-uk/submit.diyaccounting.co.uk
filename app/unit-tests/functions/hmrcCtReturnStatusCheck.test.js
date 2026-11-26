// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcCtReturnStatusCheck.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";

const mockCheck = vi.fn();
vi.mock("@app/services/hmrcCtPendingReturnCheck.js", () => ({ checkPendingCtReturns: (...args) => mockCheck(...args) }));
vi.mock("@app/services/subHasher.js", () => ({ initializeSalt: vi.fn().mockResolvedValue(undefined) }));

import { handler } from "@app/functions/hmrc/hmrcCtReturnStatusCheck.js";

const REQUIRED = ["RECEIPTS_DYNAMODB_TABLE_NAME", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME", "MCP_OAUTH_BLOB_KEY_SECRET_ARN"];

describe("hmrcCtReturnStatusCheck handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const name of REQUIRED) process.env[name] = `test-${name}`;
  });

  test("runs the check and returns what it found", async () => {
    mockCheck.mockResolvedValue({ checked: 1, outcomes: [{ correlationId: "A1", outcome: "pending" }] });
    await expect(handler()).resolves.toEqual({ checked: 1, outcomes: [{ correlationId: "A1", outcome: "pending" }] });
  });

  test.each(REQUIRED)("refuses to run without %s", async (name) => {
    delete process.env[name];
    await expect(handler()).rejects.toThrow(name);
    expect(mockCheck).not.toHaveBeenCalled();
  });
});
