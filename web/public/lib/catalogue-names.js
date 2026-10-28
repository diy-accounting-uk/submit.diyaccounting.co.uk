// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/catalogue-names.js
// Turns the bundle and activity ids that the API returns into the names the catalogue gives
// them, and loads the catalogue once per page. An id the catalogue does not hold stays as the id.

(function () {
  "use strict";

  function nameFrom(entries, id) {
    const entry = Array.isArray(entries) ? entries.find((candidate) => candidate.id === id) : null;
    return (entry && entry.name) || id;
  }

  function bundleName(catalogue, bundleId) {
    return nameFrom(catalogue && catalogue.bundles, bundleId);
  }

  function activityName(catalogue, activityId) {
    return nameFrom(catalogue && catalogue.activities, activityId);
  }

  let catalogueRequest = null;

  // Resolves to the parsed catalogue, or null when it cannot be loaded.
  function loadCatalogue() {
    if (!catalogueRequest) {
      catalogueRequest = fetch("/submit.catalogue.toml")
        .then((response) => (response.ok ? response.text() : null))
        .then((text) => (text && window.TOML ? window.TOML.parse(text) : null))
        .catch(() => null);
    }
    return catalogueRequest;
  }

  window.catalogueNames = { bundleName, activityName, loadCatalogue };
})();
