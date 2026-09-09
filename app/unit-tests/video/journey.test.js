// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/journey.test.js

import { describe, test, expect } from "vitest";
import { resolveHmrcTestUser } from "../../../scripts/lib/video/journey.js";

const baseEnv = {
  TEST_HMRC_USERNAME: "user123456789",
  TEST_HMRC_PASSWORD: "correcthorsebatterystaple",
  TEST_HMRC_VAT_NUMBER: "193054661",
};

describe("resolveHmrcTestUser", () => {
  test("defaults hmrcServices to mtd-vat when the script names none, and resolves no nino", async () => {
    const user = await resolveHmrcTestUser(baseEnv);
    expect(user.vatNumber).toBe("193054661");
    expect(user.nino).toBeUndefined();
  });

  test("resolves TEST_HMRC_NINO when the script's hmrcServices asks for mtd-income-tax", async () => {
    const env = { ...baseEnv, TEST_HMRC_NINO: "AB123456C" };
    const user = await resolveHmrcTestUser(env, ["mtd-vat", "mtd-income-tax"]);
    expect(user.nino).toBe("AB123456C");
  });

  test("ignores TEST_HMRC_NINO when the script never asked for mtd-income-tax", async () => {
    const env = { ...baseEnv, TEST_HMRC_NINO: "AB123456C" };
    const user = await resolveHmrcTestUser(env, ["mtd-vat"]);
    expect(user.nino).toBeUndefined();
  });

  test("refuses to resolve when the script asks for mtd-income-tax but TEST_HMRC_NINO is missing", async () => {
    await expect(resolveHmrcTestUser(baseEnv, ["mtd-vat", "mtd-income-tax"])).rejects.toThrow(/TEST_HMRC_NINO/);
  });
});
