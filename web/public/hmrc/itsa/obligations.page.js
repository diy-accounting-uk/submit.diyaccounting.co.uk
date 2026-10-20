// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.CarriedIdentifiers.bind("nino", document.getElementById("nino"));
window.CarriedIdentifiers.bind("businessId", document.getElementById("businessId"));

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
  sessionStorage.removeItem("pendingObligationsRequest");
  sessionStorage.removeItem("hmrcAccessToken");
  sessionStorage.removeItem("hmrcTokenScope");
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("hmrcAccount");
  sessionStorage.removeItem("currentActivity");

  showSearchCriteria();
  document.getElementById("obligationsResults").style.display = "none";
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
    continueObligationsRetrieval();
  } else {
    console.log("OAuth callback handler (no accessToken found)");
  }
}

function readFilters(source) {
  return {
    typeOfBusiness: source.typeOfBusiness || "",
    businessId: source.businessId || "",
    status: source.status || "",
  };
}

async function retrieveObligations(nino, filters, testScenario, runFraudPreventionHeaderValidation, accessToken) {
  const params = new URLSearchParams({ nino });
  if (filters.typeOfBusiness) params.append("typeOfBusiness", filters.typeOfBusiness);
  if (filters.businessId) params.append("businessId", filters.businessId);
  if (filters.status) params.append("status", filters.status);
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

  const response = await window.authorizedFetch(`/api/v1/hmrc/itsa/obligations?${params}`, {
    method: "GET",
    headers: {
      ...requestHeaders,
      "x-wait-time-ms": "0",
    },
    pollPendingMessage: "Still processing...",
    pollSuccessMessage: "Obligations retrieved.",
    pollErrorMessage: "Failed to retrieve obligations.",
  });

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(hmrcErrorMessage(result, "Failed to retrieve obligations"));
    error.status = response.status;
    throw error;
  }
  return result;
}

async function continueObligationsRetrieval() {
  try {
    const accessToken = sessionStorage.getItem("hmrcAccessToken");
    const pendingRequest = JSON.parse(sessionStorage.getItem("pendingObligationsRequest") || "null");

    if (!pendingRequest) {
      console.log("No pending obligations request found");
      return;
    }

    console.log("Retrieved pending request:", pendingRequest);
    hideSearchCriteria();
    showLoading();
    hideStatus();
    showStatus("Retrieving obligations...", "info");

    if (pendingRequest.nino) document.getElementById("nino").value = pendingRequest.nino;
    if (pendingRequest.typeOfBusiness) document.getElementById("typeOfBusiness").value = pendingRequest.typeOfBusiness;
    if (pendingRequest.businessId) document.getElementById("businessId").value = pendingRequest.businessId;
    if (pendingRequest.status) document.getElementById("status").value = pendingRequest.status;
    if (pendingRequest.testScenario) document.getElementById("testScenario").value = pendingRequest.testScenario;
    if (pendingRequest.runFraudPreventionHeaderValidation)
      document.getElementById("runFraudPreventionHeaderValidation").checked = pendingRequest.runFraudPreventionHeaderValidation;

    const result = await retrieveObligations(
      pendingRequest.nino,
      readFilters(pendingRequest),
      pendingRequest.testScenario,
      pendingRequest.runFraudPreventionHeaderValidation,
      accessToken,
    );

    displayObligations(result.obligations || []);
    document.getElementById("obligationsResults").style.display = "block";
    hideRequestControls();
    hideStatus();

    sessionStorage.removeItem("currentActivity");
    sessionStorage.removeItem("pendingObligationsRequest");
    sessionStorage.removeItem("oauth_state");
    console.log("Obligations retrieval completed successfully");
  } catch (error) {
    console.error("Error retrieving obligations:", error);
    if (error.status === 401) {
      sessionStorage.removeItem("hmrcAccessToken");
      sessionStorage.removeItem("hmrcTokenScope");
      showStatus("Access token expired. Please re-authenticate.", "error");
    } else {
      showStatus(`Failed to retrieve obligations: ${error.message}`, "error");
    }
    showSearchCriteria();
    sessionStorage.removeItem("pendingObligationsRequest");
    sessionStorage.removeItem("hmrcAccessToken");
    sessionStorage.removeItem("hmrcTokenScope");
    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("hmrcAccount");
    sessionStorage.removeItem("currentActivity");
    console.log("Obligations retrieval failed, cleared session storage to prevent retry loop");
  } finally {
    hideLoading();
  }
}

async function handleFormSubmission(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const nino = formData.get("nino").replace(/\s+/g, "").toUpperCase();
  const filters = readFilters({
    typeOfBusiness: formData.get("typeOfBusiness"),
    businessId: formData.get("businessId"),
    status: formData.get("status"),
  });
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
      const requestData = { nino, ...filters, testScenario, runFraudPreventionHeaderValidation };

      const hmrcAccount = sessionStorage.getItem("hmrcAccount");
      const currentActivity = `${location.pathname}`;

      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("pendingObligationsRequest", JSON.stringify(requestData));
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
      showStatus("Retrieving obligations...", "info");

      const result = await retrieveObligations(nino, filters, testScenario, runFraudPreventionHeaderValidation, accessToken);

      displayObligations(result.obligations || []);
      document.getElementById("obligationsResults").style.display = "block";
      hideRequestControls();
      hideStatus();
    } catch (error) {
      console.error("Error retrieving obligations:", error);
      if (error.status === 401) {
        sessionStorage.removeItem("hmrcAccessToken");
        sessionStorage.removeItem("hmrcTokenScope");
        showStatus("Access token expired. Please try again.", "error");
      } else {
        showStatus(`Failed to retrieve obligations: ${error.message}`, "error");
      }
    } finally {
      hideLoading();
    }
  }
}

// HMRC answers one entry per business, each carrying its own obligationDetails - so the
// page groups by business, with a heading naming the type and business ID above each
// business's own table, rather than one flat table a mixed customer has to sort out for
// themselves.
function displayObligations(obligations) {
  const tableContainer = document.getElementById("obligationsTable");

  const businessesWithObligations = (obligations || []).filter((business) => (business.obligationDetails || []).length > 0);

  if (businessesWithObligations.length === 0) {
    tableContainer.innerHTML = '<p class="no-data">No obligations found for the specified National Insurance number.</p>';
    return;
  }

  tableContainer.innerHTML = businessesWithObligations
    .map((business) => {
      const rows = business.obligationDetails
        .map(
          (detail) => `
            <tr>
              <td class="date-column">${escapeHtml(detail.periodStartDate)}</td>
              <td class="date-column">${escapeHtml(detail.periodEndDate)}</td>
              <td class="date-column">${escapeHtml(detail.dueDate)}</td>
              <td><span class="${detail.status === "fulfilled" ? "status-fulfilled" : "status-open"}">${escapeHtml(detail.status)}</span></td>
              <td class="date-column">${escapeHtml(detail.receivedDate || "-")}</td>
            </tr>
          `,
        )
        .join("");

      return `
        <h4>${escapeHtml(business.typeOfBusiness)} (${escapeHtml(business.businessId)})</h4>
        <table class="results-table">
          <thead>
            <tr>
              <th>Period start</th>
              <th>Period end</th>
              <th>Due date</th>
              <th>Status</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    })
    .join("");
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById("toggleSearchCriteriaBtn")?.addEventListener("click", () => {
  showSearchCriteria();
});

document.getElementById("cancelRequestBtn")?.addEventListener("click", () => {
  cancelRequest();
});

document.getElementById("newSearchBtn")?.addEventListener("click", () => {
  const form = document.getElementById("itsaObligationsForm");
  const resultsContainer = document.getElementById("obligationsResults");
  form.reset();
  resultsContainer.style.display = "none";
  showSearchCriteria();
  hideStatus();
});

document.getElementById("nino").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById("itsaObligationsForm").addEventListener("submit", handleFormSubmission);

document.addEventListener("DOMContentLoaded", function () {
  console.log("JS block started loading: DOMContentLoaded event handler");
  initializePage();
  handleOAuthCallback();
  console.log("JS block finished loading: DOMContentLoaded event handler");
});

console.log("JS block finished loading.");

document.getElementById("addTestDataLink").addEventListener("click", (event) => {
  event.preventDefault();
  window.testDataGenerator.populateItsaObligationsForm();
});
