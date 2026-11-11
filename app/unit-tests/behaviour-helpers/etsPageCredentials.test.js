// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readEtsPageCredentials } from "../../../behaviour-tests/helpers/etsPageCredentials.js";

const complete = { HMRC_CT_ETS_SENDER_ID: " sender ", HMRC_CT_ETS_PASSWORD: " pass word ", HMRC_CT_ETS_UTR: " 1234567890 " };

describe("behaviour-tests/helpers/etsPageCredentials", () => {
  test("none of the three variables gives null", () => {
    expect(readEtsPageCredentials({})).toBeNull();
    expect(readEtsPageCredentials({ HMRC_CT_ETS_SENDER_ID: "  ", HMRC_CT_ETS_PASSWORD: "", HMRC_CT_ETS_UTR: "" })).toBeNull();
  });

  test("all three give the user ID and UTR trimmed and the password as it is", () => {
    expect(readEtsPageCredentials(complete)).toEqual({ userId: "sender", password: " pass word ", utr: "1234567890" });
  });

  test("a partial set throws and names the missing variable without the values", () => {
    const attempt = () => readEtsPageCredentials({ ...complete, HMRC_CT_ETS_PASSWORD: "" });
    expect(attempt).toThrow("HMRC_CT_ETS_PASSWORD is missing");
    expect(attempt).not.toThrow(/sender|1234567890/);
  });

  test("a UTR that is not 10 digits throws", () => {
    expect(() => readEtsPageCredentials({ ...complete, HMRC_CT_ETS_UTR: "12345" })).toThrow("10 digits");
  });
});
