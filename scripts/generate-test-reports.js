#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

/**
 * Generate test report JSON files from behaviour test results
 *
 * This script:
 * 1. Reads testContext.json files from behaviour test results
 * 2. Reads hmrc-api-requests.jsonl files for API data
 * 3. Generates test-report-<test-name>.json files
 * 4. Generates test-reports-index.txt listing all reports
 *
 * Usage (direct mode only):
 *   node scripts/generate-test-reports.js \
 *     --testName <name> \
 *     [--testFile <path/to/test-file.js>] \
 *     [--envFile <path/to/.env>]
 *
 * Notes:
 * - The provided values are used as-is. The script does not derive or auto-discover tests.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, "..");
const RESULTS_DIR = path.join(PROJECT_ROOT, "target/behaviour-test-results");
const REPORTS_DIR = path.join(PROJECT_ROOT, "target/test-reports/html-report");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "target/behaviour-test-results");

// -------------------------
// Logging helpers (simplified)
// -------------------------

function fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return "?";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)}${units[i]}`;
}

function truncList(arr, n = 5) {
  if (!Array.isArray(arr)) return [];
  if (arr.length <= n) return arr;
  return [...arr.slice(0, n), `…(+${arr.length - n} more)`];
}

function logInfo(msg) {
  console.log(msg);
}
function logOk(msg) {
  console.log(msg);
}
function logWarn(msg) {
  console.log(msg);
}
function logDebug(msg) {
  console.log(msg);
}
function logStep(msg) {
  console.log(msg);
}

// -------------------------
// CLI helpers
// -------------------------
function parseCliArgs(argv = process.argv.slice(2)) {
  const out = { testName: null, testFile: null, envFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (i + 1 < argv.length ? argv[i + 1] : undefined);
    if (a === "--testName" || a === "--test-name" || a === "-n") {
      out.testName = next();
      i++;
    } else if (a === "--testFile" || a === "--test-file" || a === "-t") {
      out.testFile = next();
      i++;
    } else if (a === "--envFile" || a === "--env-file" || a === "-e") {
      out.envFile = next();
      i++;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

function toProjectRelative(filePath) {
  try {
    const rel = path.relative(PROJECT_ROOT, path.resolve(filePath));
    if (!rel || rel.startsWith("..")) return filePath; // outside project
    return rel;
  } catch (_) {
    return filePath;
  }
}

function readFilePayload(filePath, label) {
  if (!filePath) return null;
  const p = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(p)) {
    logWarn(`${label} not found: ${p}`);
    return null;
  }
  try {
    const size = fs.statSync(p)?.size;
    const rel = toProjectRelative(p);
    logDebug(`Reading ${label} ${rel} (${fmtBytes(size)})`);
    return { filename: rel, content: fs.readFileSync(p, "utf-8") };
  } catch (e) {
    logWarn(`Failed to read ${label}: ${e.message}`);
    return null;
  }
}

/**
 * Read and parse JSONL file
 */
function readJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    logWarn(`JSONL file not found: ${filePath}`);
    return [];
  }

  let content = "";
  try {
    const size = fs.statSync(filePath)?.size;
    logDebug(`Open JSONL file (${fmtBytes(size)}): ${filePath}`);
    content = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    logWarn(`Failed to read JSONL file: ${e.message}`);
    return [];
  }

  let parsed = [];
  let failures = 0;
  const lines = content.split("\n").filter((line) => line.trim());
  for (const [i, line] of lines.entries()) {
    try {
      const obj = JSON.parse(line);
      parsed.push(obj);
      // Log URL submissions with method/status when available
      const url = obj?.request?.url || obj?.url;
      if (url) {
        const method = obj?.request?.method || obj?.method || "";
        const status = obj?.response?.status || obj?.status || "";
        const parts = ["HMRC API request" + (method ? ` ${method}` : ""), url, status ? `(status ${status})` : ""].filter(Boolean);
        logInfo(parts.join(" "));
        logInfo(obj?.request?.httpRequest?.headers?.traceparent);
        logInfo(obj?.request?.traceparent);
      }
    } catch (e) {
      failures++;
      logWarn(`JSONL parse error at line ${i + 1}: ${e.message}`);
    }
  }
  logOk(`Parsed ${parsed.length} JSONL entries (${failures} failed)`);
  return parsed;
}

/**
 * Find first file by name using system 'find' (portable to macOS/Linux)
 * Falls back to null if not found or on error.
 */
function findFirstByName(baseDir, fileName) {
  try {
    const output = execFileSync("find", [baseDir, "-type", "f", "-name", fileName, "-print", "-quit"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (output.length > 0) {
      return path.resolve(output[0]);
    }
  } catch (_) {
    // ignore and return null
  }
  return null;
}

/**
 * Find testContext.json under a directory using 'find'
 */
function findTestContext(dir) {
  logDebug(`Explore dir for testContext.json: ${dir}`);
  if (!fs.existsSync(dir)) {
    logWarn(`Directory does not exist: ${dir}`);
    return null;
  }
  const found = findFirstByName(dir, "testContext.json");
  if (found) {
    logOk(`Found testContext.json at ${found}`);
    return found;
  }
  logDebug(`No testContext.json under ${dir}`);
  return null;
}

/**
 * Find hmrc-api-requests.jsonl under a directory using 'find'
 */
function findHmrcApiRequests(dir) {
  logDebug(`Explore dir for hmrc-api-requests.jsonl: ${dir}`);
  if (!fs.existsSync(dir)) {
    logWarn(`Directory does not exist: ${dir}`);
    return null;
  }
  const found = findFirstByName(dir, "hmrc-api-requests.jsonl");
  if (found) {
    logOk(`Found hmrc-api-requests.jsonl at ${found}`);
    return found;
  }
  logDebug(`No hmrc-api-requests.jsonl under ${dir}`);
  return null;
}

/**
 * Find figures.json in a directory using 'find'
 */
function findFiguresJson(dir) {
  logDebug(`Explore dir for figures.json: ${dir}`);
  if (!fs.existsSync(dir)) {
    logWarn(`Directory does not exist: ${dir}`);
    return null;
  }
  const found = findFirstByName(dir, "figures.json");
  if (found) {
    logOk(`Found figures.json at ${found}`);
    return found;
  }
  logDebug(`No figures.json under ${dir}`);
  return null;
}

/**
 * Try to locate a test-specific directory that matches the provided testName.
 * Prefers an exact match, then any subdirectory whose name starts with the testName.
 */
function findMatchingTestDir(baseDir, testName) {
  const exact = path.join(baseDir, testName);
  if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) return exact;

  // Find candidate dirs starting with the test name
  let candidates = [];
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(`${testName}`)) {
        const full = path.join(baseDir, entry.name);
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(full).mtimeMs;
        } catch (_) {}
        candidates.push({ full, mtimeMs });
      }
    }
  } catch (e) {
    logWarn(`Failed to scan for matching test dir in ${baseDir}: ${e.message}`);
  }

  if (candidates.length === 0) return null;

  // Prefer most recently modified directory
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const chosen = candidates[0]?.full ?? null;
  if (chosen) logInfo(`Matched test directory for '${testName}': ${chosen}`);
  return chosen;
}

/**
 * Regex patterns for status detection (compiled once for performance)
 */
const STATUS_PATTERNS = {
  passed: /(\d+)\s+passed/i,
  failed: /(\d+)\s+failed/i,
  skipped: /(\d+)\s+skipped/i,
  allPassed: /All\s+tests?\s+passed/i,
  checkPassed: /✓.*passed/i,
};

/**
 * Check if playwright report exists and extract test status
 * Sources status (and failedTests when available) ONLY from .last-run.json
 * in target/behaviour-test-results. No HTML parsing fallback.
 */
function getPlaywrightReportStatus(testName) {
  const indexPath = path.join(REPORTS_DIR, "index.html");
  const exists = fs.existsSync(indexPath);
  logInfo(`Playwright HTML report ${exists ? "exists" : "missing"}: ${indexPath}`);

  // Start with defaults
  const result = { exists, status: "unknown" };

  // Prefer .last-run.json for authoritative status and failedTests
  try {
    const lastRunPath = path.join(RESULTS_DIR, ".last-run.json");
    if (fs.existsSync(lastRunPath)) {
      logDebug(`Reading last-run metadata from ${lastRunPath}`);
      const content = fs.readFileSync(lastRunPath, "utf-8");
      const lastRun = JSON.parse(content);
      if (typeof lastRun.status === "string") {
        result.status = lastRun.status;
      }
      if (Array.isArray(lastRun.failedTests)) {
        result.failedTests = lastRun.failedTests;
      }
      const ftPreview = Array.isArray(result.failedTests) ? truncList(result.failedTests) : [];
      logOk(`Derived test status from .last-run.json: ${result.status}${ftPreview.length ? `, failedTests: ${ftPreview.length}` : ""}`);
      if (ftPreview.length) logDebug(`Failed tests preview: ${JSON.stringify(ftPreview)}`);
    } else {
      logWarn(`.last-run.json not found in ${RESULTS_DIR}`);
    }
  } catch (e) {
    logWarn(`Failed to read .last-run.json: ${e.message}`);
  }
  logInfo(`Test outcome: ${result.status}`);
  return result;
}

// (Legacy auto-derivation helpers removed)

/**
 * Find screenshots and videos for a test, preferring curated figures.json
 */
function findTestArtifacts(testName) {
  const artifacts = {
    screenshots: [],
    videos: [],
    figures: null,
  };

  // Look in behaviour test results directory
  if (!fs.existsSync(RESULTS_DIR)) {
    logWarn(`No test results dir for '${testName}': ${RESULTS_DIR}`);
    return artifacts;
  }

  // Determine a likely test-specific directory
  const testDir = findMatchingTestDir(RESULTS_DIR, testName);

  // First, try to read figures.json which contains curated screenshots
  const figuresPath = (testDir && findFiguresJson(testDir)) || findFiguresJson(RESULTS_DIR);
  if (figuresPath && fs.existsSync(figuresPath)) {
    try {
      const figuresData = JSON.parse(fs.readFileSync(figuresPath, "utf-8"));
      artifacts.figures = figuresData;
      // Extract screenshot filenames from figures.json
      artifacts.screenshots = figuresData.map((fig) => fig.filename).filter((f) => f != null && f !== "");
      logOk(`Read figures.json (${figuresPath}) with ${artifacts.screenshots.length} curated screenshots`);
      const preview = truncList(artifacts.screenshots);
      if (preview.length) logDebug(`Screenshot preview: ${preview.join(", ")}`);

      // Also copy figures.json to a stable location for workers
      try {
        const dest = path.join(OUTPUT_DIR, `${testName}-figures.json`);
        fs.copyFileSync(figuresPath, dest);
        logOk(`Copied figures.json to ${dest}`);
      } catch (copyErr) {
        logWarn(`Failed to copy figures.json: ${copyErr.message}`);
      }
    } catch (e) {
      logWarn(`Failed to read figures.json at ${figuresPath}: ${e.message}`);
    }
  }

  // If no figures.json, fall back to finding all screenshots
  if (artifacts.screenshots.length === 0) {
    // Recursively find screenshots and videos
    function findFiles(dir, relativePath = "") {
      logDebug(`Scan directory for screenshots: ${dir}`);
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          logDebug(`Enter dir: ${fullPath}`);
          findFiles(fullPath, relPath);
        } else if (entry.isFile()) {
          if (entry.name.endsWith(".png") || entry.name.endsWith(".jpg") || entry.name.endsWith(".jpeg")) {
            artifacts.screenshots.push(relPath);
            logInfo(`Found screenshot: ${relPath}`);
          }
        }
      }
    }

    try {
      const scanRoot = testDir || RESULTS_DIR;
      logInfo(`Scan screenshots starting at: ${scanRoot}`);
      findFiles(scanRoot);
      const preview = truncList(artifacts.screenshots);
      if (artifacts.screenshots.length) logDebug(`Found ${artifacts.screenshots.length} screenshots (preview: ${preview.join(", ")})`);
    } catch (e) {
      logWarn(`Failed to find test artifacts: ${e.message}`);
    }
  }

  // Find video for this specific test (should be only one at root level)
  // Videos are typically named with timestamps, look for .webm or .mp4 at the root of RESULTS_DIR
  try {
    const entries = fs.readdirSync(RESULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith(".webm") || entry.name.endsWith(".mp4"))) {
        artifacts.videos.push(entry.name);
        logOk(`Found video: ${entry.name}`);
      }
    }
  } catch (e) {
    logWarn(`Failed to find videos: ${e.message}`);
  }

  return artifacts;
}

/**
 * Generate a test report JSON file
 */
function generateTestReport(testName, testContextPath, hmrcApiRequestsPath, overrides = {}) {
  logStep(`Generating report for: ${testName}`);

  // Read testContext.json
  let testContext = {};
  if (testContextPath && fs.existsSync(testContextPath)) {
    try {
      const size = fs.statSync(testContextPath)?.size;
      testContext = JSON.parse(fs.readFileSync(testContextPath, "utf-8"));
      logOk(`Read testContext from ${testContextPath} (${fmtBytes(size)})`);
      const keys = Object.keys(testContext || {});
      if (keys.length) logDebug(`testContext keys: ${keys.join(", ")}`);
    } catch (e) {
      logWarn(`Failed to read testContext: ${e.message}`);
    }
  } else {
    logInfo(`No testContext found for ${testName}`);
  }

  // Read hmrc-api-requests.jsonl
  let hmrcApiRequests = [];
  logInfo(`Reading HMRC API requests from: ${hmrcApiRequestsPath}`);
  if (hmrcApiRequestsPath && fs.existsSync(hmrcApiRequestsPath)) {
    try {
      hmrcApiRequests = readJsonlFile(hmrcApiRequestsPath);
      logOk(`Read ${hmrcApiRequests.length} HMRC API requests`);
      const preview = truncList(hmrcApiRequests.map((r) => r?.request?.url || r?.url || "?"));
      if (preview.length) logDebug(`API request URL preview: ${preview.join(", ")}`);
    } catch (e) {
      logWarn(`Failed to read HMRC API requests: ${e.message}`);
    }
  } else {
    logInfo(`No HMRC API requests found for ${testName}`);
  }

  // Get playwright report status
  const playwrightReport = getPlaywrightReportStatus(testName);

  // Get test source file (CLI-provided; no auto-derivation)
  const testSourceFile = overrides.testSourceFile ?? null;
  if (testSourceFile) {
    logOk(`Read test source file: ${testSourceFile.filename}`);
  }

  // Get environment config (CLI-provided; no auto-derivation)
  const envConfig = overrides.envConfig ?? null;
  if (envConfig) {
    logOk(`Read environment config: ${envConfig.filename}`);
  }

  // Get test artifacts (screenshots and videos)
  const artifacts = findTestArtifacts(testName);
  if (artifacts.screenshots.length > 0) {
    logOk(`Found ${artifacts.screenshots.length} screenshot(s)`);
  }
  if (artifacts.videos.length > 0) {
    logOk(`Found ${artifacts.videos.length} video(s)`);
  }

  // Prefer explicit testId from testContext when present
  const finalTestName = (testContext && typeof testContext.testId === "string" && testContext.testId.trim()) || testName;

  // Build report object
  const report = {
    testName: finalTestName,
    generatedAt: new Date().toISOString(),
    testContext,
    hmrcApiRequests,
    playwrightReport,
    testSourceFile,
    envConfig,
    artifacts,
  };

  // Named after the suite the workflow passes as --testName, which the upload job looks for as
  // test-report-<suite>.json. Every suite's testId equals its suite name for the same reason: the
  // publish script finds the html-report under target/test-reports/<testName>/.
  const reportFileName = `test-report-${testName}.json`;
  const reportPath = path.join(OUTPUT_DIR, reportFileName);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const payload = JSON.stringify(report, null, 2);
  fs.writeFileSync(reportPath, payload, "utf-8");
  try {
    const size = fs.statSync(reportPath)?.size;
    logOk(`Generated ${reportFileName} (${fmtBytes(size)})`);
  } catch (_) {
    logOk(`Generated ${reportFileName}`);
  }
  return reportFileName;
}

/**
 * Find test-specific data in behaviour test results
 * Returns both testContext.json and hmrc-api-requests.jsonl for a specific test
 */
function findTestData(testName) {
  // Try to find a directory matching this test name in the behaviour test results
  if (!fs.existsSync(RESULTS_DIR)) {
    logWarn(`Results directory missing: ${RESULTS_DIR}`);
    return { testContextPath: null, hmrcApiRequestsPath: null };
  }

  // Look for test-specific subdirectory first
  const testSpecificDir = path.join(RESULTS_DIR, testName);
  if (fs.existsSync(testSpecificDir)) {
    logInfo(`Searching test-specific data in ${testSpecificDir}`);
    const testContextPath = findTestContext(testSpecificDir);
    const hmrcApiRequestsPath = findHmrcApiRequests(testSpecificDir);
    logDebug(`findTestData result (specific): testContext=${!!testContextPath}, api=${!!hmrcApiRequestsPath}`);
    return { testContextPath, hmrcApiRequestsPath };
  }

  // Fallback to searching entire results directory
  logInfo(`Searching fallback data in ${RESULTS_DIR}`);
  const testContextPath = findTestContext(RESULTS_DIR);
  const hmrcApiRequestsPath = findHmrcApiRequests(RESULTS_DIR);
  logDebug(`findTestData result (fallback): testContext=${!!testContextPath}, api=${!!hmrcApiRequestsPath}`);

  return { testContextPath, hmrcApiRequestsPath };
}

/**
 * Main execution
 */
function main() {
  logStep("=== Generating Test Reports ===");
  logInfo(`Project root: ${PROJECT_ROOT}`);
  logInfo(`Results directory: ${RESULTS_DIR}`);
  logInfo(`Reports directory: ${REPORTS_DIR}`);
  logInfo(`Output directory: ${OUTPUT_DIR}`);
  logDebug(`Node ${process.version} | cwd=${process.cwd()}`);
  console.log("");

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Parse CLI arguments
  const args = parseCliArgs();
  if (args.help) {
    console.log(
      `\nUsage (direct mode):\n  node scripts/generate-test-reports.js --testName <name> [--testFile <path>] [--envFile <path>]\n`,
    );
    process.exit(0);
  }

  if (!args.testName) {
    console.error("\nError: --testName is required.\n");
    console.log(`Usage:\n  node scripts/generate-test-reports.js --testName <name> [--testFile <path>] [--envFile <path>]\n`);
    process.exit(1);
  }

  // Direct mode only: explicit testName (and optional file paths)
  const testName = args.testName;
  logOk(`Direct mode: generating report for test '${testName}'`);

  const overrides = {
    testSourceFile: args.testFile ? readFilePayload(args.testFile, "test file") : null,
    envConfig: args.envFile ? readFilePayload(args.envFile, "env file") : null,
  };

  const { testContextPath, hmrcApiRequestsPath } = findTestData(testName);
  generateTestReport(testName, testContextPath, hmrcApiRequestsPath, overrides);

  // Rebuild index file by scanning all test-report-*.json in OUTPUT_DIR
  const indexPath = path.join(OUTPUT_DIR, "test-reports-index.txt");
  const reportFiles = (fs.existsSync(OUTPUT_DIR) ? fs.readdirSync(OUTPUT_DIR) : [])
    .filter((f) => f.startsWith("test-report-") && f.endsWith(".json"))
    .sort();
  fs.writeFileSync(indexPath, reportFiles.map((f) => f + "\n").join(""), "utf-8");

  console.log("");
  logStep("=== Test Report Generation Complete ===");
}

main();
