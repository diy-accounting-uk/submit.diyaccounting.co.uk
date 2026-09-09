// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
