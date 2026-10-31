// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// --- helpers
const getIdToken = () => {
  try {
    return localStorage.getItem("cognitoIdToken");
  } catch (e) {
    // In opaque origins (e.g., setContent in tests), localStorage may be inaccessible
    return null;
  }
};

// Lightweight wrappers that use page-level cache when available, with safe fallbacks for tests
const __rc = typeof window !== "undefined" && window.requestCache ? window.requestCache : null;
const fetchAndParse = async (url, opts = {}) => {
  try {
    if (__rc && typeof __rc.getJSON === "function" && !url.endsWith(".toml")) return __rc.getJSON(url, opts);
  } catch {}
  // Fallback: Use fetchWithIdToken if authorization is needed
  const init = opts.init || {};
  const hasAuthHeader = init.headers && (init.headers.Authorization || init.headers.authorization);
  let res;
  if (hasAuthHeader && window.fetchWithIdToken) {
    res = await window.fetchWithIdToken(url, init);
  } else {
    res = await fetch(url, init);
  }

  try {
    if (url.endsWith(".toml")) {
      const text = await res.text();
      return window.TOML ? window.TOML.parse(text) : null;
    }
    return await res.json();
  } catch {
    return null;
  }
};
const invalidate = (prefix) => {
  try {
    if (__rc && typeof __rc.invalidate === "function") return __rc.invalidate(prefix);
  } catch {}
};

// In-memory bundles state for this page
let __userBundles = [];
let __fullBundleData = []; // Full bundle objects from API (with token info, allocated flag, etc.)
let __fetchBundlesController = null;
let __catalogueData = null; // Catalogue TOML data (stored for re-renders)
let __catalogueSettled = false; // True once the catalogue has loaded or failed to load
let __currentEnv = null; // Current environment name
let __viewer = null; // What this person has chosen to see: preview features, operator features, account settings
let __catalogService = null; // lib/services/catalog-service.js, read once the catalogue loads

const parseUserBundles = () => (Array.isArray(__userBundles) ? __userBundles : []);

// Fetch bundles from API endpoint (single source of truth, with lightweight caching)
const fetchUserBundles = async () => {
  const idToken = getIdToken();
  if (!idToken) {
    __userBundles = [];
    return __userBundles;
  }

  const userInfoJson = localStorage.getItem("userInfo");
  let userId = null;
  try {
    const userInfo = JSON.parse(userInfoJson);
    userId = userInfo && userInfo.sub;
  } catch {}

  if (userId) {
    const cached = await window.bundleCache.getBundles(userId);
    if (cached && Array.isArray(cached)) {
      __userBundles = cached;
      // Don't return early — fall through to API fetch so __fullBundleData
      // is populated (needed for subscription info, token counts, expiry).
    }
  }

  // Abort previous fetch if any
  if (__fetchBundlesController) {
    __fetchBundlesController.abort();
  }
  __fetchBundlesController = new AbortController();
  const signal = __fetchBundlesController.signal;

  try {
    const bundlesData = await fetchAndParse("/api/v1/bundle", {
      ttlMs: 0,
      init: { headers: { Authorization: `Bearer ${idToken}` }, signal },
    });
    if (bundlesData && bundlesData.bundles && Array.isArray(bundlesData.bundles)) {
      const operatorFeaturesOn = (await import("/lib/services/viewer-settings.js")).isOperatorFeaturesOn();
      __fullBundleData = bundlesData.bundles.filter((b) => operatorFeaturesOn || b.bundleId !== "operator");
      __userBundles = __fullBundleData.filter((b) => b.allocated).map((b) => b.bundleId);
      if (userId) {
        await window.bundleCache.setBundles(userId, __userBundles, 5 * 60 * 1000); // 5 minutes TTL
      }
      return __userBundles;
    }
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("Fetch user bundles aborted");
      return __userBundles;
    }
    console.warn("Failed to fetch bundles:", err);
  } finally {
    if (__fetchBundlesController?.signal === signal) {
      __fetchBundlesController = null;
    }
  }
  __userBundles = [];
  return __userBundles;
};

const hasBundle = (bundles, id) =>
  (bundles || []).some((b) => {
    if (typeof b === "string") return b === id;
    return b?.bundleId === id;
  });

const markToRequest = (btn, message = "Request bundle") => {
  const tg = btn.getAttribute("data-tokens-granted");
  const tokenLabel = tg ? ` (${tg} token${tg !== "1" ? "s" : ""})` : "";
  btn.textContent = message + tokenLabel;
  btn.disabled = false;
  btn.classList.remove("btn-ok");
};

const markGranted = (btn, message = "Added ✓") => {
  btn.textContent = message;
  btn.disabled = true;
  btn.classList.add("btn-ok");
};

// The landing attribution analytics.js stored under this key at first sign-in (MK-3): the
// server writes it once onto the account's first bundle and ignores it on every later one.
function readStoredLandingAttribution() {
  try {
    const raw = localStorage.getItem("attribution.landing");
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

// --- request individual bundle
async function requestBundle(bundleId, bundleName, qualifiers = {}) {
  const idToken = getIdToken();
  if (!idToken) {
    showStatus("Please log in first to request bundles.", "warning");
    window.location.href = "auth/login.html";
    return false;
  }

  // Show status immediately before making the request
  showStatus(`Requesting bundle "${bundleName}"...`, "info");

  try {
    const r = await window.fetchWithIdToken("/api/v1/bundle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bundleId, qualifiers, acquisition: readStoredLandingAttribution() }),
    });
    const body = await r.json().catch(() => ({}));

    if (r.ok) {
      if (r.status === 202 || body.status === "granted" || body.status === "already_granted") {
        showStatus(`Bundle "${bundleName}" added successfully.`, "success");
        // Update local state and write through to persistent cache
        if (!hasBundle(__userBundles, bundleId)) {
          __userBundles.push(bundleId);
        }
        const userInfoJson = localStorage.getItem("userInfo");
        let userId = null;
        try {
          const userInfo = JSON.parse(userInfoJson);
          userId = userInfo && userInfo.sub;
        } catch {}
        if (userId) {
          await window.bundleCache.setBundles(userId, __userBundles, 5 * 60 * 1000);
        }
        // Refresh in-memory cache and re-render
        invalidate("/api/v1/bundle");
        try {
          renderCurrentBundles();
        } catch {}
        try {
          updateBundleStatus();
        } catch {}
        // Notify developer mode toggle to refresh
        window.dispatchEvent(new CustomEvent("bundle-changed"));
        return true;
      } else {
        showStatus(`Bundle ${bundleId} request failed: unexpected response`, "error");
      }
    } else {
      showStatus(`Failed to request bundle: ${body.error || "Unknown error"}`, "error");
    }
  } catch (err) {
    showStatus(`Failed to request bundle. Error: ${err?.message || err}.`, "error");
  }
  return false;
}

// Build an element: attrs with an undefined or false value are skipped, a string child becomes a text node.
function domEl(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === false) continue;
    node.setAttribute(key, value === true ? "true" : value);
  }
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== ""));
  return node;
}

const noteEl = (kind, text) => domEl("p", { class: `bundle-note bundle-note--${kind}` }, text);

const serviceItemEl = (...children) => domEl("div", { class: "service-item" }, ...children);

// --- render one catalog card
const cardEl = (b) => {
  const name = String((b && (b.name || b.id)) || "");
  const tg = b.tokensGranted;
  const tokenLabel = tg !== undefined ? ` (${tg} token${tg !== 1 ? "s" : ""})` : "";
  const enable = b.enable || "never";

  const bundleButton = (cls, extra, label, withTokens = false) =>
    domEl(
      "button",
      {
        "type": "button",
        "class": cls,
        "data-bundle-id": b.id,
        "data-bundle-name": name,
        "data-tokens-granted": withTokens && tg !== undefined ? tg : undefined,
        ...extra,
      },
      label,
    );

  // Check capacity availability from API response (for bundles with a cap)
  const fullEntry = __fullBundleData.find((fb) => fb.bundleId === b.id);
  const capacityAvailable = fullEntry?.bundleCapacityAvailable !== false;

  // Check if pass validation enables this bundle
  let passCode = null;
  try {
    const pv = sessionStorage.getItem("passValidation");
    if (pv) {
      const parsed = JSON.parse(pv);
      if (parsed.bundleId === b.id && parsed.valid) passCode = parsed.code;
    }
  } catch {}

  const allocation = b.allocation || "";
  const manageCard = () =>
    serviceItemEl(
      bundleButton("btn btn-outline service-btn", { "data-manage-subscription": "true" }, `Manage Subscription — ${name}`),
      noteEl("ok", "Active subscription"),
    );
  const hasActiveSubscription = () => __fullBundleData.some((fb) => fb.bundleId === b.id && fb.allocated && fb.stripeSubscriptionId);

  // on-pass without valid pass: disabled with reason on button
  if (enable === "on-pass" && !passCode) {
    return serviceItemEl(
      bundleButton(
        "btn service-btn",
        { "data-requires-pass": "true", "data-disabled-reason": "on-pass", "disabled": "" },
        `Pass required — ${name}`,
        true,
      ),
      noteEl("warn", "Enter a pass invitation above to unlock this bundle"),
    );
  }

  // on-pass-on-subscription with valid pass: show Subscribe or Manage button
  if (allocation === "on-pass-on-subscription" && passCode) {
    if (hasActiveSubscription()) return manageCard();
    return serviceItemEl(
      bundleButton("btn service-btn", { "data-subscribe": "true" }, `Subscribe £9.99/mo — ${name}`),
      noteEl("plain", "Monthly subscription via Stripe"),
    );
  }

  // on-subscription allocation with always-visible: show Subscribe or Manage button
  if (allocation === "on-subscription" && enable === "always") {
    if (hasActiveSubscription()) return manageCard();

    // Two prices per bundle (annual and monthly): the annual (default) price is the
    // main Subscribe button, the monthly price is a text link beneath it.
    const prices = Array.isArray(b.prices) ? b.prices : [];
    if (prices.length > 1) {
      const annual = prices.find((p) => p.interval === "year") || prices.find((p) => p.default) || prices[0];
      const monthly = prices.find((p) => p !== annual && p.interval === "month") || prices.find((p) => p !== annual);
      return serviceItemEl(
        bundleButton(
          "btn service-btn",
          { "data-subscribe": "true", "data-interval": "annual" },
          `Subscribe ${formatGbp(annual.amount / 100)}/yr — ${name}`,
        ),
        monthly
          ? domEl(
              "p",
              { class: "bundle-note" },
              bundleButton(
                "link-button",
                {
                  "data-subscribe": "true",
                  "data-interval": "monthly",
                },
                `or ${formatGbp(monthly.amount / 100)}/month`,
              ),
            )
          : null,
        noteEl("plain", b.description || "Subscription via Stripe"),
      );
    }

    const singlePriceLabel =
      prices.length === 1 ? ` ${formatGbp(prices[0].amount / 100)}/${prices[0].interval === "year" ? "yr" : "mo"}` : "";
    return serviceItemEl(
      bundleButton("btn service-btn", { "data-subscribe": "true" }, `Subscribe${singlePriceLabel} — ${name}`),
      noteEl("plain", b.description || "Monthly subscription via Stripe"),
    );
  }

  // on-subscription: disabled with reason on button (fallback for non-always enable)
  if (enable === "on-subscription") {
    return serviceItemEl(
      bundleButton(
        "btn service-btn",
        { "data-disabled-reason": "on-subscription", "disabled": "" },
        `Subscription required — ${name}`,
        true,
      ),
      noteEl("warn", "A subscription is needed for this bundle"),
    );
  }

  // Capacity full: disabled with reason on button (pass bypasses cap)
  if (!capacityAvailable && !passCode) {
    return serviceItemEl(
      bundleButton("btn service-btn", { "data-disabled-reason": "capacity", "disabled": "" }, `Limit reached — ${name}`, true),
      noteEl("warn", "Global user limit reached, please try again tomorrow"),
    );
  }

  // on-pass with valid pass: enabled, pass code attached
  if (enable === "on-pass" && passCode) {
    const passAttrs = { "data-pass-code": String(passCode) };
    return serviceItemEl(bundleButton("btn service-btn", passAttrs, `Request ${name}${tokenLabel}`, true));
  }

  // enable = "always": normal enabled button (with pass code if a validated pass targets this bundle)
  return serviceItemEl(
    bundleButton("btn service-btn", passCode ? { "data-pass-code": String(passCode) } : {}, `Request ${name}${tokenLabel}`, true),
  );
};

// --- click handler for all request buttons
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-bundle-id]");
  if (!btn || btn.disabled) return;
  // Subscribe and Manage Subscription buttons have their own dedicated handlers
  if (btn.hasAttribute("data-subscribe") || btn.hasAttribute("data-manage-subscription")) return;

  const bundleId = btn.getAttribute("data-bundle-id");
  const bundleName = btn.getAttribute("data-bundle-name") || bundleId;
  const original = btn.textContent;

  // Pass-enabled bundle: redeem the pass to grant the bundle
  const passCode = btn.getAttribute("data-pass-code");
  if (passCode) {
    btn.textContent = "Redeeming...";
    btn.disabled = true;
    const success = await redeemPassCode(passCode);
    if (success) {
      markGranted(btn, `Added ✓ ${bundleName}`);
      // Clear pass validation after successful redemption
      try {
        sessionStorage.removeItem("passValidation");
      } catch {}
    } else {
      btn.textContent = original;
      btn.disabled = false;
    }
    return;
  }

  // Normal bundle request
  const card = btn.closest(".service-item");
  const qualifiers = {};
  const tx = card?.querySelector('input[name="transactionId"]');
  if (tx?.value) qualifiers.transactionId = tx.value;
  const tier = card?.querySelector('input[name="subscriptionTier"]');
  if (tier?.value) qualifiers.subscriptionTier = tier.value;

  btn.textContent = "Requesting...";
  btn.disabled = true;

  const success = await requestBundle(bundleId, bundleName, qualifiers);
  if (success) {
    markGranted(btn, `Added ✓ ${bundleName}`);
  } else {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// --- Subscribe click handler
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-subscribe]");
  if (!btn || btn.disabled) return;

  const idToken = getIdToken();
  if (!idToken) {
    showStatus("Please log in first to subscribe.", "warning");
    window.location.href = "auth/login.html";
    return;
  }

  const original = btn.textContent;
  btn.textContent = "Redirecting to checkout...";
  btn.disabled = true;

  try {
    const bundleId = btn.getAttribute("data-bundle-id");
    const interval = btn.getAttribute("data-interval");

    // GA4 ecommerce: begin_checkout when the user starts a Stripe checkout
    if (typeof gtag === "function") {
      gtag("event", "begin_checkout", {
        currency: "GBP",
        value: 0,
        items: [{ item_id: bundleId }],
      });
    }

    const response = await window.fetchWithIdToken("/api/v1/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId, ...(interval && { interval }), acquisition: readStoredLandingAttribution() }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok && body.checkoutUrl) {
      window.location.href = body.checkoutUrl;
    } else {
      showStatus(`Failed to start checkout: ${body.error || body.message || "Unknown error"}`, "error");
      btn.textContent = original;
      btn.disabled = false;
    }
  } catch (err) {
    showStatus(`Failed to start checkout: ${err?.message || err}`, "error");
    btn.textContent = original;
    btn.disabled = false;
  }
});

// --- Manage Subscription click handler
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-manage-subscription]");
  if (!btn || btn.disabled) return;

  const idToken = getIdToken();
  if (!idToken) {
    showStatus("Please log in first.", "warning");
    return;
  }

  btn.textContent = "Loading portal...";
  btn.disabled = true;

  try {
    const response = await window.fetchWithIdToken("/api/v1/billing/portal", {
      headers: { "Content-Type": "application/json" },
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok && body.portalUrl) {
      window.location.href = body.portalUrl;
    } else {
      showStatus(`Failed to open subscription portal: ${body.error || body.message || "Unknown error"}`, "error");
      btn.textContent = "Manage Subscription";
      btn.disabled = false;
    }
  } catch (err) {
    showStatus(`Failed to open subscription portal: ${err?.message || err}`, "error");
    btn.textContent = "Manage Subscription";
    btn.disabled = false;
  }
});

// --- reflect previously granted
function updateBundleStatus() {
  const bundles = parseUserBundles();
  document.querySelectorAll("button[data-bundle-id]").forEach((btn) => {
    // Skip subscription-specific buttons — their text is managed by cardEl()
    if (btn.hasAttribute("data-subscribe") || btn.hasAttribute("data-manage-subscription")) return;
    const id = btn.getAttribute("data-bundle-id");
    const name = btn.getAttribute("data-bundle-name") || id;
    if (hasBundle(bundles, id)) {
      markGranted(btn, `Added ✓ ${name}`);
    } else if (!btn.hasAttribute("data-disabled-reason")) {
      // Re-enable buttons that are not structurally disabled (on-pass/on-subscription/capacity)
      markToRequest(btn, `Request ${name}`);
    }
  });
}

const messageEl = (text) => domEl("p", { class: "service-description" }, text);

function isListedInCurrentEnvironment(b) {
  return __catalogService.isBundleShown(b, __currentEnv, __viewer);
}

// --- render catalogue bundles (reusable, reads from __catalogueData)
function renderCatalogueBundles() {
  const container = document.getElementById("catalogBundles");
  if (!__catalogueData || !__catalogueData.bundles) {
    container.replaceChildren(messageEl("Catalog unavailable."));
    return;
  }
  const cards = (__catalogueData.bundles || [])
    .filter((b) => b["allocation"] && b["allocation"] !== "automatic")
    .filter((b) => b["enable"] !== "never")
    .filter((b) => {
      if (!b.hidden) return true;
      // Show hidden bundles if a valid pass unlocks them
      try {
        const pv = sessionStorage.getItem("passValidation");
        if (pv) {
          const parsed = JSON.parse(pv);
          if (parsed.bundleId === b.id && parsed.valid) return true;
        }
      } catch {}
      return false;
    })
    .filter(isListedInCurrentEnvironment)
    .map(cardEl);
  container.replaceChildren(...(cards.length > 0 ? cards : [messageEl("No bundles available.")]));
  updateBundleStatus();
}

// Read current environment from submit.environment-name.txt
async function readEnvironment() {
  try {
    const envRes = await fetch("submit.environment-name.txt", { cache: "no-store" });
    if (envRes.ok) {
      const text = (await envRes.text()).trim();
      return text || null;
    }
  } catch {}
  return null;
}

// The block holds room for the cards while they load; once both lists have arrived it hands the room back.
function releaseReservedHeight() {
  document.querySelector(".bundles-block")?.classList.add("bundles-settled");
}

// --- bootstrap: fetch catalog and render. The promise lets initPage wait for the catalogue
// before it validates a ?pass= code, so the pass status names the bundle, not its id.
const __catalogueReady = (async function () {
  const container = document.getElementById("catalogBundles");
  try {
    await fetchUserBundles();
    // Rows take their place now with a blank name; the catalogue supplies the names.
    renderCurrentBundles();

    const idToken = getIdToken();
    const headers = idToken ? { Authorization: `Bearer ${idToken}` } : undefined;
    __catalogueData = await fetchAndParse("/submit.catalogue.toml", {
      ttlMs: 300000,
      init: headers ? { headers } : undefined,
    });
    if (!__catalogueData || !__catalogueData.bundles) {
      container.replaceChildren(messageEl("Catalog unavailable."));
      __catalogueSettled = true;
      renderCurrentBundles();
      releaseReservedHeight();
      return;
    }

    __currentEnv = await readEnvironment();
    __viewer = await (await import("/lib/services/viewer-settings.js")).fetchViewer();
    __catalogService = await import("/lib/services/catalog-service.js");
    renderCatalogueBundles();
    __catalogueSettled = true;
    renderCurrentBundles();
    renderGeneratedPassesEmptyText();
    releaseReservedHeight();
  } catch (err) {
    try {
      console.error("[bundles.html] Catalog bootstrap error:", err && (err.stack || err.message || err));
    } catch {}
    container.replaceChildren(messageEl("Failed to load catalog."));
    __catalogueSettled = true;
    renderCurrentBundles();
    releaseReservedHeight();
  }
})();

// --- render current user bundles with remove buttons
function renderCurrentBundles() {
  const container = document.getElementById("currentBundles");
  const bundles = parseUserBundles();

  const bundleCards = bundles.map((bundleEntry) => {
    const bundleId = typeof bundleEntry === "string" ? bundleEntry : bundleEntry.bundleId;

    // Look up display name from catalogue
    const catBundle = __catalogueData?.bundles?.find((cb) => cb.id === bundleId);
    // Until the catalogue settles the name is blank, so an id is never shown.
    const displayName = __catalogueSettled ? catBundle?.name || bundleId : "\u00a0";

    // Look up full bundle data for token info
    const fullData = __fullBundleData.find((b) => b.bundleId === bundleId && b.allocated);
    const tokensRemaining = fullData?.tokensRemaining;
    const tokensGranted = fullData?.tokensGranted ?? catBundle?.tokensGranted;
    const tokenResetAt = fullData?.tokenResetAt;

    // Build info fragments
    const fragments = [];
    if (tokensGranted !== undefined) {
      fragments.push(`${tokensGranted} token${tokensGranted !== 1 ? "s" : ""} allocated`);
    }
    if (tokensRemaining !== undefined) {
      fragments.push(`${tokensRemaining} remaining`);
    }
    if (tokenResetAt) {
      const resetDate = new Date(tokenResetAt);
      if (!isNaN(resetDate.getTime())) {
        fragments.push(`refreshes ${resetDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`);
      }
    }
    const expiryStr = fullData?.expiry;
    if (expiryStr) {
      const expiryDate = new Date(expiryStr);
      if (!isNaN(expiryDate.getTime())) {
        fragments.push(`expires ${expiryDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`);
      }
    }

    const infoLine = fragments.length > 0 ? domEl("div", { class: "bundle-note" }, fragments.join(" · ")) : null;

    // Show Manage Subscription button if bundle has an active subscription
    const manageBtn = fullData?.stripeSubscriptionId
      ? domEl(
          "button",
          { "type": "button", "class": "btn btn-outline bundle-row-btn", "data-manage-subscription": "true", "data-bundle-id": bundleId },
          "Manage Subscription",
        )
      : null;

    return domEl(
      "div",
      {
        class: "service-item bundle-row",
      },
      domEl(
        "span",
        { class: "bundle-row-line" },
        domEl("span", { class: "bundle-row-name" }, displayName),
        manageBtn,
        domEl(
          "button",
          { "type": "button", "class": "btn btn-danger-outline bundle-row-btn", "data-remove-bundle-id": bundleId },
          "Remove",
        ),
      ),
      infoLine,
    );
  });

  container.replaceChildren(...bundleCards);

  const section = document.getElementById("currentBundlesSection");
  if (section) {
    section.style.display = bundles.length > 0 ? "block" : "none";
  }
  document.querySelector(".bundles-block")?.classList.toggle("holds-no-bundles", bundles.length === 0);
}

// --- click handler for remove buttons
document.addEventListener("click", async (e) => {
  if (e.target.closest("button[data-remove-bundle-id]")) {
    const btn = e.target.closest("button[data-remove-bundle-id]");
    const bundleId = btn.getAttribute("data-remove-bundle-id");
    await removeBundle(bundleId);
  }
});

// --- remove individual bundle
async function removeBundle(bundleId, fireAndForget = true) {
  const bundleName = __catalogueData?.bundles?.find((cb) => cb.id === bundleId)?.name || bundleId;
  const idToken = getIdToken();
  if (!idToken) {
    showStatus("Please log in first to remove bundles.", "warning");
    window.location.href = "auth/login.html";
    return;
  }

  // Show status immediately before making the request
  showStatus(`Removing bundle "${bundleName}"...`, "info");

  try {
    const response = await window.fetchWithIdToken("/api/v1/bundle", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      fireAndForget,
      body: JSON.stringify({ bundleId }),
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok) {
      // Update local state and write through to persistent cache
      __userBundles = __userBundles.filter((b) => (typeof b === "string" ? b : b.bundleId) !== bundleId);
      const userInfoJson = localStorage.getItem("userInfo");
      let userId = null;
      try {
        const userInfo = JSON.parse(userInfoJson);
        userId = userInfo && userInfo.sub;
      } catch {}
      if (userId) {
        await window.bundleCache.setBundles(userId, __userBundles, 5 * 60 * 1000);
      }
      invalidate("/api/v1/bundle");
      renderCurrentBundles();
      updateBundleStatus(); // Update the request buttons
      // Notify developer mode toggle to refresh
      window.dispatchEvent(new CustomEvent("bundle-changed"));
      showStatus(`Bundle "${bundleName}" removed successfully.`, "success");
    } else {
      showStatus(`Failed to remove bundle: ${result.error || "Unknown error"}`, "error");
    }
  } catch (error) {
    showStatus("Failed to remove bundle. Please try again.", "error");
    console.error("Remove bundle error:", error);
  }
}

// --- pass redemption ---
const passReasonMessages = {
  not_found: "Pass not found. Please check the code and try again.",
  expired: "This pass has expired.",
  exhausted: "This pass has been fully used.",
  revoked: "This pass has been revoked.",
  wrong_email: "This pass is restricted to a different email address.",
  email_required: "This pass requires email verification.",
  not_yet_valid: "This pass is not yet valid.",
  held_for_review: "This pass is on hold while we review it. Please try again later.",
  own_pass: "You cannot redeem a pass you generated.",
  referral_already_used: "This account has already redeemed a referral pass.",
};

function showPassStatus(message, type) {
  const el = document.getElementById("passStatus");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.className = `pass-status pass-status--${type === "success" ? "ok" : type === "error" ? "error" : "info"}`;
}

async function redeemPassCode(code) {
  const idToken = getIdToken();
  if (!idToken) {
    try {
      sessionStorage.setItem("pendingPass", code);
    } catch {}
    showPassStatus("Please log in to redeem your pass.", "info");
    return false;
  }

  const btn = document.getElementById("redeemPassBtn");
  if (btn) {
    btn.textContent = "Redeeming...";
    btn.disabled = true;
  }

  try {
    const response = await window.fetchWithIdToken("/api/v1/pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await response.json().catch(() => ({}));

    if (body.requiresSubscription) {
      // Pass is valid but bundle requires subscription — store validation and re-render
      try {
        sessionStorage.setItem(
          "passValidation",
          JSON.stringify({ code, bundleId: body.bundleId, valid: true, testPass: body.testPass || false }),
        );
      } catch {}
      // If test pass, activate synthetic mode so checkout uses test Stripe
      if (body.testPass) {
        sessionStorage.setItem("hmrcAccount", "synthetic");
        window.dispatchEvent(new CustomEvent("bundle-changed"));
      }
      showPassStatus(`Pass valid! Click "Subscribe" to start your subscription.`, "success");
      renderCatalogueBundles();
      return true;
    }

    if (body.redeemed) {
      showPassStatus(`Pass redeemed! Bundle "${body.bundleId}" has been added.`, "success");
      // If test pass, activate synthetic mode immediately
      if (body.testPass) {
        sessionStorage.setItem("hmrcAccount", "synthetic");
      }
      // Update local state
      if (!hasBundle(__userBundles, body.bundleId)) {
        __userBundles.push(body.bundleId);
      }
      invalidate("/api/v1/bundle");
      // Clear persistent bundle cache so fetchUserBundles hits the API
      try {
        const uij = localStorage.getItem("userInfo");
        const uid = uij && JSON.parse(uij)?.sub;
        if (uid) await window.bundleCache.clearBundles(uid);
      } catch {}
      // Refresh full bundle data
      await fetchUserBundles();
      try {
        renderCurrentBundles();
      } catch {}
      try {
        updateBundleStatus();
      } catch {}
      window.dispatchEvent(new CustomEvent("bundle-changed"));
      // Clear pending pass
      try {
        sessionStorage.removeItem("pendingPass");
      } catch {}
      // Remove ?pass= from URL without reload
      const url = new URL(window.location);
      url.searchParams.delete("pass");
      window.history.replaceState({}, "", url);
      return true;
    } else {
      const msg = passReasonMessages[body.reason] || `Pass redemption failed: ${body.reason || "unknown error"}`;
      showPassStatus(msg, "error");
      return false;
    }
  } catch (err) {
    showPassStatus(`Failed to redeem pass: ${err?.message || err}`, "error");
    return false;
  } finally {
    if (btn) {
      btn.textContent = "Redeem Pass";
      btn.disabled = false;
    }
  }
}

// --- validate pass code (GET, public, no auth needed)
async function validatePassCode(code) {
  try {
    const response = await fetch(`/api/v1/pass?code=${encodeURIComponent(code)}`);
    return await response.json();
  } catch (err) {
    return { valid: false, reason: "network_error" };
  }
}

// --- handle pass entry: validate first, then enable bundle or auto-redeem
async function handlePassEntry(code) {
  const btn = document.getElementById("redeemPassBtn");
  if (btn) {
    btn.textContent = "Checking...";
    btn.disabled = true;
  }

  try {
    const result = await validatePassCode(code);

    if (!result.valid) {
      const msg = passReasonMessages[result.reason] || `Pass not valid: ${result.reason || "unknown"}`;
      showPassStatus(msg, "error");
      return;
    }

    // Pass is valid — store validation in sessionStorage
    const bundleId = result.bundleId;
    try {
      sessionStorage.setItem("passValidation", JSON.stringify({ code, bundleId, valid: true }));
    } catch {}

    const isLoggedIn = !!getIdToken();

    // Look up bundle from catalogue
    const catBundle = __catalogueData?.bundles?.find((cb) => cb.id === bundleId);
    const bundleName = catBundle?.name || bundleId;
    const isHidden = !!catBundle?.hidden;

    if (isLoggedIn) {
      const isSubscriptionBundle = catBundle?.allocation === "on-pass-on-subscription";
      if (result.emailRestricted) {
        if (isSubscriptionBundle) {
          showPassStatus(`Pass valid for the invited email. Click "Subscribe" to start your subscription.`, "success");
        } else {
          showPassStatus(`Pass valid for the invited email. Click "Request ${bundleName}" to add the bundle.`, "success");
        }
      } else if (isSubscriptionBundle) {
        showPassStatus(`Pass valid! Click "Subscribe" to start your subscription.`, "success");
      } else {
        showPassStatus(`Pass valid! Click "Request ${bundleName}" to add the bundle.`, "success");
      }
    } else {
      try {
        sessionStorage.setItem("pendingPass", code);
        sessionStorage.setItem("postLoginRedirect", window.location.pathname + "?pass=" + encodeURIComponent(code));
      } catch {}
      if (result.emailRestricted) {
        showPassStatus(`Pass valid! Log in with the invited email to add the "${bundleName}" bundle.`, "info");
      } else {
        showPassStatus(`Pass valid! Log in to add the "${bundleName}" bundle.`, "info");
      }
    }
    // Re-render catalogue to show the pass-unlocked bundle
    renderCatalogueBundles();
  } catch (err) {
    showPassStatus(`Failed to check pass: ${err?.message || err}`, "error");
  } finally {
    if (btn) {
      btn.textContent = "Redeem Pass";
      btn.disabled = false;
    }
  }
}

// Pass form click handler
document.getElementById("redeemPassBtn")?.addEventListener("click", async () => {
  const input = document.getElementById("passInput");
  const code = (input?.value || "").trim().toLowerCase();
  if (!code) {
    showPassStatus("Please enter a passphrase.", "error");
    return;
  }
  await handlePassEntry(code);
});

// Allow Enter key to submit
document.getElementById("passInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("redeemPassBtn")?.click();
  }
});

// Feedback engagement section logic
async function initFeedbackEngagementSection() {
  const section = document.getElementById("feedbackEngagementSection");
  if (!section) return;

  const isLoggedIn = !!getIdToken();
  let alreadyRegistered = false;
  try {
    alreadyRegistered = localStorage.getItem("feedbackEngagementRegistered") === "true";
  } catch {}

  if (!isLoggedIn || alreadyRegistered) return;

  // Check feature flag
  if (window.featureFlags && typeof window.featureFlags.isFeatureEnabled === "function") {
    const enabled = await window.featureFlags.isFeatureEnabled("feedback-engagement");
    if (!enabled) return;
  }

  section.style.display = "block";

  const joinBtn = document.getElementById("feedbackEngagementBtn");
  if (joinBtn) {
    // If already registered, update button state
    if (alreadyRegistered) {
      joinBtn.textContent = "Thanks! We'll be in touch soon.";
      joinBtn.classList.add("btn-ok");
      joinBtn.disabled = true;
      return;
    }

    joinBtn.addEventListener("click", async function () {
      joinBtn.disabled = true;
      joinBtn.textContent = "Sending...";
      try {
        const response = await window.fetchWithIdToken("/api/v1/interest", { method: "POST" });
        if (response.ok) {
          joinBtn.textContent = "Thanks! We'll be in touch soon.";
          joinBtn.classList.add("btn-ok");
          try {
            localStorage.setItem("feedbackEngagementRegistered", "true");
          } catch {}
        } else {
          joinBtn.textContent = "Try again";
          joinBtn.disabled = false;
        }
      } catch (err) {
        console.error("Feedback engagement failed:", err);
        joinBtn.textContent = "Try again";
        joinBtn.disabled = false;
      }
    });
  }
}

// --- My Generated Passes ---
let __myPassesNextPageKey = null;

const FEWER_THAN_THREE = "fewer than 3";

function figureCell(label, value, { count = true } = {}) {
  const shown = value === null || value === undefined ? (count ? FEWER_THAN_THREE : "—") : String(value);
  return domEl(
    "div",
    { "class": "pass-figure", "data-figure": label.toLowerCase().replace(/ /g, "-") },
    domEl("dt", {}, label),
    domEl("dd", {}, shown),
  );
}

function lastUsedLabel(lastUsed) {
  if (!lastUsed) return "Not used yet";
  return new Date(lastUsed).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function passFiguresEl(figures, className) {
  return domEl(
    "dl",
    { class: className },
    figureCell("Uses", figures.uses, { count: false }),
    figureCell("New accounts", figures.newAccounts),
    figureCell("Filed", figures.filed),
    figureCell("Subscribers", figures.subscribers),
    figureCell("Paid charges", figures.paidCharges),
    figureCell("Last used", lastUsedLabel(figures.lastUsed), { count: false }),
  );
}
let __noGeneratedPasses = false;

const PASS_ACTIVITY_IDS = ["generate-pass-digital", "generate-pass-physical"];

// The empty-list text says how to generate a pass when a held bundle allows it, and which
// bundles allow it when none does. It waits for the catalogue and its service, which hold both
// answers; the catalogue load calls it again once both exist.
function renderGeneratedPassesEmptyText() {
  const emptyMsg = document.getElementById("generatedPassesEmpty");
  if (!emptyMsg || !__noGeneratedPasses || !__catalogueData?.bundles || !__catalogService) return;
  const passActivities = (__catalogueData.activities || []).filter((a) => PASS_ACTIVITY_IDS.includes(a.id));
  const allowedIds = new Set(passActivities.flatMap((a) => a.bundles || []));
  const heldAllowed = parseUserBundles().some((entry) => allowedIds.has(typeof entry === "string" ? entry : entry.bundleId));
  const prefix = "You haven't generated any passes yet. ";
  if (heldAllowed) {
    const names = passActivities.map((a) => a.name).join(" or ");
    emptyMsg.textContent = `${prefix}Use ${names} in the activities list.`;
  } else {
    const offered = __catalogueData.bundles
      .filter((b) => allowedIds.has(b.id) && !b.hidden && b.enable === "always")
      .filter(isListedInCurrentEnvironment);
    const names = offered.map((b) => b.name).join(", ");
    emptyMsg.textContent = `${prefix}A pass is generated from a bundle that allows it: ${names}.`;
  }
  emptyMsg.style.display = "block";
}

// A pass just generated lands here: show it, scroll to it and put focus on it.
function focusNewlyGeneratedPass() {
  const url = new URL(window.location.href);
  const newCode = url.searchParams.get("newPass");
  if (!newCode) return;
  url.searchParams.delete("newPass");
  window.history.replaceState(null, "", url);
  const card = Array.from(document.querySelectorAll("#generatedPassesList [data-pass-code]")).find(
    (el) => el.getAttribute("data-pass-code") === newCode,
  );
  if (!card) return;
  card.setAttribute("tabindex", "-1");
  card.scrollIntoView({ block: "center" });
  card.focus();
  showStatus(`Pass ${newCode} generated. Track what this link earns under My generated passes`, "success");
}

async function fetchMyGeneratedPasses(append) {
  const idToken = getIdToken();
  if (!idToken) return;
  const viewer = await (await import("/lib/services/viewer-settings.js")).fetchViewer();
  if (viewer.account.passGeneration === false) return;

  try {
    let url = "/api/v1/pass/my-passes?limit=50";
    if (append && __myPassesNextPageKey) {
      url += "&nextPageKey=" + encodeURIComponent(__myPassesNextPageKey);
    }
    const res = await window.fetchWithIdToken(url);
    const data = await res.json();

    if (!res.ok || !data.passes) return;

    const bundleResponse = await (await import("/lib/services/viewer-settings.js")).fetchBundleResponse();
    const viewerIsOperator =
      viewer.operatorFeatures && (bundleResponse?.bundles ?? []).some((bundle) => bundle.bundleId === "operator" && bundle.allocated);

    const section = document.getElementById("myGeneratedPasses");
    const list = document.getElementById("generatedPassesList");
    const emptyMsg = document.getElementById("generatedPassesEmpty");
    const loadMore = document.getElementById("generatedPassesLoadMore");

    section.style.display = "block";

    if (!append) list.replaceChildren();
    document.getElementById("generatedPassesTotals")?.remove();

    if (data.passes.length === 0 && !append) {
      __noGeneratedPasses = true;
      renderGeneratedPassesEmptyText();
      loadMore.style.display = "none";
      return;
    }

    __noGeneratedPasses = false;
    emptyMsg.style.display = "none";

    data.passes.forEach((pass) => {
      const typeLabel = pass.passTypeId === "digital-pass" ? "Digital" : "Physical";
      const expiryLabel = pass.validUntil
        ? new Date(pass.validUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : "No expiry";
      const usageLabel =
        pass.maxUses === undefined || pass.maxUses === null
          ? `${pass.useCount || 0} uses`
          : `${pass.useCount || 0} of ${pass.maxUses} uses`;
      const heldLabel = pass.heldForReview ? " · on hold for review" : "";
      const passUrl = `${window.location.origin}/bundles.html?pass=${encodeURIComponent(pass.code)}`;
      const qrPage = pass.passTypeId === "digital-pass" ? "generate-digital.html" : "generate-physical.html";
      const qrUrl = `${window.location.origin}/passes/${qrPage}?code=${encodeURIComponent(pass.code)}`;
      const card = domEl(
        "div",
        {
          "data-pass-code": pass.code,
          "class": "service-item bundle-row",
        },
        domEl(
          "div",
          { class: "bundle-row-line" },
          domEl("span", { class: "pass-code" }, pass.code),
          domEl("span", { class: "status-tag" }, typeLabel),
        ),
        pass.notes ? domEl("div", { class: "bundle-note" }, pass.notes) : null,
        domEl("div", { class: "bundle-note" }, `${expiryLabel} · ${usageLabel}${heldLabel}`),
        pass.figures ? passFiguresEl(pass.figures, "pass-figures") : null,
        domEl(
          "div",
          { class: "bundle-row-line" },
          domEl(
            "button",
            {
              "type": "button",
              "class": "btn btn-small btn-secondary pass-copy-link",
              "data-pass-url": passUrl,
            },
            "Copy Link",
          ),
          domEl(
            "a",
            {
              href: qrUrl,
              class: "btn btn-small btn-secondary",
            },
            "View QR",
          ),
          pass.heldForReview && viewerIsOperator
            ? domEl(
                "button",
                {
                  "type": "button",
                  "class": "btn btn-small btn-primary pass-release",
                  "data-pass-code": pass.code,
                },
                "Release",
              )
            : null,
        ),
      );
      list.appendChild(card);
    });

    if (data.totals && data.passes.length > 0) {
      list.appendChild(
        domEl(
          "div",
          { id: "generatedPassesTotals", class: "service-item bundle-row pass-totals" },
          domEl(
            "div",
            { class: "bundle-row-line" },
            domEl(
              "span",
              { class: "pass-code" },
              data.totals.countedPasses === data.totals.passes
                ? `All ${data.totals.passes} passes`
                : `${data.totals.countedPasses} of ${data.totals.passes} passes (the others are under 3 new accounts together)`,
            ),
          ),
          passFiguresEl(data.totals, "pass-figures"),
        ),
      );
    }

    __myPassesNextPageKey = data.nextPageKey || null;
    loadMore.style.display = __myPassesNextPageKey ? "block" : "none";

    if (!append) focusNewlyGeneratedPass();
  } catch (err) {
    console.warn("Failed to fetch my generated passes:", err);
  }
}

// Copy link click handler for generated passes
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".pass-copy-link");
  if (!btn) return;
  const url = btn.getAttribute("data-pass-url");
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "Copied!";
    setTimeout(() => {
      btn.textContent = "Copy Link";
    }, 2000);
  } catch {}
});

// Release a pass held for review: the operator lets it run for another thousand uses
const RELEASE_RAISE_BY = 1000;
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".pass-release");
  if (!btn) return;
  btn.disabled = true;
  try {
    const res = await window.fetchWithIdToken("/api/v1/pass/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: btn.getAttribute("data-pass-code"), raiseBy: RELEASE_RAISE_BY }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showStatus(`Pass ${btn.getAttribute("data-pass-code")} released`, "success");
    fetchMyGeneratedPasses(false);
  } catch (err) {
    btn.disabled = false;
    showStatus(`The pass was not released (${err.message})`, "error");
  }
});

// Affiliates: an operator sets the tier and state of a referrer
async function initAffiliateSection() {
  if (!getIdToken()) return;
  const viewer = await (await import("/lib/services/viewer-settings.js")).fetchViewer();
  const bundleResponse = await (await import("/lib/services/viewer-settings.js")).fetchBundleResponse();
  const viewerIsOperator =
    viewer.operatorFeatures && (bundleResponse?.bundles ?? []).some((bundle) => bundle.bundleId === "operator" && bundle.allocated);
  if (!viewerIsOperator) return;
  document.getElementById("affiliateSection").hidden = false;
}

function showAffiliate(affiliate) {
  document.getElementById("affiliateTier").value = affiliate.tier;
  document.getElementById("affiliateState").value = affiliate.state;
  document.getElementById("affiliateResult").textContent =
    `Tier ${affiliate.tier}, state ${affiliate.state}` + (affiliate.approvedAt ? `, approved ${affiliate.approvedAt}` : "");
}

document.getElementById("affiliateLookupBtn")?.addEventListener("click", async () => {
  const referrerHash = document.getElementById("affiliateReferrerHash").value.trim();
  const result = document.getElementById("affiliateResult");
  try {
    const res = await window.fetchWithIdToken(`/api/v1/affiliate?referrerHash=${encodeURIComponent(referrerHash)}`);
    if (res.status === 404) {
      result.textContent = "No affiliate for that referrer";
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showAffiliate(await res.json());
  } catch (err) {
    result.textContent = `The lookup failed (${err.message})`;
  }
});

document.getElementById("affiliateSaveBtn")?.addEventListener("click", async () => {
  const saveButton = document.getElementById("affiliateSaveBtn");
  const referrerHash = document.getElementById("affiliateReferrerHash").value.trim();
  const tier = document.getElementById("affiliateTier").value;
  const state = document.getElementById("affiliateState").value;
  saveButton.disabled = true;
  try {
    const res = await window.fetchWithIdToken("/api/v1/affiliate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrerHash, tier, state }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showAffiliate(await res.json());
    showStatus("Affiliate saved", "success");
  } catch (err) {
    showStatus(`The affiliate was not saved (${err.message})`, "error");
  } finally {
    saveButton.disabled = false;
  }
});

// Load more button
document.getElementById("loadMorePassesBtn")?.addEventListener("click", () => {
  fetchMyGeneratedPasses(true);
});

// --- page init
try {
  sessionStorage.removeItem("currentActivity");
} catch {}

// Initialize page - wait for submit.js module to be ready
function initPage() {
  checkAuthStatus();
  initFeedbackEngagementSection();
  fetchMyGeneratedPasses(false);
  initAffiliateSection();

  // Handle checkout result from Stripe redirect
  const urlParams = new URLSearchParams(window.location.search);
  const checkoutResult = urlParams.get("checkout");
  if (checkoutResult === "success") {
    showStatus("Subscription activated! Your bundle has been added.", "success");
    const sessionId = urlParams.get("session_id");
    // Clear URL params without reload
    const url = new URL(window.location);
    url.searchParams.delete("checkout");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", url);

    // GA4 ecommerce: purchase, once, for this completed Stripe checkout session
    if (sessionId && typeof gtag === "function") {
      (async () => {
        try {
          const response = await window.fetchWithIdToken(`/api/v1/billing/checkout/${encodeURIComponent(sessionId)}`);
          const body = await response.json().catch(() => ({}));
          if (response.ok && body.amountTotal != null) {
            gtag("event", "purchase", {
              transaction_id: sessionId,
              value: body.amountTotal / 100,
              currency: body.currency,
              items: [{ item_id: body.bundleId }],
            });
          }
        } catch (err) {
          console.warn("Failed to record purchase event:", err);
        }
      })();
    }

    // Invalidate bundle cache and re-fetch (retry if webhook hasn't fired yet)
    const refreshBundles = async () => {
      invalidate("/api/v1/bundle");
      try {
        const uij = localStorage.getItem("userInfo");
        const uid = uij && JSON.parse(uij)?.sub;
        if (uid) await window.bundleCache.clearBundles(uid);
      } catch {}
      await fetchUserBundles();
      try {
        renderCurrentBundles();
      } catch {}
      try {
        renderCatalogueBundles();
      } catch {}
      window.dispatchEvent(new CustomEvent("bundle-changed"));
    };
    // First attempt immediately, then retry after 3s if bundle not yet granted by webhook
    refreshBundles().then(() => {
      setTimeout(refreshBundles, 3000);
    });
  } else if (checkoutResult === "canceled") {
    showStatus("Checkout was canceled. You can try again when you're ready.", "info");
    const url = new URL(window.location);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", url);
  }

  // Handle ?pass= URL parameter
  const passFromUrl = urlParams.get("pass");
  if (passFromUrl) {
    const input = document.getElementById("passInput");
    if (input) input.value = passFromUrl;
    // Validate pass (whether new or returning from login)
    __catalogueReady.then(() => handlePassEntry(passFromUrl.trim().toLowerCase()));
  } else {
    // Check for pending pass from previous session (saved before login redirect)
    try {
      const pendingPass = sessionStorage.getItem("pendingPass");
      if (pendingPass && getIdToken()) {
        const input = document.getElementById("passInput");
        if (input) input.value = pendingPass;
        __catalogueReady.then(() => handlePassEntry(pendingPass.trim().toLowerCase()));
      }
    } catch {}
  }
}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}
