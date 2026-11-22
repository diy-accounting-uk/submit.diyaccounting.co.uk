// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The company watch list in the page: the list read once from the account, an "Add to watch list"
// button for a company, and a watchlistchange event on the document whenever the list changes, so
// every button and list on the page shows the same list.

(function () {
  "use strict";

  const service = () => import("/lib/services/watch-list-service.js");
  const siteText = (id, english, values) =>
    window.siteText
      ? window.siteText(id, english, values)
      : english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));

  let listRead = null;

  /** @returns {Promise<string[]>} The company numbers the account watches, read once for the page */
  function current() {
    if (!listRead) {
      listRead = service()
        .then((module) => module.readWatchList())
        .catch((error) => {
          listRead = null;
          throw error;
        });
    }
    return listRead;
  }

  function changed(list) {
    listRead = Promise.resolve(list);
    document.dispatchEvent(new CustomEvent("watchlistchange", { detail: list }));
    return list;
  }

  async function add(companyNumber) {
    return changed(await (await service()).addToWatchList(companyNumber));
  }

  async function remove(companyNumber) {
    return changed(await (await service()).removeFromWatchList(companyNumber));
  }

  async function cap() {
    return (await service()).WATCH_LIST_CAP;
  }

  async function show(button, companyNumber, list) {
    const limit = await cap();
    if (list.includes(companyNumber)) {
      button.textContent = siteText("ch.watch.on-list", "On your watch list");
      button.disabled = true;
    } else if (list.length >= limit) {
      button.textContent = siteText("ch.watch.list-full", "Watch list full");
      button.disabled = true;
    } else {
      button.textContent = siteText("ch.watch.add", "Add to watch list");
      button.disabled = false;
    }
  }

  /**
   * An "Add to watch list" button for one company. It says when the company is on the list already
   * or the list is full, and follows every change to the list.
   * @param {string} companyNumber
   * @returns {HTMLButtonElement}
   */
  function button(companyNumber) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "secondary-button watch-list-add";
    element.dataset.companyNumber = companyNumber;
    element.textContent = siteText("ch.watch.add", "Add to watch list");
    element.disabled = true;
    element.addEventListener("click", async () => {
      element.disabled = true;
      try {
        await add(companyNumber);
      } catch (error) {
        console.warn("The watch list was not saved:", error);
        if (window.showStatus) window.showStatus(siteText("ch.watch.not-saved", "The watch list was not saved. Try again."), "error");
        show(element, companyNumber, await current());
      }
    });
    document.addEventListener("watchlistchange", (event) => {
      if (element.isConnected) show(element, companyNumber, event.detail);
    });
    current()
      .then((list) => show(element, companyNumber, list))
      .catch((error) => console.warn("Could not read the watch list:", error));
    return element;
  }

  window.watchList = { current, add, remove, cap, button };
})();
