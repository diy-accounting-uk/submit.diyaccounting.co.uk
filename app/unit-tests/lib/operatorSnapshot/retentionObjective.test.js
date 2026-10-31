// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { retentionObjective } from "@app/lib/operatorSnapshot/retentionObjective.js";

const context = {
  envName: "test",
  region: "eu-west-2",
  athenaWorkGroupName: "test-env-analytics",
  githubRepo: "diy-accounting-uk/submit.diyaccounting.co.uk",
  ga4PropertyId: "523400333",
};

describe("retentionObjective", () => {
  test("is the retention objective with at least one observation", () => {
    expect(retentionObjective.id).toBe("retention");
    expect(retentionObjective.name).toBeTruthy();
    expect(retentionObjective.observations.length).toBeGreaterThan(0);
  });

  test("every observation has a unique id and the fields the batch query reads", () => {
    const ids = retentionObjective.observations.map((observation) => observation.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const observation of retentionObjective.observations) {
      expect(observation.label, observation.id).toBeTruthy();
      expect(observation.unit, observation.id).toBeTruthy();
      expect(observation.view, observation.id).toBeTruthy();
      expect(observation.dayColumn, observation.id).toBeTruthy();
      expect(observation.valueExpr, observation.id).toBeTruthy();
      expect(observation.aggregation, observation.id).toBeTruthy();
    }
  });

  test("every deep link resolves to a URL", () => {
    for (const observation of retentionObjective.observations) {
      expect(observation.deepLink(context), observation.id).toEqual(expect.stringMatching(/^https:\/\//));
    }
  });
});
