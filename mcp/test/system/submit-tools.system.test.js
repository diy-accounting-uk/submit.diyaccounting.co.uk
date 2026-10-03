// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Runs the Submit-facing tools against the simulator lane (npm run start:simulator): the
// local Express server over dynalite and the HTTP simulator that stands in for HMRC. The tools
// take whatever open obligation the simulator answers; no period key is written here.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listVatObligations, submitVatReturn, getVatReceipt } from "../../lib/submit-tools.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..");
const SIMULATOR_VRN = "111222333";
const USER_SUB = "mcp-system-test-user";

function unsignedJwt(sub) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = { sub, email: `${sub}@example.com`, iat: issuedAt, exp: issuedAt + 3600 };
  return [encode({ alg: "none", typ: "JWT" }), encode(claims), ""].join(".");
}

describe("Submit-facing tools against the simulator lane", () => {
  let simulator;
  let configDir;
  let baseUrl;
  const previousEnvironment = {};

  beforeAll(async () => {
    simulator = spawn("/bin/bash", ["scripts/start-simulator.sh"], {
      cwd: REPOSITORY_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    baseUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The simulator lane did not report a listening address")), 100_000);
      let output = "";
      const onData = (chunk) => {
        output += chunk.toString();
        const match = output.match(/^Listening at (http:\/\/127\.0\.0\.1:\d+)/m);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      simulator.stdout.on("data", onData);
      simulator.stderr.on("data", onData);
      simulator.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`The simulator lane exited with ${code} before listening`));
      });
    });

    const token = unsignedJwt(USER_SUB);
    configDir = mkdtempSync(join(tmpdir(), "diya-submit-system-"));
    const expiresAt = Date.now() + 3_600_000;
    writeFileSync(
      join(configDir, "credentials.json"),
      JSON.stringify({
        refreshToken: "unused",
        idToken: token,
        idTokenExpiresAt: expiresAt,
        accessToken: token,
        accessTokenExpiresAt: expiresAt,
      }),
    );
    for (const [name, value] of [
      ["DIYA_SUBMIT_BASE_URL", baseUrl],
      ["DIYA_SUBMIT_CONFIG_DIR", configDir],
    ]) {
      previousEnvironment[name] = process.env[name];
      process.env[name] = value;
    }

    const grant = await fetch(`${baseUrl}/api/v1/bundle`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: "day-guest" }),
    });
    expect(grant.ok).toBe(true);
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (configDir) rmSync(configDir, { recursive: true, force: true });
    if (simulator?.pid) {
      try {
        process.kill(-simulator.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  });

  it("lists open obligations, files a return for one and fetches its receipt", async () => {
    const hmrcAccessToken = "simulator-hmrc-access-token";
    const listed = await listVatObligations(null, { vrn: SIMULATOR_VRN, status: "O", hmrcAccessToken });
    const obligations = listed.obligations ?? listed.hmrcResponse?.obligations;
    expect(Array.isArray(obligations)).toBe(true);
    const open = obligations.find((obligation) => obligation.status === "O") ?? obligations[0];
    expect(open).toBeTruthy();

    const submitted = await submitVatReturn(null, {
      vatNumber: SIMULATOR_VRN,
      periodStart: open.start,
      periodEnd: open.end,
      hmrcAccessToken,
      allowSyntheticObligations: true,
      vatDueSales: 100,
      vatDueAcquisitions: 0,
      vatReclaimedCurrPeriod: 20,
      totalValueSalesExVAT: 500,
      totalValuePurchasesExVAT: 100,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
    });
    expect(submitted.receipt).toBeTruthy();
    expect(submitted.receiptId).toBeTruthy();

    const receipt = await getVatReceipt(null, { name: `${submitted.receiptId}.json` });
    expect(receipt).toBeTruthy();
  });
});
