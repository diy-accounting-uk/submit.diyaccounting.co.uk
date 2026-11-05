// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// manageSecretsWorkflow.test.js -- manage-secrets.yml runs in a public repository, so its
// Actions logs are public. This test pins the shape that keeps a secret value out of them:
// no action that prints or accepts a salt, and no step that echoes a variable holding a
// secret value.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/manage-secrets.yml"), "utf8");
const workflow = load(text);
const steps = workflow.jobs.manage.steps;
const inputs = workflow.on.workflow_dispatch.inputs;

// An echo or printf whose whole argument is a variable that holds a secret value.
const PRINTS_VALUE = /\b(?:echo|printf)\b[^\n|>]*\$\{?(?:VALUE|SALT_VALUE|SECRET_VALUE)\b[^\n|>]*$/m;

describe("manage-secrets.yml keeps secret values out of public logs", () => {
  it("offers no action that backs up or restores a salt", () => {
    expect(inputs.action.options).toEqual(["list", "check", "check-salt", "check-rotation"]);
  });

  it("takes no input that carries a secret value", () => {
    expect(Object.keys(inputs).sort()).toEqual(["action", "environment-name"]);
  });

  it("echoes no variable that holds a secret value", () => {
    for (const step of steps) {
      if (!step.run) continue;
      expect(step.run, `step "${step.name}" prints a value`).not.toMatch(PRINTS_VALUE);
    }
  });

  it("puts no workflow input inside a run block", () => {
    for (const step of steps) {
      if (!step.run) continue;
      const bad = [...step.run.matchAll(/\$\{\{\s*inputs\.([a-z-]+)/g)].map((m) => m[1]).filter((n) => n !== "environment-name");
      expect(bad, `step "${step.name}"`).toEqual([]);
    }
  });

  it("detects a printed value", () => {
    expect('echo "$VALUE"').toMatch(PRINTS_VALUE);
    expect('echo "length: ${#VALUE}"').not.toMatch(PRINTS_VALUE);
  });
});
