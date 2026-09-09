#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// CDK app entry for the backlog-33a spike: synthesises only CrossAccountBackupVaultStack, the
// same construction SubmitBackupAccount.java performs for that one stack. The sibling
// BackupAccountAccessStack is deliberately left out — it would pull in a second stack's worth of
// IAM role and OIDC constructs that this spike does not need to answer "how faithful is a
// straight port of one stack".

import { App, Environment, Tags } from "aws-cdk-lib";
import { CrossAccountBackupVaultStack } from "../lib/cross-account-backup-vault-stack";

const app = new App();

function contextString(key: string, fallback: string): string {
  const value = app.node.tryGetContext(key);
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

const cdkDefaultAccount = process.env.CDK_DEFAULT_ACCOUNT;
const cdkDefaultRegion = process.env.CDK_DEFAULT_REGION;
const primaryEnv: Environment | undefined =
  cdkDefaultAccount && cdkDefaultRegion ? { account: cdkDefaultAccount, region: cdkDefaultRegion } : undefined;

const vaultName = process.env.CROSS_ACCOUNT_VAULT_NAME ?? contextString("vaultName", "submit-cross-account-vault");

const rawRoleArns =
  process.env.SOURCE_BACKUP_ROLE_ARNS ?? contextString("sourceBackupRoleArns", "");
const sourceBackupRoleArns = rawRoleArns
  .split(",")
  .map((arn: string) => arn.trim())
  .filter((arn: string) => arn.length > 0);

if (sourceBackupRoleArns.length === 0) {
  throw new Error(
    "No source backup role ARNs configured. Set SOURCE_BACKUP_ROLE_ARNS or sourceBackupRoleArns in cdk.json " +
      "to the deployment accounts' backup service roles. A vault nothing can copy into is not worth deploying.",
  );
}

const stack = new CrossAccountBackupVaultStack(app, "backup-CrossAccountBackupVaultStack", {
  env: primaryEnv,
  vaultName,
  sourceBackupRoleArns,
});

// Mirrors CostAllocationTags.applyTo(app, "backup", "backup") in the Java app: cost-allocation
// tags are Aspects on the whole app, not stack properties, because applying them stack by stack
// let the largest line items on the bill ship with no tags at all. Tags.of(...).add() is the
// Aspect-based path that writes literal Tags/BackupVaultTags into each taggable resource at synth
// time; Stack#tags (CFN stack-level tags, propagated only at deploy time) would not show up here.
const APPLICATION = "@diy-accounting-uk/submit.diyaccounting.co.uk";
Tags.of(app).add("Application", APPLICATION);
Tags.of(app).add("CostCenter", APPLICATION);
Tags.of(app).add("Owner", APPLICATION);
Tags.of(app).add("Project", APPLICATION);
Tags.of(app).add("Environment", "backup");
Tags.of(app).add("DeploymentName", "backup");
Tags.of(app).add("ManagedBy", "aws-cdk");
Tags.of(stack).add("Stack", "CrossAccountBackupVaultStack");

app.synth();
