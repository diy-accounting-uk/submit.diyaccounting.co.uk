// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/referralConfig.js

import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

let cachedConfig = null;

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateReferralConfig(config) {
  const tiers = config?.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error("referrals.toml: no tiers defined");
  }
  const seen = new Set();
  for (const tier of tiers) {
    if (seen.has(tier.id)) {
      throw new Error(`referrals.toml: duplicate tier id '${tier.id}'`);
    }
    seen.add(tier.id);
    if (tier.form !== "credit" && tier.form !== "cash") {
      throw new Error(`referrals.toml: tier '${tier.id}' form must be credit or cash`);
    }
    for (const field of ["rateBps", "months", "holdDays"]) {
      if (!isPositiveInteger(tier[field])) {
        throw new Error(`referrals.toml: tier '${tier.id}' ${field} must be a positive integer`);
      }
    }
    if (tier.form === "credit" && !isPositiveInteger(tier.capCreditMonths)) {
      throw new Error(`referrals.toml: credit tier '${tier.id}' needs capCreditMonths`);
    }
  }
  if (!seen.has(config.ledger?.defaultTier)) {
    throw new Error(`referrals.toml: defaultTier '${config.ledger?.defaultTier}' has no tier`);
  }
  return config;
}

export function loadReferralConfig() {
  if (cachedConfig) return cachedConfig;
  const filePath = path.join(process.cwd(), "referrals.toml");
  const raw = fs.readFileSync(filePath, "utf-8");
  cachedConfig = validateReferralConfig(TOML.parse(raw));
  return cachedConfig;
}

export function getTier(config, id) {
  const tier = config.tiers.find((t) => t.id === id);
  if (!tier) throw new Error(`referrals.toml: unknown tier '${id}'`);
  return tier;
}

/**
 * The tier an approved affiliate item names; every other referrer earns the default tier.
 */
export function resolveTierId(config, affiliateItem) {
  return affiliateItem?.state === "approved" ? affiliateItem.tier : config.ledger.defaultTier;
}
