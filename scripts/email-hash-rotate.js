#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/email-hash-rotate.js
//
// Adds a new version to one environment's email-hash-secret registry and makes it current,
// keeping every earlier version in place. Unlike the user-sub-hash-salt (subHasher.js), the
// email hash is never a DynamoDB partition key: each pass record already stores the exact
// secret version it was hashed with (passService.js's emailHashSecretVersion), so a rotation
// needs no re-keying pass — app/lib/emailHash.js's hashEmailWithVersion() re-derives a stored
// hash from that recorded version on every check, whatever the current version has moved to.
//
// email-hash-rotate.yml runs this per environment, plan by default, --apply to write. Never
// prints a secret value.
//
// Usage:
//   ENVIRONMENT_NAME=ci node scripts/email-hash-rotate.js [--apply]

import crypto from "node:crypto";

const SECRET_NAME_SUFFIX = "submit/email-hash-secret";

export function parseArgs(argv) {
  const opts = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--help") {
      console.log("Usage: ENVIRONMENT_NAME=ci|prod node scripts/email-hash-rotate.js [--apply]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  return opts;
}

/**
 * Parse the current registry and work out the next version label.
 * Version labels are "v<n>"; the next one is one past the highest existing n.
 *
 * @param {string} raw - The secret's current JSON string
 * @returns {{ registry: object, nextVersion: string }}
 */
export function planNextVersion(raw) {
  const registry = JSON.parse(raw);
  if (!registry.current || !registry.versions || !registry.versions[registry.current]) {
    throw new Error(`Email hash secret registry is malformed: current="${registry.current}"`);
  }
  const existingNumbers = Object.keys(registry.versions)
    .map((v) => Number(v.replace(/^v/, "")))
    .filter((n) => Number.isInteger(n));
  const nextNumber = (existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0) + 1;
  return { registry, nextVersion: `v${nextNumber}` };
}

/**
 * Build the rotated registry: the new version added, made current, every earlier version kept.
 *
 * @param {object} registry - The parsed current registry
 * @param {string} nextVersion - The new version's label
 * @param {string} newSecret - The new version's secret value
 * @returns {object} The rotated registry
 */
export function buildRotatedRegistry(registry, nextVersion, newSecret) {
  return {
    current: nextVersion,
    versions: { ...registry.versions, [nextVersion]: newSecret },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) throw new Error("ENVIRONMENT_NAME is required (e.g., 'ci' or 'prod')");
  const secretName = `${envName}/${SECRET_NAME_SUFFIX}`;

  const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand, TagResourceCommand } =
    await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });

  const current = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  const { registry, nextVersion } = planNextVersion(current.SecretString);
  const previousVersions = Object.keys(registry.versions);

  console.log(`Secret: ${secretName}`);
  console.log(`Current version: ${registry.current}`);
  console.log(`Versions kept: [${previousVersions.join(", ")}]`);
  console.log(`New version: ${nextVersion} (${opts.apply ? "writing" : "plan only"})`);

  if (!opts.apply) {
    console.log("Plan only — no write made. Re-run with --apply to rotate.");
    return;
  }

  const newSecret = crypto.randomBytes(32).toString("base64");
  const rotated = buildRotatedRegistry(registry, nextVersion, newSecret);

  await client.send(new UpdateSecretCommand({ SecretId: secretName, SecretString: JSON.stringify(rotated) }));
  await client.send(
    new TagResourceCommand({
      SecretId: secretName,
      Tags: [{ Key: "rotated-at", Value: new Date().toISOString().slice(0, 10) }],
    }),
  );

  console.log(`Rotated. Current version is now ${nextVersion}; earlier versions stay in the registry`);
  console.log(`for any pass still carrying an older emailHashSecretVersion.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
