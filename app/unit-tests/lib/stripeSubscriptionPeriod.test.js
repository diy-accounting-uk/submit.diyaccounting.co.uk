// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { cancelsAtPeriodEnd } from "@app/lib/stripeSubscriptionPeriod.js";

const withItem = (fields) => ({ items: { data: [{ current_period_end: 2000 }] }, ...fields });

describe("cancelsAtPeriodEnd", () => {
  test("is true when cancel_at_period_end is set", () => {
    expect(cancelsAtPeriodEnd(withItem({ cancel_at_period_end: true }))).toBe(true);
  });

  test("is true when cancel_at is the period end or earlier", () => {
    expect(cancelsAtPeriodEnd(withItem({ cancel_at: 2000 }))).toBe(true);
    expect(cancelsAtPeriodEnd(withItem({ cancel_at: 1500 }))).toBe(true);
  });

  test("is false when cancel_at is after the period end", () => {
    expect(cancelsAtPeriodEnd(withItem({ cancel_at: 2001 }))).toBe(false);
  });

  test("is false when nothing is scheduled", () => {
    expect(cancelsAtPeriodEnd(withItem({ cancel_at: null, cancel_at_period_end: false }))).toBe(false);
    expect(cancelsAtPeriodEnd({})).toBe(false);
  });

  test("is false when cancel_at is set and the period end is unknown", () => {
    expect(cancelsAtPeriodEnd({ cancel_at: 2000 })).toBe(false);
  });

  test("reads a period end carried on the subscription itself", () => {
    expect(cancelsAtPeriodEnd({ current_period_end: 2000, cancel_at: 2000 })).toBe(true);
  });
});
