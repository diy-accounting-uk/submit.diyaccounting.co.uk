// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Finds which /submit/ci/slots/<slot> record, if any, a given ref currently holds, so
// destroy-ci.yml's `delete` trigger can retire the slot a just-deleted branch was still
// claiming. Runs on plain Node with no npm dependencies, matching claim-ci-slot.mjs.
//
// A branch delete fires no run for the branch itself - GitHub always runs the default branch's
// copy of the workflow - so this script has no claim record of its own to check against, only
// the ref to search for among the live slot records. It prints the matching slot name to stdout,
// or nothing when no slot holds that ref, and always exits 0: a lookup failure (a malformed
// record, or the aws call itself failing) is indistinguishable here from "no match", and either
// way the caller's correct response is the same - do not destroy anything on the strength of a
// guess.

import { spawnSync } from "node:child_process";

const PARAMETER_PATH_PREFIX = "/submit/ci/slots/";

export function slotForRef(records, ref) {
  for (const { name, value } of records) {
    if (!name.startsWith(PARAMETER_PATH_PREFIX)) continue;
    let record;
    try {
      record = JSON.parse(value);
    } catch {
      continue;
    }
    if (record && record.ref === ref) {
      return name.slice(PARAMETER_PATH_PREFIX.length);
    }
  }
  return null;
}

// The action resolves the CLI to an absolute path before this script runs, so the spawn never
// searches PATH for it, matching claim-ci-slot.mjs's runAws.
function runAws(args) {
  const awsCli = process.env.SLOT_FOR_REF_AWS_CLI;
  if (!awsCli || !awsCli.startsWith("/")) {
    throw new Error("SLOT_FOR_REF_AWS_CLI must be the absolute path of the aws CLI");
  }
  return spawnSync(awsCli, args, { encoding: "utf8" });
}

function getSlotRecords(region) {
  const result = runAws(["ssm", "get-parameters-by-path", "--path", PARAMETER_PATH_PREFIX, "--recursive", "--region", region, "--output", "json"]);
  if (result.status !== 0) {
    throw new Error(`aws ssm get-parameters-by-path ${PARAMETER_PATH_PREFIX} failed: ${result.stderr || result.error?.message}`);
  }
  const parsed = JSON.parse(result.stdout);
  return (parsed.Parameters || []).map((parameter) => ({ name: parameter.Name, value: parameter.Value }));
}

function main() {
  const ref = process.env.SLOT_FOR_REF_GITHUB_REF;
  const region = process.env.AWS_REGION || "eu-west-2";
  if (!ref) {
    throw new Error("SLOT_FOR_REF_GITHUB_REF must be set");
  }
  const slot = slotForRef(getSlotRecords(region), ref);
  if (slot) {
    console.log(slot);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
  }
}
