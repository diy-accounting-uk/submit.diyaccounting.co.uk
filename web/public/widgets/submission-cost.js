// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Submission Cost Widget
// Shows what a submission will cost before the customer sends it: the token price the
// catalogue carries for this activity, and the account's remaining allowance from
// GET /api/v1/bundle. Never blocks a submission on its own - only a confirmed, known-exhausted
// balance disables the submit control, and a slow or failed balance read just shows the price
// with no number, leaving the button enabled.

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
        const response = await fetch("/submit.catalogue.toml");
        if (response.ok) {
          const text = await response.text();
          catalogCache = window.TOML ? window.TOML.parse(text) : JSON.parse(text);
        }
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

  // The container sits directly above the submit control in document order (the page's only
  // job besides the script tag), so its next sibling is that control.
  function findSubmitButton(container) {
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

  function renderFree(container) {
    container.className = "submission-cost hint";
    container.textContent = "This submission is free. It does not use a token.";
  }

  function renderCostOnly(container, tokenCost) {
    container.className = "submission-cost hint";
    container.textContent = `This submission costs ${tokenCost} token${tokenCost === 1 ? "" : "s"}.`;
  }

  function renderCostAndBalance(container, tokenCost, tokensRemaining) {
    container.className = "submission-cost hint";
    container.textContent = `This submission costs ${tokenCost} token${tokenCost === 1 ? "" : "s"}. You have ${tokensRemaining} left.`;
  }

  function renderExhausted(container, resetDate) {
    container.className = "submission-cost status-message warning";
    container.textContent = "";
    const lead = resetDate
      ? `You have no tokens left. Your allowance refreshes on ${resetDate}, or you can `
      : "You have no tokens left. You can ";
    container.appendChild(document.createTextNode(lead));
    const link = document.createElement("a");
    link.href = "/bundles.html";
    link.textContent = "add a bundle";
    container.appendChild(link);
    container.appendChild(document.createTextNode("."));
  }

  async function renderContainer(container) {
    const catalog = await fetchCatalog();
    const activity = findActivity(catalog, window.location.pathname);
    const tokenCost = activity?.tokenCost || 0;
    if (tokenCost === 0) {
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

    const tokensRemaining = qualifyingBundle.tokensRemaining ?? 0;
    if (tokensRemaining < tokenCost) {
      renderExhausted(container, formatResetDate(qualifyingBundle.tokenResetAt));
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
