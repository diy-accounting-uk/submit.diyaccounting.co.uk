// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

const getIdToken = () => {
  try {
    return localStorage.getItem("cognitoIdToken");
  } catch (e) {
    return null;
  }
};

const __rc = typeof window !== "undefined" && window.requestCache ? window.requestCache : null;

async function fetchBundleData() {
  const idToken = getIdToken();
  if (!idToken) return null;

  try {
    let data;
    if (__rc && typeof __rc.getJSON === "function") {
      data = await __rc.getJSON("/api/v1/bundle", {
        ttlMs: 0,
        init: { headers: { Authorization: "Bearer " + idToken } },
      });
    } else if (window.fetchWithIdToken) {
      const response = await window.fetchWithIdToken("/api/v1/bundle", {});
      if (response.ok) {
        data = await response.json();
      }
    }
    return data;
  } catch (err) {
    console.warn("Failed to fetch bundle data:", err);
    return null;
  }
}

function tableRow(cellTexts, cellClass) {
  const row = document.createElement("tr");
  for (const text of cellTexts) {
    const cell = document.createElement("td");
    if (cellClass) cell.className = cellClass;
    cell.textContent = text;
    row.append(cell);
  }
  return row;
}

function messageRow(columns, text) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columns;
  cell.className = "no-data";
  cell.textContent = text;
  row.append(cell);
  return row;
}

function renderTokenSources(bundles, catalogue) {
  const body = document.getElementById("tokenSourcesBody");
  const tokenBundles = (bundles || []).filter(function (b) {
    return b.allocated && b.tokensGranted !== undefined;
  });

  if (tokenBundles.length === 0) {
    body.replaceChildren(messageRow(4, "No token bundles found."));
    return;
  }

  const rows = tokenBundles.map(function (b) {
    const remaining = b.tokensGranted === "unlimited" ? "Unlimited" : Math.max(0, (b.tokensGranted || 0) - (b.tokensConsumed || 0));
    let expiryInfo = "";
    if (b.tokenResetAt) {
      const resetDate = new Date(b.tokenResetAt);
      if (!isNaN(resetDate.getTime()))
        expiryInfo = "Refreshes " + resetDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    }
    if (!expiryInfo && b.expiry) {
      const expiryDate = new Date(b.expiry);
      if (!isNaN(expiryDate.getTime()))
        expiryInfo = "Expires " + expiryDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    }
    return tableRow([
      window.catalogueNames.bundleName(catalogue, b.bundleId) || "Unknown",
      b.tokensGranted || 0,
      remaining,
      expiryInfo || "-",
    ]);
  });
  body.replaceChildren(...rows);
}

function renderTokenConsumption(bundles, catalogue) {
  const body = document.getElementById("tokenConsumptionBody");
  const allEvents = [];

  (bundles || []).forEach(function (b) {
    if (b.tokenEvents && Array.isArray(b.tokenEvents)) {
      b.tokenEvents.forEach(function (evt) {
        allEvents.push(evt);
      });
    }
  });

  // Sort by timestamp descending (most recent first)
  allEvents.sort(function (a, b) {
    return (b.timestamp || "").localeCompare(a.timestamp || "");
  });

  if (allEvents.length === 0) {
    body.replaceChildren(messageRow(3, "No token consumption recorded."));
    return;
  }

  const rows = allEvents.map(function (evt) {
    const dateStr = evt.timestamp
      ? new Date(evt.timestamp).toLocaleString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";
    return tableRow([window.catalogueNames.activityName(catalogue, evt.activity) || "Unknown", dateStr, evt.tokensUsed || 1]);
  });
  body.replaceChildren(...rows);
}

async function loadUsage() {
  const [data, catalogue] = await Promise.all([fetchBundleData(), window.catalogueNames.loadCatalogue()]);
  if (!data) return;
  renderTokenSources(data.bundles || [], catalogue);
  renderTokenConsumption(data.bundles || [], catalogue);
  renderSubscriptionManagement(data.bundles || []);
}

function renderSubscriptionManagement(bundles) {
  const section = document.getElementById("subscriptionManagement");
  const hasSubscription = (bundles || []).some(function (b) {
    return b.allocated && b.stripeSubscriptionId;
  });
  section.hidden = !hasSubscription;
}

document.getElementById("manageSubscriptionBtn").addEventListener("click", async function () {
  const btn = document.getElementById("manageSubscriptionBtn");
  btn.textContent = "Loading...";
  btn.disabled = true;
  try {
    const response = await window.fetchWithIdToken("/api/v1/billing/portal", {});
    if (response.ok) {
      const result = await response.json();
      const portalUrl = result.data ? result.data.portalUrl : result.portalUrl;
      if (portalUrl) {
        window.location.href = portalUrl;
        return;
      }
    }
    btn.textContent = "Manage Subscription";
    btn.disabled = false;
    if (window.showStatus) window.showStatus("Unable to open subscription management. Please try again.", "error");
  } catch (err) {
    btn.textContent = "Manage Subscription";
    btn.disabled = false;
    if (window.showStatus) window.showStatus("Failed to connect to billing service.", "error");
  }
});

document.getElementById("refreshUsageBtn").addEventListener("click", function () {
  if (__rc && typeof __rc.invalidate === "function") {
    __rc.invalidate("/api/v1/bundle");
  }
  loadUsage();
  renderBrowserStorage();
});

// Allowlist: only these keys have their values displayed.
// Everything else is redacted by default to avoid leaking internal state.
const STORAGE_ALLOWLIST = new Set([
  "cognitoIdToken",
  "cognitoAccessToken",
  "cognitoRefreshToken",
  "userInfo",
  "loginProvider",
  "auth:lastUpdate",
  "consent.rum",
  "consent.analytics",
  "feedbackEngagementRegistered",
]);

function redactValue(key, value) {
  if (/^cognito.*Token$/.test(key)) {
    const claims = window.parseJwtClaims ? window.parseJwtClaims(value) : null;
    if (claims && claims.exp) {
      const remaining = Math.round((claims.exp * 1000 - Date.now()) / 60000);
      if (remaining > 0) return "Present (expires in " + remaining + " min)";
      return "Present (expired)";
    }
    return value ? "Present" : "(empty)";
  }
  if (key === "userInfo") {
    try {
      const info = JSON.parse(value);
      const parts = [];
      if (info.name) parts.push(info.name);
      if (info.email) parts.push(info.email);
      return parts.length > 0 ? parts.join(", ") : value;
    } catch (e) {
      return value;
    }
  }
  if (!STORAGE_ALLOWLIST.has(key)) {
    return "[redacted]";
  }
  return value || "(empty)";
}

function renderBrowserStorage() {
  const body = document.getElementById("browserStorageBody");
  const keys = Object.keys(localStorage).sort();
  if (keys.length === 0) {
    body.replaceChildren(messageRow(2, "No data stored."));
    return;
  }
  const rows = keys.map(function (k) {
    let v;
    try {
      v = localStorage.getItem(k);
    } catch (e) {
      v = "[unreadable]";
    }
    const row = tableRow([k, redactValue(k, v)], "storage-cell");
    row.firstElementChild.className = "storage-key";
    return row;
  });
  body.replaceChildren(...rows);
}

document.getElementById("clearStorageBtn").addEventListener("click", function () {
  if (!confirm("Clear all local storage for this site? This will log you out.")) return;
  const rumConsent = localStorage.getItem("consent.rum");
  const analyticsConsent = localStorage.getItem("consent.analytics");
  const rumConfig = localStorage.getItem("rum.config");
  localStorage.clear();
  if (rumConsent !== null) localStorage.setItem("consent.rum", rumConsent);
  if (analyticsConsent !== null) localStorage.setItem("consent.analytics", analyticsConsent);
  if (rumConfig !== null) localStorage.setItem("rum.config", rumConfig);
  renderBrowserStorage();
});

// Mirrors the dashboard's own "This year costs N tokens" line (D6), read from the same
// sessionStorage key the dashboard's business picker writes, so the figure only ever gets
// computed in one place. Absent when the customer has not used the ITSA business picker
// this session - not every visitor to this page has.
function renderItsaYearCostSummary() {
  const summaryEl = document.getElementById("itsaYearCostSummary");
  let stored = null;
  try {
    stored = JSON.parse(sessionStorage.getItem("itsaYearTokenCost") || "null");
  } catch (e) {
    stored = null;
  }
  if (!stored || !stored.yearTokens) {
    summaryEl.hidden = true;
    return;
  }
  summaryEl.textContent = `Your ITSA year costs ${stored.yearTokens} tokens for the ${stored.businessCount} business${stored.businessCount === 1 ? "" : "es"} you picked on the dashboard.`;
  summaryEl.hidden = false;
}

function initPage() {
  checkAuthStatus();
  loadUsage();
  renderBrowserStorage();
  renderItsaYearCostSummary();
}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}
