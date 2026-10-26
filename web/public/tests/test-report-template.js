// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Store report globally for use in artifact rendering
let report = null;

// Get test name from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const testName = urlParams.get("test");

if (!testName) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("error").style.display = "block";
  document.getElementById("error").textContent = "Error: No test name specified in URL";
} else {
  loadTestReport(testName);
}

async function loadTestReport(testName) {
  try {
    const response = await fetch(`test-report-${testName}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load test report: ${response.statusText}`);
    }

    report = await response.json();
    renderReport(report);
  } catch (error) {
    console.error("Error loading test report:", error);
    document.getElementById("loading").style.display = "none";
    document.getElementById("error").style.display = "block";
    document.getElementById("error").textContent = `Error loading test report: ${error.message}`;
  }
}

function renderReport(report) {
  // Hide loading, show content
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";

  // Set title with status safely using DOM manipulation
  const titleElement = document.getElementById("testTitle");
  const status = report.playwrightReport?.status || "unknown";

  // Clear previous content
  titleElement.textContent = "";

  // Add text content safely
  const titleText = document.createTextNode(report.testContext?.title || report.testName);
  titleElement.appendChild(titleText);

  // Add status span safely
  const statusSpan = document.createElement("span");
  statusSpan.className = `status ${status}`;
  statusSpan.textContent = status.toUpperCase();
  titleElement.appendChild(document.createTextNode(" "));
  titleElement.appendChild(statusSpan);

  // Set metadata
  document.getElementById("testName").textContent = report.testName;
  document.getElementById("generatedAt").textContent = new Date(report.generatedAt).toLocaleString();

  // Set Playwright link (validate test name)
  const playwrightLink = document.getElementById("playwrightLink");
  if (/^[a-zA-Z0-9_-]+$/.test(report.testName)) {
    playwrightLink.href = `test-reports/${report.testName}/html-report/index.html`;
  } else {
    playwrightLink.href = "#";
    playwrightLink.style.display = "none";
  }

  // Render test context JSON
  document.getElementById("testContextJson").textContent = JSON.stringify(report.testContext, null, 2);

  // Render HMRC API requests
  renderHmrcApiRequests(report.hmrcApiRequests || []);

  // Render test artifacts
  renderArtifacts(report.artifacts || {});

  // Render environment config
  renderEnvConfig(report.envConfig);
}

function escapeHtml(unsafe) {
  if (typeof unsafe !== "string") {
    return unsafe;
  }
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function renderHmrcApiRequests(requests) {
  const section = document.getElementById("hmrcApiSection");

  if (!requests || requests.length === 0) {
    section.innerHTML = "<p>No HMRC API requests found for this test.</p>";
    return;
  }

  // Filter to only include requests whose traceparent matches observedTraceparent
  const observed = report?.testContext?.testData?.observedTraceparent;
  const filtered = Array.isArray(requests)
    ? requests.filter((req) => {
        const httpRequest = req.httpRequest || req;
        const headers = httpRequest?.headers || {};
        const headerTraceparent = headers.traceparent || headers.Traceparent;
        const topLevelTraceparent = req.traceparent || req.Traceparent;
        const candidate = headerTraceparent || topLevelTraceparent || null;
        if (!observed) return true; // if no observed in report, show all
        return candidate === observed;
      })
    : [];

  if (filtered.length === 0) {
    section.innerHTML = `<p>No HMRC API requests matched observed traceparent${observed ? `: ${escapeHtml(observed)}` : ""}.</p>`;
    return;
  }

  let html = `<p>Found ${filtered.length} HMRC API request(s) for observed trace.</p>`;

  filtered.forEach((req, index) => {
    // Handle different data structures - could be direct or nested
    const httpRequest = req.httpRequest || req;
    const httpResponse = req.httpResponse || req.response;

    const method = escapeHtml((httpRequest.method || req.method || "GET").toUpperCase());
    const url = escapeHtml(httpRequest.path || httpRequest.url || req.url || req.path || "unknown");
    const requestHeaders = httpRequest.headers || {};
    const requestBody = httpRequest.body || httpRequest.data || req.body || req.data;

    const statusCode = httpResponse?.statusCode || httpResponse?.status || "";
    const responseHeaders = httpResponse?.headers || {};
    const responseBody = httpResponse?.body || httpResponse?.data;

    html += `
      <div class="api-request">
        <h4>
          <span class="api-method ${method.toLowerCase()}">${method}</span>
          ${url}
          ${statusCode ? `<span class="${statusCode < 400 ? "status-success" : "status-error"}" style="margin-left: 1rem;">Status: ${statusCode}</span>` : ""}
        </h4>

        <details>
          <summary>Request:</summary>
          <pre><strong>Method:</strong> ${method}
<strong>URL:</strong> ${url}${
      Object.keys(requestHeaders).length > 0
        ? `
<strong>Headers:</strong>
${escapeHtml(JSON.stringify(requestHeaders, null, 2))}`
        : ""
    }${
      requestBody
        ? `
<strong>Body:</strong>
${escapeHtml(typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody, null, 2))}`
        : ""
    }</pre>
        </details>

        ${
          httpResponse
            ? `
        <details>
          <summary>Response:</summary>
          <pre>${
            statusCode
              ? `<strong>Status:</strong> ${statusCode}
`
              : ""
          }${
            Object.keys(responseHeaders).length > 0
              ? `<strong>Headers:</strong>
${escapeHtml(JSON.stringify(responseHeaders, null, 2))}
`
              : ""
          }${
            responseBody
              ? `<strong>Body:</strong>
${escapeHtml(typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2))}`
              : ""
          }</pre>
        </details>
        `
            : ""
        }
      </div>
    `;
  });

  section.innerHTML = html;
}

function renderArtifacts(artifacts) {
  // Render videos at the bottom with border
  const videosSection = document.getElementById("videosSection");
  if (artifacts.videos && artifacts.videos.length > 0) {
    let html = "";
    artifacts.videos.forEach((video) => {
      const videoPath = `behaviour-test-results/${report.testName}/${escapeHtml(video)}`;
      const videoExt = video.toLowerCase();
      html += `
        <div class="video-container">
          <p><strong>Test Recording: ${escapeHtml(video)}</strong></p>
          <video controls>`;
      // Add appropriate source based on file extension
      if (videoExt.endsWith(".webm")) {
        html += `<source src="${videoPath}" type="video/webm">`;
        // Also try mp4 if converted
        html += `<source src="${videoPath.replace(".webm", ".mp4")}" type="video/mp4">`;
      } else if (videoExt.endsWith(".mp4")) {
        html += `<source src="${videoPath}" type="video/mp4">`;
      } else {
        // Generic fallback
        html += `<source src="${videoPath}">`;
      }
      html += `
            Your browser does not support the video tag.
          </video>
        </div>
      `;
    });
    videosSection.innerHTML = html;
  } else {
    videosSection.innerHTML = "<p>No videos found for this test.</p>";
  }

  // Render screenshots with figure metadata if available
  const screenshotsSection = document.getElementById("screenshotsSection");
  if (artifacts.screenshots && artifacts.screenshots.length > 0) {
    let html = '<div class="screenshot-gallery">';

    // Use figures metadata if available
    if (artifacts.figures && artifacts.figures.length > 0) {
      artifacts.figures.forEach((figure, index) => {
        const screenshotPath = `behaviour-test-results/${report.testName}/${escapeHtml(figure.filename)}`;
        const caption = figure.caption || `Screenshot ${figure.order ?? index + 1}`;
        html += `
          <div class="screenshot-item">
            <a href="${screenshotPath}" target="_blank">
              <img src="${screenshotPath}" alt="${escapeHtml(caption)}" title="${escapeHtml(figure.description || caption)}">
            </a>
            <div class="screenshot-caption">
              <strong>${escapeHtml(caption)}</strong><br>
              ${escapeHtml(figure.description || "")}
            </div>
          </div>
        `;
      });
    } else {
      // Fallback to simple list if no figures metadata
      artifacts.screenshots.forEach((screenshot) => {
        const screenshotPath = `behaviour-test-results/${report.testName}/${escapeHtml(screenshot)}`;
        const filename = screenshot.split("/").pop();
        html += `
          <div class="screenshot-item">
            <a href="${screenshotPath}" target="_blank">
              <img src="${screenshotPath}" alt="${escapeHtml(filename)}" title="Click to view full size">
            </a>
            <div class="screenshot-caption">
              ${escapeHtml(filename)}
            </div>
          </div>
        `;
      });
    }

    html += "</div>";
    screenshotsSection.innerHTML = html;
  } else {
    screenshotsSection.innerHTML = "<p>No screenshots found for this test.</p>";
  }
}

function renderEnvConfig(envConfig) {
  const section = document.getElementById("envConfigSection");
  const filenameElement = document.getElementById("envConfigFilename");
  const contentElement = document.getElementById("envConfigContent");

  if (envConfig && envConfig.content) {
    filenameElement.textContent = `Environment Configuration: ${envConfig.filename}`;
    contentElement.textContent = envConfig.content;
  } else {
    section.style.display = "none";
  }
}
