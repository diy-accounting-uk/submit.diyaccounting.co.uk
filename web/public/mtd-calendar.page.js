// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/mtd-calendar.page.js
// A "Web form" link names its catalogue activity. Where the catalogue does not list that activity
// in this environment and the person has not turned on preview features, the link becomes plain text.

(async function () {
  "use strict";
  const anchors = Array.from(document.querySelectorAll("a[data-activity]"));
  if (anchors.length === 0) return;
  try {
    const service = await import("/lib/services/catalog-service.js");
    const viewerSettings = await import("/lib/services/viewer-settings.js");
    const [response, environmentName, viewer] = await Promise.all([
      fetch("/submit.catalogue.toml"),
      service.fetchCurrentEnvironmentName(),
      viewerSettings.fetchViewer(),
    ]);
    if (!response.ok) return;
    const catalog = window.TOML.parse(await response.text());
    anchors.forEach(function (anchor) {
      const activity = (catalog.activities || []).find(function (entry) {
        return entry.id === anchor.dataset.activity;
      });
      if (activity && !service.isActivityShown(activity, environmentName, viewer)) {
        anchor.replaceWith(document.createTextNode(anchor.textContent));
      }
    });
  } catch (err) {
    console.warn("mtd-calendar: could not read the catalogue", err);
  }
})();
