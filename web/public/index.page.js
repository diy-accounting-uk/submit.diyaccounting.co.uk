// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// In-memory user bundles state (list of bundleId strings)
let __userBundles = [];
let __syntheticBundleIds = new Set();
let __tokensRemaining = 0;
let __hasTokenBundles = false;
let __unlimitedTokenBundleIds = new Set();
let __fetchBundlesController = null;

async function initializeBundles() {
  const idToken = localStorage.getItem("cognitoIdToken");
  const userInfo = localStorage.getItem("userInfo");
  if (idToken && userInfo) {
    console.log("User is authenticated");

    // Abort previous fetch if any
    if (__fetchBundlesController) {
      __fetchBundlesController.abort();
    }
    __fetchBundlesController = new AbortController();
    const signal = __fetchBundlesController.signal;

    // Fetch user bundles from endpoint (single source of truth)
    try {
      const rc = window.requestCache;
      let bundlesData;
      if (rc && typeof rc.getJSON === "function") {
        bundlesData = await rc.getJSON("/api/v1/bundle", {
          ttlMs: 5000,
          init: { headers: { Authorization: `Bearer ${idToken}` }, signal },
        });
      } else {
        const response = await window.fetchWithIdToken("/api/v1/bundle", { signal });
        if (response.ok) {
          bundlesData = await response.json();
        }
      }

      if (bundlesData && bundlesData.bundles && Array.isArray(bundlesData.bundles)) {
        const allocated = bundlesData.bundles.filter((b) => b.allocated);
        __userBundles = allocated.map((b) => b.bundleId);
        __syntheticBundleIds = new Set(allocated.filter((b) => b.qualifiers?.synthetic === true).map((b) => b.bundleId));
        // Set sessionStorage for synthetic mode based on bundle qualifiers (single source of truth)
        if (__syntheticBundleIds.size > 0) {
          sessionStorage.setItem("hmrcAccount", "synthetic");
        } else {
          sessionStorage.removeItem("hmrcAccount");
        }
        __tokensRemaining = typeof bundlesData.tokensRemaining === "number" ? bundlesData.tokensRemaining : 0;
        __hasTokenBundles = bundlesData.bundles.some((b) => b.allocated && b.tokensGranted !== undefined);
        __unlimitedTokenBundleIds = new Set(
          bundlesData.bundles.filter((b) => b.allocated && b.tokensGranted === "unlimited").map((b) => b.bundleId),
        );
      } else {
        __userBundles = [];
        __syntheticBundleIds = new Set();
        __tokensRemaining = 0;
        __hasTokenBundles = false;
        __unlimitedTokenBundleIds = new Set();
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Fetch user bundles aborted");
        return;
      }
      console.warn("Failed to fetch bundles:", err);
      __userBundles = [];
    } finally {
      if (__fetchBundlesController?.signal === signal) {
        __fetchBundlesController = null;
      }
    }
    renderDynamicActivities();
  } else {
    console.log("User is not authenticated");
    __userBundles = [];
    renderDynamicActivities();
  }
}

// Activities rendering based on bundles
function parseUserBundles() {
  // Return in-memory state; do not use localStorage for bundles
  return Array.isArray(__userBundles) ? __userBundles : [];
}

// function hasBundle(bundles, id) {
//  return (bundles || []).some((b) => typeof b === "string" && b === id);
// }

// Parse bundle expiry date from bundle string or object
function parseBundleExpiry(bundleEntry) {
  if (!bundleEntry) return null;
  if (typeof bundleEntry === "object") return bundleEntry.expiry || null;
  if (typeof bundleEntry !== "string") return null;

  const parts = bundleEntry.split("|");
  if (parts.length < 2) return null;
  const expiryMatch = parts[1].match(/EXPIRY=(.+)/);
  if (expiryMatch && expiryMatch[1]) {
    return expiryMatch[1]; // ISO date string like "2025-12-31" or full ISO timestamp
  }
  return null;
}

// Check if a bundle is expired
function isBundleExpired(bundleEntry) {
  const expiryStr = parseBundleExpiry(bundleEntry);
  if (!expiryStr) return false; // No expiry means not expired
  const expiryDate = new Date(expiryStr);
  if (isNaN(expiryDate.getTime())) return false; // Invalid date
  return expiryDate < new Date(); // Expired if expiry date is in the past
}

// Get user's active bundles (automatic + granted non-expired)
// Automatic bundles are only granted to authenticated users
function getActiveBundles(catalog, userBundles) {
  const active = new Set();
  const isLoggedIn = !!localStorage.getItem("cognitoIdToken");

  // Add automatic bundles for authenticated users
  if (catalog.bundles && isLoggedIn) {
    for (const bundle of catalog.bundles) {
      if (bundle.allocation === "automatic") {
        active.add(bundle.id);
      }
    }
  }

  // Add granted non-expired bundles
  for (const bundleEntry of userBundles) {
    if (!isBundleExpired(bundleEntry)) {
      const bundleId = typeof bundleEntry === "string" ? bundleEntry.split("|")[0] : bundleEntry.bundleId;
      active.add(bundleId);
    }
  }

  return Array.from(active);
}

// Get user's expired bundles
function getExpiredBundles(userBundles) {
  const expired = new Set();
  for (const bundleEntry of userBundles) {
    if (isBundleExpired(bundleEntry)) {
      const bundleId = typeof bundleEntry === "string" ? bundleEntry.split("|")[0] : bundleEntry.bundleId;
      expired.add(bundleId);
    }
  }
  return Array.from(expired);
}

// Check if user has access to an activity
function canAccessActivity(activity, activeBundles) {
  if (!activity.bundles || !Array.isArray(activity.bundles)) return false;
  return activity.bundles.some((bundleId) => activeBundles.includes(bundleId));
}

// function renderActivitiesByBundle() {
//   const container = document.getElementById("activitiesByBundle");
//   if (!container) return;
//
//   // Keep the bundle summary section for now, but we could make this dynamic too
//   const bundles = parseUserBundles();
//   const sections = [];
//
//   // Default bundle always available
//   sections.push(`
//     <section style="margin-bottom:1em;">
//       <h3 style="margin:0 0 .5em 0;">Default bundle</h3>
//       <ul>
//         <li>VAT Obligations (Production) – available</li>
//         <li>View receipts – available</li>
//       </ul>
//     </section>
//   `);
//
//   if (hasBundle(bundles, "test") || hasBundle(bundles, "test")) {
//     sections.push(`
//       <section style="margin-bottom:1em;">
//         <h3 style="margin:0 0 .5em 0;">Test API bundle</h3>
//         <ul>
//           <li>Submit VAT (Synthetic API) – available</li>
//           <li>VAT Obligations (Synthetic API) – available</li>
//         </ul>
//       </section>
//     `);
//   }
//
//   container.innerHTML = sections.join("");
//   container.style.display = "block"; // Make sure it's visible
// }

// Generate dynamic activity buttons based on display rules from catalogue
// Display rules:
//   - "never": don't show the button
//   - "on-entitlement": show only if user has an active bundle (default)
//   - "always-with-upsell": always show; if not entitled, show as call-to-action linking to bundles page
//   - "always": always show the button regardless of entitlement
function messageParagraph(className, text) {
  const paragraph = document.createElement("p");
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

// One activity row: a button (disabled, or going to href when clicked) and an optional note beneath it.
function activityItem({ buttonClass, label, href, disabled, note, noteClass }) {
  const item = document.createElement("div");
  item.className = "activity-item";
  const button = document.createElement("button");
  button.type = "button";
  button.className = buttonClass;
  button.textContent = label;
  if (disabled) {
    button.disabled = true;
  } else {
    button.addEventListener("click", () => {
      window.location.href = href;
    });
  }
  item.append(button);
  if (note) {
    const noteElement = document.createElement("p");
    noteElement.className = noteClass;
    noteElement.textContent = note;
    item.append(noteElement);
  }
  return item;
}

// The status box and the subtitle say what the catalogue lists for this environment.
function renderFeatureStatus(catalog, environmentName) {
  const list = document.getElementById("featureStatusList");
  const subtitle = document.getElementById("homeSubtitle");
  const { groups, filings } = window.featureStatusSummary(catalog, environmentName);
  if (list) window.renderFeatureStatusList(list, groups);
  if (subtitle && filings.length > 0) {
    subtitle.textContent = `Submit ${window.joinWithAnd(filings)} to HMRC and Companies House`;
  }
}

async function renderDynamicActivities() {
  const dynamicContainer = document.getElementById("dynamicActivities");
  if (!dynamicContainer) return;

  try {
    // Fetch catalog
    const response = await fetch("/submit.catalogue.toml");
    if (!response.ok) {
      dynamicContainer.replaceChildren(
        messageParagraph("activity-message activity-message--error", "Unable to load activities. Please try again later."),
      );
      return;
    }

    const text = await response.text();
    const catalog = window.TOML ? window.TOML.parse(text) : await response.json().catch(() => ({}));
    const userBundles = parseUserBundles();
    const activeBundles = getActiveBundles(catalog, userBundles);
    const expiredBundles = getExpiredBundles(userBundles);
    const currentEnvironmentName = await window.fetchCurrentEnvironmentName();
    renderFeatureStatus(catalog, currentEnvironmentName);

    // Build a map of bundle id -> levelName for upsell display (distinct levels)
    const bundleLevelNameMap = {};
    for (const bundle of catalog.bundles || []) {
      bundleLevelNameMap[bundle.id] = bundle.levelName || bundle.name || bundle.id;
    }

    let needsLogin = false;
    const activitiesByArea = new Map();
    const addActivity = (activityPath, element) => {
      const area = window.activityArea(activityPath);
      if (!activitiesByArea.has(area)) activitiesByArea.set(area, []);
      activitiesByArea.get(area).push(element);
    };

    for (const activity of catalog.activities || []) {
      if (!activity.bundles || !Array.isArray(activity.bundles)) continue;

      // Skip activities not listed in the current environment
      if (!window.isActivityListedInEnvironment(activity, currentEnvironmentName)) continue;

      const displayRule = activity.display || "on-entitlement";

      // Skip activities with display="never"
      if (displayRule === "never") continue;

      const hasNonExpiredAccess = activity.bundles.some((bundleId) => activeBundles.includes(bundleId));
      const hasExpiredAccess = activity.bundles.some((bundleId) => expiredBundles.includes(bundleId));

      // An activity with no page has no button
      const path = window.activityPagePath(activity);
      if (!path) continue;

      if (hasNonExpiredAccess || displayRule === "always") {
        // User has access OR display="always" - show active button
        const tokenCost = activity.tokenCost || 0;
        const isMetered = activity.metered === true;
        const tokenLabel = isMetered && tokenCost > 0 ? ` (${tokenCost} token${tokenCost !== 1 ? "s" : ""})` : "";

        // An unlimited-grant bundle (the resident-pro practice licence) covering this
        // activity is exempt from the token count - never insufficient, never blocked.
        const hasUnlimitedAccess = activity.bundles.some((bundleId) => __unlimitedTokenBundleIds.has(bundleId));

        // Check if user has insufficient tokens for metered activities
        const insufficientTokens = isMetered && __hasTokenBundles && !hasUnlimitedAccess && tokenCost > 0 && __tokensRemaining < tokenCost;
        const noTokensForMetered = isMetered && __hasTokenBundles && !hasUnlimitedAccess && tokenCost === 0 && __tokensRemaining === 0;

        if (insufficientTokens) {
          addActivity(
            path,
            activityItem({
              buttonClass: "btn",
              disabled: true,
              label: `Insufficient tokens \u2014 ${activity.name}`,
              note: "Insufficient tokens",
              noteClass: "activity-note activity-note--warn",
            }),
          );
        } else if (noTokensForMetered) {
          addActivity(
            path,
            activityItem({
              buttonClass: "btn",
              disabled: true,
              label: `No tokens \u2014 ${activity.name}`,
              note: "No tokens available",
              noteClass: "activity-note activity-note--warn",
            }),
          );
        } else {
          addActivity(path, activityItem({ buttonClass: "btn activity-secondary", href: path, label: `${activity.name}${tokenLabel}` }));
        }
      } else if (hasExpiredAccess) {
        // User had access but it expired - show disabled button
        addActivity(path, activityItem({ buttonClass: "btn", disabled: true, label: `Expired \u2014 ${activity.name}` }));
      } else if (displayRule === "always-with-upsell") {
        // User doesn't have access - show activity with upsell annotation
        const isLoggedIn = !!localStorage.getItem("cognitoIdToken");
        const distinctLevelNames = [
          ...new Set(activity.bundles.filter((id) => id !== "default").map((id) => bundleLevelNameMap[id] || id)),
        ];
        const requiredBundleNames = distinctLevelNames.join(" or ");

        if (isLoggedIn) {
          // Logged in but missing bundle - link to bundles page
          addActivity(
            path,
            activityItem({
              buttonClass: "btn activity-secondary",
              href: "bundles.html",
              label: activity.name,
              note: `Requires: ${requiredBundleNames}`,
              noteClass: "activity-note",
            }),
          );
        } else {
          // Not logged in - prompt to log in, once above the list
          needsLogin = true;
          addActivity(
            path,
            activityItem({
              buttonClass: "btn activity-secondary",
              href: "auth/login.html",
              label: activity.name,
            }),
          );
        }
      }
      // For displayRule === "on-entitlement" with no access, don't show anything
    }

    // If no activities to show, display message
    if (activitiesByArea.size === 0) {
      dynamicContainer.replaceChildren(
        messageParagraph("activity-message", "No activities available. Request additional bundles to access more features."),
      );
      return;
    }

    const areaOrder = ["VAT", "Income Tax", "Companies House", "Passes", "More"];
    const sections = areaOrder
      .filter((area) => activitiesByArea.has(area))
      .map((area) => {
        const section = document.createElement("section");
        section.className = "activity-group";
        section.setAttribute("aria-label", area);
        const heading = document.createElement("h2");
        heading.textContent = area;
        section.append(heading, ...activitiesByArea.get(area));
        return section;
      });
    const loginNote = needsLogin ? [messageParagraph("activity-message", "These activities need an account and a bundle.")] : [];
    dynamicContainer.replaceChildren(...loginNote, ...sections);
    dynamicContainer.querySelector(".activity-secondary")?.classList.remove("activity-secondary");
  } catch (error) {
    console.error("Error loading activities:", error);
    dynamicContainer.replaceChildren(
      messageParagraph("activity-message activity-message--error", "Error loading activities. Please refresh the page."),
    );
  }
}

sessionStorage.removeItem("currentActivity");
console.log("Current activity cleared");

// Feedback engagement banner logic
async function initFeedbackEngagementBanner() {
  const banner = document.getElementById("feedbackEngagementBanner");
  if (!banner) return;

  const isLoggedIn = !!localStorage.getItem("cognitoIdToken");
  const alreadyRegistered = localStorage.getItem("feedbackEngagementRegistered") === "true";

  if (!isLoggedIn || alreadyRegistered) return;

  // Check feature flag
  if (window.featureFlags && typeof window.featureFlags.isFeatureEnabled === "function") {
    const enabled = await window.featureFlags.isFeatureEnabled("feedback-engagement");
    if (!enabled) {
      banner.hidden = true;
      return;
    }
  }

  banner.hidden = false;
  banner.style.visibility = "visible";

  const joinBtn = document.getElementById("feedbackEngagementBtn");
  const dismissBtn = document.getElementById("feedbackDismissBtn");

  if (joinBtn) {
    joinBtn.addEventListener("click", async function () {
      joinBtn.disabled = true;
      joinBtn.textContent = "Sending...";
      try {
        const response = await window.fetchWithIdToken("/api/v1/interest", { method: "POST" });
        if (response.ok) {
          joinBtn.textContent = "Thanks! We'll be in touch soon.";
          joinBtn.classList.add("btn-ok");
          localStorage.setItem("feedbackEngagementRegistered", "true");
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

  if (dismissBtn) {
    dismissBtn.addEventListener("click", function () {
      banner.hidden = true;
    });
  }
}

// Initialize page - wait for submit.js module to be ready
function initPage() {
  checkAuthStatus();
  initializeBundles();
  initFeedbackEngagementBanner();
}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}
