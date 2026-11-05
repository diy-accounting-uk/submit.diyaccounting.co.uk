// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/rotateSecretPlan.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

import { planRotation, ROTATABLE_SECRETS } from "../../../scripts/rotate-secret-plan.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Written by deploy-env-secrets.yml from personal-data lists, not rotated as keys.
// origin/verify holds a current and a previous value and rolls through deploy-environment.yml.
const NOT_KEYS = new Set(["operator-emails", "family-affiliate-emails", "origin/verify"]);

describe("planRotation", () => {
  test("names the AWS secret, the GitHub secret and the vendor assert", () => {
    expect(planRotation("hmrc/sandbox_client_secret", "ci")).toEqual({
      awsSecretName: "ci/submit/hmrc/sandbox_client_secret",
      githubSecret: "HMRC_SANDBOX_CLIENT_SECRET",
      assertCommand: "node infra/hmrc/hmrc-assert.js --environment ci",
      refreshCognito: false,
    });
  });

  test("marks the Google client secret for the Cognito refresh", () => {
    expect(planRotation("google/client_secret", "prod")).toEqual(expect.objectContaining({ refreshCognito: true, assertCommand: "" }));
    expect(Object.entries(ROTATABLE_SECRETS).filter(([, entry]) => entry.refreshCognito)).toHaveLength(1);
  });

  test("runs stripe-sync in test mode for a test key and for ci, and live for a live key in prod", () => {
    expect(planRotation("stripe/test_secret_key", "prod").assertCommand).toBe(
      "node infra/stripe/stripe-sync.js --environment prod --mode test",
    );
    expect(planRotation("stripe/secret_key", "ci").assertCommand).toBe("node infra/stripe/stripe-sync.js --environment ci --mode test");
    expect(planRotation("stripe/secret_key", "prod").assertCommand).toBe("node infra/stripe/stripe-sync.js --environment prod --mode live");
  });

  test("refuses a secret outside the table, an unknown environment and an environment that does not use the secret", () => {
    expect(() => planRotation("operator-emails", "ci")).toThrow(/not in the rotation table/);
    expect(() => planRotation("hmrc/client_secret", "staging")).toThrow(/not ci or prod/);
    expect(() => planRotation("paypal/client_secret", "ci")).toThrow(/not used in ci/);
    expect(() => planRotation("companies-house/sandbox_api_key", "prod")).toThrow(/not used in prod/);
  });
});

describe("the rotation table and deploy-env-secrets.yml", () => {
  const workflow = load(readFileSync(resolve(ROOT, ".github/workflows/deploy-env-secrets.yml"), "utf8"));
  const written = [];
  for (const step of workflow.jobs["create-secrets"].steps) {
    const githubSecret = Object.values(step.env ?? {})
      .map((value) => String(value).match(/secrets\.([A-Z_]+)/)?.[1])
      .find(Boolean);
    const suffix = step.run?.match(/\/submit\/([a-z_/-]+)"/)?.[1];
    if (githubSecret && suffix && step.run.includes("put-secret-with-rotation-tag.sh")) written.push({ githubSecret, suffix });
  }

  test("finds the secrets the deploy writes", () => {
    expect(written.length).toBeGreaterThan(10);
  });

  test("lists every key the deploy writes with the same GitHub secret name", () => {
    for (const { githubSecret, suffix } of written) {
      if (NOT_KEYS.has(suffix)) continue;
      expect(ROTATABLE_SECRETS[suffix]?.githubSecret, suffix).toBe(githubSecret);
    }
  });

  test("lists in the rotate-secret.yml choice exactly the keys in the table", () => {
    const rotate = load(readFileSync(resolve(ROOT, ".github/workflows/rotate-secret.yml"), "utf8"));
    expect(rotate.on.workflow_dispatch.inputs.secret.options).toEqual(Object.keys(ROTATABLE_SECRETS));
  });
});
