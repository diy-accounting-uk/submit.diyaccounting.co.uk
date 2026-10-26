// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Test report labels mapping
const TEST_LABELS = {
  "bundle": "Click through test: Adding and removing bundles",
  "post-vat-return-sandbox": "Click through test: Post VAT Return from HMRC (sandbox)",
  "get-vat-return-sandbox": "Click through test: Get VAT Return from HMRC (sandbox)",
  "obligation-sandbox": "Click through test: View VAT obligations from HMRC (sandbox)",
  "submit-vat": "Click through test: Submit a VAT return to HMRC (includes view VAT return and obligations)",
  "submit-vat-sandbox": "Click through test: Submit a VAT return to HMRC (sandbox, includes view VAT return and obligations)",
};

async function loadTestReports() {
  try {
    // Load the test reports index
    const indexResponse = await fetch("test-reports-index.txt");

    if (!indexResponse.ok) {
      showNoReports();
      return;
    }

    const indexText = await indexResponse.text();
    const reportFiles = indexText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (reportFiles.length === 0) {
      showNoReports();
      return;
    }

    // Load each report's metadata
    const reports = await Promise.all(
      reportFiles.map(async (fileName) => {
        try {
          const response = await fetch(fileName);
          if (!response.ok) {
            return null;
          }
          const report = await response.json();
          return { fileName, ...report };
        } catch (e) {
          console.warn(`Failed to load ${fileName}:`, e);
          return null;
        }
      }),
    );

    const validReports = reports.filter((r) => r !== null);

    if (validReports.length === 0) {
      showNoReports();
      return;
    }

    renderReports(validReports);
  } catch (error) {
    console.error("Error loading test reports:", error);
    showNoReports();
  }
}

function showNoReports() {
  document.getElementById("loadingMessage").style.display = "none";
  document.getElementById("noReportsMessage").style.display = "block";
}

function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function isValidTestName(testName) {
  // Allow only alphanumeric characters, hyphens, and underscores
  // This prevents path traversal attacks
  return /^[a-zA-Z0-9_-]+$/.test(testName);
}

function renderReports(reports) {
  document.getElementById("loadingMessage").style.display = "none";
  document.getElementById("reportsContainer").style.display = "block";

  const container = document.getElementById("reportsContainer");

  let html = "";

  reports.forEach((report) => {
    const testName = report.testName;

    // Validate test name to prevent path traversal
    if (!isValidTestName(testName)) {
      console.warn(`Skipping invalid test name: ${testName}`);
      return;
    }

    const label = TEST_LABELS[testName] || testName;
    const status = report.playwrightReport?.status || "unknown";
    const statusClass = status === "passed" ? "success" : status === "failed" ? "error" : "warning";
    const statusIcon = status === "passed" ? "✓" : status === "failed" ? "✗" : "?";

    // Create a summary from test context
    const description = report.testContext?.description || "No description available";
    const generatedAt = new Date(report.generatedAt).toLocaleString();

    // Escape user-controlled content
    const escapedTestName = escapeHtml(testName);
    const escapedLabel = escapeHtml(label);
    const escapedDescription = escapeHtml(description);
    const escapedGeneratedAt = escapeHtml(generatedAt);
    const encodedTestName = encodeURIComponent(testName);

    html += `
      <div style="margin-bottom: 2rem; border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; background-color: #fafafa;">
        <h2 style="margin-top: 0; margin-bottom: 0.5rem;">
          <span style="color: ${statusClass === "success" ? "#28a745" : statusClass === "error" ? "#dc3545" : "#ffc107"};">${statusIcon}</span>
          ${escapedLabel}
        </h2>
        <p style="color: #666; margin-bottom: 1rem; font-size: 0.95rem;">
          ${escapedDescription}
        </p>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <a href="test-report-template.html?test=${encodedTestName}" target="_blank" class="btn" style="text-decoration: none; display: inline-block;">
            View Full Test Details
          </a>
        </div>
        <p style="margin-top: 1rem; margin-bottom: 0; font-size: 0.85rem; color: #999;">
          Generated: ${escapedGeneratedAt}
        </p>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Initialize - wait for submit.js module to be ready
function initPage() {
  checkAuthStatus();
  loadTestReports();
}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}
