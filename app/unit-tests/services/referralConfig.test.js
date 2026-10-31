// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { loadReferralConfig, validateReferralConfig, getTier, resolveTierId } from "@app/services/referralConfig.js";

const credit = { id: "customer", form: "credit", rateBps: 3000, months: 12, holdDays: 30, capCreditMonths: 12 };
const cash = { id: "casual", form: "cash", rateBps: 3000, months: 12, holdDays: 120 };
const valid = () => ({ ledger: { defaultTier: "customer" }, tiers: [{ ...credit }, { ...cash }] });

describe("services/referralConfig", () => {
  test("the real file loads with the four tiers", () => {
    const config = loadReferralConfig();
    expect(config.tiers.map((t) => t.id)).toEqual(["customer", "casual", "creator", "family"]);
    expect(config.ledger.defaultTier).toBe("customer");
    expect(getTier(config, "family").rateBps).toBe(10000);
  });

  test("the real file keeps the cash payout switched off and gives each connect tier a minimum payout", () => {
    const config = loadReferralConfig();
    expect(config.ledger.payCash).toBe(false);
    for (const tier of config.tiers.filter((t) => t.payout === "connect")) {
      expect(tier.minPayoutPence).toBeGreaterThan(0);
    }
  });

  test("a connect tier without minPayoutPence is refused", () => {
    const config = valid();
    config.tiers[1].payout = "connect";
    expect(() => validateReferralConfig(config)).toThrow(/connect tier 'casual' must be cash with a positive integer minPayoutPence/);
    config.tiers[1].minPayoutPence = 2000;
    expect(() => validateReferralConfig(config)).not.toThrow();
  });

  test("a duplicate tier id is refused", () => {
    const config = valid();
    config.tiers.push({ ...cash });
    expect(() => validateReferralConfig(config)).toThrow(/duplicate tier id 'casual'/);
  });

  test("a form other than credit or cash is refused", () => {
    const config = valid();
    config.tiers[1].form = "voucher";
    expect(() => validateReferralConfig(config)).toThrow(/form must be credit or cash/);
  });

  test.each(["rateBps", "months", "holdDays"])("%s that is not a positive integer is refused", (field) => {
    for (const bad of [0, -1, 1.5, "3"]) {
      const config = valid();
      config.tiers[1][field] = bad;
      expect(() => validateReferralConfig(config)).toThrow(new RegExp(`${field} must be a positive integer`));
    }
  });

  test("a credit tier without capCreditMonths is refused", () => {
    const config = valid();
    delete config.tiers[0].capCreditMonths;
    expect(() => validateReferralConfig(config)).toThrow(/needs capCreditMonths/);
  });

  test("a default tier with no tier is refused", () => {
    const config = valid();
    config.ledger.defaultTier = "missing";
    expect(() => validateReferralConfig(config)).toThrow(/defaultTier 'missing' has no tier/);
  });

  test("getTier throws for an unknown id", () => {
    expect(() => getTier(valid(), "nope")).toThrow(/unknown tier/);
  });

  test("resolveTierId gives the default tier unless an affiliate is approved", () => {
    const config = valid();
    expect(resolveTierId(config, null)).toBe("customer");
    expect(resolveTierId(config, { state: "approved", tier: "casual" })).toBe("casual");
    expect(resolveTierId(config, { state: "applied", tier: "casual" })).toBe("customer");
    expect(resolveTierId(config, { state: "ended", tier: "casual" })).toBe("customer");
  });
});
