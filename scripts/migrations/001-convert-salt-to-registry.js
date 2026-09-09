// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/migrations/001-convert-salt-to-registry.js
// Pre-deploy migration: Converts raw-string salt in Secrets Manager to JSON registry format.
// Idempotent: if already valid JSON registry, no-op.

export const phase = "pre-deploy";
export const description = "Convert salt secret from raw string to JSON registry format";

export async function up({ envName }) {
  const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } = await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });

  const secretName = `${envName}/submit/user-sub-hash-salt`;
  console.log(`    Reading secret: ${secretName}`);

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!response.SecretString) {
    throw new Error(`Secret ${secretName} has no value`);
  }

  const raw = response.SecretString;

  // Check if already valid registry format
  try {
    const parsed = JSON.parse(raw);
    if (parsed.current && parsed.versions && parsed.versions[parsed.current]) {
      console.log(`    Secret is already in registry format (current: ${parsed.current})`);
      return; // Idempotent — already converted
    }
  } catch {
    // Not JSON — this is the raw string format we need to convert
  }

  // Convert raw string to registry format
  const registry = {
    current: "v1",
    versions: {
      v1: raw,
    },
  };

  const registryJson = JSON.stringify(registry);
  console.log(`    Converting raw salt (${raw.length} chars) to registry format`);

  await client.send(
    new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: registryJson,
    }),
  );

  console.log(`    Secret updated to registry format (current: v1)`);
}
