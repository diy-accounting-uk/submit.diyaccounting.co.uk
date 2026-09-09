#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// Diffs the TypeScript synth of CrossAccountBackupVaultStack against the Java synth of the same
// stack, after stripping the boilerplate that differs for reasons that have nothing to do with
// which language wrote the stack: CDK bootstrap-version plumbing, the CDK CLI's own analytics
// resource, and asset hashes (this stack has none today, but the next stack in a row-33 rewrite
// might).
//
// Usage: node scripts/diff-templates.js [javaTemplatePath] [tsTemplatePath]

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_JAVA_TEMPLATE = path.resolve(
  __dirname,
  "..",
  "..",
  "cdk-submit-backup.out",
  "backup-CrossAccountBackupVaultStack.template.json",
);
const DEFAULT_TS_TEMPLATE = path.resolve(__dirname, "..", "cdk.out", "backup-CrossAccountBackupVaultStack.template.json");

const ASSET_HASH_PATTERN = /[a-f0-9]{64}/g;

function loadTemplate(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${filePath}. Run the matching synth script first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** Strips synth boilerplate that is not part of the stack's own design. */
function normalise(template) {
  const clone = JSON.parse(JSON.stringify(template));

  // Bootstrap-qualifier plumbing: same for every stack in an app, unrelated to this one.
  if (clone.Parameters) {
    delete clone.Parameters.BootstrapVersion;
    if (Object.keys(clone.Parameters).length === 0) delete clone.Parameters;
  }
  if (clone.Rules) {
    delete clone.Rules.CheckBootstrapVersion;
    if (Object.keys(clone.Rules).length === 0) delete clone.Rules;
  }

  // The CDK CLI's own analytics resource (AWS::CDK::Metadata) records CDK/construct versions and
  // whichever invocation path (java -jar vs. npx cdk synth) triggered it. It says nothing about
  // the stack under test.
  if (clone.Resources) {
    for (const [logicalId, resource] of Object.entries(clone.Resources)) {
      if (resource && resource.Type === "AWS::CDK::Metadata") {
        delete clone.Resources[logicalId];
      }
    }
  }

  // Asset hashes (Lambda/Docker asset S3 keys, docker image tags) are content-addressed and have
  // no reason to match between two independently-built synths. This stack has no assets, but the
  // normaliser stays generic so the next stack in a row-33 rewrite can reuse it unchanged.
  return replaceAssetHashes(clone);
}

function replaceAssetHashes(value) {
  if (typeof value === "string") {
    return value.replace(ASSET_HASH_PATTERN, "<ASSET_HASH>");
  }
  if (Array.isArray(value)) {
    return value.map(replaceAssetHashes);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = replaceAssetHashes(value[key]);
    }
    return out;
  }
  return value;
}

/** Recursively sorts object keys so two structurally-equal templates serialise identically. */
function canonicalise(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalise);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalise(value[key]);
    }
    return out;
  }
  return value;
}

function main() {
  const javaPath = process.argv[2] || DEFAULT_JAVA_TEMPLATE;
  const tsPath = process.argv[3] || DEFAULT_TS_TEMPLATE;

  const javaTemplate = canonicalise(normalise(loadTemplate(javaPath)));
  const tsTemplate = canonicalise(normalise(loadTemplate(tsPath)));

  const javaJson = JSON.stringify(javaTemplate, null, 2) + "\n";
  const tsJson = JSON.stringify(tsTemplate, null, 2) + "\n";

  if (javaJson === tsJson) {
    console.log("IDENTICAL after normalisation.");
    console.log(`  Java: ${javaPath}`);
    console.log(`  TS:   ${tsPath}`);
    process.exit(0);
  }

  const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "cdk-template-diff-"));
  const javaTmp = path.join(tmpDir, "java.normalised.json");
  const tsTmp = path.join(tmpDir, "typescript.normalised.json");
  fs.writeFileSync(javaTmp, javaJson);
  fs.writeFileSync(tsTmp, tsJson);

  console.log(`Differences found. Normalised templates written to ${tmpDir}\n`);
  const result = spawnSync("diff", ["-u", javaTmp, tsTmp], { encoding: "utf8" });
  console.log(result.stdout || "(diff produced no textual output)");
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

main();
