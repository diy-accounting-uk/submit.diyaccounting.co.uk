// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { ACCOUNT_SETTING_DEFAULTS, resolveAccountSettings, validateAccountSettingsUpdate } from "@app/lib/accountSettings.js";

describe("account settings", () => {
  test("pass generation is on by default", () => {
    expect(ACCOUNT_SETTING_DEFAULTS).toEqual({ passGeneration: true });
    expect(resolveAccountSettings(undefined)).toEqual({ passGeneration: true });
    expect(resolveAccountSettings({})).toEqual({ passGeneration: true });
  });

  test("a stored boolean replaces the default and anything else is ignored", () => {
    expect(resolveAccountSettings({ passGeneration: false })).toEqual({ passGeneration: false });
    expect(resolveAccountSettings({ passGeneration: "no", other: true })).toEqual({ passGeneration: true });
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
  ])("an update of %j is refused", (body, reason) => {
    expect(validateAccountSettingsUpdate(body).errors).toEqual([reason]);
  });
});
