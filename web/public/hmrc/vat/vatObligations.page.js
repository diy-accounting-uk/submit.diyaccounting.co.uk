// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives the text in the reader's language; without it (in a unit test) the English stands.
const siteText = (id, english, values) =>
  window.siteText
    ? window.siteText(id, english, values)
    : english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));

function cancelRequest() {
  // Clear all in-progress session data
  sessionStorage.removeItem("pendingObligationsRequest");
  sessionStorage.removeItem("pendingReturnRequest");
  sessionStorage.removeItem("hmrcGrantId");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("currentActivity");

  // Show form and hide results
  window.SearchForm.showCriteria("obligationsForm");
  document.getElementById("obligationsResults").style.display = "none";
  hideStatus();
  console.log("Request cancelled, session data cleared");
}

// Check if we're in synthetic/test mode to show developer options
async function initializePage() {
  const hmrcAccount = await window.readHmrcAccount();

  // The status line says sandbox when this page's HMRC calls go to HMRC's test service
  window.showHmrcStatusForService(siteText("vat-read.status-sandbox-text", "This reads HMRC's test service, not your real records."));

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
  const hmrcGrantId = sessionStorage.getItem("hmrcGrantId");
  if (hmrcGrantId) {
    console.log("OAuth callback handler (accessToken found)");
    // If we have an access token, retrieve stored parameters and execute the call
    continueObligationsRetrieval();
  } else {
    console.log("OAuth callback handler (no accessToken found)");
  }
}

async function continueObligationsRetrieval() {
  try {
    const hmrcGrantId = sessionStorage.getItem("hmrcGrantId");
    const pendingRequest = window.PendingRequest.read("pendingObligationsRequest", ["vrn"]);

    if (!pendingRequest) {
      console.log("No pending obligations request found");
      // Don't clear token - it might be valid from previous HMRC operation
      // Let form submission use it directly
      return;
    }

    console.log("Retrieved pending request:", pendingRequest);
    window.SearchForm.hideCriteria(); // Hide the form when retrieving obligations after auth
    showLoading();
    hideStatus(); // Clear stale banners from an earlier failed attempt before showing the new one
    showStatus(siteText("vat-obligations.retrieving", "Retrieving VAT obligations..."), "info");

    // Restore form values
    if (pendingRequest.vrn) document.getElementById("vrn").value = pendingRequest.vrn;
    if (pendingRequest.from) document.getElementById("fromDate").value = pendingRequest.from;
    if (pendingRequest.to) document.getElementById("toDate").value = pendingRequest.to;
    if (pendingRequest.status) document.getElementById("status").value = pendingRequest.status;
    if (pendingRequest.testScenario) document.getElementById("testScenario").value = pendingRequest.testScenario;
    if (pendingRequest.runFraudPreventionHeaderValidation)
      document.getElementById("runFraudPreventionHeaderValidation").checked = pendingRequest.runFraudPreventionHeaderValidation;

    // Build query parameters
    const params = new URLSearchParams({ vrn: pendingRequest.vrn });
    if (pendingRequest.from) params.append("from", pendingRequest.from);
    if (pendingRequest.to) params.append("to", pendingRequest.to);
    if (pendingRequest.status) params.append("status", pendingRequest.status);
    if (pendingRequest.testScenario) params.append("Gov-Test-Scenario", pendingRequest.testScenario);
    if (pendingRequest.runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

    // Get Gov-Client headers
    const govClientHeaders = await getGovClientHeaders();

    const requestHeaders = {
      "x-mcp-hmrc-grant": hmrcGrantId,
      "Content-Type": "application/json",
      ...govClientHeaders,
    };

    // Add hmrcAccount header if present in sessionStorage
    const hmrcAccount = await window.readHmrcAccount();
    if (hmrcAccount) {
      requestHeaders["hmrcAccount"] = hmrcAccount;
    }

    const response = await window.authorizedFetch(`/api/v1/hmrc/vat/obligation?${params}`, {
      method: "GET",
      headers: {
        ...requestHeaders,
        "x-wait-time-ms": "0",
      },
      pollPendingMessage: siteText("widget.still-processing", "Still processing..."),
      pollSuccessMessage: siteText("vat-obligations.retrieved", "VAT obligations retrieved."),
      pollErrorMessage: siteText("vat-obligations.retrieve-failed", "Failed to retrieve VAT obligations."),
    });

    const result = await response.json();

    if (!response.ok) {
      // Handle 401 specifically to trigger re-authentication
      if (response.status === 401) {
        sessionStorage.removeItem("hmrcGrantId");
        sessionStorage.removeItem("hmrcTokenScope");
        showFailure({ status: 401 }, siteText("vat-obligations.could-not-retrieve", "Could not retrieve VAT obligations"));
        window.SearchForm.showCriteria("obligationsForm"); // Show form on error
        // Could trigger re-auth here if desired
        return;
      }
      throw requestError(response, result, "Failed to retrieve obligations");
    }

    // Display results
    displayObligations(result.obligations || []);
    document.getElementById("obligationsResults").style.display = "block";
    window.SearchForm.hideForResults("obligationsForm");
    hideStatus();

    // Clean up session storage - keep token for subsequent HMRC operations
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingObligationsRequest");
    // Keep hmrcGrantId for subsequent operations (view return, submit return)
    sessionStorage.removeItem("oauth_state");
    // Keep hmrcAccount for subsequent operations
    console.log("Obligations retrieval completed successfully");
  } catch (error) {
    console.error("Error retrieving obligations:", error);
    showFailure(error, siteText("vat-obligations.could-not-retrieve", "Could not retrieve VAT obligations"));
    window.SearchForm.showCriteria("obligationsForm"); // Show form on error
    // Clear pending request data to prevent auto-retry loop on next page load
    sessionStorage.removeItem("pendingObligationsRequest");
    sessionStorage.removeItem("hmrcGrantId");
    sessionStorage.removeItem("hmrcTokenScope");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("currentActivity");
    console.log("Obligations retrieval failed, cleared session storage to prevent retry loop");
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
  const status = formData.get("status");
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireVatNumberAnd("vrn")) return;

  // Check if we have an access token with sufficient scope
  const hmrcGrantId = sessionStorage.getItem("hmrcGrantId");
  const scopeSufficient = hmrcGrantId && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!hmrcGrantId;

  if (!scopeSufficient) {
    if (hmrcGrantId) {
      console.log("HMRC access token exists but scope insufficient, clearing and re-authorizing");
      if (window.hmrcScopeCheck) window.hmrcScopeCheck.clearHmrcToken();
    }
    try {
      showLoading();
      showStatus(siteText("widget.hmrc-auth-starting", "Initiating HMRC authentication..."), "info");

      // Store request parameters and generate state
      const state = generateRandomState();
      const requestData = {
        vrn,
        from,
        to,
        status,
        testScenario,
        runFraudPreventionHeaderValidation,
      };

      const hmrcAccount = await window.readHmrcAccount();
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingObligationsRequest", JSON.stringify(requestData));
      // Note: Don't set pendingReturnRequest here - it has different field names (periodStart/periodEnd vs from/to)
      sessionStorage.setItem("currentActivity", currentActivity);
      console.log("Stored pending request and current activity:", requestData, currentActivity, hmrcAccount);

      // Get OAuth scope from catalogue
      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:vat";

      // Get OAuth URL with catalogue-driven scope
      const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");
      console.log("Generated HMRC Auth URL:", authResponseUrl);

      showStatus(
        siteText("widget.hmrc-auth-redirecting", "Redirecting to HMRC for authentication at {url}...", { url: authResponseUrl }),
        "info",
      );

      // Redirect to HMRC OAuth
      console.log(`Page transition initiated: Redirecting to HMRC OAuth URL ${authResponseUrl}`);
      try {
        window.__correlation?.prepareRedirect?.();
      } catch {}
      window.location.href = authResponseUrl;
    } catch (error) {
      console.error("Authentication error:", error);
      showStatus(siteText("widget.hmrc-auth-failed", "Authentication failed: {reason}", { reason: error.message }), "error");
      hideLoading();
    }
  } else {
    // We have an access token, proceed directly
    try {
      showLoading();
      hideStatus(); // Clear stale banners from an earlier failed attempt before showing the new one
      showStatus(siteText("vat-obligations.retrieving", "Retrieving VAT obligations..."), "info");

      // Build query parameters
      const params = new URLSearchParams({ vrn });
      if (from) params.append("from", from);
      if (to) params.append("to", to);
      if (status) params.append("status", status);
      if (testScenario) params.append("Gov-Test-Scenario", testScenario);
      if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

      // Get Gov-Client headers
      const govClientHeaders = await getGovClientHeaders();

      const requestHeaders = {
        "x-mcp-hmrc-grant": hmrcGrantId,
        "Content-Type": "application/json",
        ...govClientHeaders,
      };

      // Add hmrcAccount header if present
      const hmrcAccount = await window.readHmrcAccount();
      if (hmrcAccount) {
        requestHeaders["hmrcAccount"] = hmrcAccount;
      }

      const response = await window.authorizedFetch(`/api/v1/hmrc/vat/obligation?${params}`, {
        method: "GET",
        headers: {
          ...requestHeaders,
          "x-wait-time-ms": "0",
        },
        pollPendingMessage: siteText("widget.still-processing", "Still processing..."),
        pollSuccessMessage: siteText("vat-obligations.retrieved", "VAT obligations retrieved."),
        pollErrorMessage: siteText("vat-obligations.retrieve-failed", "Failed to retrieve VAT obligations."),
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle 401 specifically to trigger re-authentication
        if (response.status === 401) {
          sessionStorage.removeItem("hmrcGrantId");
          sessionStorage.removeItem("hmrcTokenScope");
          showFailure({ status: 401 }, siteText("vat-obligations.could-not-retrieve", "Could not retrieve VAT obligations"));
          return;
        }
        throw requestError(response, result, "Failed to retrieve obligations");
      }

      // Display results
      displayObligations(result.obligations || []);
      document.getElementById("obligationsResults").style.display = "block";
      window.SearchForm.hideForResults("obligationsForm");
      hideStatus();
    } catch (error) {
      console.error("Error retrieving obligations:", error);
      showFailure(error, siteText("vat-obligations.could-not-retrieve", "Could not retrieve VAT obligations"));
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

function displayObligations(obligations) {
  const tableContainer = document.getElementById("obligationsTable");

  if (!obligations || obligations.length === 0) {
    tableContainer.replaceChildren(
      noDataMessage(siteText("vat-obligations.none-found", "No obligations found for the specified criteria.")),
    );
    return;
  }

  // Get VAT registration number safely
  const vrn = document.getElementById("vrn").value;

  const rows = obligations.map((obligation) => {
    const statusText =
      obligation.status === "O"
        ? siteText("vat-obligations.status-open", "Open")
        : obligation.status === "F"
          ? siteText("vat-obligations.status-fulfilled", "Fulfilled")
          : "—";
    const statusClass = obligation.status === "O" ? "status-open" : obligation.status === "F" ? "status-fulfilled" : "";

    // Format date range for display (HMRC requirement: don't show period key)
    const periodDisplay = formatDateRange(obligation.start, obligation.end);
    const dueDateDisplay = formatDate(obligation.due);
    // An open obligation has no received date yet.
    const receivedDisplay = obligation.received
      ? formatDate(obligation.received)
      : obligation.status === "O"
        ? siteText("vat-obligations.not-yet-received", "Not yet received")
        : "—";

    const isFulfilled = obligation.status === "F";
    const actionButton = element(
      "button",
      { class: "action-button", type: "button" },
      isFulfilled ? siteText("vat-obligations.view-return", "View return") : siteText("vat-obligations.submit-return", "Submit return"),
    );
    actionButton.addEventListener("click", () => {
      const openReturn = isFulfilled ? viewReturn : submitReturn;
      openReturn(vrn, obligation.periodKey || "", obligation.start || "", obligation.end || "");
    });

    const usePeriodButton = element(
      "button",
      { class: "link-button", type: "button" },
      siteText("vat-obligations.use-period", "Use this period"),
    );
    usePeriodButton.addEventListener("click", () => usePeriod(obligation.start || "", obligation.end || "", periodDisplay));

    return element(
      "tr",
      {},
      element("td", {}, periodDisplay),
      element("td", { class: "date-column" }, dueDateDisplay),
      element("td", {}, element("span", statusClass ? { class: statusClass } : {}, statusText)),
      element("td", { class: "date-column" }, receivedDisplay),
      element("td", { class: "action-column" }, actionButton, usePeriodButton),
    );
  });

  tableContainer.replaceChildren(
    resultsTable(
      [
        [siteText("vat-obligations.col-period", "VAT Period")],
        [siteText("vat-obligations.col-due", "Due Date")],
        [siteText("vat-obligations.col-status", "Status")],
        [siteText("vat-obligations.col-received", "Received")],
        [siteText("vat-obligations.col-action", "Action")],
      ],
      rows,
    ),
  );
}

const formatDate = HmrcDisplayFormat.formatDate;
const formatDateRange = HmrcDisplayFormat.formatDateRange;

// Remembers the chosen period so the return view opens with its dates filled in.
function usePeriod(periodStart, periodEnd, periodDisplay) {
  window.CarriedIdentifiers.remember("periodStart", periodStart);
  window.CarriedIdentifiers.remember("periodEnd", periodEnd);
  document.getElementById("periodNextSteps").hidden = false;
  showStatus(
    siteText("vat-obligations.period-chosen", "Period {period} is chosen. View its return with the link below the list.", {
      period: periodDisplay,
    }),
    "info",
  );
}

function viewReturn(vrn, periodKey, periodStart, periodEnd) {
  // Navigate to view VAT return page with period dates (hmrcAccount is in sessionStorage)
  window.location.href = `viewVatReturn.html?vrn=${encodeURIComponent(vrn)}&periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`;
}

function submitReturn(vrn, periodKey, periodStart, periodEnd) {
  // Navigate to submit VAT return page with period dates (hmrcAccount is in sessionStorage)
  window.location.href = `submitVat.html?vrn=${encodeURIComponent(vrn)}&periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`;
}

// Toggle search criteria button handler
document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", () => {
  window.SearchForm.showCriteria("obligationsForm");
});

// Cancel request button handler
document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  cancelRequest();
});

// New search button handler
document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("vatObligationsForm");
  const resultsContainer = document.getElementById("obligationsResults");
  form.reset();
  resultsContainer.style.display = "none";
  window.SearchForm.showCriteria("obligationsForm"); // Show the form again when doing a new search
  hideStatus();
});

// Input validation
window.CarriedIdentifiers.bind("vrn", document.getElementById("vrn"));
document.getElementById("vrn").addEventListener("input", function (e) {
  // Only allow digits
  e.target.value = e.target.value.replace(/\D/g, "");
});

// Event listeners
document.getElementById("vatObligationsForm").addEventListener("submit", handleFormSubmission);

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
  window.testDataGenerator.populateVatObligationsForm();
});
