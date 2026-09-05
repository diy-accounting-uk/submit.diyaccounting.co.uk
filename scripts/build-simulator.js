#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/build-simulator.js
// Transform web/public -> web/public-simulator with simulator-specific modifications
// 1. Copy all files
// 2. Inject simulator banner into HTML files
// 3. Add data-simulator attribute to <html> tag
// 4. Add meta robots noindex
// 5. Create robots.txt for simulator subdomain

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const sourceDir = path.join(projectRoot, "web/public");
const targetDir = path.join(projectRoot, "web/public-simulator");

// Simulator banner HTML to inject after <body>
const SIMULATOR_BANNER = `
  <!-- Simulator Banner - Injected by build-simulator.js -->
  <div class="simulator-banner" role="alert" aria-live="polite">
    This is the demo. Click here for the live site: <a href="https://submit.diyaccounting.co.uk/" style="color: inherit; text-decoration: underline; font-weight: bold;">submit.diyaccounting.co.uk</a>
  </div>
`;

// Meta tags to inject in <head>
const SIMULATOR_META_TAGS = `
  <!-- Simulator Meta Tags - Injected by build-simulator.js -->
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="simulator" content="true">
`;

// Storage namespace proxy - isolates simulator storage from parent page
// Must run before any other script to intercept all storage access
const SIMULATOR_STORAGE_PROXY = `
  <script>
    // Simulator Storage Namespace Proxy - Injected by build-simulator.js
    // Prefixes all localStorage/sessionStorage keys with "simulator." so the
    // simulator iframe's storage does not conflict with the parent page.
    (function() {
      var PREFIX = 'simulator.';
      var realLocalStorage = window.localStorage;
      var realSessionStorage = window.sessionStorage;

      function createPrefixedStorage(real) {
        var wrapper = {
          getItem: function(key) {
            return real.getItem(PREFIX + key);
          },
          setItem: function(key, value) {
            real.setItem(PREFIX + key, value);
          },
          removeItem: function(key) {
            real.removeItem(PREFIX + key);
          },
          clear: function() {
            var keysToRemove = [];
            for (var i = 0; i < real.length; i++) {
              var k = real.key(i);
              if (k && k.indexOf(PREFIX) === 0) keysToRemove.push(k);
            }
            for (var j = 0; j < keysToRemove.length; j++) {
              real.removeItem(keysToRemove[j]);
            }
          },
          key: function(index) {
            var count = 0;
            for (var i = 0; i < real.length; i++) {
              var k = real.key(i);
              if (k && k.indexOf(PREFIX) === 0) {
                if (count === index) return k.substring(PREFIX.length);
                count++;
              }
            }
            return null;
          },
          get length() {
            var count = 0;
            for (var i = 0; i < real.length; i++) {
              var k = real.key(i);
              if (k && k.indexOf(PREFIX) === 0) count++;
            }
            return count;
          }
        };
        return wrapper;
      }

      var prefixedLocal = createPrefixedStorage(realLocalStorage);
      var prefixedSession = createPrefixedStorage(realSessionStorage);

      Object.defineProperty(window, 'localStorage', {
        get: function() { return prefixedLocal; },
        configurable: true
      });
      Object.defineProperty(window, 'sessionStorage', {
        get: function() { return prefixedSession; },
        configurable: true
      });
    })();
  </script>
`;

// robots.txt content for simulator subdomain
const ROBOTS_TXT = `# Simulator subdomain - do not index
User-agent: *
Disallow: /
`;

// Simulator demo user identity
const SIMULATOR_DEMO_USER = {
  sub: "demo-user-12345",
  email: "demo@simulator.diyaccounting.co.uk",
  name: "Demo User",
  given_name: "Demo",
};

// Build proper JWT-format tokens (unsigned) so decodeJwtNoVerify can extract claims
const JWT_HEADER = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
const SIMULATOR_ID_TOKEN = `${JWT_HEADER}.${Buffer.from(JSON.stringify(SIMULATOR_DEMO_USER)).toString("base64url")}.`;
const SIMULATOR_ACCESS_TOKEN = `${JWT_HEADER}.${Buffer.from(JSON.stringify({ sub: SIMULATOR_DEMO_USER.sub, token_use: "access" })).toString("base64url")}.`;

/**
 * Recursively copy directory
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Transform HTML file with simulator modifications
 */
function transformHtmlFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");

  // Add data-simulator="true" to <html> tag
  content = content.replace(/<html(\s+lang="[^"]*")?>/i, '<html$1 data-simulator="true">');

  // Inject meta tags and storage namespace proxy after <head>
  // Storage proxy must run before any other script to intercept all storage access
  content = content.replace(/<head>/i, "<head>" + SIMULATOR_META_TAGS + SIMULATOR_STORAGE_PROXY);

  // Inject simulator banner after <body>
  content = content.replace(/<body>/i, "<body>" + SIMULATOR_BANNER);

  // Remove CloudWatch RUM placeholders (no analytics in simulator)
  content = content.replace(/<meta name="rum:[^"]*" content="[^"]*"\s*\/?>/g, "");

  // Inject script to set up simulator user session in localStorage
  const simulatorScript = `
  <script>
    // Simulator auto-login - inject demo user into localStorage
    (function() {
      if (document.documentElement.dataset.simulator === 'true') {
        // Set up demo user session
        localStorage.setItem('userInfo', ${JSON.stringify(JSON.stringify(SIMULATOR_DEMO_USER))});
        localStorage.setItem('cognitoIdToken', '${SIMULATOR_ID_TOKEN}');
        localStorage.setItem('cognitoAccessToken', '${SIMULATOR_ACCESS_TOKEN}');

        // Set HMRC token in sessionStorage (with full scope so pages skip OAuth redirect)
        sessionStorage.setItem('hmrcAccessToken', 'simulator-hmrc-token');
        sessionStorage.setItem('hmrcTokenScope', 'write:vat read:vat');
        sessionStorage.setItem('hmrcAccount', 'synthetic');
      }
    })();
  </script>
`;

  // Remove old localstorage-viewer widget (replaced by developer floats)
  content = content.replace(/<script src="[^"]*localstorage-viewer\.js"><\/script>\s*/g, "");

  // Insert simulator script and postMessage bridge before closing </body>
  const bridgeScript = `  <script src="/widgets/simulator-bridge.js"></script>\n`;
  content = content.replace(/<\/body>/i, simulatorScript + bridgeScript + "</body>");

  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Transform CSS file with simulator styles
 */
function transformCssFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");

  // Check if simulator styles already exist
  if (content.includes(".simulator-banner")) {
    console.log(`  Skipping ${path.basename(filePath)} - simulator styles already present`);
    return;
  }

  // Append simulator-specific CSS
  const simulatorCss = `

/* ============================================
   Simulator Mode Styles
   Injected by build-simulator.js
   ============================================ */

/* Simulator banner - always visible at top */
.simulator-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(90deg, #ff6b6b 0%, #ff8e8e 50%, #ff6b6b 100%);
  color: white;
  text-align: center;
  padding: 10px 16px;
  font-weight: bold;
  z-index: 10000;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
  letter-spacing: 0.5px;
}

/* Offset body content to account for fixed banner */
html[data-simulator="true"] body {
  padding-top: 44px !important;
}

/* Visual indicator on buttons - show "(demo)" suffix */
html[data-simulator="true"] .btn::after,
html[data-simulator="true"] button[type="submit"]::after {
  content: " (demo)";
  font-size: 0.75em;
  opacity: 0.8;
  font-weight: normal;
}

/* Don't add suffix to navigation buttons or icon buttons */
html[data-simulator="true"] .journey-btn::after,
html[data-simulator="true"] .about-nav-link::after,
html[data-simulator="true"] .main-nav a::after,
html[data-simulator="true"] .login-link::after,
html[data-simulator="true"] button.status-close-button::after,
html[data-simulator="true"] button[aria-label]::after {
  content: none;
}

/* Highlight animation for guided journeys */
.simulator-highlight {
  outline: 3px solid #ff6b6b !important;
  outline-offset: 2px;
  animation: pulse-highlight 1s ease-in-out infinite;
  position: relative;
  z-index: 1000;
}

@keyframes pulse-highlight {
  0%, 100% {
    outline-color: #ff6b6b;
    box-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
  }
  50% {
    outline-color: #ff9999;
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.8);
  }
}

/* Simulator notice styling */
.simulator-notice {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 20px;
}
`;

  content += simulatorCss;
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Main build function
 */
function buildSimulator() {
  console.log("Building simulator static files...");
  console.log(`  Source: ${sourceDir}`);
  console.log(`  Target: ${targetDir}`);

  // Clean target directory
  if (fs.existsSync(targetDir)) {
    console.log("  Cleaning existing target directory...");
    fs.rmSync(targetDir, { recursive: true });
  }

  // Copy all files
  console.log("  Copying files...");
  copyDirSync(sourceDir, targetDir);

  // Find and transform HTML files
  console.log("  Transforming HTML files...");
  const htmlFiles = findFiles(targetDir, ".html");
  for (const htmlFile of htmlFiles) {
    console.log(`    Processing ${path.relative(targetDir, htmlFile)}`);
    transformHtmlFile(htmlFile);
  }

  // Transform CSS files
  console.log("  Transforming CSS files...");
  const cssFiles = findFiles(targetDir, ".css");
  for (const cssFile of cssFiles) {
    console.log(`    Processing ${path.relative(targetDir, cssFile)}`);
    transformCssFile(cssFile);
  }

  // Create robots.txt
  console.log("  Creating robots.txt...");
  fs.writeFileSync(path.join(targetDir, "robots.txt"), ROBOTS_TXT, "utf-8");

  // Create simulator-local.js signal file in web/public/
  // This git-ignored file tells simulator.html to use the local /sim/ path
  // instead of the production simulator URL
  const signalFilePath = path.join(sourceDir, "simulator-local.js");
  console.log("  Creating simulator-local.js signal file...");
  fs.writeFileSync(signalFilePath, "// Generated by build-simulator.js — do not commit\nwindow.__simulatorLocal = true;\n", "utf-8");

  // Copy Lambda server entry point for Lambda Web Adapter deployment
  console.log("  Adding Lambda server files...");
  const lambdaServerSrc = path.join(projectRoot, "scripts/simulator-lambda-server.mjs");
  const lambdaServerDest = path.join(targetDir, "lambda-server.mjs");
  fs.copyFileSync(lambdaServerSrc, lambdaServerDest);

  // Create run.sh - Lambda Web Adapter entrypoint
  const runSh = `#!/bin/bash\nexec node lambda-server.mjs\n`;
  fs.writeFileSync(path.join(targetDir, "run.sh"), runSh, { mode: 0o755 });

  // Create minimal package.json for Node.js module resolution
  const packageJson = JSON.stringify({ type: "module" }, null, 2) + "\n";
  fs.writeFileSync(path.join(targetDir, "package.json"), packageJson, "utf-8");

  console.log("Simulator build complete!");
  console.log(`  Total HTML files: ${htmlFiles.length}`);
  console.log(`  Total CSS files: ${cssFiles.length}`);
}

/**
 * Recursively find files by extension
 */
function findFiles(dir, extension) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, extension));
    } else if (entry.name.endsWith(extension)) {
      results.push(fullPath);
    }
  }

  return results;
}

// Run build
buildSimulator();
