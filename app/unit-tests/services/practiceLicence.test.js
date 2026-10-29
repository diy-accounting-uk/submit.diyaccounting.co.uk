// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { holdsPracticeLicence } from "../../services/practiceLicence.js";

const past = new Date(Date.now() - 1000).toISOString();
const future = new Date(Date.now() + 86400000).toISOString();

describe("holdsPracticeLicence", () => {
  test("holds it for an active resident-pro subscription", () => {
    expect(holdsPracticeLicence([{ bundleId: "resident-pro", subscriptionStatus: "active" }])).toBe(true);
  });

  test("holds it for a resident-pro-comp pass", () => {
    expect(holdsPracticeLicence([{ bundleId: "resident-pro-comp" }])).toBe(true);
    expect(holdsPracticeLicence([{ bundleId: "resident-pro-comp", expiry: future }])).toBe(true);
  });

  test("does not hold it for an expired resident-pro-comp pass", () => {
    expect(holdsPracticeLicence([{ bundleId: "resident-pro-comp", expiry: past }])).toBe(false);
  });

  test("does not hold it for a lapsed or expired resident-pro subscription", () => {
    expect(holdsPracticeLicence([{ bundleId: "resident-pro", subscriptionStatus: "cancelled" }])).toBe(false);
    expect(holdsPracticeLicence([{ bundleId: "resident-pro", subscriptionStatus: "active", expiry: past }])).toBe(false);
  });

  test("does not hold it for other bundles or none", () => {
    expect(holdsPracticeLicence([{ bundleId: "resident" }])).toBe(false);
    expect(holdsPracticeLicence([])).toBe(false);
  });
});
