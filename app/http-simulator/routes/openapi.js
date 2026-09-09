// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/openapi.js
// Serve OpenAPI specs and provide Swagger UI for exploration
// Handles: GET /openapi/*, GET /docs/*

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to OpenAPI specs
const specsDir = path.resolve(process.cwd(), "_developers/reference");

/**
 * Get list of available OpenAPI spec files
 */
function getSpecFiles() {
  try {
    const files = fs.readdirSync(specsDir);
    return files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"));
  } catch {
    return [];
  }
}

/**
 * Generate index HTML with links to specs and Swagger UI
 */
function generateIndexHtml(baseUrl, specFiles) {
  const specLinks = specFiles
    .map(
      (file) => `
      <li>
        <strong>${file}</strong>
        <ul>
          <li><a href="/openapi/${file}">Raw spec</a></li>
          <li><a href="/docs/${file}">Swagger UI</a></li>
          <li><a href="https://editor.swagger.io/?url=${encodeURIComponent(`${baseUrl}/openapi/${file}`)}" target="_blank">Swagger Editor (external)</a></li>
        </ul>
      </li>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <title>HTTP Simulator - API Documentation</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    ul { list-style-type: none; padding-left: 0; }
    li { margin: 10px 0; }
    li ul { padding-left: 20px; list-style-type: disc; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .endpoint { background: #f5f5f5; padding: 10px 15px; margin: 10px 0; border-radius: 4px; font-family: monospace; }
    .method { font-weight: bold; }
    .get { color: #61affe; }
    .post { color: #49cc90; }
    .info { background: #e8f4f8; padding: 15px; border-radius: 4px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>HTTP Simulator</h1>

  <div class="info">
    <p><strong>This simulator replaces:</strong></p>
    <ul>
      <li>Docker mock-oauth2-server (local app authentication)</li>
      <li>HMRC VAT API (obligations, returns, fraud headers)</li>
    </ul>
  </div>

  <h2>Available Endpoints</h2>

  <h3>Local OAuth (replaces mock-oauth2-server)</h3>
  <div class="endpoint"><span class="method get">GET</span> /oauth/authorize - Interactive login form</div>
  <div class="endpoint"><span class="method post">POST</span> /default/token - Token exchange</div>

  <h3>HMRC OAuth</h3>
  <div class="endpoint"><span class="method get">GET</span> /oauth/authorize - Auto-grant for HMRC client_id</div>
  <div class="endpoint"><span class="method post">POST</span> /oauth/token - HMRC token exchange</div>

  <h3>HMRC VAT API</h3>
  <div class="endpoint"><span class="method get">GET</span> /organisations/vat/{vrn}/obligations</div>
  <div class="endpoint"><span class="method post">POST</span> /organisations/vat/{vrn}/returns</div>
  <div class="endpoint"><span class="method get">GET</span> /organisations/vat/{vrn}/returns/{periodKey}</div>
  <div class="endpoint"><span class="method get">GET</span> /test/fraud-prevention-headers/validate</div>

  <h3>Health & Documentation</h3>
  <div class="endpoint"><span class="method get">GET</span> /health - Health check</div>
  <div class="endpoint"><span class="method get">GET</span> /openapi/{spec} - Raw OpenAPI specs</div>
  <div class="endpoint"><span class="method get">GET</span> /docs/{spec} - Swagger UI for spec</div>

  <h2>OpenAPI Specifications</h2>
  <ul>
    ${specLinks || "<li>No OpenAPI specs found in _developers/reference/</li>"}
  </ul>

  <h2>Gov-Test-Scenario Support</h2>
  <p>Set the <code>Gov-Test-Scenario</code> header to trigger specific responses:</p>
  <ul>
    <li><code>NOT_FOUND</code> - Returns 404</li>
    <li><code>VRN_INVALID</code> - Returns 400</li>
    <li><code>DUPLICATE_SUBMISSION</code> - Returns 403</li>
    <li><code>QUARTERLY_NONE_MET</code> - Obligations with none fulfilled</li>
    <li><code>QUARTERLY_ONE_MET</code> - Obligations with one fulfilled</li>
    <li>... and more</li>
  </ul>
</body>
</html>`;
}

/**
 * Generate Swagger UI HTML for a specific spec
 */
function generateSwaggerUiHtml(specUrl, specName) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Swagger UI - ${specName}</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; }
    .topbar { display: none !important; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
}

export function apiEndpoint(app) {
  // GET / - Index page with links
  app.get("/", (req, res) => {
    const protocol = req.protocol || "http";
    const host = req.get("host") || `localhost:${req.socket.localPort || 9000}`;
    const baseUrl = `${protocol}://${host}`;
    const specFiles = getSpecFiles();

    res.setHeader("Content-Type", "text/html");
    res.send(generateIndexHtml(baseUrl, specFiles));
  });

  // GET /openapi/:spec - Serve raw OpenAPI spec
  app.get("/openapi/:spec", (req, res) => {
    const specFile = req.params.spec;
    const specPath = path.join(specsDir, specFile);

    console.log(`[http-simulator:openapi] GET /openapi/${specFile}`);

    // Security check - prevent directory traversal
    if (specFile.includes("..") || !specFile.match(/^[\w.-]+\.(yaml|yml|json)$/)) {
      return res.status(400).json({ error: "Invalid spec file name" });
    }

    try {
      const content = fs.readFileSync(specPath, "utf-8");

      if (specFile.endsWith(".json")) {
        res.setHeader("Content-Type", "application/json");
      } else {
        res.setHeader("Content-Type", "text/yaml");
      }

      res.send(content);
    } catch (err) {
      console.log(`[http-simulator:openapi] Spec not found: ${specFile}`);
      res.status(404).json({
        error: "Spec not found",
        availableSpecs: getSpecFiles(),
      });
    }
  });

  // GET /docs/:spec - Swagger UI for spec
  app.get("/docs/:spec", (req, res) => {
    const specFile = req.params.spec;

    console.log(`[http-simulator:openapi] GET /docs/${specFile}`);

    // Security check
    if (specFile.includes("..") || !specFile.match(/^[\w.-]+\.(yaml|yml|json)$/)) {
      return res.status(400).json({ error: "Invalid spec file name" });
    }

    const specPath = path.join(specsDir, specFile);
    if (!fs.existsSync(specPath)) {
      return res.status(404).json({
        error: "Spec not found",
        availableSpecs: getSpecFiles(),
      });
    }

    const protocol = req.protocol || "http";
    const host = req.get("host") || `localhost:${req.socket.localPort || 9000}`;
    const specUrl = `${protocol}://${host}/openapi/${specFile}`;

    res.setHeader("Content-Type", "text/html");
    res.send(generateSwaggerUiHtml(specUrl, specFile));
  });

  // GET /openapi - List available specs
  app.get("/openapi", (req, res) => {
    const specFiles = getSpecFiles();
    res.json({
      specs: specFiles,
      baseUrl: `/openapi`,
      swaggerUi: `/docs`,
    });
  });
}
