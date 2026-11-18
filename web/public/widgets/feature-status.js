// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/feature-status.js
// The status box lists the features the catalogue offers in this environment under their status.
// A page with <ul data-feature-status-list="auto"> is filled on load. The home page calls
// window.renderFeatureStatusList with a catalogue it has already read. A page that holds
// <template id="pageText"> supplies its own words for the status text: each span in it is marked
// data-i18n="<page>.rt-<key>", and the Welsh page build translates them. The block that holds a
// list (data-feature-status="summary") ships hidden and shows only when the list has a status
// other than production to name.

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

  // page-chrome.js gives the text in the chosen language; without it the English stands.
  function siteText(id, english) {
    return window.siteText ? window.siteText(id, english) : english;
  }

  // The status words for a page with no pageText template of its own, in the home page's Welsh.
  function statusWord(status) {
    if (status === "production") return siteText("widget.status-production", "Production");
    if (status === "sandbox") return siteText("widget.status-sandbox", "Sandbox");
    return siteText("widget.status-preview", "Preview");
  }

  function statusMeaning(status) {
    if (status === "production") return siteText("widget.status-meaning-production", "for real use");
    if (status === "sandbox") return siteText("widget.status-meaning-sandbox", "against a test service");
    return siteText("widget.status-meaning-preview", "you can try the screens, and nothing is sent");
  }

  function joinWithAnd(items) {
    if (items.length <= 1) return items.join("");
    const last = items[items.length - 1];
    const word = /^[aeiouwy]/i.test(last)
      ? pageText("and-vowel", siteText("widget.status-and-vowel", "and"))
      : pageText("and", siteText("widget.status-and", "and"));
    // Welsh "a" aspirates a following c, p or t.
    const joined = pageLanguage() === "cy" && word === "a" ? last.replace(/^[cpt]/, (letter) => `${letter}h`) : last;
    return `${items.slice(0, -1).join(", ")} ${word} ${joined}`;
  }

  function renderFeatureStatusList(list, groups) {
    const summary = list.closest('[data-feature-status="summary"]');
    if (summary) summary.hidden = !groups.some(({ status }) => status !== "production");
    list.replaceChildren(
      ...groups.map(({ status, labels }) => {
        const item = document.createElement("li");
        const tag = document.createElement("span");
        tag.className = "status-tag";
        tag.dataset.status = status;
        tag.textContent = pageText(`status-${status}`, statusWord(status));
        const meaning = pageText("meaning-" + status, statusMeaning(status));
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
