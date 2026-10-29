// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/mtd-calendar.page.js
// A "Web form" link names its catalogue activity. Where the catalogue does not list that activity
// in this environment, the link becomes plain text.

(async function () {
  "use strict";
  const anchors = Array.from(document.querySelectorAll("a[data-activity]"));
  if (anchors.length === 0) return;
  try {
    const service = await import("/lib/services/catalog-service.js");
    const [response, environmentName] = await Promise.all([fetch("/submit.catalogue.toml"), service.fetchCurrentEnvironmentName()]);
    if (!response.ok) return;
    const catalog = window.TOML.parse(await response.text());
    anchors.forEach(function (anchor) {
      const activity = (catalog.activities || []).find(function (entry) {
        return entry.id === anchor.dataset.activity;
      });
      if (activity && !service.isActivityListedInEnvironment(activity, environmentName)) {
        anchor.replaceWith(document.createTextNode(anchor.textContent));
      }
    });
  } catch (err) {
    console.warn("mtd-calendar: could not read the catalogue", err);
  }
})();
