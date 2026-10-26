// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// OAuth callback handling

// A state that starts "mcp." belongs to a grant an MCP tool started: the code goes to the MCP
// grant route, which stores HMRC's tokens server side. This page keeps no token and needs no
// sign-in for that branch.
const MCP_STATE_PREFIX = "mcp.";

function mcpGrantState() {
  const state = new URLSearchParams(window.location.search).get("state");
  return state && state.startsWith(MCP_STATE_PREFIX) ? state : null;
}

async function handleMcpGrantCallback(state) {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const error = urlParams.get("error");
  window.history.replaceState({}, document.title, window.location.pathname);
  if (error || !code) {
    showStatus(`HMRC did not grant access (${error || "no authorisation code"}). Ask the chat for a new HMRC link.`, "error");
    return;
  }
  try {
    showLoading();
    const response = await fetch("/api/v1/mcp/hmrc-grants/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = body.message || `HMRC access could not be saved (HTTP ${response.status})`;
      showStatus(`${reason}. Ask the chat for a new HMRC link.`, "error");
      return;
    }
    showStatus("HMRC access granted. Go back to your chat to carry on.", "success");
  } catch (fetchError) {
    showStatus(`HMRC access could not be saved: ${fetchError.message}. Ask the chat for a new HMRC link.`, "error");
  } finally {
    hideLoading();
  }
}

async function handleOAuthCallback() {
  const mcpState = mcpGrantState();
  if (mcpState) {
    await handleMcpGrantCallback(mcpState);
    return;
  }
  const code = getValidatedAuthorisationCode();
  let succeeded = false;

  if (!code) {
    console.error("No valid authorisation code found in URL parameters.");
    showStatus("No valid authorisation code found. Please try again.", "error");
  } else {
    try {
      showLoading();
      showStatus("Exchanging authorisation code for access token...", "info");

      // Exchange code for access token
      const accessToken = await exchangeToken(code);

      showStatus("Obtained Access Token from HMRC...", "info");

      // Clean up session storage
      sessionStorage.removeItem("oauth_state");
      sessionStorage.setItem("hmrcAccessToken", accessToken);
      succeeded = true;
    } catch (error) {
      console.error("Submission error:", error);
      showStatus(`HMRC sign-in for ${pendingActivityName()} failed: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  // Only carry on to the pending activity automatically when the token exchange
  // succeeded. On failure, stay on this page so the error message stays visible
  // instead of being wiped out by an immediate redirect.
  if (succeeded) {
    checkCurrentActivityAndRedirect();
  } else {
    offerReturnToActivity();
  }
}

// On failure, point the existing "Return home" button back at the pending
// activity instead, so the user can dismiss the error and retry.
let navigationTarget = "../";
document.getElementById("navigationBtn").addEventListener("click", () => {
  window.location.href = navigationTarget;
});

const UPPERCASE_WORDS = new Set(["vat", "itsa", "nino", "hmrc", "bsas", "uk"]);

// The name of the activity the pending request was for, from the page it was stored on:
// "/hmrc/vat/vatObligations.html" is "VAT obligations".
function pendingActivityName() {
  const currentActivity = sessionStorage.getItem("currentActivity");
  const fileName = currentActivity
    ? currentActivity
        .split("?")[0]
        .split("/")
        .pop()
        .replace(/\.html$/, "")
    : "";
  if (!fileName) return "HMRC";
  return fileName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word) => (UPPERCASE_WORDS.has(word.toLowerCase()) ? word.toUpperCase() : word.toLowerCase()))
    .join(" ");
}

function offerReturnToActivity() {
  const currentActivity = sessionStorage.getItem("currentActivity");
  const navigationBtn = document.getElementById("navigationBtn");
  if (currentActivity && navigationBtn) {
    navigationBtn.textContent = `Back to ${pendingActivityName()}`;
    navigationTarget = currentActivity;
  }
}

function getValidatedAuthorisationCode() {
  console.log("OAuth callback handler");
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const state = urlParams.get("state");
  const error = urlParams.get("error");

  if (error) {
    showStatus(`OAuth error: ${error}`, "error");
    console.error("OAuth callback handler (error exit)");
    return null;
  }

  if (code && state) {
    const storedState = sessionStorage.getItem("oauth_state");

    if (state !== storedState) {
      showStatus("Invalid OAuth state. Please try again.", "error");
      console.error("OAuth callback handler (invalid state exit)");
      return null;
    }

    // Clear URL parameters
    console.log("Page transition initiated: Clearing URL parameters");
    window.history.replaceState({}, document.title, window.location.pathname);

    // Continue with token exchange and submission
    console.log("OAuth callback handler (normal completion)");
    return code;
  } else {
    console.log("OAuth callback handler (no action taken)");
    return null;
  }
}

async function exchangeToken(code) {
  const url = `/api/v1/hmrc/token`;
  const body = JSON.stringify({ code });
  console.log(`Exchanging token. Remote call initiated: POST ${url} ++ Body: ${body}`);

  const requestHeaders = {
    "Content-Type": "application/json",
  };

  // Get hmrcAccount from sessionStorage if available
  const hmrcAccount = sessionStorage.getItem("hmrcAccount");
  if (hmrcAccount) {
    requestHeaders["hmrcAccount"] = hmrcAccount;
  }

  // Include Cognito idToken so backend can associate the HMRC OAuth audit with the authenticated web user
  const response = await window.fetchWithIdToken(url, {
    method: "POST",
    headers: requestHeaders,
    body,
  });
  if (!response.ok) {
    let hmrcErrorDescription = "";
    try {
      const errorJson = await response.json();
      if (errorJson.error_description) {
        hmrcErrorDescription = ` - ${errorJson.error_description}`;
      }
    } catch {
      // Error body wasn't JSON; fall back to the generic message below.
    }
    const message = `Failed to exchange token. Remote call failed: POST ${url} - Status: ${response.status} ${response.statusText}${hmrcErrorDescription}`;
    console.error(message);
    throw new Error(message);
  }

  const responseJson = await response.json();
  const accessToken = responseJson.accessToken;
  if (!accessToken) {
    const message = `Failed to exchange token. Remote call response did not include accessToken: POST ${url} - Status: ${response.status} ${response.statusText} - Body: ${JSON.stringify(responseJson)}`;
    console.error(message);
    throw new Error(message);
  }

  // Store the granted scope so pages can check before reusing the token
  if (responseJson.scope) {
    sessionStorage.setItem("hmrcTokenScope", responseJson.scope);
    console.log("Stored HMRC token scope:", responseJson.scope);
  }

  console.log(`Exchanged token. Remote call completed successfully: POST ${url}`, responseJson, accessToken);
  return accessToken;
}

function checkCurrentActivityAndRedirect() {
  const currentActivity = sessionStorage.getItem("currentActivity");
  if (currentActivity) {
    console.log("Current activity found:", currentActivity);
    window.location.href = currentActivity;
  } else {
    console.log("No current activity found, staying on current page");
  }
}

// Wait for submit.js module to be ready before running the callback handler
if (window.__submitReady__) {
  handleOAuthCallback();
} else {
  document.addEventListener("submit-ready", handleOAuthCallback, { once: true });
}
