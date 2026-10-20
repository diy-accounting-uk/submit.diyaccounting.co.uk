// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Date formatting utilities (inline version for non-module context)
const DateUtils = {
  formatDateRange(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const dateOptions = { day: "numeric", month: "short", year: "numeric" };
    return `${startDate.toLocaleDateString("en-GB", dateOptions)} to ${endDate.toLocaleDateString("en-GB", dateOptions)}`;
  },
};

// Check if we're in synthetic/test mode to show developer options
async function initializePage() {
  const urlParams = new URLSearchParams(window.location.search);
  const vrn = urlParams.get("vrn");
  const periodStart = urlParams.get("periodStart");
  const periodEnd = urlParams.get("periodEnd");
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");

  // If URL params provide complete period data, clear any stale pendingReturnRequest
  // This handles navigation from obligations page where URL params should take precedence
  if (vrn && periodStart && periodEnd) {
    sessionStorage.removeItem("pendingReturnRequest");
    console.log("Cleared stale pendingReturnRequest - using URL params instead");
  }

  if (vrn) {
    document.getElementById("vrn").value = vrn;
  }
  if (periodStart) {
    document.getElementById("periodStart").value = periodStart;
  }
  if (periodEnd) {
    document.getElementById("periodEnd").value = periodEnd;
  }

  // Show synthetic indicator if hmrcAccount=synthetic
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

// Form visibility management
let formHidden = false;

function hideForm() {
  const container = document.getElementById("searchForm");
  const toggleBtn = document.getElementById("toggleFormBtn");
  const cancelBtn = document.getElementById("cancelRequestBtn");
  if (container && toggleBtn) {
    container.style.display = "none";
    toggleBtn.style.display = "inline-block";
    if (cancelBtn) cancelBtn.style.display = "inline-block";
    formHidden = true;
  }
}

function showForm() {
  const container = document.getElementById("searchForm");
  const toggleBtn = document.getElementById("toggleFormBtn");
  const cancelBtn = document.getElementById("cancelRequestBtn");
  if (container && toggleBtn) {
    container.style.display = "block";
    toggleBtn.style.display = "none";
    if (cancelBtn) cancelBtn.style.display = "none";
    formHidden = false;
  }
}

function hideRequestControls() {
  document.getElementById("cancelRequestBtn").style.display = "none";
  document.getElementById("toggleFormBtn").style.display = "none";
}

function cancelRequest() {
  // Clear all in-progress session data
  sessionStorage.removeItem("pendingReturnRequest");
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");

  // Show form and hide results
  showForm();
  document.getElementById("returnResults").style.display = "none";
  hideStatus();
  console.log("Request cancelled, session data cleared");
}

// OAuth callback handling
function handleOAuthCallback() {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  if (accessToken) {
    console.log("OAuth callback handler (accessToken found)");
    // If we have an access token, retrieve stored parameters and execute the call
    continueReturnRetrieval();
  } else {
    console.log("OAuth callback handler (no accessToken found)");
  }
}

async function continueReturnRetrieval() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingReturnRequest") || "null");

    if (!pendingRequest) {
      console.log("No pending return request found");
      // Don't clear token - it might be valid from VAT submission
      // Let form submission use it directly
      return;
    }

    console.log("Retrieved pending request:", pendingRequest);
    // Hide form while retrieving
    hideForm();
    showLoading();
    hideStatus(); // Clear stale banners from an earlier failed attempt before showing the new one
    showStatus("Retrieving VAT return...", "info");

    // Restore form values
    if (pendingRequest.vrn) document.getElementById("vrn").value = pendingRequest.vrn;
    if (pendingRequest.periodStart) document.getElementById("periodStart").value = pendingRequest.periodStart;
    if (pendingRequest.periodEnd) document.getElementById("periodEnd").value = pendingRequest.periodEnd;
    if (pendingRequest.testScenario) document.getElementById("testScenario").value = pendingRequest.testScenario;
    if (pendingRequest.runFraudPreventionHeaderValidation)
      document.getElementById("runFraudPreventionHeaderValidation").checked = pendingRequest.runFraudPreventionHeaderValidation;

    // Build query parameters - use date range instead of periodKey
    const params = new URLSearchParams({
      vrn: pendingRequest.vrn,
      periodStart: pendingRequest.periodStart,
      periodEnd: pendingRequest.periodEnd,
    });
    if (pendingRequest.testScenario) params.append("Gov-Test-Scenario", pendingRequest.testScenario);
    if (pendingRequest.runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
    if (pendingRequest.allowSyntheticObligations) params.append("allowSyntheticObligations", "true");

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

    const response = await window.authorizedFetch(`/api/v1/hmrc/vat/return?${params}`, {
      method: "GET",
      headers: {
        ...requestHeaders,
        "x-wait-time-ms": "0",
      },
      pollPendingMessage: "Still processing...",
      pollSuccessMessage: "VAT return retrieved.",
      pollErrorMessage: "Failed to retrieve VAT return.",
    });

    const result = await response.json();

    if (!response.ok) {
      // Handle 401 specifically to trigger re-authentication
      if (response.status === 401) {
        sessionStorage.removeItem("hmrcAccessToken");
        sessionStorage.removeItem("hmrcTokenScope");
        showStatus("Access token expired. Please re-authenticate.", "error");
        return;
      }
      throw new Error(hmrcErrorMessage(result, "Failed to retrieve VAT return"));
    }

    // Display results - add period dates for display
    result.periodStart = pendingRequest.periodStart;
    result.periodEnd = pendingRequest.periodEnd;
    displayReturn(result);
    document.getElementById("returnResults").style.display = "block";
    hideRequestControls();
    document.getElementById("searchForm").style.display = "none";
    hideStatus();

    // Clean up session storage - keep token for subsequent HMRC operations
    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingReturnRequest");
    // Keep hmrcAccessToken for subsequent operations (obligations, submit return)
    sessionStorage.removeItem("oauth_state");
    // Keep hmrcAccount for subsequent operations
    console.log("Return retrieval completed successfully");
  } catch (error) {
    console.error("Error retrieving VAT return:", error);
    showStatus(`Failed to retrieve return: ${error.message}`, "error");
    // Auto-expand form on error so user can retry
    showForm();
    // Clear pending request data to prevent auto-retry loop on next page load
    sessionStorage.removeItem("pendingReturnRequest");
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcTokenScope");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("hmrcAccount");
    sessionStorage.removeItem("currentActivity");
    console.log("Return retrieval failed, cleared session storage to prevent retry loop");
  } finally {
    hideLoading();
  }
}

// Handle form submission
async function handleFormSubmission(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const vrn = formData.get("vrn").trim();
  const periodStart = formData.get("periodStart");
  const periodEnd = formData.get("periodEnd");
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  // Basic validation
  if (!vrn || !periodStart || !periodEnd) {
    showStatus("Please enter your VAT registration number and VAT period start and end dates.", "error");
    return;
  }

  if (!/^\d{9}$/.test(vrn)) {
    showStatus("VAT number must be exactly 9 digits.", "error");
    return;
  }

  // Check if we have an access token with sufficient scope
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  const scopeSufficient = accessToken && window.hmrcScopeCheck ? await window.hmrcScopeCheck.isTokenSufficient() : !!accessToken;

  // Check hmrcAccount for synthetic mode (set by bundle qualifiers via sessionStorage)
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");
  const allowSyntheticObligations = hmrcAccount === "synthetic";

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
        periodStart,
        periodEnd,
        testScenario,
        runFraudPreventionHeaderValidation,
        allowSyntheticObligations,
      };

      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingReturnRequest", JSON.stringify(requestData));
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
      showStatus("Retrieving VAT return...", "info");

      // Build query parameters — use periodKey directly if available (e.g., from prior submission)
      const urlPeriodKey = new URLSearchParams(window.location.search).get("periodKey");
      const params = new URLSearchParams({ vrn, periodStart, periodEnd });
      if (urlPeriodKey) params.append("periodKey", urlPeriodKey);
      if (testScenario) params.append("Gov-Test-Scenario", testScenario);
      if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");
      if (allowSyntheticObligations) params.append("allowSyntheticObligations", "true");

      // Get Gov-Client headers
      const govClientHeaders = await getGovClientHeaders();

      const requestHeaders = {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...govClientHeaders,
      };

      // Add hmrcAccount header if present
      if (hmrcAccount) {
        requestHeaders["hmrcAccount"] = hmrcAccount;
      }

      const response = await window.authorizedFetch(`/api/v1/hmrc/vat/return?${params}`, {
        method: "GET",
        headers: {
          ...requestHeaders,
          "x-wait-time-ms": "0",
        },
        pollPendingMessage: "Still processing...",
        pollSuccessMessage: "VAT return retrieved.",
        pollErrorMessage: "Failed to retrieve VAT return.",
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
        throw new Error(hmrcErrorMessage(result, "Failed to retrieve VAT return"));
      }

      // Display results - add period dates for display
      result.periodStart = periodStart;
      result.periodEnd = periodEnd;
      displayReturn(result);
      document.getElementById("returnResults").style.display = "block";
      hideRequestControls();
      document.getElementById("searchForm").style.display = "none";
      hideStatus();
    } catch (error) {
      console.error("Error retrieving VAT return:", error);
      showStatus(`Failed to retrieve return: ${error.message}`, "error");
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

function sourceAnchor(sourceKey, { anchor, text } = {}) {
  const source = HmrcFieldTable.SOURCES[sourceKey];
  const href = anchor ? `${source.url}#${anchor}` : source.url;
  return element("a", { href, rel: "noopener", target: "_blank" }, text || source.title);
}

function displayReturn(returnData) {
  const detailsContainer = document.getElementById("returnDetails");

  const formatCurrency = (value, decimalPlaces = 2) => {
    const num = parseFloat(value);
    if (isNaN(num)) return decimalPlaces === 0 ? "£0" : "£0.00";
    return decimalPlaces === 0 ? formatGbpWhole(num) : formatGbp(num);
  };

  const formatWholePounds = (value) => formatCurrency(value, 0);

  const formatBoolean = (value) => {
    return value === true ? "Yes" : value === false ? "No" : "—";
  };

  // Boxes 3 and 5 are the totals, so their figures are bold; boxes 6 to 9 are whole pounds.
  const buildBox = (box) => {
    const whole = box.box >= 6;
    const amount = whole ? formatWholePounds(returnData[box.field]) : formatCurrency(returnData[box.field]);
    const amountElement = element("dd", box.box === 5 ? { class: "net-amount" } : {});
    if (box.box === 3 || box.box === 5) {
      amountElement.append(element("strong", {}, amount));
    } else {
      amountElement.append(amount);
    }
    return element(
      "div",
      { "class": "detail-item", "id": `vatReturnBox${box.box}`, "data-hmrc-field": box.field },
      element("dt", {}, `Box ${box.box}: ${box.label || ""}`),
      amountElement,
      element(
        "p",
        { class: "box-definition", id: `vatReturnBox${box.box}Definition` },
        `“${box.definition || ""}”`,
        " ",
        sourceAnchor(box.source, { anchor: box.anchor, text: `VAT Notice 700/12, box ${box.box}` }),
      ),
    );
  };
  const buildBoxes = (first, last) => HmrcFieldTable.VAT_RETURN_BOXES.filter((box) => box.box >= first && box.box <= last).map(buildBox);

  // Get period display from the dates (periodStart/periodEnd are set on returnData before calling displayReturn)
  const periodDisplay =
    returnData.periodStart && returnData.periodEnd
      ? DateUtils.formatDateRange(returnData.periodStart, returnData.periodEnd)
      : returnData.start && returnData.end
        ? DateUtils.formatDateRange(returnData.start, returnData.end)
        : "—";

  const section = (heading, ...gridChildren) =>
    element("div", { class: "detail-section" }, element("h4", {}, heading), element("dl", { class: "detail-grid" }, ...gridChildren));

  detailsContainer.replaceChildren(
    element(
      "div",
      { class: "return-details" },
      section(
        "Period information",
        element(
          "div",
          { class: "detail-item" },
          element("dt", {}, "Period:"),
          element("dd", {}, element("strong", {}, periodDisplay || "")),
        ),
        element(
          "div",
          { class: "detail-item" },
          element("dt", {}, "Finalised:"),
          element("dd", { class: returnData.finalised ? "status-fulfilled" : "status-open" }, formatBoolean(returnData.finalised)),
        ),
      ),
      section("VAT amounts", ...buildBoxes(1, 5)),
      section("Turnover (whole pounds)", ...buildBoxes(6, 9)),
      element(
        "p",
        { class: "field-table-source" },
        "Box definitions quoted from ",
        sourceAnchor("vatNotice70012"),
        `, retrieved ${HmrcFieldTable.formatIsoDate(HmrcFieldTable.SOURCES.vatNotice70012.retrieved)}.`,
      ),
    ),
  );
}

// Button handlers
document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("vatReturnForm");
  const resultsContainer = document.getElementById("returnResults");
  const searchForm = document.getElementById("searchForm");
  form.reset();
  resultsContainer.style.display = "none";
  searchForm.style.display = "block";
  hideStatus();
});

document.getElementById("backToObligationsBtn")?.addEventListener("click", () => {
  window.location.href = "vatObligations.html";
});

// Input validation for VAT registration number
window.CarriedIdentifiers.bind("vrn", document.getElementById("vrn"));
window.CarriedIdentifiers.bind("periodStart", document.getElementById("periodStart"));
window.CarriedIdentifiers.bind("periodEnd", document.getElementById("periodEnd"));
document.getElementById("vrn").addEventListener("input", function (e) {
  // Only allow digits
  e.target.value = e.target.value.replace(/\D/g, "");
});

// Event listeners
document.getElementById("vatReturnForm").addEventListener("submit", handleFormSubmission);

// Initialize page when DOM is loaded
document.addEventListener("DOMContentLoaded", async function () {
  console.log("JS block started loading: DOMContentLoaded event handler");

  // Toggle form button handler
  document.getElementById("toggleFormBtn")?.addEventListener("click", () => {
    showForm();
  });

  // Cancel request button handler
  document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
    cancelRequest();
  });

  await initializePage();
  // Check if we're returning from OAuth
  handleOAuthCallback();

  // Auto-submit if we have URL parameters and no OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  const vrn = urlParams.get("vrn");
  const periodStart = urlParams.get("periodStart");
  const periodEnd = urlParams.get("periodEnd");
  if (vrn && periodStart && periodEnd) {
    // Without a token the submit starts the OAuth flow; with one it runs directly
    document.getElementById("vatReturnForm").requestSubmit();
  }
  console.log("JS block finished loading: DOMContentLoaded event handler");
});

console.log("JS block finished loading.");

document.getElementById("addTestDataLink").addEventListener("click", (event) => {
  event.preventDefault();
  window.testDataGenerator.populateViewVatReturnForm();
});
