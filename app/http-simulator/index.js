// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-01 Run the HTTP simulator server
// - **Use when:** local or CI tests need HMRC, Companies House or Stripe endpoints without real calls.
// - **Does:** startSimulator starts an Express app and registers every simulator route in a fixed order. createApp answers a health check at GET /health. A shared in-memory store holds submitted returns, authorization codes and tokens, and resets between tests.
// - **Run:** `import { startSimulator } from "app/http-simulator/index.js"`; `npm run simulator`
// - **Entry:** `app/http-simulator/index.js:startSimulator`; `app/http-simulator/server.js:createApp`
// - **Files:** app/http-simulator/index.js, app/http-simulator/server.js, app/http-simulator/state/store.js, app/system-tests/hmrcSimulator.system.test.js, app/system-tests/runLocalHttpServer.system.test.js, app/system-tests/runLocalOAuth2Server.system.test.js, app/system-tests/runLocalDynamoDb.system.test.js
// - **Keywords:** http simulator, mock server, express, local server, in-memory store, fixtures, sandbox, system test
// - **Related:** DEV-02, DEV-03, DEV-14
// @end-capability

// @capability DEV-26 Enforce Claude Code conventions via rules and hooks
// - **Use when:** a Claude session writes Lambda, CDK or test code, or pushes to main.
// - **Does:** lambda-functions.md, cdk-infrastructure.md and testing.md document the handler, stack and test-naming patterns Claude sessions follow. guard-main-push.sh is a PreToolUse hook that blocks a git push to main unless every file changed is Markdown or PR-reviewed. add-references.md is a slash command that adds inline citation references to spreadsheets-site articles, sourced from GOV.UK pages via references.toml.
// - **Run:** `/add-references`
// - **Entry:** `app/http-simulator/index.js:startSimulator`; `.claude/hooks/guard-main-push.sh`; `.claude/commands/add-references.md`
// - **Files:** .claude/rules/lambda-functions.md, .claude/rules/cdk-infrastructure.md, .claude/rules/testing.md, .claude/hooks/guard-main-push.sh, .claude/commands/add-references.md
// - **Keywords:** claude rules, pretooluse hook, guard main push, lambda naming, cdk naming, test naming, add-references command, citation references
// - **Related:** DEV-27
// @end-capability

// app/http-simulator/index.js
// Entry point for the HTTP simulator that replaces:
// 1. Docker mock-oauth2-server (local app authentication)
// 2. HMRC API (VAT endpoints, OAuth token exchange)

import { createApp } from "./server.js";
import { reset as resetState } from "./state/store.js";

/**
 * Start the HTTP simulator server
 * @param {Object} options
 * @param {number} [options.port=9000] - Port to listen on (0 for random)
 * @returns {Promise<{baseUrl: string, port: number, stop: Function}>}
 */
export async function startSimulator(options = {}) {
  const port = options.port ?? 9000;
  const app = createApp();

  // Reset state before starting
  resetState();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, (err) => {
      if (err) {
        reject(err);
        return;
      }

      const actualPort = server.address().port;
      const baseUrl = `http://localhost:${actualPort}`;

      console.log(`[http-simulator] Started on ${baseUrl}`);

      resolve({
        baseUrl,
        port: actualPort,
        stop: () => {
          return new Promise((resolveStop) => {
            server.close(() => {
              console.log("[http-simulator] Stopped");
              resolveStop();
            });
          });
        },
      });
    });

    server.on("error", reject);
  });
}

export { resetState };
