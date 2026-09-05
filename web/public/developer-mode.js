// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Developer Mode Toggle Script
// Provides a global developer mode toggle that persists in sessionStorage.
// The toggle icon only appears if the user has a synthetic bundle (qualifiers.synthetic === true).
// When enabled:
// - Adds 'developer-mode' class to <body>
// - Shows header dev info (traceparent, x-request-id, entitlement) with terminal styling
// - Shows footer dev links (tests, api) with terminal styling
// - Shows developer sections on forms (test scenarios, validation options)
//
(function () {
  const KEY = "showDeveloperOptions";

  // Read current state
  const isEnabled = () => sessionStorage.getItem(KEY) === "true";

  // Check if user has a synthetic bundle (granted via test pass)
  async function userHasSyntheticBundle() {
    try {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return false;

      const response = await fetch("/api/v1/bundle", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return false;

      const data = await response.json();
      const bundles = Array.isArray(data?.bundles) ? data.bundles : [];
      return bundles.some((b) => b?.qualifiers?.synthetic === true);
    } catch (e) {
      console.warn("Failed to check synthetic bundle for developer mode:", e);
      return false;
    }
  }

  // Copy icon SVG
  const copyIconSvg = `<svg class="dev-copy-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>`;

  // Copy to clipboard helper
  function copyToClipboard(text, element) {
    navigator.clipboard
      ?.writeText?.(text)
      .then(() => {
        const original = element.style.color;
        element.style.color = "#00ff00";
        return setTimeout(() => {
          element.style.color = original;
        }, 200);
      })
      .catch((err) => console.warn("Copy failed:", err));
  }

  // Get deployment name from meta tag or URL
  function getDeploymentName() {
    const hostname = window.location.hostname;
    if (hostname.includes("ci.")) return "ci";
    if (hostname.includes("prod.") || hostname === "submit.diyaccounting.co.uk") return "prod";
    if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) return "local";
    // Try to extract from subdomain pattern like ci-branchname.submit...
    const match = hostname.match(/^([^.]+)\./);
    return match ? match[1] : hostname;
  }

  // Create or update dev float elements
  function createDevFloats() {
    const body = document.body;

    // DateTime float
    let datetimeEl = document.getElementById("dev-datetime");
    if (!datetimeEl) {
      datetimeEl = document.createElement("div");
      datetimeEl.id = "dev-datetime";
      datetimeEl.className = "dev-float-left";
      body.appendChild(datetimeEl);
    }
    const now = new Date();
    datetimeEl.textContent = now.toLocaleString();

    // Deployment float
    let deploymentEl = document.getElementById("dev-deployment");
    if (!deploymentEl) {
      deploymentEl = document.createElement("div");
      deploymentEl.id = "dev-deployment";
      deploymentEl.className = "dev-float-left";
      deploymentEl.style.cursor = "pointer";
      body.appendChild(deploymentEl);
    }
    const deployment = getDeploymentName();
    deploymentEl.innerHTML = `deploy: ${deployment} ${copyIconSvg}`;
    deploymentEl.onclick = () => copyToClipboard(deployment, deploymentEl);

    // Traceparent float
    let traceparentEl = document.getElementById("dev-traceparent");
    if (!traceparentEl) {
      traceparentEl = document.createElement("div");
      traceparentEl.id = "dev-traceparent";
      traceparentEl.className = "dev-float-left";
      traceparentEl.style.cursor = "pointer";
      body.appendChild(traceparentEl);
    }
    const traceparent = sessionStorage.getItem("traceparent") || window.__correlation?.getTraceparent?.() || "-";
    const tpShort = traceparent.length > 20 ? traceparent.substring(0, 20) + "..." : traceparent;
    traceparentEl.innerHTML = `trace: ${tpShort} ${copyIconSvg}`;
    traceparentEl.title = traceparent;
    traceparentEl.onclick = () => copyToClipboard(traceparent, traceparentEl);

    // Request ID float
    let requestIdEl = document.getElementById("dev-requestid");
    if (!requestIdEl) {
      requestIdEl = document.createElement("div");
      requestIdEl.id = "dev-requestid";
      requestIdEl.className = "dev-float-left";
      requestIdEl.style.cursor = "pointer";
      body.appendChild(requestIdEl);
    }
    const requestId = window.__correlation?.getLastXRequestId?.() || window.getLastXRequestId?.() || "-";
    const ridShort = requestId.length > 20 ? requestId.substring(0, 20) + "..." : requestId;
    requestIdEl.innerHTML = `req-id: ${ridShort} ${copyIconSvg}`;
    requestIdEl.title = requestId;
    requestIdEl.onclick = () => copyToClipboard(requestId, requestIdEl);

    // Update request ID on correlation changes
    window.addEventListener("correlation:update", () => {
      const rid = window.__correlation?.getLastXRequestId?.() || window.getLastXRequestId?.() || "-";
      const short = rid.length > 20 ? rid.substring(0, 20) + "..." : rid;
      requestIdEl.innerHTML = `req-id: ${short} ${copyIconSvg}`;
      requestIdEl.title = rid;
      requestIdEl.onclick = () => copyToClipboard(rid, requestIdEl);
    });
  }

  // Remove dev float elements
  function removeDevFloats() {
    ["dev-datetime", "dev-deployment", "dev-traceparent", "dev-requestid"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // Apply state to body class, icon, and dev elements visibility
  function applyState() {
    const enabled = isEnabled();
    document.body.classList.toggle("developer-mode", enabled);

    const icon = document.querySelector(".developer-mode-toggle");
    if (icon) {
      // When enabled: coloured wrench, when off: greyed out
      const wrench = icon.querySelector("svg path");
      if (wrench) {
        wrench.style.fill = enabled ? "#e67e22" : "#888";
      }
      // Add subtle glow when enabled
      icon.style.filter = enabled ? "drop-shadow(0 0 4px rgba(230, 126, 34, 0.6))" : "";
    }

    // Create or remove dev floats
    if (enabled) {
      createDevFloats();
    } else {
      removeDevFloats();
    }

    // Toggle visibility of entitlement status
    const entitlementStatus = document.querySelector(".entitlement-status");
    if (entitlementStatus) entitlementStatus.style.display = enabled ? "block" : "none";

    // Toggle visibility of footer dev links
    const viewSourceLink = document.getElementById("viewSourceLink");
    const testsLink = document.getElementById("latestTestsLink");
    const apiDocsLink = document.getElementById("apiDocsLink");
    if (viewSourceLink) viewSourceLink.style.display = enabled ? "block" : "none";
    if (testsLink) testsLink.style.display = enabled ? "block" : "none";
    if (apiDocsLink) apiDocsLink.style.display = enabled ? "block" : "none";

    // Dispatch event for page-specific handlers (e.g., show/hide form developer sections)
    window.dispatchEvent(new CustomEvent("developer-mode-changed", { detail: { enabled } }));
  }

  // Inject toggle icon into header-left (only if user has a synthetic bundle)
  async function injectToggle() {
    const headerLeft = document.querySelector(".header-left");
    if (!headerLeft) return;

    // Don't inject twice
    if (headerLeft.querySelector(".developer-mode-toggle")) return;

    // Only show icon if user has a synthetic bundle
    const hasSyntheticBundle = await userHasSyntheticBundle();

    // Set sessionStorage for synthetic mode based on bundle qualifiers (single source of truth)
    if (hasSyntheticBundle) {
      sessionStorage.setItem("hmrcAccount", "synthetic");
    } else {
      sessionStorage.removeItem("hmrcAccount");
    }

    if (!hasSyntheticBundle) return;

    const toggle = document.createElement("a");
    toggle.href = "#";
    toggle.title = "Toggle Developer Mode";
    toggle.className = "developer-mode-toggle";
    // Wrench icon - works well at small sizes
    toggle.innerHTML = `
      <svg class="developer-icon" viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;">
        <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" fill="#888"/>
      </svg>
    `;

    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      sessionStorage.setItem(KEY, isEnabled() ? "" : "true");
      applyState();
    });

    headerLeft.appendChild(toggle);
    applyState();
  }

  // Inject CSS for terminal overlay styling
  function injectStyles() {
    if (document.getElementById("developer-mode-styles")) return;

    const style = document.createElement("style");
    style.id = "developer-mode-styles";
    style.textContent = `
      /* Developer Mode Toggle Icon Styling */
      .developer-mode-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        margin-left: 8px;
        text-decoration: none;
        transition: transform 0.3s ease;
      }

      .developer-mode-toggle:hover {
        filter: drop-shadow(0 0 6px rgba(241, 196, 15, 0.8)) !important;
      }

      .developer-icon {
        width: 24px;
        height: 24px;
      }

      /* ================================================================
         TERMINAL OVERLAY STYLING
         Inspired by Homebrew Mac Terminal / Alien movie CRT aesthetics
         Applied when body.developer-mode is set
         ================================================================ */

      /* Hide developer controls button when using global toggle */
      body.developer-mode .developer-controls {
        display: none;
      }

      /* ================================================================
         TERMINAL SIDEBAR - LEFT SIDE
         All dev info positioned vertically on the left
         ================================================================ */

      /* Base styling for all left-side dev floats */
      .dev-float-left {
        position: fixed;
        left: 0;
        background: rgba(0, 15, 0, 0.5);
        border: 1px solid rgba(0, 255, 0, 0.4);
        border-left: none;
        border-radius: 0 4px 4px 0;
        padding: 4px 12px;
        font-family: "Courier New", Consolas, Monaco, monospace;
        color: #00ff00 !important;
        text-shadow: 0 0 3px rgba(0, 255, 0, 0.5);
        font-size: 0.7em;
        z-index: 1000;
      }

      .dev-float-left:hover {
        background: rgba(0, 30, 0, 0.6);
        border-color: #00ff00;
        box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
      }

      /* Copy icon styling */
      .dev-copy-icon {
        cursor: pointer;
        margin-left: 6px;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .dev-copy-icon:hover {
        opacity: 1;
      }

      /* Individual float positions */
      body.developer-mode #dev-datetime { top: 80px; }
      body.developer-mode #dev-deployment { top: 110px; }
      body.developer-mode #dev-traceparent { top: 140px; }
      body.developer-mode #dev-requestid { top: 170px; }
      body.developer-mode .entitlement-status { top: 200px; }
      body.developer-mode #latestTestsLink { top: 230px; }
      body.developer-mode #apiDocsLink { top: 260px; }
      body.developer-mode #viewSourceLink { top: 290px; }
      body.developer-mode #localstorageContainer { top: 320px; }

      /* Entitlement status styling */
      body.developer-mode .entitlement-status {
        position: fixed;
        left: 0;
        background: rgba(0, 15, 0, 0.5);
        border: 1px solid rgba(0, 255, 0, 0.4);
        border-left: none;
        border-radius: 0 4px 4px 0;
        padding: 4px 12px;
        font-family: "Courier New", Consolas, Monaco, monospace;
        color: #00ff00 !important;
        text-shadow: 0 0 3px rgba(0, 255, 0, 0.5);
        font-size: 0.7em;
        z-index: 1000;
      }

      /* Footer dev links */
      body.developer-mode #latestTestsLink,
      body.developer-mode #apiDocsLink,
      body.developer-mode #viewSourceLink {
        position: fixed;
        left: 0;
        background: rgba(0, 15, 0, 0.5);
        border: 1px solid rgba(0, 255, 0, 0.4);
        border-left: none;
        border-radius: 0 4px 4px 0;
        padding: 4px 12px;
        font-family: "Courier New", Consolas, Monaco, monospace;
        color: #00ff00 !important;
        text-shadow: 0 0 3px rgba(0, 255, 0, 0.5);
        text-decoration: none;
        font-size: 0.7em;
        z-index: 1000;
        display: block !important;
      }

      body.developer-mode #latestTestsLink:hover,
      body.developer-mode #apiDocsLink:hover,
      body.developer-mode #viewSourceLink:hover {
        background: rgba(0, 30, 0, 0.6);
        border-color: #00ff00;
        box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
      }

      /* ================================================================
         TERMINAL STYLING FOR FORM DEVELOPER SECTIONS
         Applied to #developerSection on forms
         ================================================================ */
      body.developer-mode #developerSection {
        position: relative;
        display: block !important;
        background: rgba(0, 15, 0, 0.5);
        border: 1px solid rgba(0, 255, 0, 0.3);
        border-radius: 6px;
        padding: 12px;
        margin: 16px 0;
        font-family: "Courier New", Consolas, Monaco, monospace;
        font-size: 0.85em;
        color: #00ff00;
        box-shadow: 0 0 8px rgba(0, 255, 0, 0.15);
        overflow: hidden;
      }

      /* Subtle scanline effect */
      body.developer-mode #developerSection::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0, 0, 0, 0.05) 2px,
          rgba(0, 0, 0, 0.05) 4px
        );
        pointer-events: none;
        z-index: 1;
      }

      /* Terminal header bar (decorative) */
      body.developer-mode #developerSection::after {
        content: "developer";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        background: rgba(0, 20, 0, 0.6);
        border-bottom: 1px solid rgba(0, 255, 0, 0.2);
        padding: 2px 12px;
        font-size: 9px;
        letter-spacing: 1px;
        color: rgba(0, 255, 0, 0.5);
        text-transform: lowercase;
      }

      /* Adjust content to account for terminal header */
      body.developer-mode #developerSection > * {
        position: relative;
        z-index: 2;
        margin-top: 8px;
      }

      body.developer-mode #developerSection > *:first-child {
        margin-top: 20px;
      }

      /* Terminal text styling */
      body.developer-mode #developerSection label {
        color: #00ff00;
        font-weight: normal;
        font-family: "Courier New", Consolas, Monaco, monospace;
        text-shadow: 0 0 3px rgba(0, 255, 0, 0.3);
        text-transform: lowercase;
      }

      body.developer-mode #developerSection .hint {
        color: rgba(0, 200, 0, 0.8);
        font-style: normal;
      }

      /* Terminal form controls */
      body.developer-mode #developerSection select,
      body.developer-mode #developerSection input[type="checkbox"] {
        background: rgba(0, 30, 0, 0.8);
        border: 1px solid rgba(0, 255, 0, 0.4);
        color: #00ff00;
        font-family: "Courier New", Consolas, Monaco, monospace;
      }

      body.developer-mode #developerSection select:focus {
        outline: none;
        border-color: #00ff00;
        box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
      }

      body.developer-mode #developerSection select option {
        background: #001a00;
        color: #00ff00;
      }

      /* Checkbox custom styling in terminal */
      body.developer-mode #developerSection input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: #00ff00;
      }

      /* Test data link inside developer section */
      body.developer-mode #developerSection .test-data-link {
        display: block;
        text-align: left;
        margin-bottom: 8px;
      }

      body.developer-mode #developerSection .test-data-link a {
        color: #00ff00;
        border-color: rgba(0, 255, 0, 0.4);
        font-family: "Courier New", Consolas, Monaco, monospace;
        text-transform: lowercase;
        font-size: 0.9em;
      }

      body.developer-mode #developerSection .test-data-link a:hover {
        background-color: rgba(0, 255, 0, 0.15);
        color: #00ff00;
      }

      /* Subtle hover glow */
      body.developer-mode #developerSection:hover {
        box-shadow: 0 0 12px rgba(0, 255, 0, 0.2);
      }

      /* Synthetic obligations option - nested terminal styling */
      body.developer-mode #syntheticObligationsOption {
        display: block;
        margin-top: 10px;
        padding: 8px;
        background: rgba(0, 10, 0, 0.5);
        border-left: 2px solid rgba(0, 255, 0, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  // Re-check synthetic bundle and inject/remove icon as needed
  async function refreshToggleVisibility() {
    const headerLeft = document.querySelector(".header-left");
    if (!headerLeft) return;

    const existingToggle = headerLeft.querySelector(".developer-mode-toggle");
    const hasSyntheticBundle = await userHasSyntheticBundle();

    // Update sessionStorage for synthetic mode based on bundle qualifiers (single source of truth)
    if (hasSyntheticBundle) {
      sessionStorage.setItem("hmrcAccount", "synthetic");
    } else {
      sessionStorage.removeItem("hmrcAccount");
    }

    if (hasSyntheticBundle && !existingToggle) {
      // User now has synthetic bundle, inject the icon
      await injectToggle();
    } else if (!hasSyntheticBundle && existingToggle) {
      // User no longer has synthetic bundle, remove the icon
      existingToggle.remove();
      // Also disable developer mode
      sessionStorage.setItem(KEY, "");
      applyState();
    }
  }

  // Run on DOMContentLoaded or immediately if already loaded
  function init() {
    injectStyles();
    injectToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // DOM is already ready (interactive or complete)
    init();
  }

  // Listen for bundle changes and refresh toggle visibility
  window.addEventListener("bundle-changed", refreshToggleVisibility);
  window.addEventListener("storage", (e) => {
    if (e.key === "cognitoIdToken" || e.key === "userInfo") {
      refreshToggleVisibility();
    }
  });
})();
