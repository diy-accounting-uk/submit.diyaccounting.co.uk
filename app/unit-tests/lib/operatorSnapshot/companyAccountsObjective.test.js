// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { companyAccountsObjective } from "@app/lib/operatorSnapshot/companyAccountsObjective.js";

const context = {
  envName: "test",
  region: "eu-west-2",
  athenaWorkGroupName: "test-env-analytics",
  githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
  ga4PropertyId: "523400333",
};

describe("companyAccountsObjective", () => {
  test("is the company-accounts objective with at least one observation", () => {
    expect(companyAccountsObjective.id).toBe("company-accounts");
    expect(companyAccountsObjective.name).toBeTruthy();
    expect(companyAccountsObjective.observations.length).toBeGreaterThan(0);
  });

  test("every observation has a unique id and the fields the batch query reads", () => {
    const ids = companyAccountsObjective.observations.map((observation) => observation.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const observation of companyAccountsObjective.observations) {
      expect(observation.label, observation.id).toBeTruthy();
      expect(observation.unit, observation.id).toBeTruthy();
      expect(observation.view, observation.id).toBeTruthy();
      expect(observation.dayColumn, observation.id).toBeTruthy();
      expect(observation.valueExpr, observation.id).toBeTruthy();
      expect(observation.aggregation, observation.id).toBeTruthy();
    }
  });

  test("every deep link resolves to a URL", () => {
    for (const observation of companyAccountsObjective.observations) {
      expect(observation.deepLink(context), observation.id).toEqual(expect.stringMatching(/^https:\/\//));
    }
  });
});
