// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/productionHostAllowList.test.js
//
// Every request to HMRC or Companies House that needs header rules or a token goes through a
// submit API. This test finds the production host strings of both bodies in tracked, non-test
// files and fails for any file that is not named below with the case it covers. Sandbox hosts
// (test-api.service.hmrc.gov.uk, api-sandbox.*, identity-sandbox.*) do not match.

import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// HMRC production API, the Companies House XML Gateway endpoint (an XML namespace on the same
// host does not match), and the Companies House REST and identity hosts.
const PRODUCTION_HOST_PATTERN =
  /(?<![\w.-])api\.service\.hmrc\.gov\.uk|xmlgw\.companieshouse\.gov\.uk\/v1-0\/xmlgw|\/\/(?:api|identity)\.company-information\.service\.gov\.uk/;

const SCANNED_ROOTS = [
  "app/",
  "web/public/",
  "mcp/",
  "scripts/",
  ".github/",
  "infra/main/",
  "infra/hmrc/",
  "infra/companies-house/",
  "cdk-application/",
  "cdk-environment/",
  "package.json",
  ".env.ci",
  ".env.prod",
  ".env.proxy",
  ".env.test",
  ".env.simulator",
];

const EXCLUDED_SEGMENTS = ["/unit-tests/", "/system-tests/", "/browser-tests/", "/node_modules/", "/test/", "/tests/", "/fixtures/"];

// One entry per file, each with the case it covers. A directory is never listed.
const ALLOWED_FILES = {
  "app/lib/hmrcHosts.js": "names the HMRC production host so an outbound call record says live or test",
  "app/services/companiesHouseXmlGateway.js":
    "Lambda-side default XML Gateway address; the Lambda holds the presenter credentials and the test service uses the same address with GatewayTest set",
  "web/public/lib/services/companies-house-filing-service.js":
    "OAuth scope identifiers that Companies House requires on its live domain; the page makes no request to these hosts",
  ".env.prod": "production base URIs that the deployed Lambdas read",
  ".env.ci": "ci Lambdas read the public register with the API key and file to the XML Gateway with GatewayTest set",
  ".env.proxy": "the local server reads the public register with the API key",
  "package.json": "mcp:accounts-test-service-proof points the stdio MCP's Submit at the XML Gateway test service with GatewayTest set",
  "cdk-application/cdk.json": "production values the CDK passes to the Lambda environment",
  "infra/hmrc/hmrc.toml": "the registered HMRC production application, read by the developer hub sync",
  "infra/companies-house/companies-house.toml": "the registered Companies House application, read by the developer hub sync",
};

function trackedScannedFiles() {
  const listed = execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return listed
    .split("\0")
    .filter(Boolean)
    .filter((file) => SCANNED_ROOTS.some((root) => file === root || (root.endsWith("/") && file.startsWith(root))))
    .filter((file) => !EXCLUDED_SEGMENTS.some((segment) => `/${file}`.includes(segment)));
}

function filesWithProductionHosts() {
  const hits = [];
  for (const file of trackedScannedFiles()) {
    let text;
    try {
      text = readFileSync(resolve(repositoryRoot, file), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    if (PRODUCTION_HOST_PATTERN.test(text)) hits.push(file);
  }
  return hits;
}

describe("production HMRC and Companies House hosts", () => {
  const hits = filesWithProductionHosts();

  test("appear only in the named files", () => {
    const unlisted = hits.filter((file) => !(file in ALLOWED_FILES));
    expect(unlisted, "route the call through a submit API, or name the file in ALLOWED_FILES with its case").toEqual([]);
  });

  test("every named file still holds one", () => {
    const stale = Object.keys(ALLOWED_FILES).filter((file) => !hits.includes(file));
    expect(stale, "remove the entry").toEqual([]);
  });

  test("no entry names a directory", () => {
    expect(Object.keys(ALLOWED_FILES).filter((file) => file.endsWith("/"))).toEqual([]);
  });
});
