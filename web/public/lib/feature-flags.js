// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// lib/feature-flags.js
// Client-side feature flag evaluator.
// Fetches /submit.features.toml once per page load, caches the result,
// and exposes a simple async isFeatureEnabled(id) API.
//
// Future: extend with rolloutPercent, user-segment targeting, and variant
// assignment for A/B testing. The evaluation function signature is stable
// so callers won't need to change.

(function () {
  "use strict";

  let _featuresPromise = null;

  function fetchFeatures() {
    if (_featuresPromise) return _featuresPromise;
    _featuresPromise = (async () => {
      try {
        const response = await fetch("/submit.features.toml", { cache: "no-store" });
        if (!response.ok) return {};
        const text = await response.text();
        if (window.TOML && typeof window.TOML.parse === "function") {
          return window.TOML.parse(text);
        }
        return {};
      } catch {
        return {};
      }
    })();
    return _featuresPromise;
  }

  /**
   * Check whether a feature flag is enabled.
   * @param {string} featureId - the feature id (e.g. "feedback-engagement")
   * @returns {Promise<boolean>}
   */
  async function isFeatureEnabled(featureId) {
    const config = await fetchFeatures();
    const features = config.features || [];
    const feature = features.find(function (f) {
      return f.id === featureId;
    });
    return !!(feature && feature.enabled);
  }

  window.featureFlags = { isFeatureEnabled: isFeatureEnabled };
})();
