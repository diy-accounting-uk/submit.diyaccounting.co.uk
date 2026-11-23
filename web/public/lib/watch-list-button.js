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

  // The server applies each change to the list it holds and answers the list as stored. The page
  // makes one change at a time so the answers arrive in the order of the changes, and the list it
  // shows is the last one stored.
  let changes = Promise.resolve();
  function inTurn(change) {
    const next = changes.then(change, change);
    changes = next.catch(() => {});
    return next;
  }

  // A refused add carries the list as stored when the server sent it, and the page shows that list.
  function add(companyNumber) {
    return inTurn(async () => {
      try {
        return changed(await (await service()).addToWatchList(companyNumber));
      } catch (error) {
        if (error.settings) changed(error.settings.watchedCompanies);
        throw error;
      }
    });
  }

  function remove(companyNumber) {
    return inTurn(async () => changed(await (await service()).removeFromWatchList(companyNumber)));
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

  // The watch list belongs to an account, so a reader who is signed out is offered the sign-in.
  function signInLink() {
    const link = document.createElement("a");
    link.className = "watch-list-sign-in";
    link.href = window.signInHref("/auth/login.html");
    link.textContent = siteText("ch.watch.sign-in-to-add", "Sign in to add to your watch list");
    return link;
  }

  /**
   * An "Add to watch list" button for one company, or a sign-in link for a reader who is signed out. It says when the company is on the list already
   * or the list is full, and follows every change to the list.
   * @param {string} companyNumber
   * @returns {HTMLButtonElement}
   */
  function button(companyNumber) {
    if (!localStorage.getItem("cognitoIdToken")) return signInLink();
    const element = document.createElement("button");
    element.type = "button";
    element.className = "secondary-button watch-list-add";
    element.dataset.companyNumber = companyNumber;
    element.textContent = siteText("ch.watch.add", "Add to watch list");
    element.disabled = true;
    // A list that could not be read says so on the button, which reads it again when pressed.
    const showList = () =>
      current()
        .then((list) => {
          delete element.dataset.unread;
          return show(element, companyNumber, list);
        })
        .catch((error) => {
          console.warn("Could not read the watch list:", error);
          element.dataset.unread = "true";
          element.textContent = siteText("ch.watch.unread-try-again", "Your watch list could not be read. Try again");
          element.disabled = false;
        });
    element.addEventListener("click", async () => {
      element.disabled = true;
      if (element.dataset.unread) {
        await showList();
        return;
      }
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
    showList();
    return element;
  }

  window.watchList = { current, add, remove, cap, button };
})();
