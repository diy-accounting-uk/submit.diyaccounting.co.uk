#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/use-deployed-base-url.js
//
// Set DIY_SUBMIT_BASE_URL to the base URL the deployed site names in its own submit.env, then
// run the given command. The site builds its OAuth redirect_uri from that value, and the
// browser keeps the sign-in state in sessionStorage, which belongs to one origin. A run that
// opens the site on a different host (the ci apex alias in .env.ci while the deployment is
// ci-set1) returns from the Cognito Hosted UI on the deployment host with no stored state, and
// the callback page rejects the login.
//
// Usage: node scripts/use-deployed-base-url.js -- command args...

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export function parseDeployedBaseUrl(submitEnvText) {
  const match = /^DIY_SUBMIT_BASE_URL=(\S+)\s*$/m.exec(submitEnvText ?? "");
  return match ? match[1] : null;
}

export async function resolveDeployedBaseUrl(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(new URL("submit.env", baseUrl));
  if (!response.ok) {
    throw new Error(`GET ${new URL("submit.env", baseUrl)} returned ${response.status}`);
  }
  const deployed = parseDeployedBaseUrl(await response.text());
  if (!deployed) {
    throw new Error(`submit.env at ${baseUrl} has no DIY_SUBMIT_BASE_URL`);
  }
  return deployed;
}

async function main() {
  const separatorIndex = process.argv.indexOf("--");
  if (separatorIndex === -1 || separatorIndex === process.argv.length - 1) {
    console.error("Usage: node scripts/use-deployed-base-url.js -- command args...");
    process.exit(1);
  }
  const [command, ...commandArgs] = process.argv.slice(separatorIndex + 1);
  const configured = process.env.DIY_SUBMIT_BASE_URL;
  if (!configured) {
    console.error("DIY_SUBMIT_BASE_URL is not set");
    process.exit(1);
  }
  const deployed = await resolveDeployedBaseUrl(configured);
  if (deployed !== configured) {
    console.log(`DIY_SUBMIT_BASE_URL ${configured} -> ${deployed} (the base URL the deployed site names)`);
  }
  const child = spawn(command, commandArgs, { stdio: "inherit", env: { ...process.env, DIY_SUBMIT_BASE_URL: deployed } });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
