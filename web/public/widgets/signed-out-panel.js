// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/signed-out-panel.js
// Puts the signed-out panel in place of a form for a visitor who is not logged in. An element
// marked data-requires-sign-in is hidden, and a panel with a Log in button goes in front of it.
// data-sign-in-title and data-sign-in-text say what the page does and what logging in gives.

(function () {
  "use strict";

  function isSignedIn() {
    try {
      return Boolean(localStorage.getItem("cognitoIdToken"));
    } catch {
      return false;
    }
  }

  function loginUrl() {
    const script = document.currentScript;
    return script ? new URL("../auth/login.html", script.src).pathname : "/auth/login.html";
  }

  const loginHref = loginUrl();

  function buildPanel(marked) {
    const panel = document.createElement("section");
    panel.className = "signed-out-panel";
    panel.id = "signedOutPanel";
    const heading = document.createElement("h2");
    heading.textContent = marked.dataset.signInTitle || "Log in to continue";
    const text = document.createElement("p");
    text.textContent = marked.dataset.signInText || "Log in to use this page.";
    const link = document.createElement("a");
    link.className = "btn";
    link.href = loginHref;
    link.textContent = "Log in";
    panel.append(heading, text, link);
    return panel;
  }

  function apply() {
    if (isSignedIn()) return;
    const marked = document.querySelectorAll("[data-requires-sign-in]");
    if (marked.length === 0) return;
    marked.forEach((element) => {
      element.style.display = "none";
    });
    marked[0].before(buildPanel(marked[0]));
  }

  apply();
})();
