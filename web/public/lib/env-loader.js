// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/env-loader.js
(function () {
  "use strict";

  async function fetchEnv() {
    const response = await fetch("/submit.env", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load /submit.env");
    }

    const text = await response.text();
    const env = {};

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();

      env[key] = value;
    }

    return env;
  }

  // Start the fetch as soon as this script is parsed and publish the promise, so that
  // consumers await the environment instead of sampling a global and losing the race.
  const envReady = fetchEnv();
  envReady.catch((err) => console.warn("Failed to load environment:", err));

  window.envReady = envReady;
})();
