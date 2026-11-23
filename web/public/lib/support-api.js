// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Support API client
 *
 * submitSupportTicket() posts the request to the Lambda API, which files it for the operator's
 * review. The response says only whether it was filed.
 */

// page-chrome.js gives the text in the reader's language; without it (in a unit test) the English stands.
const siteText = (id, english, values) =>
  window.siteText
    ? window.siteText(id, english, values)
    : english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));

/**
 * Submit a support ticket via the Lambda API
 * This files the request on behalf of the user; the person never needs a GitHub account.
 *
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 * @param {string} params.email - Address the reply goes to, as typed (not verified)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function submitSupportTicket({ subject, description, category, email }) {
  try {
    // The API answers on the page's own origin, as every other call of the site does.
    const response = await fetch("/api/v1/support/ticket", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject, description, category, email }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || siteText("help.ticket-failed", "Failed to submit ticket ({status})", { status: response.status }),
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error submitting support ticket:", error);
    return {
      success: false,
      error: siteText("help.network-error", "Network error. Please try again or email support@diyaccounting.co.uk."),
    };
  }
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.submitSupportTicket = submitSupportTicket;
}
