// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));

// Global variables
let searchCriteriaHidden = false;

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
    document.getElementById("businessDetailsForm").style.display = "";
    container.style.display = "block";
    toggleBtn.style.display = "none";
    if (cancelBtn) cancelBtn.style.display = "none";
    searchCriteriaHidden = false;
  }
}

function hideRequestControls() {
  document.getElementById("cancelRequestBtn").style.display = "none";
  document.getElementById("toggleSearchCriteriaBtn").style.display = "none";
  document.getElementById("businessDetailsForm").style.display = "none";
}

function cancelRequest() {
  sessionStorage.removeItem("pendingBusinessDetailsRequest");
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");

  showSearchCriteria();
  document.getElementById("businessDetailsResults").style.display = "none";
  hideStatus();
  console.log("Request cancelled, session data cleared");
}

function initializePage() {
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");

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

  const devSection = document.getElementById("developerSection");

  function updateDeveloperSectionVisibility() {
    const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
    if (devSection) {
      devSection.style.display = developerModeEnabled ? "block" : "none";
    }
  }

  updateDeveloperSectionVisibility();
  window.addEventListener("developer-mode-changed", updateDeveloperSectionVisibility);
}

function handleOAuthCallback() {
  const accessToken = sessionStorage.getItem("hmrcAccessToken");
  if (accessToken) {
    console.log("OAuth callback handler (accessToken found)");
    continueBusinessDetailsRetrieval();
  } else {
    console.log("OAuth callback handler (no accessToken found)");
  }
}

async function continueBusinessDetailsRetrieval() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingBusinessDetailsRequest") || "null");

    if (!pendingRequest) {
      console.log("No pending business details request found");
      return;
    }

    console.log("Retrieved pending request:", pendingRequest);
    hideSearchCriteria();
    showLoading();
    hideStatus();
    showStatus("Retrieving business details...", "info");

    if (pendingRequest.nino) document.getElementById("nino").value = pendingRequest.nino;
    if (pendingRequest.testScenario) document.getElementById("testScenario").value = pendingRequest.testScenario;
    if (pendingRequest.runFraudPreventionHeaderValidation)
      document.getElementById("runFraudPreventionHeaderValidation").checked = pendingRequest.runFraudPreventionHeaderValidation;

    const params = new URLSearchParams({ nino: pendingRequest.nino });
    if (pendingRequest.testScenario) params.append("Gov-Test-Scenario", pendingRequest.testScenario);
    if (pendingRequest.runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

    const govClientHeaders = await getGovClientHeaders();

    const requestHeaders = {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...govClientHeaders,
    };

    const hmrcAccount = sessionStorage.getItem("hmrcAccount");
    if (hmrcAccount) {
      requestHeaders["hmrcAccount"] = hmrcAccount;
    }

    const response = await window.authorizedFetch(`/api/v1/hmrc/itsa/business/details?${params}`, {
      method: "GET",
      headers: {
        ...requestHeaders,
        "x-wait-time-ms": "0",
      },
      pollPendingMessage: "Still processing...",
      pollSuccessMessage: "Business details retrieved.",
      pollErrorMessage: "Failed to retrieve business details.",
    });

    const result = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        sessionStorage.removeItem("hmrcAccessToken");
        sessionStorage.removeItem("hmrcTokenScope");
        showStatus("Access token expired. Please re-authenticate.", "error");
        showSearchCriteria();
        return;
      }
      throw new Error(hmrcErrorMessage(result, "Failed to retrieve business details"));
    }

    displayBusinesses(result.listOfBusinesses || []);
    document.getElementById("businessDetailsResults").style.display = "block";
    hideRequestControls();
    hideStatus();

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingBusinessDetailsRequest");
    sessionStorage.removeItem("oauth_state");
    console.log("Business details retrieval completed successfully");
  } catch (error) {
    console.error("Error retrieving business details:", error);
    showStatus(`Failed to retrieve business details: ${error.message}`, "error");
    showSearchCriteria();
    sessionStorage.removeItem("pendingBusinessDetailsRequest");
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcTokenScope");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("hmrcAccount");
    sessionStorage.removeItem("currentActivity");
    console.log("Business details retrieval failed, cleared session storage to prevent retry loop");
  } finally {
    hideLoading();
  }
}

async function handleFormSubmission(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const nino = formData.get("nino").replace(/\s+/g, "").toUpperCase();
  const testScenario = formData.get("testScenario");
  const runFraudPreventionHeaderValidation = document.getElementById("runFraudPreventionHeaderValidation")?.checked || false;

  if (!window.formErrors.requireFields(["nino"])) return;

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

      const state = generateRandomState();
      const requestData = { nino, testScenario, runFraudPreventionHeaderValidation };

      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingBusinessDetailsRequest", JSON.stringify(requestData));
      sessionStorage.setItem("currentActivity", currentActivity);
      console.log("Stored pending request and current activity:", requestData, currentActivity, hmrcAccount);

      const oauthScope = window.hmrcScopeCheck ? await window.hmrcScopeCheck.getOAuthScopeString() : "read:self-assessment";

      const authResponseUrl = await window.authUrlBuilder.buildHmrcAuthUrl(state, oauthScope, hmrcAccount || "live");
      console.log("Generated HMRC Auth URL:", authResponseUrl);

      showStatus(`Redirecting to HMRC for authentication at ${authResponseUrl}...`, "info");

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
    try {
      showLoading();
      hideStatus();
      showStatus("Retrieving business details...", "info");

      const params = new URLSearchParams({ nino });
      if (testScenario) params.append("Gov-Test-Scenario", testScenario);
      if (runFraudPreventionHeaderValidation) params.append("runFraudPreventionHeaderValidation", "true");

      const govClientHeaders = await getGovClientHeaders();

      const requestHeaders = {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...govClientHeaders,
      };

      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
      if (hmrcAccount) {
        requestHeaders["hmrcAccount"] = hmrcAccount;
      }

      const response = await window.authorizedFetch(`/api/v1/hmrc/itsa/business/details?${params}`, {
        method: "GET",
        headers: {
          ...requestHeaders,
          "x-wait-time-ms": "0",
        },
        pollPendingMessage: "Still processing...",
        pollSuccessMessage: "Business details retrieved.",
        pollErrorMessage: "Failed to retrieve business details.",
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          sessionStorage.removeItem("hmrcAccessToken");
          sessionStorage.removeItem("hmrcTokenScope");
          showStatus("Access token expired. Please try again.", "error");
          return;
        }
        throw new Error(hmrcErrorMessage(result, "Failed to retrieve business details"));
      }

      displayBusinesses(result.listOfBusinesses || []);
      document.getElementById("businessDetailsResults").style.display = "block";
      hideRequestControls();
      hideStatus();
    } catch (error) {
      console.error("Error retrieving business details:", error);
      showStatus(`Failed to retrieve business details: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function displayBusinesses(businesses) {
  const tableContainer = document.getElementById("businessDetailsTable");

  if (!businesses || businesses.length === 0) {
    tableContainer.replaceChildren(el("p", "no-data", "No businesses found for the specified National Insurance number."));
    return;
  }

  const headerRow = document.createElement("tr");
  ["Business type", "Trading name", "Business ID"].forEach((heading) => headerRow.append(el("th", "", heading)));
  const thead = document.createElement("thead");
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  businesses.forEach((business) => {
    const row = document.createElement("tr");
    row.append(
      el("td", "", business.typeOfBusiness || ""),
      el("td", "", business.tradingName || "-"),
      el("td", "", business.businessId || ""),
    );
    tbody.append(row);
  });

  const table = el("table", "results-table");
  table.append(thead, tbody);
  tableContainer.replaceChildren(table);
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", () => {
  showSearchCriteria();
});

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  cancelRequest();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("itsaBusinessDetailsForm");
  const resultsContainer = document.getElementById("businessDetailsResults");
  form.reset();
  resultsContainer.style.display = "none";
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("itsaBusinessDetailsForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  console.log("JS block started loading: DOMContentLoaded event handler");
  initializePage();
  handleOAuthCallback();
  console.log("JS block finished loading: DOMContentLoaded event handler");
});

console.log("JS block finished loading.");

document.getElementById("addTestDataLink").addEventListener("click", (event) => {
  event.preventDefault();
  window.testDataGenerator.populateItsaBusinessDetailsForm();
});
