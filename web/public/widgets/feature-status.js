// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/feature-status.js
// The status box lists the features the catalogue offers in this environment under their status.
// A page with <ul data-feature-status-list="auto"> is filled on load. The home page calls
// window.renderFeatureStatusList with a catalogue it has already read. A page that holds
// <template id="pageText"> supplies its own words for the status text: each span in it is marked
// data-i18n="<page>.rt-<key>", and the Welsh page build translates them.

(function () {
  "use strict";

  function pageText(key, fallback) {
    const template = document.getElementById("pageText");
    const span = template && template.content.querySelector(`[data-i18n$=".rt-${key}"]`);
    return span ? span.textContent.trim() : fallback;
  }

  function pageLanguage() {
    return document.documentElement.lang;
  }

  const STATUS_WORDS = { production: "Production", sandbox: "Sandbox", preview: "Preview" };
  const STATUS_MEANINGS = {
    production: "for real use",
    sandbox: "against a test service",
    preview: "on our simulator only",
  };

  function joinWithAnd(items) {
    if (items.length <= 1) return items.join("");
    const last = items[items.length - 1];
    const word = /^[aeiouwy]/i.test(last) ? pageText("and-vowel", "and") : pageText("and", "and");
    // Welsh "a" aspirates a following c, p or t.
    const joined = pageLanguage() === "cy" && word === "a" ? last.replace(/^[cpt]/, (letter) => `${letter}h`) : last;
    return `${items.slice(0, -1).join(", ")} ${word} ${joined}`;
  }

  function renderFeatureStatusList(list, groups) {
    list.replaceChildren(
      ...groups.map(({ status, labels }) => {
        const item = document.createElement("li");
        const tag = document.createElement("span");
        tag.className = "status-tag";
        tag.dataset.status = status;
        tag.textContent = pageText(`status-${status}`, STATUS_WORDS[status]);
        const meaning = pageText("meaning-" + status, STATUS_MEANINGS[status]);
        item.append(tag, ` ${meaning}: ${joinWithAnd(labels)}.`);
        return item;
      }),
    );
  }

  async function fillAutoLists() {
    const lists = document.querySelectorAll('[data-feature-status-list="auto"]');
    if (lists.length === 0) return;
    try {
      const service = await import("/lib/services/catalog-service.js");
      const viewerSettings = await import("/lib/services/viewer-settings.js");
      const [catalogText, environmentName, viewer] = await Promise.all([
        service.fetchCatalogText(),
        service.fetchCurrentEnvironmentName(),
        viewerSettings.fetchViewer(),
      ]);
      const catalog = window.TOML.parse(catalogText);
      const { groups } = service.featureStatusSummary(catalog, environmentName, viewer, pageLanguage());
      lists.forEach((list) => renderFeatureStatusList(list, groups));
    } catch (err) {
      console.warn("feature-status: could not read the catalogue", err);
    }
  }

  window.pageText = pageText;
  window.pageLanguage = pageLanguage;
  window.joinWithAnd = joinWithAnd;
  window.renderFeatureStatusList = renderFeatureStatusList;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fillAutoLists);
  } else {
    fillAutoLists();
  }
})();
