// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Global variables
let searchCriteriaHidden = false;

// Functions to manage search criteria visibility
function hideSearchCriteria() {
  const container = document.getElementById("searchCriteriaContainer");
  const toggleBtn = document.getElementById("toggleSearchCriteriaBtn");
  const cancelBtn = document.getElementById("cancelRequestBtn");
  if (container && toggleBtn) {
    container.style.display = "none";
    toggleBtn.style.display = "inline-block";
    if (cancelBtn) cancelBtn.style.display = "inline-block";
    searchCriteriaHidden = true;
  }
}

function showSearchCriteria() {
  const container = document.getElementById("searchCriteriaContainer");
  const toggleBtn = document.getElementById("toggleSearchCriteriaBtn");
  const cancelBtn = document.getElementById("cancelRequestBtn");
  if (container && toggleBtn) {
    container.style.display = "block";
    toggleBtn.style.display = "none";
    if (cancelBtn) cancelBtn.style.display = "none";
    searchCriteriaHidden = false;
  }
}

function hideRequestControls() {
  document.getElementById("cancelRequestBtn").style.display = "none";
  document.getElementById("toggleSearchCriteriaBtn").style.display = "none";
}

function cancelRequest() {
  // Clear all in-progress session data
  sessionStorage.removeItem("pendingLiabilitiesRequest");
  sessionStorage.removeItem("pendingReturnRequest");
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");

  // Show form and hide results
  showSearchCriteria();
  document.getElementById("liabilitiesResults").style.display = "none";
  hideStatus();
  console.log("Request cancelled, session data cleared");
}

// Check if we're in synthetic/test mode to show developer options
function initializePage() {
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");

  // Show synthetic indicator if in synthetic mode (determined by bundle qualifiers via sessionStorage)
  if (hmrcAccount === "synthetic") {
    const syntheticIndicator = document.getElementById("syntheticIndicator");
    if (syntheticIndicator) {
      syntheticIndicator.classList.add("visible");
    }
    const testDataLink = document.getElementById("testDataLink");
    if (testDataLink) {
      testDataLink.classList.add("visible");
    }
  }

  // Developer mode is now controlled by the global toggle via developer-mode.js
  // Show developer section based on sessionStorage and listen for changes
  const devSection = document.getElementById("developerSection");

  function updateDeveloperSectionVisibility() {
    const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
    if (devSection) {
      devSection.style.display = developerModeEnabled ? "block" : "none";
    }
  }

  // Initial check
  updateDeveloperSectionVisibility();

  // Listen for developer mode toggle changes
  window.addEventListener("developer-mode-changed", updateDeveloperSectionVisibility);
}

// OAuth callback handling
function handleOAuthCallback() {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  if (accessToken) {
    console.log("OAuth callback handler (accessToken found)");
    // If we have an access token, retrieve stored parameters and execute the call
    continueLiabilitiesRetrieval();
  } else {
    console.log("OAuth callback handler (no accessToken found)");
  }
}

async function continueLiabilitiesRetrieval() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingLiabilitiesRequest") || "null");

    if (!pendingRequest) {
      console.log("No pending liabilities request found");
      // Don't clear token - it might be valid from previous HMRC operation
      // Let form submission use it directly
      return;
    }

    console.log("Retrieved pending request:", pendingRequest);
    hideSearchCriteria(); // Hide the form when retrieving liabilities after auth
    showLoading();
    hideStatus(); // Clear stale banners from an earlier failed attempt before showing the new one
    showStatus("Retrieving VAT liabilities...", "info");

    // Restore form values
    if (pendingRequest.vrn) document.getElementById("vrn").value = pendingRequest.vrn;
    if (pendingRequest.from) document.getElementById("fromDate").value = pendingRequest.from;
    if (pendingRequest.to) document.getElementById("toDate").value = pendingRequest.to;
    if (pendingRequest.testScenario) document.getElementById("testScenario").value = pendingRequest.testScenario;
    if (pendingRequest.runFraudPreventionHeaderValidation)
      document.getElementById("runFraudPreventionHeaderValidation").checked = pendingRequest.runFraudPreventionHeaderValidation;

    // Build query parameters
    const params = new URLSearchParams({ vrn: pendingRequest.vrn });
    if (pendingRequest.from) params.append("from", pendingRequest.from);
    if (pendingRequest.to) params.append("to", pendingRequest.to);
    if (pendingRequest.testScenario) params.append("Gov-Test-Scenario", pendingRequest.testScenario);
    if (pendingRequest.runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

    // Get Gov-Client headers
    const govClientHeaders = await getGovClientHeaders();

    const requestHeaders = {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...govClientHeaders,
    };

    // Add hmrcAccount header if present in sessionStorage
    const hmrcAccount = sessionStorage.getItem("hmrcAccount");
    if (hmrcAccount) {
      requestHeaders["hmrcAccount"] = hmrcAccount;
    }

    const response = await window.authorizedFetch(`/api/v1/hmrc/vat/liability?${params}`, {
      method: "GET",
      headers: {
        ...requestHeaders,
        "x-wait-time-ms": "0",
      },
      pollPendingMessage: "Still processing...",
      pollSuccessMessage: "VAT liabilities retrieved.",
      pollErrorMessage: "Failed to retrieve VAT liabilities.",
    });

    const result = await response.json();

    if (!response.ok) {
      // Handle 401 specifically to trigger re-authentication
      if (response.status === 401) {
        sessionStorage.removeItem("hmrcAccessToken");
        sessionStorage.removeItem("hmrcTokenScope");
        showStatus("Access token expired. Please re-authenticate.", "error");
        showSearchCriteria(); // Show form on error
        return;
      }
      throw new Error(hmrcErrorMessage(result, "Failed to retrieve liabilities"));
    }

    // Display results
    displayLiabilities(result.liabilities || []);
    document.getElementById("liabilitiesResults").style.display = "block";
    hideRequestControls();
    hideStatus();

    // Clean up session storage - keep token for subsequent HMRC operations
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingLiabilitiesRequest");
    // Keep hmrcAccessToken for subsequent operations
    sessionStorage.removeItem("oauth_state");
    // Keep hmrcAccount for subsequent operations
    console.log("Liabilities retrieval completed successfully");
  } catch (error) {
    console.error("Error retrieving liabilities:", error);
    showStatus(`Failed to retrieve liabilities: ${error.message}`, "error");
    showSearchCriteria(); // Show form on error
    // Clear pending request data to prevent auto-retry loop on next page load
    sessionStorage.removeItem("pendingLiabilitiesRequest");
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcTokenScope");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("hmrcAccount");
    sessionStorage.removeItem("currentActivity");
    console.log("Liabilities retrieval failed, cleared session storage to prevent retry loop");
  } finally {
    hideLoading();
  }
}

// Handle form submission
async function handleFormSubmission(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const vrn = formData.get("vrn").trim();
  const from = formData.get("fromDate");
  const to = formData.get("toDate");
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  // Basic validation
  if (!vrn) {
    showStatus("Please enter a VAT registration number.", "error");
    return;
  }

  if (!/^\d{9}$/.test(vrn)) {
    showStatus("VAT number must be exactly 9 digits.", "error");
    return;
  }

  // Check if we have an access token with sufficient scope
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;

  if (!scopeSufficient) {
    if (accessToken) {
      console.log("HMRC access token exists but scope insufficient, clearing and re-authorizing");
      if (window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    }
    try {
      showLoading();
      showStatus("Initiating HMRC authentication...", "info");

      // Store request parameters and generate state
      const state = generateRandomState();
      const requestData = {
        vrn,
        from,
        to,
        testScenario,
        runFraudPreventionHeaderValidation,
      };

      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingLiabilitiesRequest", JSON.stringify(requestData));
      sessionStorage.setItem("currentActivity", currentActivity);
      console.log("Stored pending request and current activity:", requestData, currentActivity, hmrcAccount);

      // Get OAuth scope from catalogue
      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:vat";

      // Get OAuth URL with catalogue-driven scope
      const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");
      console.log("Generated HMRC Auth URL:", authResponseUrl);

      showStatus(`Redirecting to HMRC for authentication at ${authResponseUrl}...`, "info");

      // Redirect to HMRC OAuth
      console.log(`Page transition initiated: Redirecting to HMRC OAuth URL ${authResponseUrl}`);
      try {
        window.__correlation?.prepareRedirect?.();
      } catch {}
      window.location.href = authResponseUrl;
    } catch (error) {
      console.error("Authentication error:", error);
      showStatus(`Authentication failed: ${error.message}`, "error");
      hideLoading();
    }
  } else {
    // We have an access token, proceed directly
    try {
      showLoading();
      hideStatus(); // Clear stale banners from an earlier failed attempt before showing the new one
      showStatus("Retrieving VAT liabilities...", "info");

      // Build query parameters
      const params = new URLSearchParams({ vrn });
      if (from) params.append("from", from);
      if (to) params.append("to", to);
      if (testScenario) params.append("Gov-Test-Scenario", testScenario);
      if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

      // Get Gov-Client headers
      const govClientHeaders = await getGovClientHeaders();

      const requestHeaders = {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...govClientHeaders,
      };

      // Add hmrcAccount header if present
      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
      if (hmrcAccount) {
        requestHeaders["hmrcAccount"] = hmrcAccount;
      }

      const response = await window.authorizedFetch(`/api/v1/hmrc/vat/liability?${params}`, {
        method: "GET",
        headers: {
          ...requestHeaders,
          "x-wait-time-ms": "0",
        },
        pollPendingMessage: "Still processing...",
        pollSuccessMessage: "VAT liabilities retrieved.",
        pollErrorMessage: "Failed to retrieve VAT liabilities.",
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle 401 specifically to trigger re-authentication
        if (response.status === 401) {
          sessionStorage.removeItem("hmrcAccessToken");
          sessionStorage.removeItem("hmrcTokenScope");
          showStatus("Access token expired. Please try again.", "error");
          return;
        }
        throw new Error(hmrcErrorMessage(result, "Failed to retrieve liabilities"));
      }

      // Display results
      displayLiabilities(result.liabilities || []);
      document.getElementById("liabilitiesResults").style.display = "block";
      hideRequestControls();
      hideStatus();
    } catch (error) {
      console.error("Error retrieving liabilities:", error);
      showStatus(`Failed to retrieve liabilities: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }
}

function element(tag, attributes = {}, ...children) {
  const created = document.createElement(tag);
  Object.entries(attributes).forEach(([name, value]) => created.setAttribute(name, value));
  created.append(...children);
  return created;
}

function noDataMessage(text) {
  return element("p", { class: "no-data" }, text);
}

function resultsTable(headerCells, rows) {
  const headerRow = element(
    "tr",
    {},
    ...headerCells.map(([text, className]) => element("th", className ? { class: className } : {}, text)),
  );
  return HmrcDisplayFormat.scrollable(
    element("table", { class: "results-table" }, element("thead", {}, headerRow), element("tbody", {}, ...rows)),
  );
}

function displayLiabilities(liabilities) {
  const tableContainer = document.getElementById("liabilitiesTable");

  if (!liabilities || liabilities.length === 0) {
    tableContainer.replaceChildren(noDataMessage("No liabilities found for the specified criteria."));
    return;
  }

  const rows = liabilities.map((liability) => {
    const periodDisplay = formatDateRange(liability.taxPeriod?.from, liability.taxPeriod?.to);
    const originalAmountDisplay = formatCurrency(liability.originalAmount);
    // HMRC leaves the outstanding amount out of a liability that is paid in full.
    const outstanding = liability.outstandingAmount;
    const outstandingAmountDisplay =
      outstanding === undefined || outstanding === null || Number(outstanding) === 0 ? "Paid" : formatCurrency(outstanding);
    const dueDateDisplay = formatDate(liability.due);

    return element(
      "tr",
      {},
      element("td", {}, element("strong", {}, periodDisplay)),
      element("td", {}, HmrcDisplayFormat.formatText(liability.type)),
      element("td", { class: "money-column" }, originalAmountDisplay),
      element("td", { class: "money-column" }, outstandingAmountDisplay),
      element("td", { class: "date-column" }, dueDateDisplay),
    );
  });

  tableContainer.replaceChildren(
    resultsTable([["Period"], ["Type"], ["Original Amount", "money-column"], ["Outstanding Amount", "money-column"], ["Due Date"]], rows),
  );
}

const formatDate = HmrcDisplayFormat.formatDate;
const formatDateRange = HmrcDisplayFormat.formatDateRange;
const formatCurrency = HmrcDisplayFormat.formatAmount;

// Toggle search criteria button handler
document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", () => {
  showSearchCriteria();
});

// Cancel request button handler
document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  cancelRequest();
});

// New search button handler
document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("vatLiabilitiesForm");
  const resultsContainer = document.getElementById("liabilitiesResults");
  form.reset();
  resultsContainer.style.display = "none";
  showSearchCriteria(); // Show the form again when doing a new search
  hideStatus();
});

// Input validation
window.CarriedIdentifiers.bind("vrn", document.getElementById("vrn"));
document.getElementById("vrn").addEventListener("input", function (e) {
  // Only allow digits
  e.target.value = e.target.value.replace(/\D/g, "");
});

// Event listeners
document.getElementById("vatLiabilitiesForm").addEventListener("submit", handleFormSubmission);

// Initialize page when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  console.log("JS block started loading: DOMContentLoaded event handler");
  initializePage();
  // Check if we're returning from OAuth
  handleOAuthCallback();
  console.log("JS block finished loading: DOMContentLoaded event handler");
});

console.log("JS block finished loading.");

document.getElementById("addTestDataLink").addEventListener("click", (event) => {
  event.preventDefault();
  window.testDataGenerator.populateVatLiabilitiesForm();
});
