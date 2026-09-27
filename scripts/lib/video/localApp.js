// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/localApp.js
//
// Starts the local app a scene script's own "localApp" field names — a command, the URL its web
// UI serves once it is up, and a pattern to match against the command's own stdout/stderr before
// the run treats it as ready. journey.js starts submit's own local services (dynamodb, the mock
// OAuth2 server, the site) for a logged-in scene script; this is the same idea generalised to any
// command that serves a page over HTTP, for a scene script whose target is a different local tool
// entirely rather than the submit site itself (see videos/mcp-diya-gl.json).

import { spawn } from "child_process";

const DEFAULT_READY_TIMEOUT_MS = 30000;

// Runs the command in its own process group so stop() can kill it and every child it spawned
// (npx, in turn, spawns the tool it installs) — killing only the shell child that `shell: true`
// creates would leave those grandchildren running.
export async function startLocalApp(config, { cwd = process.cwd() } = {}) {
  const { command, url, readyPattern } = config;
  const readyTimeoutMs = config.readyTimeoutMs || DEFAULT_READY_TIMEOUT_MS;
  const pattern = new RegExp(readyPattern);

  console.log(`Starting the local app this capture needs: ${command}`);
  const child = spawn(command, { shell: true, cwd, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });

  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `local app did not match readyPattern ${JSON.stringify(readyPattern)} within ${readyTimeoutMs}ms:\n${output.slice(-2000)}`,
        ),
      );
    }, readyTimeoutMs);

    function onData(chunk) {
      output += chunk.toString();
      if (pattern.test(output)) {
        cleanup();
        resolve();
      }
    }
    function onExit(code) {
      cleanup();
      reject(new Error(`local app exited before becoming ready (code ${code}):\n${output.slice(-2000)}`));
    }
    function cleanup() {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    }

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });

  console.log(`Local app ready at ${url}`);

  return {
    url,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === "win32") {
        child.kill();
      } else {
        // Negative pid signals the whole process group startLocalApp's detached:true created,
        // reaching npx's own spawned child along with the shell that `shell: true` interposed.
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    },
  };
}
