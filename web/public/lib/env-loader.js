// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-16 Configure the frontend via TOML and env libraries
// - **Use when:** a page needs runtime config, feature flags, or a cached GET with ETag revalidation.
// - **Does:** env-loader.js fetches /submit.env at runtime and parses KEY=VALUE lines into window.envReady. feature-flags.js fetches and caches /submit.features.toml and exposes isFeatureEnabled. request-cache.js is an in-memory, promise-deduplicated GET cache with TTL and ETag revalidation. toml-parser.js is the parser both rely on. storage-utils.js wraps localStorage and sessionStorage access so a quota or privacy error never throws.
// - **Run:** no command; see Does and Entry
// - **Entry:** `web/public/lib/env-loader.js`; `web/public/lib/feature-flags.js:isFeatureEnabled`; `web/public/lib/request-cache.js:getJSON`
// - **Files:** web/public/lib/env-loader.js, web/public/lib/feature-flags.js, web/public/lib/request-cache.js, web/public/lib/toml-parser.js, web/public/lib/utils/storage-utils.js, web/public/submit.features.toml
// - **Keywords:** env loader, feature flags, toml parser, request cache, etag, localStorage wrapper, runtime config, submit.env
// - **Related:** SITE-17
// @end-capability

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
