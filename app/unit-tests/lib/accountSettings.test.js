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

  test("the watch list is capped at 50 companies", () => {
    expect(WATCH_LIST_CAP).toBe(50);
  });

  test("an update names pass generation with a boolean value", () => {
    expect(validateAccountSettingsUpdate({ passGeneration: false })).toEqual({
      update: { passGeneration: false },
      watchListOperation: null,
      errors: [],
    });
  });

  test.each([
    [{ watchList: { add: "00000001" } }, { op: "add", companyNumber: "00000001" }],
    [{ watchList: { remove: "SC000000" } }, { op: "remove", companyNumber: "SC000000" }],
  ])("a watch list operation %j names one company", (body, operation) => {
    expect(validateAccountSettingsUpdate(body)).toEqual({ update: {}, watchListOperation: operation, errors: [] });
  });

  test.each([
    [{ passGeneration: "off" }, "Setting passGeneration must be true or false"],
    [{ colour: true }, "Unknown setting: colour"],
    [{}, "Request body names no setting"],
    [null, "Request body must be a JSON object of settings"],
    [[true], "Request body must be a JSON object of settings"],
    [{ watchedCompanies: ["00000001"] }, "Setting watchedCompanies changes one company at a time through watchList"],
    [{ watchList: { add: "1" } }, "watchList takes an 8-character company number"],
    [
      { watchList: { add: "00000001", remove: "00000002" } },
      'watchList must be { "add": "<company number>" } or { "remove": "<company number>" }',
    ],
    [{ watchList: "00000001" }, 'watchList must be { "add": "<company number>" } or { "remove": "<company number>" }'],
    [{ watchList: { replace: ["00000001"] } }, 'watchList must be { "add": "<company number>" } or { "remove": "<company number>" }'],
  ])("an update of %j is refused", (body, reason) => {
    expect(validateAccountSettingsUpdate(body).errors).toEqual([reason]);
  });
});
