// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operators.js
// The operator list -- a comma-separated list of email addresses -- grants the operator
// dashboard activity to a logged-in user whose email matches an entry, case-insensitively.
// Sourced from Secrets Manager at {ENVIRONMENT_NAME}/submit/operator-emails, the same
// deterministic-per-environment-name pattern app/services/subHasher.js uses for the user sub
// hash salt; OPERATOR_EMAILS is a raw env var override for local development and tests.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/operators.js" });

const secretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

let cachedOperators = null;

function parseOperatorEmails(raw) {
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

async function fetchOperatorEmails() {
  if (process.env.OPERATOR_EMAILS) {
    logger.info({ message: "Using OPERATOR_EMAILS from environment (local dev/test)" });
    return parseOperatorEmails(process.env.OPERATOR_EMAILS);
  }

  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) {
    throw new Error(
      "ENVIRONMENT_NAME environment variable is required for Secrets Manager access. This must be set by the CDK stack (e.g., 'ci' or 'prod').",
    );
  }
  const secretName = `${envName}/submit/operator-emails`;

  logger.info({ message: "Fetching operator emails from Secrets Manager", secretName });
  const result = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!result.SecretString) {
    throw new Error(`Secret ${secretName} exists but has no SecretString value`);
  }

  return parseOperatorEmails(result.SecretString);
}

// Cached per process: the operator list is fetched once and does not change while the
// process/container is running.
export async function loadOperators() {
  if (cachedOperators === null) {
    cachedOperators = await fetchOperatorEmails();
  }
  return cachedOperators;
}

export async function isOperatorEmail(email) {
  if (!email || typeof email !== "string") return false;
  const operators = await loadOperators();
  return operators.includes(email.trim().toLowerCase());
}

export function _clearOperatorsCache() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearOperatorsCache can only be used in test environment");
  }
  cachedOperators = null;
}
