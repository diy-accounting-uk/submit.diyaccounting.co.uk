// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// rotateSecretWorkflow.test.js -- rotate-secret.yml and deploy-env-secrets.yml run in a public
// repository. A `${{ secrets.X }}` inside a `run:` block is pasted into the script text, so a
// value with a quote or a newline changes the script. These tests pin that every secret reaches
// a script through `env:`, and that rotate-secret.yml touches one secret and nothing else.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

function stepsOf(file) {
  const workflow = load(readFileSync(resolve(ROOT, ".github/workflows", file), "utf8"));
  return Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
}

const SECRET_IN_SCRIPT = /\$\{\{[^}]*\b(?:secrets|vars\.[A-Z_]*(?:SECRET|KEY|TOKEN|EMAILS))/;

describe.each(["deploy-env-secrets.yml", "rotate-secret.yml"])("%s", (file) => {
  const steps = stepsOf(file);

  it("puts no secret expression inside a run block", () => {
    for (const step of steps) {
      if (!step.run) continue;
      expect(step.run, `step "${step.name}"`).not.toMatch(SECRET_IN_SCRIPT);
    }
  });

  it("detects a secret expression in a run block", () => {
    expect('scripts/put.sh "${{ secrets.X }}"').toMatch(SECRET_IN_SCRIPT);
    expect('scripts/put.sh "$SECRET_VALUE"').not.toMatch(SECRET_IN_SCRIPT);
  });
});

describe("rotate-secret.yml", () => {
  const steps = stepsOf("rotate-secret.yml");

  it("writes one secret, by the name the plan step outputs", () => {
    const writes = steps.filter((step) => step.run?.includes("put-secret-with-rotation-tag.sh"));
    expect(writes).toHaveLength(1);
    expect(writes[0].run).toContain('"$AWS_SECRET_NAME" "$SECRET_VALUE"');
    expect(writes[0].env.SECRET_VALUE).toBe("${{ secrets[steps.plan.outputs.github-secret] }}");
  });

  it("refreshes Cognito only when the plan says so", () => {
    const refresh = steps.find((step) => step.run?.includes("refresh-google-identity-provider.sh"));
    expect(refresh.if).toBe("steps.plan.outputs.refresh-cognito == 'true'");
  });

  it("runs the vendor assert only when the plan names one", () => {
    const assertStep = steps.find((step) => step.name === "Run the vendor assert");
    expect(assertStep.if).toBe("steps.plan.outputs.assert-command != ''");
  });
});
