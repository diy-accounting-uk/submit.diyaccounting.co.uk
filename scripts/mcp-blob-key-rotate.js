#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-168 Roll the MCP blob key without breaking sealed data
// - **Use when:** the key that signs MCP OAuth blobs and seals MCP codes and HMRC grants must change, on a schedule or after exposure.
// - **Does:** mcp-blob-key-rotate.js reads one environment's `{env}/submit/mcp/oauth-blob-key` secret as a registry, a raw value counting as version v1. It adds a random key as the next version, makes it current and keeps every earlier version, so blobs and sealed values made before the roll still open. It plans by default and writes only with --apply. It never prints a key.
// - **Run:** `gh workflow run mcp-blob-key-rotate.yml -f environment-name=<ci|prod> -f apply=<true|false>`
// - **Entry:** `scripts/mcp-blob-key-rotate.js:main`; `app/lib/mcpBlobKey.js:parseBlobKeyRegistry`
// - **Files:** .github/workflows/mcp-blob-key-rotate.yml, scripts/mcp-blob-key-rotate.js, app/lib/mcpBlobKey.js, app/lib/mcpOauthBlob.js, app/lib/codesSeal.js, app/unit-tests/scripts/mcpBlobKeyRotate.test.js, app/unit-tests/lib/mcpBlobKey.test.js
// - **Keywords:** mcp blob key, key roll, key registry, key version, sealed grant, oauth blob, rotation schedule
// - **Related:** OPS-43, OPS-45, OPS-165
// @end-capability

// scripts/mcp-blob-key-rotate.js
//
// Adds a new version to one environment's MCP blob key registry and makes it current, keeping
// every earlier version. app/lib/mcpBlobKey.js reads the stored value as a registry, a raw value
// as version v1. Blobs and sealed values name the version that made them, so a roll needs no
// re-sealing pass. Remove an old version by hand only after the longest-lived value made under it
// has ended.
//
// Run this only after a deploy that holds the registry reader. A reader from before that deploy
// takes the JSON value for the key.
//
// mcp-blob-key-rotate.yml runs this per environment: plan by default, --apply to write. Never
// prints a key.
//
// Usage:
//   ENVIRONMENT_NAME=ci node scripts/mcp-blob-key-rotate.js [--apply]

import crypto from "node:crypto";
import { parseBlobKeyRegistry } from "../app/lib/mcpBlobKey.js";

const SECRET_NAME_SUFFIX = "submit/mcp/oauth-blob-key";

export function parseArgs(argv) {
  const opts = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--help") {
      console.log("Usage: ENVIRONMENT_NAME=ci|prod node scripts/mcp-blob-key-rotate.js [--apply]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  return opts;
}

/**
 * Read the stored value as a registry and work out the next version label. A raw value is
 * version v1. The next label is one past the highest existing number.
 *
 * @param {string} raw - The secret's current string
 * @returns {{ registry: {current: string, versions: object}, nextVersion: string }}
 */
export function planNextVersion(raw) {
  const registry = parseBlobKeyRegistry(raw);
  const highest = Math.max(...Object.keys(registry.versions).map((label) => Number(label.slice(1))));
  return { registry, nextVersion: `v${highest + 1}` };
}

/**
 * Build the rotated registry: the new version added, made current, every earlier version kept.
 */
export function buildRotatedRegistry(registry, nextVersion, newKey) {
  return { current: nextVersion, versions: { ...registry.versions, [nextVersion]: newKey } };
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
  const wasRaw = !current.SecretString.startsWith("{");

  console.log(`Secret: ${secretName}`);
  console.log(`Stored as: ${wasRaw ? "a raw value, read as v1" : "a registry"}`);
  console.log(`Current version: ${registry.current}`);
  console.log(`Versions kept: [${Object.keys(registry.versions).join(", ")}]`);
  console.log(`New version: ${nextVersion} (${opts.apply ? "writing" : "plan only"})`);

  if (!opts.apply) {
    console.log("Plan only. No write made. Run again with --apply to roll the key.");
    return;
  }

  const newKey = crypto.randomBytes(48).toString("base64url");
  const rotated = buildRotatedRegistry(registry, nextVersion, newKey);

  await client.send(new UpdateSecretCommand({ SecretId: secretName, SecretString: JSON.stringify(rotated) }));
  await client.send(
    new TagResourceCommand({
      SecretId: secretName,
      Tags: [{ Key: "rotated-at", Value: new Date().toISOString().slice(0, 10) }],
    }),
  );

  console.log(`Rolled. Current version is now ${nextVersion}. Earlier versions stay in the registry`);
  console.log("so blobs and sealed values made under them still open.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
