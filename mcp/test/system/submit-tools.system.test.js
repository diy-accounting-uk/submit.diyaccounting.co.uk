// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Runs the Submit-facing tools against the simulator lane (npm run start:simulator): the
// local Express server over dynalite and the HTTP simulator that stands in for HMRC. The HMRC
// grant is started through request_hmrc_authorisation and completed as the callback page would,
// so no tool takes an HMRC token. The tools take whatever open obligation the simulator answers;
// no period key is written here.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listVatObligations,
  submitVatReturn,
  getVatReceipt,
  requestHmrcAuthorisation,
  requestCompaniesHouseCodes,
  submitMicroEntityAccounts,
  pollSubmission,
  listAccountsReceipts,
} from "../../lib/submit-tools.js";
import { createSession } from "../../lib/book-tools.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..");
const SIMULATOR_VRN = "111222333";
const USER_SUB = "mcp-system-test-user";
const SIMULATOR_COMPANY_NUMBER = "00000001";
const SIMULATOR_COMPANY_AUTH_CODE = "AB12CD";
const ACCOUNTS_CASES = JSON.parse(readFileSync(join(REPOSITORY_ROOT, "scripts/fixtures/companies-house-test-service-cases.json"), "utf8"));
const ORIGINAL_ACCOUNTS_CASE = ACCOUNTS_CASES.find((testCase) => testCase.name === "micro-entity-accounts");
const REVISED_ACCOUNTS_CASE = ACCOUNTS_CASES.find((testCase) => testCase.name === "micro-entity-accounts-revised");
const POLL_BUDGET = 10;

// The accounts fields of a test-service case, filed for the simulator's company.
function accountsFiling(testCase) {
  return {
    companyNumber: SIMULATOR_COMPANY_NUMBER,
    companyName: testCase.companyName,
    periodStart: testCase.periodStart,
    periodEnd: testCase.periodEnd,
    balanceSheet: testCase.balanceSheet,
    averageEmployees: testCase.averageEmployees,
    director: testCase.director,
    statementsAccepted: testCase.statementsAccepted,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unsignedJwt(sub) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = { sub, email: `synthetic-${sub}@test.diyaccounting.co.uk`, iat: issuedAt, exp: issuedAt + 3600 };
  return [encode({ alg: "none", typ: "JWT" }), encode(claims), ""].join(".");
}

describe("Submit-facing tools against the simulator lane", () => {
  let simulator;
  let configDir;
  let baseUrl;
  let session;
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
    session = createSession({ credentials: { accessToken: async () => token, idToken: async () => token }, pollBudgetMs: 30_000 });
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

    const authorised = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
    const grant = await fetch(`${baseUrl}/api/v1/bundle`, {
      method: "POST",
      headers: authorised,
      body: JSON.stringify({ bundleId: "day-guest" }),
    });
    expect(grant.ok).toBe(true);
    const issued = await fetch(`${baseUrl}/api/v1/pass/admin`, {
      method: "POST",
      headers: authorised,
      body: JSON.stringify({
        passTypeId: "resident-ltd",
        bundleId: "resident-ltd",
        validityPeriod: "P1D",
        maxUses: 1,
        createdBy: "mcp-system-test",
        testPass: true,
      }),
    });
    const issuedBody = await issued.json();
    expect(issued.ok, JSON.stringify(issuedBody)).toBe(true);
    const redeemed = await fetch(`${baseUrl}/api/v1/pass`, {
      method: "POST",
      headers: authorised,
      body: JSON.stringify({ code: issuedBody?.data?.code || issuedBody?.code }),
    });
    expect(redeemed.ok).toBe(true);
  });

  // The user typing the company authentication code on the link request_companies_house_codes
  // answers: the same PUT the codes page sends.
  async function enteredCodes(companyNumber) {
    const codes = await requestCompaniesHouseCodes(session, { kind: "accounts", companyNumber });
    const entered = await fetch(`${baseUrl}/api/v1/mcp/codes-entries/${encodeURIComponent(codes.entryId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ companyAuthCode: SIMULATOR_COMPANY_AUTH_CODE }),
    });
    expect(entered.ok).toBe(true);
    return codes.entryId;
  }

  async function pollUntilSettled(submissionNumber) {
    for (let poll = 1; poll <= POLL_BUDGET; poll++) {
      const polled = await pollSubmission(session, { kind: "accounts", submissionNumber });
      if (polled.statusCode !== "PENDING") return polled;
      await sleep(1000);
    }
    throw new Error(`Submission ${submissionNumber} was still PENDING after ${POLL_BUDGET} polls`);
  }

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

  it("files accounts, finds their receipt with list_accounts_receipts, and files the revision that names it, refused for another period", async () => {
    const original = await submitMicroEntityAccounts(session, {
      ...accountsFiling(ORIGINAL_ACCOUNTS_CASE),
      codesEntryId: await enteredCodes(SIMULATOR_COMPANY_NUMBER),
    });
    expect(original.submissionNumber).toBeTruthy();
    expect((await pollUntilSettled(original.submissionNumber)).statusCode).toBe("ACCEPT");

    const listed = await listAccountsReceipts(session, {});
    const revisable = listed.receipts.find(
      (receipt) =>
        receipt.revisable &&
        receipt.companyNumber === SIMULATOR_COMPANY_NUMBER &&
        receipt.periodStart === REVISED_ACCOUNTS_CASE.periodStart &&
        receipt.periodEnd === REVISED_ACCOUNTS_CASE.periodEnd,
    );
    expect(revisable).toMatchObject({ status: "accepted", accountsType: "micro-entity", revisedAccounts: false });

    const yearEarlier = (isoDate) => `${Number(isoDate.slice(0, 4)) - 1}${isoDate.slice(4)}`;
    await expect(
      submitMicroEntityAccounts(session, {
        ...accountsFiling(REVISED_ACCOUNTS_CASE),
        periodStart: yearEarlier(REVISED_ACCOUNTS_CASE.periodStart),
        periodEnd: yearEarlier(REVISED_ACCOUNTS_CASE.periodEnd),
        revision: { ...REVISED_ACCOUNTS_CASE.revision, revisesReceipt: revisable.name },
        codesEntryId: await enteredCodes(SIMULATOR_COMPANY_NUMBER),
      }),
    ).rejects.toThrow(/cannot replace them/);

    const revised = await submitMicroEntityAccounts(session, {
      ...accountsFiling(REVISED_ACCOUNTS_CASE),
      revision: { ...REVISED_ACCOUNTS_CASE.revision, revisesReceipt: revisable.name },
      codesEntryId: await enteredCodes(SIMULATOR_COMPANY_NUMBER),
    });
    expect(revised.submissionNumber).toBeTruthy();
    expect((await pollUntilSettled(revised.submissionNumber)).statusCode).toBe("ACCEPT");

    const relisted = await listAccountsReceipts(session, {});
    const revisedReceipt = relisted.receipts.find((receipt) => receipt.revisedAccounts);
    expect(revisedReceipt).toMatchObject({ companyNumber: SIMULATOR_COMPANY_NUMBER, revisable: false });
    expect(relisted.receipts.find((receipt) => receipt.name === revisable.name)).toMatchObject({ revisable: true });
  });

  it("starts an HMRC grant, lists open obligations, files a return for one and fetches its receipt", async () => {
    const authorisation = await requestHmrcAuthorisation(session, { hmrcAccount: "synthetic" });
    const authoriseUrl = new URL(authorisation.url);
    authoriseUrl.searchParams.set("autoGrant", "true");
    const consent = await fetch(authoriseUrl, { redirect: "manual" });
    expect(consent.status).toBe(302);
    const returned = new URL(consent.headers.get("location"));
    expect(returned.pathname).toBe("/activities/submitVatCallback.html");
    const callback = await fetch(`${baseUrl}/api/v1/mcp/hmrc-grants/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: returned.searchParams.get("code"), state: returned.searchParams.get("state") }),
    });
    expect(await callback.json()).toEqual({ state: "granted" });

    const listed = await listVatObligations(session, { vrn: SIMULATOR_VRN, status: "O" });
    const obligations = listed.obligations ?? listed.hmrcResponse?.obligations;
    expect(Array.isArray(obligations)).toBe(true);
    const open = obligations.find((obligation) => obligation.status === "O") ?? obligations[0];
    expect(open).toBeTruthy();

    const submitted = await submitVatReturn(session, {
      vatNumber: SIMULATOR_VRN,
      periodStart: open.start,
      periodEnd: open.end,
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

    const receipt = await getVatReceipt(session, { name: `${submitted.receiptId}.json` });
    expect(receipt).toBeTruthy();
  });
});
