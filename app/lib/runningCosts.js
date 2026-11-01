// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/runningCosts.js

import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

/**
 * The fixed monthly running costs that are not AWS, from running-costs.toml: a list of suppliers,
 * each `{ name = "...", monthlyGbp = 12.5 }`.
 *
 * @returns {{suppliers: Array<{name: string, monthlyGbp: number}>, monthlyTotalGbp: number}}
 */
export function loadFixedRunningCosts() {
  const raw = fs.readFileSync(path.join(process.cwd(), "running-costs.toml"), "utf-8");
  const suppliers = TOML.parse(raw).suppliers;
  if (!Array.isArray(suppliers)) {
    throw new Error("running-costs.toml: suppliers must be a list");
  }
  for (const supplier of suppliers) {
    if (typeof supplier.name !== "string" || !Number.isFinite(supplier.monthlyGbp) || supplier.monthlyGbp < 0) {
      throw new Error(`running-costs.toml: each supplier needs a name and a monthlyGbp of zero or more (${JSON.stringify(supplier)})`);
    }
  }
  return { suppliers, monthlyTotalGbp: suppliers.reduce((sum, supplier) => sum + supplier.monthlyGbp, 0) };
}
