// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Support API client
 *
 * submitSupportTicket() posts the request to the Lambda API, which files it for the operator's
 * review. The response says only whether it was filed.
 */

/**
 * Get the API base URL from the page configuration
 * @returns {string|null} The API base URL or null if not configured
 */
function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    if (window.config && window.config.apiBaseUrl) {
      return window.config.apiBaseUrl;
    }
    const apiUrl = document.documentElement.dataset.apiUrl;
    if (apiUrl) {
      return apiUrl;
    }
  }
  return null;
}

/**
 * Submit a support ticket via the Lambda API
 * This files the request on behalf of the user; the person never needs a GitHub account.
 *
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function submitSupportTicket({ subject, description, category }) {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return {
      success: false,
      error: "Support API not configured. Please email support@diyaccounting.co.uk instead.",
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/support/ticket`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject, description, category }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `Failed to submit ticket (${response.status})`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error submitting support ticket:", error);
    return {
      success: false,
      error: "Network error. Please try again or email support@diyaccounting.co.uk.",
    };
  }
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.submitSupportTicket = submitSupportTicket;
}
