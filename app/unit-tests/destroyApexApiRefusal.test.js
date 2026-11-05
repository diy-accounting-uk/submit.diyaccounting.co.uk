// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// destroyApexApiRefusal.test.js -- each destroy workflow deletes the API Gateway mappings that name the
// destroyed set's API, and then a domain whose mappings were all that API's. When the apex API domain
// still maps to that API, the apex would lose its API. Both workflows refuse that destroy before the
// cleanup runs; this test reads both so the two checks stay alike.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REFUSE = "Refuse to destroy the live or last known good deployment";
const CLEANUP = "Clean up external API Gateway custom domain mappings";

const stepsOf = (file) => {
  const workflow = load(readFileSync(resolve(ROOT, ".github", "workflows", file), "utf8"));
  const job = Object.values(workflow.jobs).find((j) => (j.steps || []).some((step) => step.name === REFUSE));
  return job.steps;
};

describe.each(["destroy-ci.yml", "destroy-prod.yml"])("%s", (file) => {
  const steps = stepsOf(file);
  const names = steps.map((step) => step.name);
  const refuse = steps.find((step) => step.name === REFUSE).run;

  it("refuses a set whose API the apex API domain still maps to", () => {
    expect(refuse).toContain('--stack-name "${DEPLOYMENT}-app-ApiStack"');
    expect(refuse).toContain("OutputKey=='HttpApiId'");
    expect(refuse).toContain("aws apigatewayv2 get-api-mappings");
    expect(refuse).toContain("Items[?ApiId=='${API_ID}'].ApiMappingId | [0]");
    expect(refuse).toContain("NotFoundException");
    expect(refuse).toContain("still maps to its API [$API_ID]");
    expect(refuse).toMatch(/Run set-origins\.yml for (ci|prod) first/);
  });

  it("runs the refusal before the mapping cleanup", () => {
    expect(names.indexOf(REFUSE)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(CLEANUP)).toBeGreaterThan(names.indexOf(REFUSE));
  });
});
