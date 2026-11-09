// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-166 Roll one secret without an environment deploy
// - **Use when:** one GitHub environment secret has a new value and only its AWS copy and its vendor check need to follow.
// - **Does:** rotate-secret.yml writes one GitHub environment secret to Secrets Manager through put-secret-with-rotation-tag.sh, then runs that vendor's assert. For the Google client secret it also refreshes the Cognito identity provider. rotate-secret-plan.js holds the table of secrets, their GitHub names and their asserts.
// - **Run:** `gh workflow run rotate-secret.yml -f secret=<aws-suffix> -f environment-name=<ci|prod>`
// - **Entry:** `scripts/rotate-secret-plan.js:planRotation`; `.github/workflows/rotate-secret.yml`
// - **Files:** scripts/rotate-secret-plan.js, .github/workflows/rotate-secret.yml, scripts/refresh-google-identity-provider.sh, app/unit-tests/scripts/rotateSecretPlan.test.js, app/unit-tests/rotateSecretWorkflow.test.js
// - **Keywords:** rotate secret, key roll, single secret, rotated-at, vendor assert, cognito refresh, store step
// - **Related:** OPS-157, OPS-45, OPS-165
// @end-capability

// scripts/rotate-secret-plan.js
//
// The table of secrets that rotate-secret.yml can write. Each key is the Secrets Manager name
// under `<environment>/submit/`. `githubSecret` is the GitHub environment secret that holds the
// new value. `assert` builds the command that proves the vendor accepts it; null means the
// vendor has no assert. `refreshCognito` marks the secret that Cognito also holds.

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENVIRONMENTS = ["ci", "prod"];

function stripeMode(suffix, environment) {
  if (suffix.startsWith("stripe/test_")) return "test";
  return environment === "prod" ? "live" : "test";
}

export const ROTATABLE_SECRETS = {
  "google/client_secret": { githubSecret: "GOOGLE_CLIENT_SECRET", refreshCognito: true, assert: () => null },
  "microsoft/client_secret": { githubSecret: "MICROSOFT_CLIENT_SECRET", assert: () => null },
  "hmrc/client_secret": {
    githubSecret: "HMRC_CLIENT_SECRET",
    assert: (_suffix, environment) => `node infra/hmrc/hmrc-assert.js --environment ${environment}`,
  },
  "hmrc/sandbox_client_secret": {
    githubSecret: "HMRC_SANDBOX_CLIENT_SECRET",
    assert: (_suffix, environment) => `node infra/hmrc/hmrc-assert.js --environment ${environment}`,
  },
  "companies-house/api_key": {
    githubSecret: "COMPANIES_HOUSE_API_KEY",
    assert: (_suffix, environment) => `node infra/companies-house/companies-house-assert.js --environment ${environment}`,
  },
  "companies-house/sandbox_api_key": {
    githubSecret: "COMPANIES_HOUSE_SANDBOX_API_KEY",
    environments: ["ci"],
    assert: (_suffix, environment) => `node infra/companies-house/companies-house-assert.js --environment ${environment}`,
  },
  "companies-house/client_secret": {
    githubSecret: "COMPANIES_HOUSE_CLIENT_SECRET",
    assert: (_suffix, environment) => `node infra/companies-house/companies-house-assert.js --environment ${environment}`,
  },
  "companies-house/presenter_id": {
    githubSecret: "COMPANIES_HOUSE_PRESENTER_ID",
    assert: (_suffix, environment) => `node infra/companies-house/companies-house-assert.js --environment ${environment}`,
  },
  "companies-house/presenter_code": {
    githubSecret: "COMPANIES_HOUSE_PRESENTER_CODE",
    assert: (_suffix, environment) => `node infra/companies-house/companies-house-assert.js --environment ${environment}`,
  },
  "stripe/secret_key": { githubSecret: "STRIPE_SECRET_KEY", assert: stripeAssert },
  "stripe/test_secret_key": { githubSecret: "STRIPE_TEST_SECRET_KEY", assert: stripeAssert },
  "stripe/webhook_secret": { githubSecret: "STRIPE_WEBHOOK_SECRET", assert: stripeAssert },
  "stripe/test_webhook_secret": { githubSecret: "STRIPE_TEST_WEBHOOK_SECRET", assert: stripeAssert },
  "telegram/bot_token": {
    githubSecret: "TELEGRAM_BOT_TOKEN",
    assert: (_suffix, environment) => `node infra/telegram/telegram-assert.js --environment ${environment}`,
  },
  "paypal/client_secret": {
    githubSecret: "PAYPAL_CLIENT_SECRET",
    environments: ["prod"],
    assert: () => "node infra/paypal/paypal-assert.js",
  },
  "github/ops_app_private_key": { githubSecret: "OPS_APP_PRIVATE_KEY", assert: () => null },
};

function stripeAssert(suffix, environment) {
  return `node infra/stripe/stripe-sync.js --environment ${environment} --mode ${stripeMode(suffix, environment)}`;
}

export function planRotation(suffix, environment) {
  const entry = ROTATABLE_SECRETS[suffix];
  if (!entry) throw new Error(`secret is not in the rotation table: ${suffix}`);
  if (!ENVIRONMENTS.includes(environment)) throw new Error(`environment is not ci or prod: ${environment}`);
  if (entry.environments && !entry.environments.includes(environment)) {
    throw new Error(`${suffix} is not used in ${environment}`);
  }
  return {
    awsSecretName: `${environment}/submit/${suffix}`,
    githubSecret: entry.githubSecret,
    assertCommand: entry.assert(suffix, environment) ?? "",
    refreshCognito: entry.refreshCognito === true,
  };
}

function main() {
  const [suffix, environment] = process.argv.slice(2);
  const plan = planRotation(suffix, environment);
  const lines = [
    `aws-secret-name=${plan.awsSecretName}`,
    `github-secret=${plan.githubSecret}`,
    `assert-command=${plan.assertCommand}`,
    `refresh-cognito=${plan.refreshCognito}`,
  ];
  for (const line of lines) console.log(line);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
