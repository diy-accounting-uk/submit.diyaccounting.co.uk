// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/ctReturnTokenCost.browser.test.js
// What a customer sees above the send button of the Company Tax Return page: the token cost of
// what the send step will send, the balance, the exhausted states and the refusal message.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PAGE_URL = "http://localhost:3000/companies-house/fileCompanyTaxReturn.html";
const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const BOOK_DIRECTORY = path.join(process.cwd(), "fixtures/diya-gl/precision-code-ltd");
const SHOTS_DIR = path.join(process.cwd(), "target/browser-test-results/ct-return-token-cost");
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const PREVIEW_BOXES = { 3: "8596148860", 30: "2025-04-01", 35: "2026-03-31", 440: 12345.67, 475: 12345.67 };
const TOKENS_EXHAUSTED = {
  status: 403,
  body: { message: "Token limit reached", reason: "tokens_exhausted", tokensRemaining: 0 },
};

const LONG_ANSWERS = {
  utr: "8596148860",
  periodStart: "2025-01-01",
  periodEnd: "2026-03-31",
  currentTurnover: "250000",
  currentCostOfSales: "50000",
  currentAdministrativeExpenses: "81000",
  currentInterestReceivable: "1000",
  currentTax: "24962",
  currentDebtors: "10000",
  currentCashAtBank: "116100",
  currentTradeCreditors: "5000",
  currentCorporationTax: "24962",
  currentTaxationSocialSecurity: "1000",
  currentCalledUpShareCapital: "100",
  currentProfitAndLossAccount: "95038",
  principalActivity: "Software consultancy",
  accountingPolicies: "The accounts are prepared under FRS 102 section 1A.",
  directors: "Alex Example",
  averageEmployees: "2",
  directorName: "Alex Example",
  directorDateApproved: "2026-06-30",
  declarantName: "Alex Example",
  nonTradingLoanRelationshipCredits: "1000",
  depreciation: "6000",
  donations: "2000",
  donationsPaid: "2000",
  donationsPaidAp2: "0",
  annualInvestmentAllowance: "12000",
  mainPoolAllowances: "1800",
  mainPoolAllowancesAp2: "363",
};

async function typeLongForm(page, extra = {}) {
  for (const [id, value] of Object.entries({ ...LONG_ANSWERS, ...extra })) await page.locator(`#${id}`).fill(value);
  await page.locator("#loansMadeAp2Yes").check();
  await page.locator("#loanName1Ap2").fill("Alex Example");
  await page.locator("#loanAmount1Ap2").fill("15000");
  for (const id of [
    "statementSection477Exemption",
    "statementMembersNotRequiredAudit",
    "statementDirectorsResponsibilities",
    "statementSmallCompaniesRegime",
    "declarationAccepted",
  ]) {
    await page.locator(`#${id}`).check();
  }
}

const LONG_COMPUTATION_LINES = {
  profitLossPerAccounts: 120000,
  nonTradingLoanRelationshipCredits: 1000,
  depreciation: 6000,
  amortisation: 0,
  entertaining: 0,
  donations: 2000,
  adjustedProfitBeforeAccountingPeriodAdjustments: 127000,
  totalCapitalAllowances: 13800,
};
const FIRST_RETURN_BOXES = {
  "3": "8596148860",
  "30": "2025-01-01",
  "35": "2025-12-31",
  "50": "yes",
  "85A": "yes",
  "305": 2000,
  "440": 19273.46,
  "475": 19273.46,
};
const SECOND_RETURN_BOXES = {
  "3": "8596148860",
  "30": "2026-01-01",
  "35": "2026-03-31",
  "50": "yes",
  "85A": "yes",
  "440": 5688.68,
  "480": 5062.5,
  "475": 5688.68,
};
const LONG_PREVIEW = (secondBoxes = SECOND_RETURN_BOXES) => ({
  periodOfAccount: { periodStart: "2025-01-01", periodEnd: "2026-03-31" },
  accountsIxbrl: "<html/>",
  returns: [
    {
      part: 1,
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      boxes: FIRST_RETURN_BOXES,
      computationsIxbrl: "<html/>",
      computationLines: {
        ...LONG_COMPUTATION_LINES,
        timeApportionment: -25121,
        adjustedProfitBeforeCapitalAllowances: 101879,
        adjustedProfit: 88079,
      },
      taxDueDate: "2026-10-01",
      returnDueDate: "2027-03-31",
    },
    {
      part: 2,
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      boxes: secondBoxes,
      computationsIxbrl: "<html/>",
      computationLines: {
        ...LONG_COMPUTATION_LINES,
        totalCapitalAllowances: 363,
        timeApportionment: -101879,
        adjustedProfitBeforeCapitalAllowances: 25121,
        adjustedProfit: 24758,
      },
      taxDueDate: "2027-01-01",
      returnDueDate: "2027-03-31",
    },
  ],
});
const IRMARKS = { A1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", A2: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" };

const balanceOf = (granted, remaining, extra = {}) => ({
  bundles: [{ bundleId: "resident-ltd", allocated: true, tokensGranted: granted, tokensRemaining: remaining, ...extra }],
});

// The server's answers, which a test changes between steps: the balance, the preview and what
// each post answers.
function newServer(overrides = {}) {
  return {
    balance: balanceOf(10, 7),
    previewBody: null,
    ctPost: () => ({ status: 200, body: { correlationId: "CORR0001", irmark: IRMARKS.A1, pollIntervalSeconds: 1 } }),
    accountsPost: () => ({ status: 200, body: { submissionNumber: "S1", pollInterval: 1 } }),
    ctPoll: (correlationId) => ({ statusCode: "ACCEPT", correlationId, irmark: IRMARKS.A1, irmarkReceipt: IRMARKS.A1 }),
    accountsPoll: () => ({ statusCode: "ACCEPT", submissionNumber: "S1" }),
    ctPosts: [],
    accountsPosts: [],
    ...overrides,
  };
}

async function serveSite(page, server) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "user@example.com" }));
    } catch {
      // storage can be blocked; the page then asks for sign-in
    }
  });
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    const method = route.request().method();
    if (url.pathname === "/submit.environment-name.txt") {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "ci" });
    } else if (url.pathname === "/api/v1/bundle") {
      await json(route, 200, server.balance);
    } else if (url.pathname === "/api/v1/companies-house/company/12345678") {
      await json(route, 200, { companyNumber: "12345678", companyName: "Precision Code Ltd" });
    } else if (url.pathname === "/api/v1/hmrc/ct/return/preview") {
      await json(route, 200, server.previewBody ?? DEFAULT_PREVIEW);
    } else if (url.pathname === "/api/v1/hmrc/ct/return" && method === "POST") {
      const body = JSON.parse(route.request().postData());
      server.ctPosts.push(body);
      const reply = server.ctPost(body);
      await json(route, reply.status, reply.body);
    } else if (url.pathname === "/api/v1/companies-house/accounts" && method === "POST") {
      const body = JSON.parse(route.request().postData());
      server.accountsPosts.push(body);
      const reply = server.accountsPost(body);
      await json(route, reply.status, reply.body);
    } else if (url.pathname.startsWith("/api/v1/hmrc/ct/return/") && method === "GET") {
      await json(route, 200, server.ctPoll(url.pathname.split("/").pop()));
    } else if (url.pathname.startsWith("/api/v1/companies-house/accounts/") && method === "GET") {
      await json(route, 200, server.accountsPoll());
    } else if (url.pathname.startsWith("/api/")) {
      await json(route, 200, {});
    } else {
      const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        await route.fulfill({
          status: 200,
          contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
          body: fs.readFileSync(filePath),
        });
      } else {
        await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
      }
    }
  });
}

const COMPUTATION_LINES = Object.fromEntries(
  ["profitLossPerAccounts", "nonTradingLoanRelationshipCredits", "depreciation", "amortisation", "entertaining", "donations"].map(
    (name) => [name, 1],
  ),
);
const DEFAULT_PREVIEW = {
  boxes: PREVIEW_BOXES,
  computationLines: { ...COMPUTATION_LINES, adjustedProfitBeforeCapitalAllowances: 2, totalCapitalAllowances: 1, adjustedProfit: 1 },
  computationsIxbrl: "<html/>",
};

async function openForm(page, server, viewport = { width: 1280, height: 900 }) {
  await page.setViewportSize(viewport);
  await serveSite(page, server);
  await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
  await page.locator("#companyNumber").fill("12345678");
  await page.locator("#companyLookupBtn").click();
  await expect(page.locator("#formView")).toBeVisible();
}

async function zippedBook() {
  const zip = new JSZip();
  zip.file("book.toml", fs.readFileSync(path.join(BOOK_DIRECTORY, "book.toml")));
  zip.file("lines.jsonl", fs.readFileSync(path.join(BOOK_DIRECTORY, "lines.jsonl")));
  return zip.generateAsync({ type: "nodebuffer" });
}

async function typeShortForm(page) {
  await page
    .locator("#booksImportFile")
    .setInputFiles({ name: "book.diya-gl.zip", mimeType: "application/zip", buffer: await zippedBook() });
  await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
  await page.locator("#regimeSmall").check();
  await page.locator("#utr").fill("8596148860");
  for (const id of [
    "statementSection477Exemption",
    "statementMembersNotRequiredAudit",
    "statementDirectorsResponsibilities",
    "statementSmallCompaniesRegime",
    "declarationAccepted",
  ]) {
    await page.locator(`#${id}`).check();
  }
}

const SCENARIOS = {
  "single": { long: false, both: false },
  "long": { long: true, both: false },
  "joint": { long: false, both: true },
  "joint long": { long: true, both: true },
};

async function reachReview(page, server, scenario, viewport) {
  const { long, both } = SCENARIOS[scenario];
  if (long) server.previewBody = LONG_PREVIEW();
  await openForm(page, server, viewport);
  if (long) await typeLongForm(page);
  else await typeShortForm(page);
  if (both) await page.locator("#sendToBoth").check();
  await page.locator("#previewBtn").click();
  await expect(page.locator("#previewView")).toBeVisible();
}

async function screenshot(page, name, { viewportOnly = false } = {}) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const width = page.viewportSize().width;
  if (viewportOnly) {
    // What the customer sees right after the refusal, before any scrolling of their own.
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-viewport-${width}.png`) });
    return;
  }
  // Let the button's colour transition and the scroll settle before the picture.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.locator(".send-step").screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`) });
  await page.screenshot({ fullPage: true, path: path.join(SHOTS_DIR, `${name}-page-${width}.png`) });
}

const slug = (text) => text.replace(/ /g, "-");

async function signIn(page, { accounts = false } = {}) {
  if (accounts) await page.locator("#companyAuthCode").fill("ABC123");
  await page.locator("#gatewayUserId").fill("gateway-user");
  await page.locator("#gatewayPassword").fill("gateway-password");
}

test.describe("The Company Tax Return page token cost", () => {
  const COSTS = [
    ["single", "This return costs 1 token. You have 7 left."],
    ["long", "The two returns cost 1 token between them. You have 7 left."],
    ["joint", "The accounts and the return cost 2 tokens. You have 7 left."],
    ["joint long", "The accounts and the two returns cost 2 tokens. You have 7 left."],
  ];

  for (const width of [1280, 390])
    for (const [scenario, sentence] of COSTS)
      test(`states the cost of a ${scenario} filing above the send button, tied to it, at ${width} pixels`, async ({ page }) => {
        await reachReview(page, newServer(), scenario, { width, height: 900 });
        await expect(page.locator("#submissionCost")).toHaveText(sentence);
        await expect(page.locator("#submitReturnBtn")).toBeEnabled();
        await expect(page.locator("#submitReturnBtn")).toHaveAttribute("aria-describedby", "submissionCost");
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        await screenshot(page, slug(`${scenario}-balance`));
      });

  test("states the cost alone and leaves the button enabled when the balance cannot be read", async ({ page }) => {
    await reachReview(page, newServer({ balance: { bundles: [] } }), "single");
    await expect(page.locator("#submissionCost")).toHaveText("This return costs 1 token.");
    await expect(page.locator("#submitReturnBtn")).toBeEnabled();
  });

  test("says the allowance is unlimited for an unlimited grant", async ({ page }) => {
    await reachReview(page, newServer({ balance: balanceOf("unlimited", 0) }), "joint");
    await expect(page.locator("#submissionCost")).toHaveText("The accounts and the return cost 2 tokens. You have unlimited tokens.");
  });

  test("return 2 of 2 on its own costs no token, because return 1 used the token for both", async ({ page }) => {
    const server = newServer({
      ctPost: (body) => ({
        status: 200,
        body: { correlationId: `CORR000${body.longPeriod.part}`, irmark: IRMARKS.A1, pollIntervalSeconds: 1 },
      }),
    });
    // Return 2 of 2 is rejected, so the customer comes back with only it left to send.
    server.ctPoll = (correlationId) =>
      correlationId.endsWith("2")
        ? { statusCode: "REJECT", correlationId, irmark: IRMARKS.A2, businessErrors: [{ number: "9043", text: "Check box 435" }] }
        : {
            statusCode: "ACCEPT",
            correlationId,
            irmark: IRMARKS.A1,
            irmarkReceipt: IRMARKS.A1,
            receiptId: "2026-11-12T10:01:00.000Z-CORR0001",
          };
    await reachReview(page, server, "long");
    await signIn(page);
    await page.locator("#submitReturnBtn").click();
    await expect(page.locator("#tryAgainBtn")).toBeVisible({ timeout: 30_000 });
    await page.locator("#tryAgainBtn").click();
    await expect(page.locator("#sendStepHeading")).toHaveText("Send return 2 of 2 to HMRC");
    await expect(page.locator("#submissionCost")).toHaveText(
      "Return 2 of 2 costs no token. Return 1 used the token for both. You have 7 left.",
    );
    await expect(page.locator("#submitReturnBtn")).toBeEnabled();
    await screenshot(page, "return-2-only");
  });

  test("the send step of a long period tells the customer the sign-in goes with each return", async ({ page }) => {
    await reachReview(page, newServer(), "long");
    await expect(page.locator("#gatewayStored")).toHaveText("They are sent with each of the two returns and never stored.");
  });

  test.describe("when the balance falls short", () => {
    test("disables the button and says why when no token is left", async ({ page }) => {
      await reachReview(page, newServer({ balance: balanceOf(10, 0, { tokenResetAt: "2026-12-01T00:00:00.000Z" }) }), "single");
      await expect(page.locator("#submissionCost")).toContainText(
        "You have no tokens left. Your allowance refreshes on 1 December 2026, or you can add a bundle.",
      );
      await expect(page.locator('#submissionCost a[href="/bundles.html"]')).toHaveCount(1);
      await expect(page.locator("#submitReturnBtn")).toBeDisabled();
      await screenshot(page, "single-exhausted");
    });

    for (const width of [1280, 390])
      test(`one token left is not enough for a joint filing, and the warning says what it costs, at ${width} pixels`, async ({ page }) => {
        const server = newServer({ balance: balanceOf(10, 1, { tokenResetAt: "2026-12-01T00:00:00.000Z" }) });
        await reachReview(page, server, "joint", { width, height: 900 });
        await expect(page.locator("#submissionCost")).toContainText(
          "You have 1 token left and this filing costs 2. Your allowance refreshes on 1 December 2026, or you can add a bundle.",
        );
        await expect(page.locator("#submitReturnBtn")).toBeDisabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        await screenshot(page, "joint-one-left");
      });

    test("one token left is enough for the return alone", async ({ page }) => {
      await reachReview(page, newServer({ balance: balanceOf(10, 1) }), "single");
      await expect(page.locator("#submissionCost")).toHaveText("This return costs 1 token. You have 1 left.");
      await expect(page.locator("#submitReturnBtn")).toBeEnabled();
    });
  });

  for (const width of [1280, 390]) {
    test.describe(`a refusal at ${width} pixels`, () => {
      const viewport = { width, height: 900 };

      async function expectTheRefusal(page, server, sentence) {
        const banner = page.locator("#statusMessagesContainer .status-error");
        await expect(banner).toContainText(sentence);
        await expect(banner).toContainText("Tokens refresh at the start of the next period. Visit the Bundles page for more options.");
        await expect(banner).toHaveCount(1);
        await expect(banner).toBeInViewport();
        await expect(page.locator("#previewView")).toBeVisible();
        await expect(page.locator("#resultView")).toBeHidden();
        await expect(page.locator("#submitReturnBtn")).toBeDisabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        expect(server.balance).toBeDefined();
      }

      test("the accounts post of a joint filing is refused and nothing is sent", async ({ page }) => {
        const server = newServer({
          balance: balanceOf(10, 2),
          accountsPost: () => ({
            status: 403,
            body: { message: "Token limit reached", reason: "tokens_exhausted", tokensRemaining: 1, tokenCost: 2 },
          }),
        });
        await reachReview(page, server, "joint", viewport);
        await signIn(page, { accounts: true });
        server.balance = balanceOf(10, 1);
        await page.locator("#submitReturnBtn").click();
        await expectTheRefusal(
          page,
          server,
          "No tokens remaining. Your token allowance has been used, so nothing was sent to Companies House.",
        );
        await expect(page.locator("#submissionCost")).toContainText("You have 1 token left and this filing costs 2.");
        expect(server.ctPosts).toHaveLength(0);
        await screenshot(page, "joint-refused", { viewportOnly: true });
      });

      test("the return post is refused and says nothing was sent to HMRC", async ({ page }) => {
        const server = newServer({ balance: balanceOf(10, 1), ctPost: () => TOKENS_EXHAUSTED });
        await reachReview(page, server, "single", viewport);
        await signIn(page);
        server.balance = balanceOf(10, 0);
        await page.locator("#submitReturnBtn").click();
        await expectTheRefusal(page, server, "No tokens remaining. Your token allowance has been used, so nothing was sent to HMRC.");
        await expect(page.locator("#submissionCost")).toContainText("You have no tokens left.");
        await screenshot(page, "single-refused", { viewportOnly: true });
      });

      test("a return refused after the accounts were accepted says the accounts are filed", async ({ page }) => {
        const server = newServer({ balance: balanceOf(10, 2), ctPost: () => TOKENS_EXHAUSTED });
        await reachReview(page, server, "joint", viewport);
        await signIn(page, { accounts: true });
        server.balance = balanceOf(10, 0);
        await page.locator("#submitReturnBtn").click();
        await expectTheRefusal(page, server, "The accounts are filed with Companies House. No tokens remaining.");
        await expect(page.locator("#statusMessagesContainer")).toContainText("nothing was sent to HMRC");
        expect(server.accountsPosts).toHaveLength(1);
        await screenshot(page, "joint-return-refused", { viewportOnly: true });
      });
    });
  }

  test("the cost line fits a 390 pixel screen for each kind of filing", async ({ page }) => {
    for (const scenario of ["joint long"]) {
      await reachReview(page, newServer({ balance: balanceOf(10, 1) }), scenario, { width: 390, height: 900 });
      await expect(page.locator("#submissionCost")).toContainText("You have 1 token left and this filing costs 2.");
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      await screenshot(page, slug(`${scenario}-one-left`));
    }
  });
});
