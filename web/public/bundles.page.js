// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// A pass link goes to the pass page. replace keeps this page out of the history.
const passForward = new URLSearchParams(window.location.search).get("pass") ? "/pass.html" + window.location.search : null;
if (passForward) window.location.replace(passForward);

// page-chrome.js gives the text in the chosen language; without it the English stands.
const siteText = (id, english, values) =>
  window.siteText
    ? window.siteText(id, english, values)
    : english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));

const unknownError = () => siteText("bundles.unknown-error", "Unknown error");
const manageSubscriptionText = () => siteText("bundles.manage-subscription", "Manage Subscription");

// The Welsh of each listed bundle's catalogue description, keyed by the catalogue's English. A
// description the catalogue has since changed is not in this map and shows as the catalogue writes it.
const BUNDLE_DESCRIPTIONS = {
  "Submit VAT returns to HMRC. £9.99/yr / £0.99/mo, cancel anytime.": () =>
    siteText("bundles.description-resident-vat", "Submit VAT returns to HMRC. £9.99/yr / £0.99/mo, cancel anytime."),
  "File accounts and confirmation statements to Companies House. £9.99/yr / £0.99/mo, cancel anytime.": () =>
    siteText(
      "bundles.description-resident-ltd",
      "File accounts and confirmation statements to Companies House. £9.99/yr / £0.99/mo, cancel anytime.",
    ),
  "Submit VAT returns to HMRC and Accounts to Companies House. £39.99/yr / £3.99/mo, cancel anytime.": () =>
    siteText(
      "bundles.description-resident-pro",
      "Submit VAT returns to HMRC and Accounts to Companies House. £39.99/yr / £3.99/mo, cancel anytime.",
    ),
  "Manage a practice's clients and file for them, with everything in Resident Pro and no token limit. £199.99/yr / £19.99/mo, cancel anytime.":
    () =>
      siteText(
        "bundles.description-resident-tax-agent",
        "Manage a practice's clients and file for them, with everything in Resident Pro and no token limit. £199.99/yr / £19.99/mo, cancel anytime.",
      ),
};

const bundleDescription = (b, fallback) => {
  if (!b.description) return fallback;
  return Object.hasOwn(BUNDLE_DESCRIPTIONS, b.description) ? BUNDLE_DESCRIPTIONS[b.description]() : b.description;
};

// The token note in the reader's language: the English sentence the catalogue gives, matched by its shape.
const tokenSentenceText = (sentence) => {
  if (sentence === "No limit on tokens.") return siteText("bundles.tokens-unlimited", "No limit on tokens.");
  const match = /^(\d+) (tokens? .*)$/.exec(sentence);
  if (!match) return sentence;
  const count = match[1];
  switch (match[2].replace(/^token /, "tokens ")) {
    case "tokens for 24 hours.":
      return siteText("bundles.tokens-for-24-hours", "{count} tokens for 24 hours.", { count });
    case "tokens for 7 days.":
      return siteText("bundles.tokens-for-7-days", "{count} tokens for 7 days.", { count });
    case "tokens each month.":
      return siteText("bundles.tokens-each-month", "{count} tokens each month.", { count });
    case "tokens each year.":
      return siteText("bundles.tokens-each-year", "{count} tokens each year.", { count });
    default:
      return sentence;
  }
};

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
      return window.TOML ? (await import("/lib/services/catalog-service.js")).parseCatalogueText(text) : null;
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
let __bundleListing = null; // lib/bundle-listing.js, loaded with the catalogue
let __catalogueData = null; // Catalogue TOML data (stored for re-renders)
let __userBundlesLoaded = false; // True once the first answer about held bundles has arrived
let __catalogueSettled = false; // True once the catalogue has loaded or failed to load
let __currentEnv = null; // Current environment name
let __affiliateApplication = null; // The caller's own affiliate state from GET /api/v1/affiliate/application
let __viewer = null; // What this person has chosen to see: preview features, operator features, account settings
let __catalogService = null; // lib/services/catalog-service.js, read once the catalogue loads
let __aggregates = null; // lib/services/catalogue-aggregates.js, read once the catalogue loads

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

// The suffix after "Request <name>": a free bundle says "free", the others state their token count.
const requestLabelSuffix = (free, tokens) => {
  if (free) return ` (${siteText("bundles.request-free", "free")})`;
  if (!tokens) return "";
  return String(tokens) === "1"
    ? ` (${siteText("bundles.request-one-token", "{count} token", { count: tokens })})`
    : ` (${siteText("bundles.request-tokens", "{count} tokens", { count: tokens })})`;
};

const markToRequest = (btn, message = siteText("bundles.request-bundle", "Request bundle")) => {
  const free = btn.getAttribute("data-free") === "true";
  btn.textContent = message + requestLabelSuffix(free, btn.getAttribute("data-tokens-granted"));
  btn.disabled = false;
  btn.classList.remove("btn-ok");
};

const markGranted = (btn, message = siteText("bundles.added", "Added ✓")) => {
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
  if (!(await window.requireSession())) return false;
  const idToken = getIdToken();

  // Show status immediately before making the request
  showStatus(siteText("bundles.requesting-bundle", "Requesting bundle “{name}”...", { name: bundleName }), "info");

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
        showStatus(siteText("bundles.bundle-added", "Bundle “{name}” added successfully.", { name: bundleName }), "success");
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
        showStatus(siteText("bundles.request-unexpected", "Bundle {id} request failed: unexpected response", { id: bundleId }), "error");
      }
    } else {
      showStatus(
        siteText("bundles.request-failed", "Failed to request bundle: {reason}", { reason: body.error || unknownError() }),
        "error",
      );
    }
  } catch (err) {
    showStatus(siteText("bundles.request-error", "Failed to request bundle. Error: {reason}.", { reason: err?.message || err }), "error");
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

// The bundle's token allowance from the catalogue, as a card note; nothing when the catalogue names none.
const tokenNoteEl = (b) => {
  const sentence = __bundleListing?.tokenSentence(b);
  return sentence ? noteEl("plain", tokenSentenceText(sentence)) : null;
};

const serviceItemEl = (...children) => domEl("div", { class: "service-item" }, ...children);

// --- render one catalog card
const cardEl = (b) => {
  const name = String((b && (b.name || b.id)) || "");
  const tg = b.tokensGranted;
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
      bundleButton(
        "btn btn-outline service-btn",
        { "data-manage-subscription": "true" },
        siteText("bundles.manage-subscription-name", "Manage Subscription — {name}", { name }),
      ),
      noteEl("ok", siteText("bundles.active-subscription", "Active subscription")),
    );
  const hasActiveSubscription = () => __fullBundleData.some((fb) => fb.bundleId === b.id && fb.allocated && fb.stripeSubscriptionId);
  const holdsThisBundle = () => __fullBundleData.some((fb) => fb.bundleId === b.id && fb.allocated);
  // A held bundle whose parts include this one: the customer already has it through that bundle.
  const holderIncludingThis = () => {
    if (!__aggregates || !__catalogueData) return null;
    const heldId = __fullBundleData
      .filter((fb) => fb.allocated && fb.bundleId !== b.id)
      .map((fb) => fb.bundleId)
      .find((id) => __aggregates.includedBundleIds(__catalogueData, id).includes(b.id));
    if (!heldId) return null;
    return __catalogueData.bundles.find((cb) => cb.id === heldId)?.name || heldId;
  };
  const heldCard = () => {
    if (hasActiveSubscription()) return manageCard();
    if (holdsThisBundle())
      return serviceItemEl(domEl("strong", {}, name), noteEl("ok", siteText("bundles.you-hold", "You hold this bundle")));
    const holderName = holderIncludingThis();
    if (holderName)
      return serviceItemEl(
        domEl("strong", {}, name),
        noteEl("ok", siteText("bundles.included-in", "Included in {name}", { name: holderName })),
      );
    return null;
  };

  // on-pass without valid pass: disabled with reason on button
  if (enable === "on-pass" && !passCode) {
    return serviceItemEl(
      bundleButton(
        "btn service-btn",
        { "data-requires-pass": "true", "data-disabled-reason": "on-pass", "disabled": "" },
        siteText("bundles.pass-required", "Pass required — {name}", { name }),
        true,
      ),
      noteEl("warn", siteText("bundles.pass-required-note", "Enter a pass invitation above to unlock this bundle")),
    );
  }

  // on-pass-on-subscription with valid pass: show Subscribe or Manage button
  if (allocation === "on-pass-on-subscription" && passCode) {
    if (hasActiveSubscription()) return manageCard();
    return serviceItemEl(
      bundleButton(
        "btn service-btn",
        { "data-subscribe": "true" },
        siteText("bundles.subscribe-month", "Subscribe {price}/mo — {name}", { price: "£9.99", name }),
      ),
      noteEl("plain", siteText("bundles.monthly-via-stripe", "Monthly subscription via Stripe")),
    );
  }

  // on-subscription allocation with always-visible: show Subscribe or Manage button
  if (allocation === "on-subscription" && enable === "always") {
    const held = heldCard();
    if (held) return held;

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
          siteText("bundles.subscribe-year", "Subscribe {price}/yr — {name}", { price: formatGbp(annual.amount / 100), name }),
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
                siteText("bundles.or-per-month", "or {price}/month", { price: formatGbp(monthly.amount / 100) }),
              ),
            )
          : null,
        noteEl("plain", bundleDescription(b, siteText("bundles.via-stripe", "Subscription via Stripe"))),
        tokenNoteEl(b),
      );
    }

    const singlePrice = prices.length === 1 ? formatGbp(prices[0].amount / 100) : null;
    const subscribeLabel = !singlePrice
      ? siteText("bundles.subscribe", "Subscribe — {name}", { name })
      : prices[0].interval === "year"
        ? siteText("bundles.subscribe-year", "Subscribe {price}/yr — {name}", { price: singlePrice, name })
        : siteText("bundles.subscribe-month", "Subscribe {price}/mo — {name}", { price: singlePrice, name });
    return serviceItemEl(
      bundleButton("btn service-btn", { "data-subscribe": "true" }, subscribeLabel),
      noteEl("plain", bundleDescription(b, siteText("bundles.monthly-via-stripe", "Monthly subscription via Stripe"))),
      tokenNoteEl(b),
    );
  }

  // on-subscription: disabled with reason on button (fallback for non-always enable)
  if (enable === "on-subscription") {
    return serviceItemEl(
      bundleButton(
        "btn service-btn",
        { "data-disabled-reason": "on-subscription", "disabled": "" },
        siteText("bundles.subscription-required", "Subscription required — {name}", { name }),
        true,
      ),
      noteEl("warn", siteText("bundles.subscription-required-note", "A subscription is needed for this bundle")),
    );
  }

  // Capacity full: disabled with reason on button (pass bypasses cap)
  if (!capacityAvailable && !passCode) {
    return serviceItemEl(
      bundleButton(
        "btn service-btn",
        { "data-disabled-reason": "capacity", "disabled": "" },
        siteText("bundles.limit-reached", "Limit reached — {name}", { name }),
        true,
      ),
      noteEl("warn", siteText("bundles.limit-reached-note", "All day passes are in use. Try again tomorrow, or choose a bundle.")),
      tokenNoteEl(b),
    );
  }

  // enable = "always": normal enabled button
  const isFree = allocation === "on-request" && !(Array.isArray(b.prices) && b.prices.length > 0);
  return serviceItemEl(
    bundleButton(
      "btn service-btn",
      isFree ? { "data-free": "true" } : {},
      siteText("bundles.request", "Request {name}", { name }) + requestLabelSuffix(isFree, tg),
      true,
    ),
    tokenNoteEl(b),
    isFree
      ? noteEl("plain", siteText("bundles.day-pass-note", "One day, no card. To keep filing after today, choose a plan above."))
      : null,
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

  // Normal bundle request
  const card = btn.closest(".service-item");
  const qualifiers = {};
  const tx = card?.querySelector('input[name="transactionId"]');
  if (tx?.value) qualifiers.transactionId = tx.value;
  const tier = card?.querySelector('input[name="subscriptionTier"]');
  if (tier?.value) qualifiers.subscriptionTier = tier.value;

  btn.textContent = siteText("bundles.requesting", "Requesting...");
  btn.disabled = true;

  const success = await requestBundle(bundleId, bundleName, qualifiers);
  if (success) {
    markGranted(btn, siteText("bundles.added-name", "Added ✓ {name}", { name: bundleName }));
  } else {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// --- Subscribe click handler
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-subscribe]");
  if (!btn || btn.disabled) return;

  if (!(await window.requireSession())) return;
  const idToken = getIdToken();

  const original = btn.textContent;
  btn.textContent = siteText("bundles.redirecting", "Redirecting to checkout...");
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
      headers: {
        "Content-Type": "application/json",
        ...(window.siteLanguage && window.siteLanguage.current() === "cy" ? { "X-Site-Language": "cy" } : {}),
      },
      body: JSON.stringify({ bundleId, ...(interval && { interval }), acquisition: readStoredLandingAttribution() }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok && body.checkoutUrl) {
      window.location.href = body.checkoutUrl;
    } else {
      showStatus(
        siteText("bundles.checkout-failed", "Failed to start checkout: {reason}", { reason: body.error || body.message || unknownError() }),
        "error",
      );
      btn.textContent = original;
      btn.disabled = false;
    }
  } catch (err) {
    showStatus(siteText("bundles.checkout-failed", "Failed to start checkout: {reason}", { reason: err?.message || err }), "error");
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
    showStatus(siteText("bundles.sign-in-first", "Please sign in first."), "warning");
    return;
  }

  btn.textContent = siteText("bundles.loading-portal", "Loading portal...");
  btn.disabled = true;

  try {
    const response = await window.fetchWithIdToken("/api/v1/billing/portal", {
      headers: { "Content-Type": "application/json" },
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok && body.portalUrl) {
      window.location.href = body.portalUrl;
    } else {
      showStatus(
        siteText("bundles.portal-failed", "Failed to open subscription portal: {reason}", {
          reason: body.error || body.message || unknownError(),
        }),
        "error",
      );
      btn.textContent = manageSubscriptionText();
      btn.disabled = false;
    }
  } catch (err) {
    showStatus(siteText("bundles.portal-failed", "Failed to open subscription portal: {reason}", { reason: err?.message || err }), "error");
    btn.textContent = manageSubscriptionText();
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
      markGranted(btn, siteText("bundles.added-name", "Added ✓ {name}", { name }));
    } else if (!btn.hasAttribute("data-disabled-reason")) {
      // Re-enable buttons that are not structurally disabled (on-pass/on-subscription/capacity)
      markToRequest(btn, siteText("bundles.request", "Request {name}", { name }));
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
    container.replaceChildren(messageEl(siteText("bundles.catalog-unavailable", "Catalog unavailable.")));
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
    .sort((a, b) => (a.allocation === "on-request") - (b.allocation === "on-request"))
    .map(cardEl);
  container.replaceChildren(...(cards.length > 0 ? cards : [messageEl(siteText("bundles.no-bundles", "No bundles available."))]));
  updateBundleStatus();
}

// Read current environment from submit.environment-name.txt
async function readEnvironment() {
  return (await import("/lib/services/catalog-service.js")).fetchCurrentEnvironmentName();
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
    __userBundlesLoaded = true;
    // Rows take their place now with a blank name; the catalogue supplies the names.
    renderCurrentBundles();

    const idToken = getIdToken();
    const headers = idToken ? { Authorization: `Bearer ${idToken}` } : undefined;
    __catalogueData = await fetchAndParse("/submit.catalogue.toml", {
      ttlMs: 300000,
      init: headers ? { headers } : undefined,
    });
    if (!__catalogueData || !__catalogueData.bundles) {
      container.replaceChildren(messageEl(siteText("bundles.catalog-unavailable", "Catalog unavailable.")));
      __catalogueSettled = true;
      renderCurrentBundles();
      releaseReservedHeight();
      return;
    }

    __currentEnv = await readEnvironment();
    __viewer = await (await import("/lib/services/viewer-settings.js")).fetchViewer();
    __catalogService = await import("/lib/services/catalog-service.js");
    __bundleListing = await import("/lib/bundle-listing.js");
    __aggregates = await import("/lib/services/catalogue-aggregates.js");
    renderCatalogueBundles();
    __catalogueSettled = true;
    renderCurrentBundles();
    renderGeneratedPassesEmptyText();
    releaseReservedHeight();
  } catch (err) {
    try {
      console.error("[bundles.html] Catalog bootstrap error:", err && (err.stack || err.message || err));
    } catch {}
    container.replaceChildren(messageEl(siteText("bundles.catalog-failed", "Failed to load catalog.")));
    __catalogueSettled = true;
    renderCurrentBundles();
    releaseReservedHeight();
  }
})();

const configSetNote = () => siteText("bundles.config-set-note", "Set for your account by DIY Accounting");

// The catalogue phrase follows "you can"; shown alone it starts with a capital and ends with a full stop.
function passSummarySentence(passSummary) {
  const phrase = typeof passSummary === "string" ? passSummary.trim() : "";
  return phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) + "." : "";
}

// Two groups: bundles held through a plan, a pass or a request, and bundles that the site's
// configuration sets. A group with no row has no heading.
function groupedBundleRows(rows) {
  const groups = [
    [siteText("bundles.group-plan-or-passes", "From your plan or passes"), rows.filter((entry) => !entry.configDriven)],
    [siteText("bundles.group-set-for-account", "Set for your account"), rows.filter((entry) => entry.configDriven)],
  ];
  return groups.flatMap(([title, members]) =>
    members.length === 0 ? [] : [domEl("h3", { class: "bundle-group-heading" }, title), ...members.map((entry) => entry.row)],
  );
}

// --- render current user bundles with remove buttons
function renderCurrentBundles() {
  const container = document.getElementById("currentBundles");
  const bundles = parseUserBundles();

  const bundleRows = bundles.map((bundleEntry) => {
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
      fragments.push(
        tokensGranted === 1
          ? siteText("bundles.held-one-token", "1 token allocated")
          : siteText("bundles.held-tokens", "{count} tokens allocated", { count: tokensGranted }),
      );
    }
    if (tokensRemaining !== undefined) {
      fragments.push(siteText("bundles.held-remaining", "{count} remaining", { count: tokensRemaining }));
    }
    if (tokenResetAt) {
      const resetDate = new Date(tokenResetAt);
      if (!isNaN(resetDate.getTime())) {
        fragments.push(siteText("bundles.held-refreshes", "refreshes {date}", { date: dateInReaderLanguage(resetDate) }));
      }
    }
    const expiryStr = fullData?.expiry;
    if (expiryStr) {
      const expiryDate = new Date(expiryStr);
      if (!isNaN(expiryDate.getTime())) {
        const shortLived = /^P[01]D$/.test(catBundle?.timeout || "");
        const day = dateInReaderLanguage(expiryDate);
        const time = expiryDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
        fragments.push(
          shortLived
            ? siteText("bundles.held-expires-at", "expires {date} at {time}", { date: day, time })
            : siteText("bundles.held-expires", "expires {date}", { date: day }),
        );
      }
    }

    if (fullData?.configDriven) fragments.push(configSetNote());

    // Like the name, the summary waits for the catalogue service, which picks the reader's language.
    const summary =
      __catalogueSettled && catBundle
        ? passSummarySentence(__catalogService.bundlePassSummary(catBundle, window.siteLanguage?.chrome?.()))
        : "";
    const summaryLine = summary ? domEl("div", { class: "bundle-note bundle-summary" }, summary) : null;
    const infoLine = fragments.length > 0 ? domEl("div", { class: "bundle-note" }, fragments.join(" · ")) : null;

    // Show Manage Subscription button if bundle has an active subscription
    const manageBtn = fullData?.stripeSubscriptionId
      ? domEl(
          "button",
          { "type": "button", "class": "btn btn-outline bundle-row-btn", "data-manage-subscription": "true", "data-bundle-id": bundleId },
          manageSubscriptionText(),
        )
      : null;

    const row = domEl(
      "div",
      {
        class: "service-item bundle-row",
      },
      domEl(
        "span",
        { class: "bundle-row-line" },
        domEl("span", { class: "bundle-row-name" }, displayName),
        manageBtn,
        fullData?.configDriven
          ? null
          : domEl(
              "button",
              { "type": "button", "class": "btn btn-danger-outline bundle-row-btn", "data-remove-bundle-id": bundleId },
              siteText("bundles.remove", "Remove"),
            ),
      ),
      summaryLine,
      infoLine,
    );
    return { row, configDriven: Boolean(fullData?.configDriven) };
  });

  const affiliateCard = affiliateRowEl();
  if (affiliateCard) bundleRows.push({ row: affiliateCard, configDriven: __affiliateApplication?.configDriven === true });

  const bundleCards = groupedBundleRows(bundleRows);
  container.replaceChildren(...bundleCards);

  const section = document.getElementById("currentBundlesSection");
  if (section) {
    section.style.display = bundleCards.length > 0 ? "block" : "none";
  }
  // A render that runs before the held bundles arrive sees an empty list; it must not hand the reserved room back.
  if (__userBundlesLoaded) document.querySelector(".bundles-block")?.classList.toggle("holds-no-bundles", bundleCards.length === 0);
}

// The affiliate status row of the current list: shown for an approved affiliate and for one that
// configuration sets; only an approved affiliate that configuration does not set can remove it.
function affiliateRowEl() {
  const application = __affiliateApplication;
  if (!application || !(application.state === "approved" || application.configDriven)) return null;
  const approvedNote = [siteText("bundles.affiliate-approved", "approved"), application.terms?.name].filter(Boolean).join(" · ");
  const note = application.configDriven ? configSetNote() : approvedNote;
  return domEl(
    "div",
    { "class": "service-item bundle-row", "data-affiliate-row": "true" },
    domEl(
      "span",
      { class: "bundle-row-line" },
      domEl(
        "span",
        { class: "bundle-row-name" },
        application.configDriven ? siteText("bundles.family-affiliate", "Family affiliate") : siteText("bundles.affiliate", "Affiliate"),
      ),
      application.configDriven
        ? null
        : domEl(
            "button",
            { "type": "button", "class": "btn btn-danger-outline bundle-row-btn", "data-withdraw-affiliate": "true" },
            siteText("bundles.remove", "Remove"),
          ),
    ),
    domEl("div", { class: "bundle-note" }, note),
  );
}

// Commission lines already earned at a cash tier stay held while the affiliate is not approved, and the
// referrer earns the customer credit tier on new referrals.
const affiliateWithdrawText = () =>
  siteText(
    "bundles.affiliate-withdraw-confirm",
    "Remove your approved affiliate status? Commission you have earned stays held and is not paid while you are not approved. New referrals earn credit on your own subscription instead. To become an affiliate again, contact support.",
  );

function showAffiliateWithdrawConfirm(anchor) {
  document.getElementById("affiliateWithdrawConfirm")?.remove();
  const panel = domEl(
    "div",
    {
      "id": "affiliateWithdrawConfirm",
      "class": "pass-delete-confirm",
      "role": "group",
      "aria-label": siteText("bundles.affiliate-withdraw-label", "Confirm removal of affiliate status"),
    },
    domEl("p", { class: "pass-delete-confirm-text" }, affiliateWithdrawText()),
    domEl(
      "div",
      { class: "bundle-row-line" },
      domEl(
        "button",
        { type: "button", class: "btn btn-small btn-danger-outline affiliate-withdraw-confirm-yes" },
        siteText("bundles.affiliate-withdraw-yes", "Yes, remove"),
      ),
      domEl(
        "button",
        { type: "button", class: "btn btn-small btn-secondary affiliate-withdraw-confirm-keep" },
        siteText("bundles.affiliate-withdraw-keep", "Keep"),
      ),
    ),
  );
  anchor.insertAdjacentElement("beforeend", panel);
  panel.querySelector(".affiliate-withdraw-confirm-yes").focus();
}

async function withdrawAffiliate() {
  const yes = document.querySelector(".affiliate-withdraw-confirm-yes");
  if (yes) yes.disabled = true;
  try {
    const res = await window.fetchWithIdToken("/api/v1/affiliate/application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
    __affiliateApplication = { ...__affiliateApplication, state: body.state };
    document.getElementById("affiliateWithdrawConfirm")?.remove();
    renderCurrentBundles();
    renderAffiliateApplyState();
    showStatus(siteText("bundles.affiliate-removed", "Your affiliate status is removed."), "success");
  } catch (err) {
    if (yes) yes.disabled = false;
    showStatus(
      siteText("bundles.affiliate-not-removed", "Your affiliate status was not removed ({message})", { message: err.message }),
      "error",
    );
  }
}

document.addEventListener("click", (e) => {
  const withdraw = e.target.closest("button[data-withdraw-affiliate]");
  if (withdraw) {
    showAffiliateWithdrawConfirm(withdraw.closest(".bundle-row"));
    return;
  }
  if (e.target.closest(".affiliate-withdraw-confirm-yes")) {
    withdrawAffiliate();
    return;
  }
  if (e.target.closest(".affiliate-withdraw-confirm-keep")) {
    document.getElementById("affiliateWithdrawConfirm")?.remove();
  }
});

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
  if (!(await window.requireSession())) return;
  const idToken = getIdToken();

  // Show status immediately before making the request
  showStatus(siteText("bundles.removing", "Removing bundle “{name}”...", { name: bundleName }), "info");

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
      showStatus(siteText("bundles.removed", "Bundle “{name}” removed successfully.", { name: bundleName }), "success");
    } else {
      showStatus(
        siteText("bundles.remove-failed", "Failed to remove bundle: {reason}", { reason: result.error || unknownError() }),
        "error",
      );
    }
  } catch (error) {
    showStatus(siteText("bundles.remove-error", "Failed to remove bundle. Please try again."), "error");
    console.error("Remove bundle error:", error);
  }
}

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

  const feature = window.featureFlags ? await window.featureFlags.getFeature("feedback-engagement") : null;
  if (!feature || !feature.enabled || !feature.message) return;
  document.getElementById("feedbackEngagementMessage").textContent = feature.message;

  section.hidden = false;
  section.style.display = "block";

  const joinBtn = document.getElementById("feedbackEngagementBtn");
  if (joinBtn) {
    // If already registered, update button state
    if (alreadyRegistered) {
      joinBtn.textContent = siteText("bundles.feedback-thanks", "Thanks! We'll be in touch soon.");
      joinBtn.classList.add("btn-ok");
      joinBtn.disabled = true;
      return;
    }

    joinBtn.addEventListener("click", async function () {
      joinBtn.disabled = true;
      joinBtn.textContent = siteText("bundles.feedback-sending", "Sending...");
      try {
        const response = await window.fetchWithIdToken("/api/v1/interest", { method: "POST" });
        if (response.ok) {
          joinBtn.textContent = siteText("bundles.feedback-thanks", "Thanks! We'll be in touch soon.");
          joinBtn.classList.add("btn-ok");
          try {
            localStorage.setItem("feedbackEngagementRegistered", "true");
          } catch {}
        } else {
          joinBtn.textContent = siteText("bundles.feedback-try-again", "Try again");
          joinBtn.disabled = false;
        }
      } catch (err) {
        console.error("Feedback engagement failed:", err);
        joinBtn.textContent = siteText("bundles.feedback-try-again", "Try again");
        joinBtn.disabled = false;
      }
    });
  }
}

// --- My Generated Passes ---
let __myPassesNextPageKey = null;

// Chromium's Intl has no Welsh dates, so a Welsh date is written here with HMRC's Welsh month names.
const WELSH_MONTHS = [
  "Ionawr",
  "Chwefror",
  "Mawrth",
  "Ebrill",
  "Mai",
  "Mehefin",
  "Gorffennaf",
  "Awst",
  "Medi",
  "Hydref",
  "Tachwedd",
  "Rhagfyr",
];
const WELSH_SHORT_MONTHS = ["Ion", "Chwef", "Maw", "Ebr", "Mai", "Meh", "Gorff", "Awst", "Medi", "Hyd", "Tach", "Rhag"];

function dateInReaderLanguage(date, { month = "long", utc = false } = {}) {
  if (window.siteLanguage?.chrome?.() !== "cy") {
    return date.toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric", ...(utc ? { timeZone: "UTC" } : {}) });
  }
  const part = (name) => (utc ? date[`getUTC${name}`]() : date[`get${name}`]());
  return `${part("Date")} ${(month === "short" ? WELSH_SHORT_MONTHS : WELSH_MONTHS)[part("Month")]} ${part("FullYear")}`;
}

// The pass card's type label, terms and figures come from lib/pass-card.js, which the operator's
// campaign pass page shares.
const passCardHelpers = { siteText, dateText: dateInReaderLanguage };

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
  if (heldAllowed) {
    const names = passActivities.map((a) => a.name).join(` ${siteText("bundles.or", "or")} `);
    emptyMsg.textContent = siteText("bundles.no-passes-use", "You haven't generated any passes yet. Use {names} in the activities list.", {
      names,
    });
  } else {
    const offered = __catalogueData.bundles
      .filter((b) => allowedIds.has(b.id) && !b.hidden && b.enable === "always")
      .filter(isListedInCurrentEnvironment);
    const names = offered.map((b) => b.name).join(", ");
    emptyMsg.textContent = siteText(
      "bundles.no-passes-bundles",
      "You haven't generated any passes yet. A pass is generated from a bundle that allows it: {names}.",
      { names },
    );
  }
  emptyMsg.style.display = "block";
}

// A pass just generated lands here with ?newPass=<code>. The code leaves the address as the page
// starts, so a reload or the language switch does not show its status again, and the first list of
// generated passes shows it once.
let newlyGeneratedPassCode = takeNewPassFromAddress();

function takeNewPassFromAddress() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("newPass");
  if (!code) return null;
  url.searchParams.delete("newPass");
  window.history.replaceState(null, "", url);
  return code;
}

// The pass just generated: show it, scroll to it and put focus on it.
function focusNewlyGeneratedPass() {
  const newCode = newlyGeneratedPassCode;
  if (!newCode) return;
  newlyGeneratedPassCode = null;
  const card = Array.from(document.querySelectorAll("#generatedPassesList [data-pass-code]")).find(
    (el) => el.getAttribute("data-pass-code") === newCode,
  );
  if (!card) return;
  card.setAttribute("tabindex", "-1");
  card.scrollIntoView({ block: "center" });
  card.focus();
  showStatus(
    siteText("bundles.pass-generated", "Pass {code} generated. Track what this link earns under My generated passes", { code: newCode }),
    "success",
  );
}

// The caller's own commission totals: held (with the day each part releases), payable and paid.
// Nothing shows until the caller has any.
async function fetchCommissionEarnings() {
  try {
    const res = await window.fetchWithIdToken("/api/v1/commission/mine");
    if (!res.ok) return;
    const earnings = await res.json();
    const block = document.getElementById("commissionEarnings");
    const list = document.getElementById("commissionEarningsList");
    if (!block || !list) return;
    const { held, payable, paid } = earnings;
    if (!held || !payable || !paid || held.totalPence + payable.totalPence + paid.totalPence === 0) {
      block.hidden = true;
      return;
    }
    const pounds = (pence) => formatGbp(pence / 100);
    const day = (isoDay) => dateInReaderLanguage(new Date(`${isoDay}T00:00:00Z`), { utc: true });
    const rows = [
      domEl("li", { "data-earnings": "held" }, siteText("bundles.earnings-held", "Held: {amount}", { amount: pounds(held.totalPence) })),
    ];
    if (held.releases.length > 0) {
      rows.push(
        domEl(
          "li",
          { "data-earnings": "releases" },
          held.releases
            .map((release) =>
              siteText("bundles.earnings-release", "{amount} releases on {date}", {
                amount: pounds(release.amountPence),
                date: day(release.releaseDate),
              }),
            )
            .join("; "),
        ),
      );
    }
    rows.push(
      domEl(
        "li",
        { "data-earnings": "payable" },
        siteText("bundles.earnings-payable", "Payable: {amount}", { amount: pounds(payable.totalPence) }),
      ),
    );
    rows.push(
      domEl("li", { "data-earnings": "paid" }, siteText("bundles.earnings-paid", "Paid: {amount}", { amount: pounds(paid.totalPence) })),
    );
    list.replaceChildren(...rows);
    block.hidden = false;
  } catch (err) {
    console.warn("Failed to fetch commission earnings:", err);
  }
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

    if (!append) fetchCommissionEarnings();
    if (!append) list.replaceChildren();
    document.getElementById("generatedPassesTotals")?.remove();

    if (data.passes.length === 0 && !append) {
      __noGeneratedPasses = true;
      document.getElementById("generatedPassesToolbar").hidden = true;
      renderGeneratedPassesEmptyText();
      loadMore.style.display = "none";
      return;
    }

    __noGeneratedPasses = false;
    emptyMsg.style.display = "none";
    document.getElementById("generatedPassesToolbar").hidden = false;
    document.getElementById("passDeleteConfirm")?.remove();

    const catalogue = __catalogueData || (await fetchAndParse("/submit.catalogue.toml", { ttlMs: 300000 }));
    data.passes.forEach((pass) => {
      const typeLabel = window.passCard.typeLabel(pass, passCardHelpers);
      const passUrl = `${window.location.origin}/pass.html?pass=${encodeURIComponent(pass.code)}`;
      const qrPage = pass.passTypeId === "physical-pass" ? "generate-physical.html" : "generate-digital.html";
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
          domEl("input", {
            "type": "checkbox",
            "class": "pass-select",
            "data-select-code": pass.code,
            "aria-label": siteText("bundles.pass-select", "Select pass {code}", { code: pass.code }),
          }),
          domEl("span", { class: "pass-code" }, pass.code),
          domEl("span", { class: "status-tag" }, typeLabel),
        ),
        pass.notes ? domEl("div", { class: "bundle-note" }, pass.notes) : null,
        window.passCard.termsEl(pass, catalogue, passCardHelpers),
        pass.heldForReview ? domEl("div", { class: "bundle-note" }, siteText("bundles.pass-on-hold", "on hold for review")) : null,
        pass.figures ? window.passCard.figuresEl(pass.figures, "pass-figures", passCardHelpers) : null,
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
            siteText("bundles.pass-copy-link", "Copy Link"),
          ),
          domEl(
            "a",
            {
              href: qrUrl,
              class: "btn btn-small btn-secondary",
            },
            siteText("bundles.pass-view-qr", "View QR"),
          ),
          domEl(
            "a",
            {
              href: marketingPostUrl(pass),
              class: "btn btn-small btn-secondary pass-post",
              target: "_blank",
              rel: "noopener",
            },
            siteText("bundles.pass-post", "Post"),
          ),
          pass.heldForReview && viewerIsOperator
            ? domEl(
                "button",
                {
                  "type": "button",
                  "class": "btn btn-small btn-primary pass-release",
                  "data-pass-code": pass.code,
                },
                siteText("bundles.pass-release", "Release"),
              )
            : null,
          domEl(
            "button",
            {
              "type": "button",
              "class": "btn btn-small btn-danger-outline pass-delete",
              "data-delete-code": pass.code,
              "aria-label": siteText("bundles.pass-delete", "Delete pass {code}", { code: pass.code }),
              "title": siteText("bundles.pass-delete-title", "Delete this pass"),
            },
            trashIconEl(),
          ),
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
                ? siteText("bundles.totals-all", "All {count} passes", { count: data.totals.passes })
                : siteText("bundles.totals-some", "{counted} of {count} passes (the others are under 3 new accounts together)", {
                    counted: data.totals.countedPasses,
                    count: data.totals.passes,
                  }),
            ),
          ),
          window.passCard.figuresEl(data.totals, "pass-figures", passCardHelpers),
        ),
      );
    }

    __myPassesNextPageKey = data.nextPageKey || null;
    loadMore.style.display = __myPassesNextPageKey ? "block" : "none";

    updatePassSelection();

    if (!append) focusNewlyGeneratedPass();
  } catch (err) {
    console.warn("Failed to fetch my generated passes:", err);
  }
}

// Prod hosts are the apex and every prod- host (prod-submit and the per-deployment prod-<sha>.submit); the rest are ci.
function isProdSubmitHost(hostname) {
  return hostname === "submit.diyaccounting.co.uk" || hostname.startsWith("prod-");
}

function marketingPostUrl(pass) {
  const marketingHost = isProdSubmitHost(window.location.hostname) ? "marketing.diyaccounting.co.uk" : "ci-marketing.diyaccounting.co.uk";
  const url = new URL(`https://${marketingHost}/`);
  url.searchParams.set("pass", pass.code);
  url.hash = String(pass.bundleId || "").includes("vat") ? "submit-vat" : "submit-all";
  return url.toString();
}

// Copy link click handler for generated passes
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".pass-copy-link");
  if (!btn) return;
  const url = btn.getAttribute("data-pass-url");
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = siteText("bundles.pass-copied", "Copied!");
    setTimeout(() => {
      btn.textContent = siteText("bundles.pass-copy-link", "Copy Link");
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
    showStatus(siteText("bundles.pass-released", "Pass {code} released", { code: btn.getAttribute("data-pass-code") }), "success");
    fetchMyGeneratedPasses(false);
  } catch (err) {
    btn.disabled = false;
    showStatus(siteText("bundles.pass-not-released", "The pass was not released ({message})", { message: err.message }), "error");
  }
});

// Delete generated passes: one by its trash button, or every ticked pass, each after an in-page confirm.
const SVG_NS = "http://www.w3.org/2000/svg";

function trashIconEl() {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    "width": "18",
    "height": "18",
    "viewBox": "0 0 24 24",
    "fill": "none",
    "stroke": "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    "focusable": "false",
  })) {
    svg.setAttribute(name, value);
  }
  for (const d of ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

const passCheckboxes = () => Array.from(document.querySelectorAll("#generatedPassesList .pass-select"));

function updatePassSelection() {
  const boxes = passCheckboxes();
  const ticked = boxes.filter((box) => box.checked);
  const selectAll = document.getElementById("selectAllPasses");
  const deleteSelected = document.getElementById("deleteSelectedPassesBtn");
  if (!selectAll || !deleteSelected) return;
  selectAll.checked = boxes.length > 0 && ticked.length === boxes.length;
  selectAll.indeterminate = ticked.length > 0 && ticked.length < boxes.length;
  deleteSelected.disabled = ticked.length === 0;
  deleteSelected.textContent =
    ticked.length > 0
      ? siteText("bundles.delete-selected-count", "Delete selected ({count})", { count: ticked.length })
      : siteText("bundles.delete-selected-d2ab5d", "Delete selected");
}

function showPassDeleteConfirm(codes, anchor, placement) {
  document.getElementById("passDeleteConfirm")?.remove();
  const one = codes.length === 1;
  const panel = domEl(
    "div",
    {
      "id": "passDeleteConfirm",
      "class": "pass-delete-confirm",
      "role": "group",
      "aria-label": one
        ? siteText("bundles.pass-delete-confirm-one-label", "Confirm delete of pass {code}", { code: codes[0] })
        : siteText("bundles.pass-delete-confirm-many-label", "Confirm delete of {count} passes", { count: codes.length }),
    },
    domEl(
      "p",
      { class: "pass-delete-confirm-text" },
      one
        ? siteText(
            "bundles.pass-delete-confirm-one",
            "Delete pass {code}? The link stops working at once. Their figures stay in your totals.",
            {
              code: codes[0],
            },
          )
        : siteText(
            "bundles.pass-delete-confirm-many",
            "Delete {count} passes? The links stop working at once. Their figures stay in your totals.",
            { count: codes.length },
          ),
    ),
    domEl(
      "div",
      { class: "bundle-row-line" },
      domEl(
        "button",
        { "type": "button", "class": "btn btn-small btn-danger-outline pass-delete-confirm-yes", "data-pass-codes": codes.join(",") },
        siteText("bundles.pass-delete-yes", "Yes, delete"),
      ),
      domEl(
        "button",
        { type: "button", class: "btn btn-small btn-secondary pass-delete-confirm-keep" },
        siteText("bundles.affiliate-withdraw-keep", "Keep"),
      ),
    ),
  );
  anchor.insertAdjacentElement(placement, panel);
  panel.querySelector(".pass-delete-confirm-yes").focus();
}

async function deletePasses(codes) {
  const yes = document.querySelector(".pass-delete-confirm-yes");
  if (yes) yes.disabled = true;
  try {
    const res = await window.fetchWithIdToken("/api/v1/pass/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const results = body.results || [];
    const deleted = results.filter((result) => result.status === "deleted").length;
    const skipped = results.length - deleted;
    const deletedText =
      deleted === 1
        ? siteText("bundles.deleted-one", "Deleted 1 pass")
        : siteText("bundles.deleted-many", "Deleted {count} passes", { count: deleted });
    const skippedText =
      skipped > 0 ? siteText("bundles.deleted-skipped", ", {count} not deleted (already deleted or not yours)", { count: skipped }) : "";
    showStatus(`${deletedText}${skippedText}`, deleted > 0 ? "success" : "warning");
    document.getElementById("passDeleteConfirm")?.remove();
    await fetchMyGeneratedPasses(false);
  } catch (err) {
    if (yes) yes.disabled = false;
    showStatus(siteText("bundles.passes-not-deleted", "The passes were not deleted ({message})", { message: err.message }), "error");
  }
}

document.addEventListener("click", (e) => {
  const trash = e.target.closest(".pass-delete");
  if (trash) {
    showPassDeleteConfirm([trash.getAttribute("data-delete-code")], trash.closest(".bundle-row"), "beforeend");
    return;
  }
  if (e.target.closest("#deleteSelectedPassesBtn")) {
    const codes = passCheckboxes()
      .filter((box) => box.checked)
      .map((box) => box.getAttribute("data-select-code"));
    if (codes.length > 0) showPassDeleteConfirm(codes, document.getElementById("generatedPassesToolbar"), "afterend");
    return;
  }
  if (e.target.closest(".pass-delete-confirm-keep")) {
    document.getElementById("passDeleteConfirm")?.remove();
    return;
  }
  const yes = e.target.closest(".pass-delete-confirm-yes");
  if (yes) deletePasses(yes.getAttribute("data-pass-codes").split(","));
});

document.addEventListener("change", (e) => {
  if (e.target.id === "selectAllPasses") {
    for (const box of passCheckboxes()) box.checked = e.target.checked;
    updatePassSelection();
  } else if (e.target.closest(".pass-select")) {
    updatePassSelection();
  }
});

// Affiliates: a signed-in user applies through Stripe Connect onboarding
const AFFILIATE_APPLY_TEXT = {
  none: () => ({
    text: siteText("bundles.apply-none", "You have not applied."),
    button: siteText("bundles.apply-button", "Apply with Stripe"),
  }),
  started: () => ({
    text: siteText("bundles.apply-started", "Your application is started. Finish the Stripe steps to send it."),
    button: siteText("bundles.apply-continue", "Continue with Stripe"),
  }),
  submitted: () => ({
    text: siteText("bundles.apply-submitted", "Stripe has your details. We review the application and tell you our decision by email."),
    button: null,
  }),
  approved: () => ({ text: siteText("bundles.apply-approved", "You are an approved affiliate."), button: null }),
  ended: () => ({ text: siteText("bundles.apply-ended", "This affiliate has ended."), button: null }),
};

function affiliateApplyView(application) {
  if (application.state === "approved") return AFFILIATE_APPLY_TEXT.approved();
  if (application.state === "ended") return AFFILIATE_APPLY_TEXT.ended();
  if (application.state === "applied") {
    return application.detailsSubmitted ? AFFILIATE_APPLY_TEXT.submitted() : AFFILIATE_APPLY_TEXT.started();
  }
  return AFFILIATE_APPLY_TEXT.none();
}

function renderAffiliateApplyState() {
  const view = affiliateApplyView(__affiliateApplication);
  document.getElementById("affiliateApplyState").textContent = view.text;
  const button = document.getElementById("affiliateApplyBtn");
  button.hidden = !view.button;
  if (view.button) button.textContent = view.button;
}

async function initAffiliateApplySection() {
  if (!getIdToken()) return;
  const stateEl = document.getElementById("affiliateApplyState");
  document.getElementById("affiliateApplySection").hidden = false;
  try {
    const res = await window.fetchWithIdToken("/api/v1/affiliate/application");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    __affiliateApplication = await res.json();
    renderAffiliateApplyState();
    renderCurrentBundles();
  } catch (err) {
    stateEl.textContent = siteText("bundles.apply-read-failed", "Your application could not be read ({message}). Reload the page.", {
      message: err.message,
    });
  }
}

document.getElementById("affiliateApplyBtn")?.addEventListener("click", async () => {
  const button = document.getElementById("affiliateApplyBtn");
  button.disabled = true;
  try {
    const res = await window.fetchWithIdToken("/api/v1/affiliate/application", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
    if (typeof body.url !== "string" || !body.url.startsWith("https://")) throw new Error("Stripe sent no onboarding link");
    window.location.assign(body.url);
  } catch (err) {
    showStatus(siteText("bundles.apply-not-started", "The application was not started ({message})", { message: err.message }), "error");
    button.disabled = false;
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
    siteText("bundles.affiliate-tier-state", "Tier {tier}, state {state}", { tier: affiliate.tier, state: affiliate.state }) +
    (affiliate.approvedAt ? siteText("bundles.affiliate-approved-at", ", approved {date}", { date: affiliate.approvedAt }) : "") +
    (affiliate.hasConnectAccount
      ? (affiliate.detailsSubmitted
          ? siteText("bundles.affiliate-details-submitted", ", Stripe details submitted")
          : siteText("bundles.affiliate-details-not-submitted", ", Stripe details not submitted")) +
        (affiliate.transfersActive
          ? siteText("bundles.affiliate-transfers-active", ", transfers active")
          : siteText("bundles.affiliate-transfers-not-active", ", transfers not active"))
      : siteText("bundles.affiliate-no-stripe", ", no Stripe account"));
}

document.getElementById("affiliateLookupBtn")?.addEventListener("click", async () => {
  const referrerHash = document.getElementById("affiliateReferrerHash").value.trim();
  const result = document.getElementById("affiliateResult");
  try {
    const res = await window.fetchWithIdToken(`/api/v1/affiliate?referrerHash=${encodeURIComponent(referrerHash)}`);
    if (res.status === 404) {
      result.textContent = siteText("bundles.affiliate-none-for-referrer", "No affiliate for that referrer");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showAffiliate(await res.json());
  } catch (err) {
    result.textContent = siteText("bundles.affiliate-lookup-failed", "The lookup failed ({message})", { message: err.message });
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
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }
    showAffiliate(await res.json());
    showStatus(siteText("bundles.affiliate-saved", "Affiliate saved"), "success");
  } catch (err) {
    showStatus(siteText("bundles.affiliate-not-saved", "The affiliate was not saved ({message})", { message: err.message }), "error");
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
  if (passForward) return;
  checkAuthStatus();
  initFeedbackEngagementSection();
  fetchMyGeneratedPasses(false);
  initAffiliateSection();
  initAffiliateApplySection();

  // Handle checkout result from Stripe redirect
  const urlParams = new URLSearchParams(window.location.search);
  const checkoutResult = urlParams.get("checkout");
  if (checkoutResult === "success") {
    showStatus(siteText("bundles.checkout-success", "Subscription activated! Your bundle has been added."), "success");
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
    showStatus(siteText("bundles.checkout-canceled", "Checkout was canceled. You can try again when you're ready."), "info");
    const url = new URL(window.location);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", url);
  }
}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}
