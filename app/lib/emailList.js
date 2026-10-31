// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/emailList.js
// A comma-separated list of email addresses held in Secrets Manager at
// {ENVIRONMENT_NAME}/submit/<secretSuffix>, with a raw environment variable that overrides it for
// local development and tests. operators.js and familyAffiliates.js each make one list from here,
// so the parsing, the cache and the lookup are written once.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/emailList.js" });

const secretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

export function parseEmailList(raw) {
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/**
 * @param {{envVar: string, secretSuffix: string, label: string, emptyWhenSecretMissing?: boolean}} options
 *   emptyWhenSecretMissing: an environment that has never been given the secret reads an empty list.
 */
export function createEmailList({ envVar, secretSuffix, label, emptyWhenSecretMissing = false }) {
  let cached = null;

  async function fetchList() {
    if (process.env[envVar]) {
      logger.info({ message: `Using ${envVar} from environment (local dev/test)` });
      return parseEmailList(process.env[envVar]);
    }

    const envName = process.env.ENVIRONMENT_NAME;
    if (!envName) {
      throw new Error(
        "ENVIRONMENT_NAME environment variable is required for Secrets Manager access. This must be set by the CDK stack (e.g., 'ci' or 'prod').",
      );
    }
    const secretName = `${envName}/submit/${secretSuffix}`;

    logger.info({ message: `Fetching ${label} from Secrets Manager`, secretName });
    let result;
    try {
      result = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: secretName }));
    } catch (error) {
      if (emptyWhenSecretMissing && error.name === "ResourceNotFoundException") {
        logger.info({ message: `Secret ${secretName} does not exist; the list is empty` });
        return [];
      }
      throw error;
    }
    if (!result.SecretString) {
      throw new Error(`Secret ${secretName} exists but has no SecretString value`);
    }
    return parseEmailList(result.SecretString);
  }

  // Cached per process: the list is fetched once and does not change while the container runs.
  async function load() {
    if (cached === null) {
      cached = await fetchList();
    }
    return cached;
  }

  // Load the list so a later synchronous check (isLoadedEmail) has it. The returned promise never
  // rejects; a failed load leaves the list unloaded and the next call tries again.
  async function warm() {
    if (cached !== null) return;
    try {
      await load();
    } catch (error) {
      logger.warn({ message: `Could not warm the ${label}`, error: error.message });
    }
  }

  // True only when the list is already loaded and holds the email.
  function isLoadedEmail(email) {
    if (cached === null || !email || typeof email !== "string") return false;
    return cached.includes(email.trim().toLowerCase());
  }

  async function isEmail(email) {
    if (!email || typeof email !== "string") return false;
    const emails = await load();
    return emails.includes(email.trim().toLowerCase());
  }

  function clearCache() {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("The email list cache can only be cleared in the test environment");
    }
    cached = null;
  }

  return { load, warm, isLoadedEmail, isEmail, clearCache };
}
