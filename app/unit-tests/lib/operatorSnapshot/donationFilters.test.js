// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { STRIPE_DONATION_PRODUCT_FILTER, PAYPAL_DONATION_PRODUCT_FILTER } from "@app/lib/operatorSnapshot/donationFilters.js";

describe("donationFilters", () => {
  test("the Stripe filter names the four donation bundle ids", () => {
    for (const id of ["donation-10", "donation-20", "donation-45", "donation-custom"]) {
      expect(STRIPE_DONATION_PRODUCT_FILTER).toContain(`'${id}'`);
    }
  });

  test("the PayPal filter names the PayPal donation label", () => {
    expect(PAYPAL_DONATION_PRODUCT_FILTER).toBe("product = 'donation-paypal'");
  });
});
