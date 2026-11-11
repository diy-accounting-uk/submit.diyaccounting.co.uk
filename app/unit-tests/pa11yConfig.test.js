// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const WAF_REQUESTS_PER_FIVE_MINUTES = 2000;
const MEASURED_REQUESTS_PER_PAGE = 45;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("Pa11y configuration against the edge rate limit", () => {
  for (const environment of ["ci", "prod"]) {
    describe(environment, () => {
      const config = readJson(`.pa11yci.${environment}.json`);

      it("writes the JSON results from the same run that prints the console report", () => {
        const reporters = config.defaults.reporters;
        expect(reporters[0]).toBe("cli");
        expect(reporters[1][0]).toBe("json");
        expect(reporters[1][1].fileName).toBe("web/public/tests/accessibility/pa11y-results.json");
      });

      it("spaces page loads so one run stays under the edge's per-address rate limit", () => {
        const submitPages = config.urls.filter((u) => String(u.url || u).includes("submit.diyaccounting.co.uk")).length;
        const secondsPerPage = 3 + config.defaults.wait / 1000;
        const pagesPerWindow = 300 / secondsPerPage;
        const requestsPerWindow = Math.min(submitPages, pagesPerWindow) * MEASURED_REQUESTS_PER_PAGE;
        expect(requestsPerWindow).toBeLessThan(WAF_REQUESTS_PER_FIVE_MINUTES);
      });
    });
  }

  it("the compliance workflow runs Pa11y once", () => {
    const workflow = readFileSync(".github/workflows/compliance.yml", "utf8");
    expect(workflow.match(/pa11y-ci/g) || []).toHaveLength(0);
    expect(workflow.match(/npm run accessibility:pa11y-/g)).toHaveLength(1);
  });
});
