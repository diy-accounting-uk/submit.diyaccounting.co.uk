// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// DOM utility functions for status messages and UI helpers

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (typeof window !== "undefined" && window.siteText) return window.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

/**
 * Show a status message in the status container
 * @param {string} message - Message to display
 * @param {string} type - Message type: "info", "success", "warning", "error"
 */
export function showStatus(message, type = "info", options = {}) {
  console.log("Status message:", message, "Type:", type);
  const statusMessagesContainer = document.getElementById("statusMessagesContainer");
  if (!statusMessagesContainer) {
    console.warn("Status messages container not found");
    return;
  }

  clearSupersededMessages(statusMessagesContainer, message, type);
  if (options.requestId) dismissStatus(options.requestId);

  const msgDiv = document.createElement("div");
  msgDiv.className = `status-message status-${type}`;
  if (options.requestId) msgDiv.dataset.requestId = options.requestId;

  // Create message content container
  const messageContent = document.createElement("span");
  messageContent.textContent = message;
  messageContent.className = "status-message-content";

  // Create close button
  const closeButton = document.createElement("button");
  closeButton.textContent = "\u00d7";
  closeButton.className = "status-close-button";
  closeButton.setAttribute("aria-label", siteText("widget.close-message", "Close message"));
  closeButton.addEventListener("click", () => {
    removeStatusMessage(msgDiv);
  });

  // Append content and close button to message div
  msgDiv.appendChild(messageContent);
  msgDiv.appendChild(closeButton);
  statusMessagesContainer.appendChild(msgDiv);

  // Auto-hide info messages after 30 seconds
  if (type === "info") {
    setTimeout(() => {
      removeStatusMessage(msgDiv);
    }, 30000);
  }
}

/**
 * Remove the messages a new message makes obsolete: a progress message once the request has
 * ended, and a shorter error that the new, fuller error repeats.
 */
function clearSupersededMessages(container, message, type) {
  if (type === "info") return;
  for (const existing of Array.from(container.querySelectorAll(".status-message"))) {
    const existingText = existing.querySelector(".status-message-content")?.textContent || "";
    const isProgress = existing.classList.contains("status-info");
    const isRepeatedError =
      type === "error" && existing.classList.contains("status-error") && message.startsWith(existingText.replace(/\.$/, ""));
    if (isProgress || isRepeatedError) removeStatusMessage(existing);
  }
}

/**
 * Remove the messages shown with this requestId, and no others: a request's own progress message
 * when the request ends.
 * @param {string} requestId - The requestId the messages were shown with
 */
export function dismissStatus(requestId) {
  const container = document.getElementById("statusMessagesContainer");
  if (!container || !requestId) return;
  for (const message of Array.from(container.querySelectorAll(".status-message[data-request-id]"))) {
    if (message.dataset.requestId === requestId) removeStatusMessage(message);
  }
}

/**
 * Remove a specific status message element
 * @param {HTMLElement} msgDiv - Message element to remove
 */
export function removeStatusMessage(msgDiv) {
  if (msgDiv && msgDiv.parentNode) {
    msgDiv.remove();
  }
}

/**
 * An Error that carries what the reader-facing failure message needs: the HTTP status and the
 * HMRC or bundle code from the response body. The status is for choosing the cause line and is
 * never shown.
 */
export function requestError(response, result, fallback) {
  const reason = (result && (result.message || result.userMessage)) || fallback;
  const hmrcReason = result?.responseBody?.message || result?.responseBody?.errors?.[0]?.message;
  const error = new Error(hmrcReason || reason);
  error.status = response?.status;
  error.code = result?.responseBody?.code || result?.code || "";
  error.service = serviceOfUrl(response?.url);
  return error;
}

/**
 * The service a request went to, from its URL: "hmrc" for a route under /api/v1/hmrc/, and ""
 * for any other route. A failure names HMRC only when its service is "hmrc".
 * @param {string} url - the request or response URL, absolute or relative to the page
 */
export function serviceOfUrl(url) {
  if (!url) return "";
  try {
    return new URL(url, window.location.origin).pathname.startsWith("/api/v1/hmrc/") ? "hmrc" : "";
  } catch {
    return "";
  }
}

function failureCause(error) {
  if (error?.failure) return error.failure;
  const status = error?.status;
  const code = error?.code || "";
  const hmrc = error?.service === "hmrc";
  if (status === 401 && hmrc)
    return {
      cause: siteText("widget.failure-hmrc-expired", "Your HMRC connection has expired."),
      next: { label: siteText("widget.connect-hmrc-again", "Connect to HMRC again"), href: window.location.pathname },
    };
  if (status === 401)
    return {
      cause: siteText("widget.failure-sign-in-expired", "Your sign-in has expired."),
      next: { label: siteText("widget.sign-in-again", "Sign in again"), href: "/auth/login.html" },
    };
  if (code.endsWith("INSOLVENT_TRADER")) {
    return {
      cause: siteText("widget.failure-insolvent", "HMRC will not release records for a trader it lists as insolvent."),
      next: { label: siteText("widget.back-to-activities", "Back to activities"), href: "/" },
    };
  }
  if (code === "tokens_exhausted") {
    return {
      cause: siteText("widget.failure-no-tokens", "You have no tokens left."),
      next: { label: siteText("widget.add-a-bundle", "Add a bundle"), href: "/bundles.html" },
    };
  }
  if (code === "BUNDLE_ENTITLEMENT_REQUIRED" || (status === 403 && /bundle/i.test(error.message))) {
    return {
      cause: siteText("widget.failure-no-bundle", "Your account has no bundle that allows this."),
      next: { label: siteText("widget.add-a-bundle", "Add a bundle"), href: "/bundles.html" },
    };
  }
  if (status === 403 && hmrc) {
    return {
      cause: siteText("widget.failure-hmrc-forbidden", "HMRC did not allow access to these records."),
      next: { label: siteText("widget.connect-hmrc-again", "Connect to HMRC again"), href: window.location.pathname },
    };
  }
  if (status === 403) {
    return {
      cause: siteText("widget.failure-forbidden", "You do not have access to this page."),
      next: { label: siteText("widget.back-to-activities", "Back to activities"), href: "/" },
    };
  }
  if (status === 404 && hmrc) {
    return {
      cause: siteText("widget.failure-hmrc-not-found", "HMRC holds nothing for these details."),
      next: { label: siteText("widget.check-and-try-again", "Check the details and try again"), href: window.location.pathname },
    };
  }
  if (status === 404) {
    return {
      cause: siteText("widget.failure-not-found", "There is nothing here for these details."),
      next: { label: siteText("widget.check-and-try-again", "Check the details and try again"), href: window.location.pathname },
    };
  }
  if ((status >= 500 || status === undefined) && hmrc) {
    return {
      cause: siteText("widget.failure-hmrc-server", "HMRC could not complete the request."),
      next: { label: siteText("widget.try-again", "Try again"), href: window.location.pathname },
    };
  }
  if (status >= 500 || status === undefined) {
    return {
      cause: siteText("widget.failure-server", "The request could not be completed."),
      next: { label: siteText("widget.try-again", "Try again"), href: window.location.pathname },
    };
  }
  const detail = String(error?.message || "")
    .replace(/ ?\(HTTP \d{3}\)\.?/g, "")
    .replace(/^Failed to [^.:]*[.:]\s*/, "")
    .trim();
  return {
    cause:
      detail ||
      (hmrc
        ? siteText("widget.failure-hmrc-refused", "HMRC refused the request.")
        : siteText("widget.failure-refused", "The request was refused.")),
    next: { label: siteText("widget.check-and-try-again", "Check the details and try again"), href: window.location.pathname },
  };
}

/**
 * Show one message for a failed request: a title naming what failed, one line of cause and one
 * next step as a link. It replaces every earlier error message so one failure reads once.
 * @param {Error} error - from requestError, or any Error
 * @param {string} title - what failed, e.g. "Could not retrieve VAT obligations"
 */
export function showFailure(error, title) {
  console.log("Status failure:", title, error?.status, error?.code, error?.message);
  const container = document.getElementById("statusMessagesContainer");
  if (!container) return;
  for (const existing of Array.from(container.querySelectorAll(".status-message"))) {
    if (existing.classList.contains("status-error") || existing.classList.contains("status-info")) removeStatusMessage(existing);
  }
  const { cause, next } = failureCause(error);

  const msgDiv = document.createElement("div");
  msgDiv.className = "status-message status-error";
  msgDiv.setAttribute("role", "alert");

  const content = document.createElement("div");
  content.className = "status-message-content";
  const heading = document.createElement("strong");
  heading.className = "status-message-title";
  heading.textContent = title;
  const causeLine = document.createElement("span");
  causeLine.className = "status-message-cause";
  causeLine.textContent = cause;
  const nextLink = document.createElement("a");
  nextLink.className = "status-message-next";
  nextLink.href = next.href;
  nextLink.textContent = next.label;
  content.append(heading, causeLine, nextLink);

  const closeButton = document.createElement("button");
  closeButton.textContent = "\u00d7";
  closeButton.className = "status-close-button";
  closeButton.setAttribute("aria-label", siteText("widget.close-message", "Close message"));
  closeButton.addEventListener("click", () => removeStatusMessage(msgDiv));

  msgDiv.append(content, closeButton);
  container.appendChild(msgDiv);
}

/**
 * Hide all status messages
 */
export function hideStatus() {
  console.log("Hiding all status messages");
  const statusMessagesContainer = document.getElementById("statusMessagesContainer");
  if (statusMessagesContainer) {
    statusMessagesContainer.innerHTML = "";
  }
}

/**
 * Execute callback when DOM is ready
 * @param {Function} callback - Callback to execute
 */
export function onDomReady(callback) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    callback();
  } else {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  }
}

/**
 * Read content from a meta tag
 * @param {string} name - Meta tag name
 * @returns {string} Meta content or empty string
 */
export function readMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el && el.content ? el.content.trim() : "";
}

// The search form of an HMRC read page (obligations, liabilities, payments, penalties): a card that
// holds the criteria and two buttons, Show search criteria and Cancel request.
const SEARCH_FORM_PARTS = ["searchCriteriaContainer", "toggleSearchCriteriaBtn", "cancelRequestBtn"];

function searchFormParts() {
  return SEARCH_FORM_PARTS.map((id) => document.getElementById(id));
}

/** While a request waits on HMRC, the criteria fold away behind the card's two buttons. */
export function hideSearchCriteria() {
  const [criteria, toggleButton, cancelButton] = searchFormParts();
  if (!criteria || !toggleButton) return;
  criteria.style.display = "none";
  toggleButton.style.display = "inline-block";
  if (cancelButton) cancelButton.style.display = "inline-block";
}

/**
 * The card shows again with its criteria, for a new search, a cancelled request or an error.
 * @param {string} formCardId - the id of the card that holds the form
 */
export function showSearchCriteria(formCardId) {
  const [criteria, toggleButton, cancelButton] = searchFormParts();
  document.getElementById(formCardId).style.display = "";
  if (!criteria || !toggleButton) return;
  criteria.style.display = "block";
  toggleButton.style.display = "none";
  if (cancelButton) cancelButton.style.display = "none";
}

/**
 * With HMRC's answer shown the card would hold nothing, so the whole card goes until showSearchCriteria.
 * @param {string} formCardId - the id of the card that holds the form
 */
export function hideSearchFormForResults(formCardId) {
  const [, toggleButton, cancelButton] = searchFormParts();
  if (toggleButton) toggleButton.style.display = "none";
  if (cancelButton) cancelButton.style.display = "none";
  document.getElementById(formCardId).style.display = "none";
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.showStatus = showStatus;
  window.hideStatus = hideStatus;
  window.dismissStatus = dismissStatus;
  window.showFailure = showFailure;
  window.requestError = requestError;
  window.removeStatusMessage = removeStatusMessage;
  // A namespace, not three globals: the ITSA page scripts declare their own showSearchCriteria.
  window.SearchForm = { hideCriteria: hideSearchCriteria, showCriteria: showSearchCriteria, hideForResults: hideSearchFormForResults };
  window.onDomReady = onDomReady;
  window.readMeta = readMeta;
}
