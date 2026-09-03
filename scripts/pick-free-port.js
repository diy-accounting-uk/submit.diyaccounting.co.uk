#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/pick-free-port.js
//
// Resolve one free TCP port, set it into env vars, and run the given command with that env —
// before the command's own process starts. Some behaviour test files (e.g.
// submitVat.behaviour.test.js) read TEST_SERVER_HTTP_PORT and DIY_SUBMIT_BASE_URL into
// module-level consts at import time, before their beforeAll hook runs — too early for
// runLocalHttpServer (behaviour-tests/helpers/behaviour-helpers.js) to resolve an ephemeral port
// in-process. Picking the port here, before that process even starts, lets two concurrent runs
// bind different ports instead of colliding on a pinned one.
//
// Usage: node scripts/pick-free-port.js VAR_NAME ["OTHER_VAR=template with {port}"] -- command args...

import net from "node:net";
import { spawn } from "node:child_process";

function getFreeTcpPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const separatorIndex = process.argv.indexOf("--");
if (separatorIndex === -1 || separatorIndex === process.argv.length - 1) {
  console.error('Usage: node scripts/pick-free-port.js VAR_NAME ["OTHER_VAR=template with {port}"] -- command args...');
  process.exit(1);
}

const varArgs = process.argv.slice(2, separatorIndex);
const [command, ...commandArgs] = process.argv.slice(separatorIndex + 1);

const port = await getFreeTcpPort();

const env = { ...process.env };
for (const arg of varArgs) {
  const eqIndex = arg.indexOf("=");
  if (eqIndex === -1) {
    env[arg] = String(port);
  } else {
    const name = arg.slice(0, eqIndex);
    const template = arg.slice(eqIndex + 1);
    env[name] = template.replace("{port}", port);
  }
}

const child = spawn(command, commandArgs, { env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
