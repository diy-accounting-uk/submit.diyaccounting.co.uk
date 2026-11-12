// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Submission Cost Widget
// Shows what a submission will cost before the customer sends it: the token price the
// catalogue carries for this activity, and the account's remaining allowance from
// GET /api/v1/bundle. Never blocks a submission on its own - only a confirmed, known-exhausted
// balance disables the submit control, and a slow or failed balance read just shows the price
// with no number, leaving the button enabled.
//
// A page whose cost depends on what it is about to send (one return, two returns, accounts and a
// return) sets data-token-cost and data-cost-lead on the container and calls
// window.SubmissionCost.refresh(). The container's own cost then replaces the catalogue's, and the
// lead is the sentence that says what the cost is for.

(function () {
  "use strict";

  let catalogCache = null;
  let catalogPromise = null;

  // A direct fetch + parse, the same shape entitlement-status.js uses, rather than the
  // module-exported catalog helpers in submit.js: those are only assigned once that module
  // script runs, which on this page happens after the classic scripts that follow it, so a
  // widget loaded in that same classic-script block cannot rely on them being ready yet.
  async function fetchCatalog() {
    if (catalogCache) return catalogCache;
    if (catalogPromise) return catalogPromise;

    catalogPromise = (async () => {
      try {
        const catalogService = await import("/lib/services/catalog-service.js");
        const text = await catalogService.fetchCatalogText();
        catalogCache = window.TOML ? catalogService.parseCatalogueText(text) : JSON.parse(text);
      } catch (err) {
        console.warn("Failed to fetch catalogue for submission cost:", err);
      }
      return catalogCache;
    })();

    return catalogPromise;
  }

  // Mirrors entitlement-status.js and hmrc-scope-check.js: the activity that governs a page is
  // whichever one lists that page's own path, not a name fixed in this file. Pages on the same
  // self-employment flow can and do carry different token costs - a quarterly update spends a
  // token, the annual submission next to it does not - so each page's own activity is what
  // tells the truth about what it costs.
  function matchesRegexPattern(pattern, normalizedPath) {
    try {
      const regex = new RegExp(pattern);
      return regex.test(normalizedPath) || regex.test("/" + normalizedPath);
    } catch (err) {
      console.warn("Invalid regex pattern in catalog:", pattern, err);
      return false;
    }
  }

  function matchesSimplePath(path, normalizedPath) {
    const normalizedActivityPath = path.replace(/^\//, "");
    return normalizedPath === normalizedActivityPath || normalizedPath.endsWith("/" + normalizedActivityPath);
  }

  function findActivity(catalog, pagePath) {
    if (!catalog?.activities) return null;
    const normalizedPath = String(pagePath || "")
      .replace(/^\//, "")
      .split("?")[0];

    for (const activity of catalog.activities) {
      const paths = activity.paths || (activity.path ? [activity.path] : []);
      for (const p of paths) {
        const isMatch = p.startsWith("^") ? matchesRegexPattern(p, normalizedPath) : matchesSimplePath(p, normalizedPath);
        if (isMatch) return activity;
      }
    }
    return null;
  }

  async function fetchBundleData() {
    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) return null;

    try {
      const rc = window.requestCache;
      if (rc && typeof rc.getJSON === "function") {
        return await rc.getJSON("/api/v1/bundle", {
          ttlMs: 5000,
          init: { headers: { Authorization: `Bearer ${idToken}` } },
        });
      }
      if (window.fetchWithIdToken) {
        const response = await window.fetchWithIdToken("/api/v1/bundle", {});
        if (response.ok) return await response.json();
      }
    } catch (err) {
      console.warn("Failed to fetch bundle balance for submission cost:", err);
    }
    return null;
  }

  // Mirrors the qualifying-bundle selection in app/services/tokenEnforcement.js: the first
  // allocated bundle in the activity's own bundle list that carries a token allowance. Reusing
  // that selection keeps the figure shown here the same one the server will charge against.
  function findQualifyingBundle(bundleData, activity) {
    if (!bundleData?.bundles || !activity?.bundles) return null;
    const activityBundleIds = new Set(activity.bundles);
    return bundleData.bundles.find((b) => b.allocated && activityBundleIds.has(b.bundleId) && b.tokensGranted !== undefined) || null;
  }

  function formatResetDate(isoDate) {
    if (!isoDate) return null;
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  // The control is the container's next sibling, or the button named by data-submit-button
  // when the page groups it with others (a Back button beside a Submit button).
  function findSubmitButton(container) {
    if (container.dataset.submitButton) return document.getElementById(container.dataset.submitButton);
    const next = container.nextElementSibling;
    return next && next.tagName === "BUTTON" ? next : null;
  }

  // Disables the button when tokens are known to be exhausted, and only re-enables it if this
  // widget was the one that disabled it - never overriding a page's own reason for disabling
  // its submit control (an unticked declaration, an unresolved calculation, and so on).
  function setBlockedByTokens(button, blocked) {
    if (!button) return;
    if (blocked) {
      button.disabled = true;
      button.dataset.submissionCostBlocked = "true";
    } else if (button.dataset.submissionCostBlocked === "true") {
      button.disabled = false;
      delete button.dataset.submissionCostBlocked;
    }
  }

  function tokenWord(count) {
    return `${count} token${count === 1 ? "" : "s"}`;
  }

  // The cost a page computed for itself, or undefined when the container leaves it to the catalogue.
  function pageCost(container) {
    if (container.dataset.tokenCost === undefined) return undefined;
    const cost = Number(container.dataset.tokenCost);
    return Number.isInteger(cost) && cost >= 0 ? cost : undefined;
  }

  function costLead(container, tokenCost) {
    return container.dataset.costLead || `This submission costs ${tokenWord(tokenCost)}.`;
  }

  function renderFree(container) {
    container.className = "submission-cost hint";
    container.textContent = "This submission is free. It does not use a token.";
  }

  function renderCostOnly(container, tokenCost) {
    container.className = "submission-cost hint";
    container.textContent = costLead(container, tokenCost);
  }

  function renderCostAndBalance(container, tokenCost, tokensRemaining) {
    container.className = "submission-cost hint";
    container.textContent = `${costLead(container, tokenCost)} You have ${tokensRemaining} left.`;
  }

  function renderUnlimitedBalance(container, tokenCost) {
    container.className = "submission-cost hint";
    container.textContent = `${costLead(container, tokenCost)} You have unlimited tokens.`;
  }

  function renderExhausted(container, resetDate, tokensRemaining, tokenCost) {
    container.className = "submission-cost status-message status-warning";
    container.textContent = "";
    // One span, so the warning's flex layout keeps the sentence and its link in one run of text.
    const message = document.createElement("span");
    const balance =
      tokensRemaining > 0 ? `You have ${tokenWord(tokensRemaining)} left and this filing costs ${tokenCost}.` : "You have no tokens left.";
    const lead = resetDate ? `${balance} Your allowance refreshes on ${resetDate}, or you can ` : `${balance} You can `;
    message.appendChild(document.createTextNode(lead));
    const link = document.createElement("a");
    link.href = "/bundles.html";
    link.textContent = "add a bundle";
    message.appendChild(link);
    message.appendChild(document.createTextNode("."));
    container.appendChild(message);
  }

  async function renderContainer(container) {
    const catalog = await fetchCatalog();
    const activity = findActivity(catalog, window.location.pathname);
    const computedCost = pageCost(container);
    const tokenCost = computedCost ?? (activity?.tokenCost || 0);
    // A computed cost of zero still names its reason and shows the balance; only a catalogue
    // activity with no price is simply free.
    if (tokenCost === 0 && computedCost === undefined) {
      renderFree(container);
      return;
    }

    const bundleData = await fetchBundleData();
    const qualifyingBundle = findQualifyingBundle(bundleData, activity);
    const button = findSubmitButton(container);

    if (!qualifyingBundle) {
      // Balance unknown: not signed in yet, or the read failed. Never a guess, never a block.
      renderCostOnly(container, tokenCost);
      setBlockedByTokens(button, false);
      return;
    }

    if (qualifyingBundle.tokensGranted === "unlimited") {
      renderUnlimitedBalance(container, tokenCost);
      setBlockedByTokens(button, false);
      return;
    }

    const tokensRemaining = qualifyingBundle.tokensRemaining ?? 0;
    if (tokensRemaining < tokenCost) {
      renderExhausted(container, formatResetDate(qualifyingBundle.tokenResetAt), tokensRemaining, tokenCost);
      setBlockedByTokens(button, true);
    } else {
      renderCostAndBalance(container, tokenCost, tokensRemaining);
      setBlockedByTokens(button, false);
    }
  }

  function containers() {
    return Array.from(document.querySelectorAll(".submission-cost"));
  }

  function refresh() {
    containers().forEach((container) => {
      renderContainer(container).catch((err) => console.warn("Failed to render submission cost:", err));
    });
  }

  function initialize() {
    refresh();
  }

  if (typeof window !== "undefined") {
    window.SubmissionCost = { refresh, initialize };
    window.__submissionCost = {
      findQualifyingBundle,
      formatResetDate,
      findActivity,
    };

    // The page dispatches this after a successful write (mirroring bundles.html after a grant
    // or revoke) and a page's own catch block dispatches it again after a 403 that reports
    // tokens_exhausted, so a balance the server itself just corrected is never left stale here.
    window.addEventListener("bundle-changed", function () {
      if (window.requestCache) window.requestCache.invalidate("/api/v1/bundle");
      refresh();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
