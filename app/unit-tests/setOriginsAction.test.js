// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/setOriginsAction.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

const ACTION_FILE = resolve(".github/actions/set-origins/action.yml");
const source = readFileSync(ACTION_FILE, "utf8");
const action = load(source);
const steps = action.runs.steps;
const indexOf = (name) => {
  const index = steps.findIndex((step) => step.name === name);
  expect(index, name).toBeGreaterThanOrEqual(0);
  return index;
};

describe("set-origins composite action", () => {
  test("the TXT records are written with the DNS account roles, and the first roles are back, before the aliases move", () => {
    const order = [
      "Plan the CloudFront alias move",
      "Assume Route53 account OIDC role for the alias TXT records",
      "Assume Route53 account deploy role for the alias TXT records",
      "Write the DNS TXT records that the alias move needs",
      "Restore original OIDC role for the alias move",
      "Restore original deploy role for the alias move",
      "Move the CloudFront aliases to the distribution of origin-domain",
      "Assume Route53 account OIDC role",
      "Assume Route53 account deploy role",
      "Alias apex domain to base domain",
      "Restore original OIDC role",
      "Restore original deploy role",
      "Transfer API Gateway custom domain for apex",
    ].map(indexOf);

    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test("each role switch for the TXT records uses the same role and chaining as the switch for the A records", () => {
    const pairs = [
      ["Assume Route53 account OIDC role for the alias TXT records", "Assume Route53 account OIDC role"],
      ["Assume Route53 account deploy role for the alias TXT records", "Assume Route53 account deploy role"],
      ["Restore original OIDC role for the alias move", "Restore original OIDC role"],
      ["Restore original deploy role for the alias move", "Restore original deploy role"],
    ];
    for (const [txtStep, recordStep] of pairs) {
      const a = steps[indexOf(txtStep)];
      const b = steps[indexOf(recordStep)];
      expect(a.uses).toBe(b.uses);
      expect(a.with).toEqual(b.with);
      expect(a.if).toContain("steps.alias-plan.outputs.moving-aliases != ''");
    }
  });

  test("every input the action reads is declared", () => {
    const used = new Set([...source.matchAll(/inputs\.([a-z0-9-]+)/g)].map((m) => m[1]));
    for (const name of used) {
      expect(Object.keys(action.inputs), name).toContain(name);
    }
  });
});
