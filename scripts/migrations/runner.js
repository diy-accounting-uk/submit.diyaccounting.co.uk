#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/migrations/runner.js
// Data migration runner — EF Migrations-style framework for DynamoDB.
//
// Usage:
//   ENVIRONMENT_NAME=ci node scripts/migrations/runner.js [--phase pre-deploy|post-deploy|all]
//
// Migrations are numbered scripts in this directory (e.g., 001-convert-salt-to-registry.js).
// Each migration exports an up() function and a phase ("pre-deploy" or "post-deploy").
// Applied migrations are tracked in the bundles table under pk="system#migrations".

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getDynamoDbClient() {
  const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, QueryCommand, PutCommand } = await import("@aws-sdk/lib-dynamodb");

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "eu-west-2",
  });
  const docClient = DynamoDBDocumentClient.from(client);
  return { docClient, QueryCommand, PutCommand };
}

function getBundlesTableName() {
  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) {
    throw new Error("ENVIRONMENT_NAME is required (e.g., 'ci' or 'prod')");
  }
  return process.env.BUNDLE_DYNAMODB_TABLE_NAME || `${envName}-env-bundles`;
}

async function getAppliedMigrations(docClient, QueryCommand, tableName) {
  const response = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "hashedSub = :pk",
      ExpressionAttributeValues: {
        ":pk": "system#migrations",
      },
    }),
  );
  return new Set((response.Items || []).map((item) => item.bundleId));
}

async function recordMigration(docClient, PutCommand, tableName, migrationId, environment) {
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        hashedSub: "system#migrations",
        bundleId: migrationId,
        appliedAt: new Date().toISOString(),
        environment,
      },
    }),
  );
}

async function discoverMigrations() {
  const files = await readdir(__dirname);
  const migrationFiles = files.filter((f) => /^\d{3}-.+\.js$/.test(f)).sort();

  const migrations = [];
  for (const file of migrationFiles) {
    const mod = await import(join(__dirname, file));
    const id = file.replace(/\.js$/, "");
    migrations.push({
      id,
      file,
      phase: mod.phase || "post-deploy",
      up: mod.up,
      description: mod.description || id,
    });
  }
  return migrations;
}

export async function runMigrations(targetPhase = "all") {
  const envName = process.env.ENVIRONMENT_NAME;
  if (!envName) {
    throw new Error("ENVIRONMENT_NAME is required");
  }

  const dryRun = process.env.MIGRATION_DRY_RUN === "true";

  console.log(`\n=== Migration Runner ===`);
  console.log(`Environment: ${envName}`);
  console.log(`Phase: ${targetPhase}`);
  if (dryRun) console.log(`Dry run: true (no writes, nothing recorded)`);
  console.log();

  const tableName = getBundlesTableName();
  const { docClient, QueryCommand, PutCommand } = await getDynamoDbClient();

  const appliedSet = await getAppliedMigrations(docClient, QueryCommand, tableName);
  console.log(`Already applied: ${appliedSet.size} migration(s)`);

  const allMigrations = await discoverMigrations();
  console.log(`Discovered: ${allMigrations.length} migration(s)`);
  console.log();

  let applied = 0;
  let skipped = 0;

  for (const migration of allMigrations) {
    if (appliedSet.has(migration.id)) {
      console.log(`  [SKIP] ${migration.id} (already applied)`);
      skipped++;
      continue;
    }

    if (targetPhase !== "all" && migration.phase !== targetPhase) {
      console.log(`  [SKIP] ${migration.id} (phase: ${migration.phase}, running: ${targetPhase})`);
      continue;
    }

    console.log(`  [RUN]  ${migration.id} — ${migration.description}${dryRun ? " (dry run)" : ""}`);
    try {
      await migration.up({ envName, tableName });
      if (dryRun) {
        console.log(`  [DRY RUN] ${migration.id} (not recorded)`);
      } else {
        await recordMigration(docClient, PutCommand, tableName, migration.id, envName);
        console.log(`  [DONE] ${migration.id}`);
      }
      applied++;
    } catch (error) {
      console.error(`  [FAIL] ${migration.id}: ${error.message}`);
      throw error;
    }
  }

  console.log();
  console.log(
    `Summary: ${applied} applied${dryRun ? " (dry run, not recorded)" : ""}, ${skipped} already done, ${allMigrations.length} total`,
  );
  console.log(`=== Migration Runner Complete ===\n`);

  return { applied, skipped, total: allMigrations.length };
}

// CLI entrypoint
if (process.argv[1] === __filename) {
  const phaseArg = process.argv.find((a) => a === "--phase");
  const phaseIdx = process.argv.indexOf("--phase");
  const phase = phaseIdx >= 0 ? process.argv[phaseIdx + 1] : "all";

  runMigrations(phase).catch((err) => {
    console.error(`Migration failed: ${err.message}`);
    process.exit(1);
  });
}
