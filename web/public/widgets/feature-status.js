// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/feature-status.js
// The status box lists the features the catalogue offers in this environment under their status.
// A page with <ul data-feature-status-list="auto"> is filled on load. The home page calls
// window.renderFeatureStatusList with a catalogue it has already read.

(function () {
  "use strict";

  const STATUS_WORDS = { production: "Production", sandbox: "Sandbox", preview: "Preview" };
  const STATUS_MEANINGS = {
    production: "for real use",
    sandbox: "against a test service",
    preview: "on our simulator only",
  };

  function joinWithAnd(items) {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }

  function renderFeatureStatusList(list, groups) {
    list.replaceChildren(
      ...groups.map(({ status, labels }) => {
        const item = document.createElement("li");
        const tag = document.createElement("span");
        tag.className = "status-tag";
        tag.dataset.status = status;
        tag.textContent = STATUS_WORDS[status];
        item.append(tag, ` ${STATUS_MEANINGS[status]}: ${joinWithAnd(labels)}.`);
        return item;
      }),
    );
  }

  async function fillAutoLists() {
    const lists = document.querySelectorAll('[data-feature-status-list="auto"]');
    if (lists.length === 0) return;
    try {
      const service = await import("/lib/services/catalog-service.js");
      const [response, environmentName] = await Promise.all([fetch("/submit.catalogue.toml"), service.fetchCurrentEnvironmentName()]);
      if (!response.ok) return;
      const catalog = window.TOML.parse(await response.text());
      const { groups } = service.featureStatusSummary(catalog, environmentName);
      lists.forEach((list) => renderFeatureStatusList(list, groups));
    } catch (err) {
      console.warn("feature-status: could not read the catalogue", err);
    }
  }

  window.joinWithAnd = joinWithAnd;
  window.renderFeatureStatusList = renderFeatureStatusList;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fillAutoLists);
  } else {
    fillAutoLists();
  }
})();
