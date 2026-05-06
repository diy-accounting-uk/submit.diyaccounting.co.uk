// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Support API client
 *
 * Two ways to submit support requests:
 * 1. submitSupportTicket() - Uses the Lambda API to create a GitHub issue
 *    (for users who don't have GitHub accounts)
 * 2. getGitHubIssueUrl() - Returns URL to create issue directly on GitHub
 *    (for users who prefer to use their own GitHub account)
 */

// GitHub repo for support issues
const GITHUB_REPO = "support-at-diyaccounting/submit.diyaccounting.co.uk";

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
 * Get the URL to create a GitHub issue directly
 * Users can use this link whether or not they have a GitHub account -
 * GitHub will prompt them to sign in or register if needed.
 *
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 * @returns {string} The GitHub issue creation URL
 */
export function getGitHubIssueUrl({ subject, description, category }) {
  const body = `## Support Request

**Category:** ${category}
**Submitted via:** DIY Accounting Submit help page

---

${description}

---
*Submitted via DIY Accounting Submit support form*`;

  const issueUrl = new URL(`https://github.com/${GITHUB_REPO}/issues/new`);
  issueUrl.searchParams.set("template", "support.md");
  issueUrl.searchParams.set("title", `[Support] ${subject}`);
  issueUrl.searchParams.set("body", body);
  issueUrl.searchParams.set("labels", `support,${category}`);

  return issueUrl.toString();
}

/**
 * Open a GitHub issue page directly in a new tab
 *
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 */
export function openGitHubIssue({ subject, description, category }) {
  const url = getGitHubIssueUrl({ subject, description, category });
  window.open(url, "_blank", "noopener");
}

/**
 * Submit a support ticket via the Lambda API
 * This creates a GitHub issue on behalf of the user using our PAT.
 * Use this for users who don't have GitHub accounts.
 *
 * @param {Object} params - Support ticket parameters
 * @param {string} params.subject - Issue subject/title
 * @param {string} params.description - Issue description
 * @param {string} params.category - Issue category
 * @returns {Promise<{success: boolean, issueNumber?: number, issueUrl?: string, error?: string}>}
 */
export async function submitSupportTicket({ subject, description, category }) {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return {
      success: false,
      error: "Support API not configured. Please use the GitHub link instead.",
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

    const result = await response.json();
    return {
      success: true,
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
    };
  } catch (error) {
    console.error("Error submitting support ticket:", error);
    return {
      success: false,
      error: "Network error. Please try again or use the GitHub link.",
    };
  }
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.submitSupportTicket = submitSupportTicket;
  window.getGitHubIssueUrl = getGitHubIssueUrl;
  window.openGitHubIssue = openGitHubIssue;
}
