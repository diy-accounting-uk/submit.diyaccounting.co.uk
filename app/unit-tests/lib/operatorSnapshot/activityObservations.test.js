// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { buildActivityObservations } from "@app/lib/operatorSnapshot/activityObservations.js";
import { loadCatalogFromRoot, isActivityListedInEnvironment } from "@app/services/productCatalog.js";

describe("buildActivityObservations", () => {
  test("has a started and completed pair for every prod-listed catalogue activity", () => {
    const observations = buildActivityObservations();
    const catalog = loadCatalogFromRoot();
    const prodActivityIds = (catalog.activities || [])
      .filter((activity) => isActivityListedInEnvironment(activity, "prod"))
      .map((activity) => activity.id);

    expect(prodActivityIds.length).toBeGreaterThan(0);
    expect(observations).toHaveLength(prodActivityIds.length * 2);
    for (const activityId of prodActivityIds) {
      expect(observations.some((o) => o.id === `${activityId}::started`)).toBe(true);
      expect(observations.some((o) => o.id === `${activityId}::completed`)).toBe(true);
    }
  });

  test("leaves out an activity the catalogue does not list in prod", () => {
    // self-employed is catalogued but not listed in prod (environments excludes it).
    expect(buildActivityObservations().some((o) => o.id === "self-employed::started")).toBe(false);
  });

  test("the started figure reads the started views and the completed figure reads the submissions views", () => {
    for (const observation of buildActivityObservations()) {
      if (observation.id.endsWith("::started")) {
        expect(observation.view).toBe("v_activity_started_daily");
        expect(observation.fastWindowView).toBe("v_activity_started_hourly");
      } else {
        expect(observation.view).toBe("v_submissions_by_activity_daily");
        expect(observation.fastWindowView).toBe("v_submissions_by_activity_hourly");
      }
      expect(observation.where).toMatch(/^activity = '[^']+'$/);
    }
  });

  test("every deep link opens the Athena saved queries", () => {
    for (const observation of buildActivityObservations()) {
      const link = observation.deepLink({ region: "eu-west-2", athenaWorkGroupName: "test-env-analytics" });
      expect(link).toContain("athena");
    }
  });
});
