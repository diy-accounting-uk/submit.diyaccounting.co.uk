// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-165 Check every secret against its rotation schedule
// - **Use when:** you need to know which keys are overdue for a roll or end within 30 days, for ci or prod.
// - **Does:** check-rotation.js reads secrets-rotation.toml and each AWS secret's rotated-at tag through buildRotationRows, prints one line per key, and exits 1 when a key is overdue or due within 30 days. It never reads a secret value. With --issue-body it writes the Markdown body of the rotation issue. rotation-check.yml runs it weekly and raises the issue; manage-secrets.yml runs it for the check-rotation action.
// - **Run:** `node scripts/check-rotation.js --environment <ci|prod> [--as-of YYYY-MM-DD] [--issue-body <file>]`; `gh workflow run rotation-check.yml`
// - **Entry:** `scripts/check-rotation.js:evaluateRotation`
// - **Files:** scripts/check-rotation.js, secrets-rotation.toml, .github/workflows/rotation-check.yml, app/unit-tests/scripts/checkRotation.test.js
// - **Keywords:** secret rotation, rotation check, key age, expires at, max age days, rotated-at, overdue key
// - **Related:** OPS-45
// @end-capability

// scripts/check-rotation.js

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { buildRotationRows } from "../app/functions/security/securityLakeNightly.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAILING_STATUSES = new Set(["overdue", "due-soon"]);

function describeRow(row) {
  if (row.status === "missing") return `${row.secret_name}: missing from Secrets Manager`;
  const due = row.days_to_due === null || row.days_to_due === undefined ? "no due date" : `${row.days_to_due} days to due`;
  const rolled = row.rotated_at ? `rolled ${row.rotated_at}` : "no roll date recorded";
  return `${row.secret_name}: ${row.status}, ${due}, ${rolled}, ${row.console}`;
}

function marker(row) {
  if (FAILING_STATUSES.has(row.status)) return "FAIL";
  return row.status === "missing" || row.status === "unrecorded" ? "note" : "ok  ";
}

export function evaluateRotation(rows) {
  const keyRows = rows.filter((row) => !row.zero_findings);
  const failing = keyRows.filter((row) => FAILING_STATUSES.has(row.status));
  const notices = keyRows.filter((row) => row.status === "missing" || row.status === "unrecorded");
  return {
    failing,
    notices,
    lines: keyRows.map((row) => `${marker(row)} ${describeRow(row)}`),
  };
}

export function issueBody(environment, failing, asOf) {
  const lines = failing.map((row) => `- \`${row.secret_name}\` (${row.console}): ${describeRow(row).split(": ").slice(1).join(": ")}`);
  return [
    `Keys in ${environment} that are overdue or due within 30 days, checked ${asOf}.`,
    "",
    ...lines,
    "",
    "Roll each key with RUNBOOK_INFORMATION_SECURITY.md section 3, then update `last_rotated` in `secrets-rotation.toml`.",
    "",
  ].join("\n");
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

async function main() {
  const args = process.argv.slice(2);
  const environment = argValue(args, "--environment");
  if (environment !== "ci" && environment !== "prod") {
    console.error("usage: check-rotation.js --environment <ci|prod> [--as-of YYYY-MM-DD] [--issue-body <file>]");
    process.exit(2);
  }
  const asOf = argValue(args, "--as-of");
  const now = asOf ? new Date(`${asOf}T00:00:00Z`) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`--as-of is not a date: ${asOf}`);
    process.exit(2);
  }
  const dateStr = now.toISOString().slice(0, 10);
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
  const rows = await buildRotationRows(client, resolve(ROOT, "secrets-rotation.toml"), environment, dateStr, now);
  const { failing, notices, lines } = evaluateRotation(rows);
  console.log(`Rotation schedule for ${environment} as of ${dateStr}`);
  for (const line of lines) console.log(line);
  console.log(`${failing.length} overdue or due within 30 days; ${notices.length} missing or without a roll date`);
  const bodyFile = argValue(args, "--issue-body");
  if (bodyFile && failing.length > 0) writeFileSync(bodyFile, issueBody(environment, failing, dateStr));
  if (failing.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
