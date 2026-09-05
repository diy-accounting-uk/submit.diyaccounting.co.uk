// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/gcp-billing-assert.test.js

import { describe, test, expect } from "vitest";

import {
  DEFAULT_ENABLED_SERVICES,
  THRESHOLD_PERCENTAGES,
  parseArgs,
  findThresholdGaps,
  decideBudgetAction,
  buildBudgetCreateBody,
  buildBudgetPatchBody,
  computeNonDefaultServices,
  isProjectSafeToDelete,
  formatInventoryReport,
} from "../../../scripts/gcp-billing-assert.js";

describe("parseArgs", () => {
  test("defaults to apply mode against diyaccounting-ga4 and the known stray project", () => {
    const opts = parseArgs([]);
    expect(opts.dryRun).toBe(false);
    expect(opts.billingProjectId).toBe("diyaccounting-ga4");
    expect(opts.strayProjectId).toBe("valued-context-507200-m9");
    expect(opts.budgetAmount).toBe("10");
    expect(opts.budgetCurrencyCode).toBe("GBP");
  });

  test("--dry-run sets dryRun true", () => {
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true);
  });

  test("overrides project ids, amount and currency", () => {
    const opts = parseArgs(["--billing-project", "other-billing-project", "--stray-project", "other-stray-project", "--amount", "25", "--currency", "USD"]);
    expect(opts.billingProjectId).toBe("other-billing-project");
    expect(opts.strayProjectId).toBe("other-stray-project");
    expect(opts.budgetAmount).toBe("25");
    expect(opts.budgetCurrencyCode).toBe("USD");
  });

  test("overrides the budget display name", () => {
    expect(parseArgs(["--budget-display-name", "custom name"]).budgetDisplayName).toBe("custom name");
  });

  test("throws on an unknown flag", () => {
    expect(() => parseArgs(["--not-a-flag"])).toThrow(/Unknown argument/);
  });
});

describe("findThresholdGaps", () => {
  test("all three thresholds are missing when there are no existing rules", () => {
    expect(findThresholdGaps([])).toEqual(THRESHOLD_PERCENTAGES);
  });

  test("no gaps when all three thresholds are already present", () => {
    const rules = [{ thresholdPercent: 0.5 }, { thresholdPercent: 0.9 }, { thresholdPercent: 1.0 }];
    expect(findThresholdGaps(rules)).toEqual([]);
  });

  test("reports only the missing threshold", () => {
    const rules = [{ thresholdPercent: 0.5 }, { thresholdPercent: 1.0 }];
    expect(findThresholdGaps(rules)).toEqual([0.9]);
  });

  test("tolerates floating point noise in an existing threshold", () => {
    const rules = [{ thresholdPercent: 0.5000000001 }, { thresholdPercent: 0.9 }, { thresholdPercent: 0.9999999999 }];
    expect(findThresholdGaps(rules)).toEqual([]);
  });
});

describe("decideBudgetAction", () => {
  test("creates a budget when the billing account has none", () => {
    const decision = decideBudgetAction([]);
    expect(decision.action).toBe("create");
    expect(decision.targetBudget).toBeNull();
    expect(decision.missingThresholds).toEqual(THRESHOLD_PERCENTAGES);
  });

  test("reuses an existing budget as-is when it already has all three thresholds", () => {
    const budget = {
      name: "billingAccounts/123/budgets/abc",
      displayName: "hand-made budget",
      thresholdRules: [{ thresholdPercent: 0.5 }, { thresholdPercent: 0.9 }, { thresholdPercent: 1.0 }],
    };
    const decision = decideBudgetAction([budget]);
    expect(decision.action).toBe("reuse-noop");
    expect(decision.targetBudget).toBe(budget);
    expect(decision.missingThresholds).toEqual([]);
  });

  test("reuses an existing budget and reports the thresholds it is missing", () => {
    const budget = {
      name: "billingAccounts/123/budgets/abc",
      displayName: "hand-made budget",
      thresholdRules: [{ thresholdPercent: 0.5 }],
    };
    const decision = decideBudgetAction([budget]);
    expect(decision.action).toBe("reuse-update");
    expect(decision.targetBudget).toBe(budget);
    expect(decision.missingThresholds).toEqual([0.9, 1.0]);
  });

  test("treats a budget with no threshold rules at all as missing every threshold", () => {
    const budget = { name: "billingAccounts/123/budgets/abc", displayName: "hand-made budget" };
    const decision = decideBudgetAction([budget]);
    expect(decision.action).toBe("reuse-update");
    expect(decision.missingThresholds).toEqual(THRESHOLD_PERCENTAGES);
  });

  test("picks the first budget when more than one already exists", () => {
    const first = { name: "billingAccounts/123/budgets/first", displayName: "first", thresholdRules: [] };
    const second = { name: "billingAccounts/123/budgets/second", displayName: "second", thresholdRules: [] };
    const decision = decideBudgetAction([first, second]);
    expect(decision.targetBudget).toBe(first);
  });
});

describe("buildBudgetCreateBody", () => {
  test("builds an account-wide filter with all three thresholds", () => {
    const body = buildBudgetCreateBody({ displayName: "diyaccounting-ga4 monthly budget", amount: "10", currencyCode: "GBP" });
    expect(body.displayName).toBe("diyaccounting-ga4 monthly budget");
    expect(body.budgetFilter).toEqual({});
    expect(body.amount).toEqual({ specifiedAmount: { currencyCode: "GBP", units: "10" } });
    expect(body.thresholdRules).toEqual([{ thresholdPercent: 0.5 }, { thresholdPercent: 0.9 }, { thresholdPercent: 1.0 }]);
  });
});

describe("buildBudgetPatchBody", () => {
  test("merges the missing thresholds in ascending order", () => {
    const result = buildBudgetPatchBody({ existingThresholdRules: [{ thresholdPercent: 0.5 }], missingThresholds: [0.9, 1.0] });
    expect(result.thresholdRules).toEqual([{ thresholdPercent: 0.5 }, { thresholdPercent: 0.9 }, { thresholdPercent: 1.0 }]);
  });

  test("sorts even when the missing threshold sorts before an existing one", () => {
    const result = buildBudgetPatchBody({ existingThresholdRules: [{ thresholdPercent: 1.0 }], missingThresholds: [0.5, 0.9] });
    expect(result.thresholdRules).toEqual([{ thresholdPercent: 0.5 }, { thresholdPercent: 0.9 }, { thresholdPercent: 1.0 }]);
  });
});

describe("computeNonDefaultServices", () => {
  test("returns nothing when every enabled service is a default", () => {
    const enabled = ["bigquery.googleapis.com", "logging.googleapis.com"];
    expect(computeNonDefaultServices(enabled)).toEqual([]);
  });

  test("reports services outside the default set, sorted", () => {
    const enabled = ["compute.googleapis.com", "bigquery.googleapis.com", "run.googleapis.com"];
    expect(computeNonDefaultServices(enabled)).toEqual(["compute.googleapis.com", "run.googleapis.com"]);
  });

  test("uses every entry in the real default set", () => {
    expect(computeNonDefaultServices(Array.from(DEFAULT_ENABLED_SERVICES))).toEqual([]);
  });

  test("accepts a custom default set", () => {
    expect(computeNonDefaultServices(["a.googleapis.com", "b.googleapis.com"], new Set(["a.googleapis.com"]))).toEqual(["b.googleapis.com"]);
  });
});

describe("isProjectSafeToDelete", () => {
  const emptyInventory = { nonDefaultServices: [], bigQueryDatasets: [], buckets: [], computeInstances: [] };

  test("true when every field is empty", () => {
    expect(isProjectSafeToDelete(emptyInventory)).toBe(true);
  });

  test("false when a non-default service is enabled", () => {
    expect(isProjectSafeToDelete({ ...emptyInventory, nonDefaultServices: ["compute.googleapis.com"] })).toBe(false);
  });

  test("false when a BigQuery dataset exists", () => {
    expect(isProjectSafeToDelete({ ...emptyInventory, bigQueryDatasets: ["my_dataset"] })).toBe(false);
  });

  test("false when a bucket exists", () => {
    expect(isProjectSafeToDelete({ ...emptyInventory, buckets: ["my-bucket"] })).toBe(false);
  });

  test("false when a compute instance exists", () => {
    expect(isProjectSafeToDelete({ ...emptyInventory, computeInstances: ["my-instance"] })).toBe(false);
  });
});

describe("formatInventoryReport", () => {
  test("reports none for every empty field", () => {
    const report = formatInventoryReport("valued-context-507200-m9", {
      nonDefaultServices: [],
      bigQueryDatasets: [],
      buckets: [],
      computeInstances: [],
    });
    expect(report).toContain("Project valued-context-507200-m9 inventory:");
    expect(report).toContain("Enabled services beyond defaults: none");
    expect(report).toContain("BigQuery datasets:                none");
    expect(report).toContain("Cloud Storage buckets:            none");
    expect(report).toContain("Compute Engine instances:         none");
  });

  test("lists the actual values when non-empty", () => {
    const report = formatInventoryReport("some-project", {
      nonDefaultServices: ["compute.googleapis.com"],
      bigQueryDatasets: ["my_dataset"],
      buckets: ["my-bucket"],
      computeInstances: ["my-instance"],
    });
    expect(report).toContain("compute.googleapis.com");
    expect(report).toContain("my_dataset");
    expect(report).toContain("my-bucket");
    expect(report).toContain("my-instance");
  });
});
