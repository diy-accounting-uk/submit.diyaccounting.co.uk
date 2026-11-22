// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  ACCOUNT_SETTING_DEFAULTS,
  WATCH_LIST_CAP,
  resolveAccountSettings,
  validateAccountSettingsUpdate,
} from "@app/lib/accountSettings.js";

describe("account settings", () => {
  test("pass generation is on and the watch list empty by default", () => {
    expect(ACCOUNT_SETTING_DEFAULTS).toEqual({ passGeneration: true, watchedCompanies: [] });
    expect(resolveAccountSettings(undefined)).toEqual({ passGeneration: true, watchedCompanies: [] });
    expect(resolveAccountSettings({})).toEqual({ passGeneration: true, watchedCompanies: [] });
  });

  test("a stored valid value replaces the default and anything else is ignored", () => {
    expect(resolveAccountSettings({ passGeneration: false })).toEqual({ passGeneration: false, watchedCompanies: [] });
    expect(resolveAccountSettings({ passGeneration: "no", other: true })).toEqual({ passGeneration: true, watchedCompanies: [] });
    expect(resolveAccountSettings({ watchedCompanies: ["00000001", "SC000000"] }).watchedCompanies).toEqual(["00000001", "SC000000"]);
    expect(resolveAccountSettings({ watchedCompanies: "00000001" }).watchedCompanies).toEqual([]);
  });

  test("the default watch list is a fresh list each time", () => {
    resolveAccountSettings(undefined).watchedCompanies.push("00000001");
    expect(resolveAccountSettings(undefined).watchedCompanies).toEqual([]);
  });

  test("an update of the watch list takes company numbers up to the cap", () => {
    const full = Array.from({ length: WATCH_LIST_CAP }, (_, index) => String(index + 1).padStart(8, "0"));
    expect(WATCH_LIST_CAP).toBe(50);
    expect(validateAccountSettingsUpdate({ watchedCompanies: full })).toEqual({ update: { watchedCompanies: full }, errors: [] });
    expect(validateAccountSettingsUpdate({ watchedCompanies: [] })).toEqual({ update: { watchedCompanies: [] }, errors: [] });
  });

  test("an update names known settings with boolean values", () => {
    expect(validateAccountSettingsUpdate({ passGeneration: false })).toEqual({ update: { passGeneration: false }, errors: [] });
  });

  test.each([
    [{ passGeneration: "off" }, "Setting passGeneration must be true or false"],
    [{ colour: true }, "Unknown setting: colour"],
    [{}, "Request body names no setting"],
    [null, "Request body must be a JSON object of settings"],
    [[true], "Request body must be a JSON object of settings"],
    [{ watchedCompanies: "00000001" }, "Setting watchedCompanies must be a list of company numbers"],
    [{ watchedCompanies: ["00000001", "1"] }, "Setting watchedCompanies must hold 8-character company numbers only"],
    [{ watchedCompanies: [{ companyNumber: "00000001" }] }, "Setting watchedCompanies must hold 8-character company numbers only"],
    [{ watchedCompanies: ["00000001", "00000001"] }, "Setting watchedCompanies must not repeat a company number"],
    [
      { watchedCompanies: Array.from({ length: 51 }, (_, index) => String(index + 1).padStart(8, "0")) },
      "Setting watchedCompanies holds at most 50 companies",
    ],
  ])("an update of %j is refused", (body, reason) => {
    expect(validateAccountSettingsUpdate(body).errors).toEqual([reason]);
  });
});
