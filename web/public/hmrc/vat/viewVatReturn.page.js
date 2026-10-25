// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
    await displayReturn(result);
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

  if (!window.formErrors.requireVatNumberAnd("vrn", ["periodStart", "periodEnd"])) return;

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
      await displayReturn(result);
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

const RETURN_EXPLANATIONS = {
  amounts:
    "Boxes 1 to 5 show the VAT due on your sales, the VAT you can reclaim on purchases, and the net amount. Box 5 is box 3 less box 4: the VAT you pay HMRC or reclaim. Amounts are in pounds and pence.",
  turnover:
    "Boxes 6 to 9 show the value of your sales and purchases without VAT, in whole pounds. They are separate from the VAT in boxes 1 to 5.",
  declaration:
    "Finalised shows whether the return was confirmed as complete when it was sent. The declaration is the statement that the information in the return is true and complete.",
};

function periodText(returnData) {
  const start = returnData.periodStart ?? returnData.start;
  const end = returnData.periodEnd ?? returnData.end;
  return HmrcDisplayFormat.formatDateRange(start, end);
}

function copyStatus(finalised) {
  if (finalised === true) return { kind: "accepted", text: "Accepted by HMRC" };
  if (finalised === false) return { kind: "pending", text: "Held by HMRC, not yet final" };
  return { kind: "sent", text: "Retrieved from HMRC" };
}

// What each box means: HMRC's guidance for the box, with a link to it. Outside the record.
function boxDefinitions() {
  const items = HmrcFieldTable.VAT_RETURN_BOXES.map((box) =>
    element(
      "div",
      { class: "box-definition-item" },
      element("dt", {}, `Box ${box.box}: ${box.label}`),
      element(
        "dd",
        {},
        element(
          "p",
          { class: "box-definition", id: `vatReturnBox${box.box}Definition` },
          `“${box.definition}”`,
          " ",
          sourceAnchor(box.source, { anchor: box.anchor, text: `VAT Notice 700/12, box ${box.box}` }),
        ),
      ),
    ),
  );
  return element("details", { class: "box-definitions" }, element("summary", {}, "What each box means"), element("dl", {}, ...items));
}

async function displayReturn(returnData) {
  const detailsContainer = document.getElementById("returnDetails");
  const [{ customerCopyHtml }, { vatReturnRecordSections }] = await Promise.all([
    import("../../lib/submission-record.js"),
    import("../../lib/vat-return-record.js"),
  ]);

  const period = periodText(returnData);
  const finalisedText = returnData.finalised === true ? "Yes" : returnData.finalised === false ? "No" : "—";
  const sections = vatReturnRecordSections({
    data: returnData,
    boxes: HmrcFieldTable.VAT_RETURN_BOXES,
    vatNumber: document.getElementById("vrn").value,
    periodHtml: `<strong>${HmrcFieldTable.escapeHtml(period)}</strong>`,
    declarationHtml: `Finalised: <strong>${finalisedText}</strong>. The information in this return was declared true and complete when it was sent to HMRC.`,
  });
  const html = customerCopyHtml({
    title: period === "—" ? "Your copy of a VAT return" : `Your copy of the VAT return for ${period}`,
    reference: { label: "VAT registration number", value: document.getElementById("vrn").value || "—" },
    status: copyStatus(returnData.finalised),
    date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    sections: [
      { heading: "VAT due", explanation: RETURN_EXPLANATIONS.amounts, recordHtml: sections.moneyHtml },
      { heading: "Turnover", explanation: RETURN_EXPLANATIONS.turnover, recordHtml: sections.turnoverHtml },
      { heading: "Declaration", explanation: RETURN_EXPLANATIONS.declaration, recordHtml: sections.declarationHtml },
    ],
    links: [
      { href: "../receipt/receipts.html", text: "See your receipts" },
      { href: "vatLiabilities.html", text: "See what you owe HMRC" },
      { href: "vatPayments.html", text: "See your payments" },
    ],
  });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  detailsContainer.replaceChildren(
    ...parsed.body.childNodes,
    boxDefinitions(),
    element(
      "p",
      { class: "field-table-source" },
      "Box definitions quoted from ",
      sourceAnchor("vatNotice70012"),
      `, retrieved ${HmrcFieldTable.formatIsoDate(HmrcFieldTable.SOURCES.vatNotice70012.retrieved)}.`,
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
