// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// prod-tool-answers.test.js -- each of the six tools that prod's hosted connector serves answers
// its listed fields and no other, nested fields included, when Submit's routes answer every field
// they store. The privacy policy names each category these fields hold.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createSession, openBook, saveBook } from "../lib/book-tools.js";
import { createServer } from "../lib/server.js";
import { HOSTED_OVERRIDES, hostedToolNames } from "../lib/hosted-tools.js";
import { READS } from "../lib/tool-annotations.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const BOOK_ID = "6f1c1f0a-3b52-4c6e-9a41-1d0c5e7a2b01";
const RECEIPT_NAME = "2026-09-22T10:55:44.288Z-990458700288.json";

// The fields each tool answers, as dotted paths; "[]" stands for every element of an array.
const ANSWER_FIELDS = {
  list_books: ["books[].bookId", "books[].period.end", "books[].period.start", "books[].product", "books[].title"],
  open_book: [
    "bookChecks.fail",
    "bookChecks.pass",
    "bookChecks.warn",
    "entity",
    "failedChecks",
    "lineCount",
    "period.end",
    "period.start",
    "product",
  ],
  derive_vat_return: [
    ...["box1", "box2", "box3", "box4", "box5", "box6", "box7", "box8", "box9"].map((box) => `boxes.${box}`),
    "dueDate",
    ...[
      "netVatDue",
      "totalAcquisitionsExVAT",
      "totalValueGoodsSuppliedExVAT",
      "totalValuePurchasesExVAT",
      "totalValueSalesExVAT",
      "totalVatDue",
      "vatDueAcquisitions",
      "vatDueSales",
      "vatReclaimedCurrPeriod",
    ].map((field) => `hmrc.${field}`),
    ...["box1", "box4", "box6", "box7"].flatMap((box) =>
      ["account", "contributes", "counterparty", "date", "gross", "reference"].map((field) => `lines.${box}[].${field}`),
    ),
    ...["periodEnd", "purchasesNet", "purchasesVat", "salesNet", "salesVat"].map((field) => `months[].${field}`),
    "notes[]",
    "periodEnd",
    "periodKey",
    "periodStart",
    "scheme",
    "vatRegistrationNumber",
  ],
  prepare_vat_return: [
    ...[
      "totalAcquisitionsExVAT",
      "totalValueGoodsSuppliedExVAT",
      "totalValuePurchasesExVAT",
      "totalValueSalesExVAT",
      "vatDueAcquisitions",
      "vatDueSales",
      "vatReclaimedCurrPeriod",
    ].map((field) => `figures.${field}`),
    "instruction",
    "link",
    "period.periodEnd",
    "period.periodStart",
  ],
  list_vat_receipts: ["receipts[].filedOn", "receipts[].formBundleNumber", "receipts[].name"],
  get_vat_receipt: ["chargeRefNumber", "formBundleNumber", "paymentIndicator", "processingDate"],
};

// The fields the link of prepare_vat_return carries in its fragment, which the VAT form reads.
const LINK_FRAGMENT_FIELDS = [
  ...[
    "totalAcquisitionsExVAT",
    "totalValueGoodsSuppliedExVAT",
    "totalValuePurchasesExVAT",
    "totalValueSalesExVAT",
    "vatDueAcquisitions",
    "vatDueSales",
    "vatReclaimedCurrPeriod",
  ].map((field) => `figures.${field}`),
  "kind",
  "packageVersion",
  "period.periodEnd",
  "period.periodStart",
  "sourceFileName",
];

function fieldPaths(value, prefix = "") {
  if (Array.isArray(value)) {
    if (value.length === 0) return [prefix];
    return [...new Set(value.flatMap((element) => fieldPaths(element, `${prefix}[]`)))];
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => fieldPaths(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

const sorted = (paths) => [...new Set(paths)].sort();

// Every field diyaGlPut.js stores in a book's metadata.json.
function storedMetadata(latestETag) {
  return {
    formatVersion: 1,
    bookId: BOOK_ID,
    product: "ltd",
    title: "BrickWork Pro Ltd",
    latestVersion: 1,
    latestETag,
    latestSize: 41234,
    versions: [{ version: 1, etag: latestETag, size: 41234, createdAt: "2026-11-01T10:00:00.000Z" }],
    retention: "sandbox",
    expiresAt: "2026-12-06T10:00:00.000Z",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    periodCoveredStart: "2025-04-01",
    periodCoveredEnd: "2026-03-31",
    provenance: { source: "mcp" },
    entitlementAtPut: { retention: "sandbox", reason: "no-subscription", bundleId: null, checkedAt: "2026-11-01T10:00:00.000Z" },
  };
}

// Every field listUserReceipts in app/data/dynamoDbReceiptRepository.js answers for a row.
function receiptRow({ receiptId, kind = null }) {
  const formBundleNumber = receiptId.slice(receiptId.indexOf("Z-") + 2);
  return {
    receiptId,
    key: `receipts/a-cognito-sub/${receiptId}.json`,
    name: `${receiptId}.json`,
    timestamp: receiptId.slice(0, receiptId.indexOf("Z-") + 1),
    formBundleNumber,
    createdAt: "2026-09-22T10:55:45.000Z",
    lastModified: "2026-09-22T10:55:45.000Z",
    clientId: null,
    kind,
    jointFilingId: null,
    longPeriod: null,
    amended: false,
    size: 160,
  };
}

const STORED_VAT_RECEIPT = {
  processingDate: "2026-09-22T10:55:44.288Z",
  formBundleNumber: "990458700288",
  paymentIndicator: "DD",
  chargeRefNumber: "XM002610011594",
};

describe("the six tools prod's hosted connector serves", () => {
  let client;
  let zipBase64;

  beforeAll(async () => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://ci-submit.example.test";
    process.env.DIY_SUBMIT_BASE_URL = "https://ci-submit.example.test";
    const credentials = { accessToken: async () => "demo-user-bearer", idToken: async () => null };

    const saving = createSession({ credentials });
    await openBook(saving, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
    vi.stubGlobal("fetch", async (_url, init) => {
      zipBase64 = JSON.parse(init.body).zipBase64;
      return { ok: true, status: 200, json: async () => ({ metadata: { latestETag: "etag-1" } }) };
    });
    await saveBook(saving, { cloud: true, bookId: BOOK_ID });

    vi.stubGlobal("fetch", async (url) => {
      const path = new URL(url).pathname;
      const answer = (body) => ({ ok: true, status: 200, json: async () => body });
      if (path === "/api/v1/books") {
        return answer({ entitlement: { reason: "no-subscription", expiry: null, residentTier: true }, books: [storedMetadata("etag-1")] });
      }
      if (path === `/api/v1/books/${BOOK_ID}/versions/latest`) {
        return answer({ metadata: storedMetadata("etag-1"), version: 1, etag: "etag-1", zipBase64 });
      }
      if (path === "/api/v1/hmrc/receipt") {
        return answer({
          receipts: [
            receiptRow({ receiptId: RECEIPT_NAME.replace(".json", "") }),
            receiptRow({ receiptId: "2026-10-02T09:00:00.000Z-00005D", kind: "accounts" }),
            receiptRow({ receiptId: "2026-08-07T08:00:00.000Z-2025-26" }),
          ],
        });
      }
      if (path === `/api/v1/hmrc/receipt/${encodeURIComponent(RECEIPT_NAME)}`) return answer(STORED_VAT_RECEIPT);
      return { ok: false, status: 404, json: async () => ({ message: `no route ${path}` }) };
    });

    const server = createServer(createSession({ credentials }), { toolNames: hostedToolNames("prod"), overrides: HOSTED_OVERRIDES });
    client = new Client({ name: "prod-tool-answers-test", version: "1.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
  }, 60000);

  afterAll(async () => {
    await client?.close();
    vi.unstubAllGlobals();
    delete process.env.DIYA_SUBMIT_BASE_URL;
    delete process.env.DIY_SUBMIT_BASE_URL;
  });

  async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    return result.structuredContent;
  }

  it("lists exactly the six tools, each read-only, not destructive and closed to the outside world", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(Object.keys(ANSWER_FIELDS).sort());
    for (const tool of tools) {
      const { readOnlyHint, destructiveHint, openWorldHint } = tool.annotations;
      expect({ readOnlyHint, destructiveHint, openWorldHint }, tool.name).toEqual(READS);
    }
  });

  it("list_books answers each book's id, title, product and period only", async () => {
    const answer = await call("list_books");
    expect(sorted(fieldPaths(answer))).toEqual(sorted(ANSWER_FIELDS.list_books));
    expect(answer.books).toEqual([
      { bookId: BOOK_ID, title: "BrickWork Pro Ltd", product: "ltd", period: { start: "2025-04-01", end: "2026-03-31" } },
    ]);
  });

  it("open_book answers the product, the business name, the period, the line count and the checks only", async () => {
    const answer = await call("open_book", { bookId: BOOK_ID });
    expect(sorted(fieldPaths(answer))).toEqual(sorted(ANSWER_FIELDS.open_book));
    expect(answer.entity).toBe("BrickWork Pro Ltd");
  });

  it("derive_vat_return answers the boxes, the months and the journal lines with no entry or line numbers", async () => {
    const answer = await call("derive_vat_return", { periodEnd: "2025-06-30" });
    expect(sorted(fieldPaths(answer))).toEqual(sorted(ANSWER_FIELDS.derive_vat_return));
  });

  it("prepare_vat_return answers the link, the period, the seven figures and the instruction only", async () => {
    const answer = await call("prepare_vat_return", { periodEnd: "2025-06-30" });
    expect(sorted(fieldPaths(answer))).toEqual(sorted(ANSWER_FIELDS.prepare_vat_return));
    const fragment = JSON.parse(Buffer.from(answer.link.split("#books=")[1], "base64url").toString("utf8"));
    expect(sorted(fieldPaths(fragment))).toEqual(sorted(LINK_FRAGMENT_FIELDS));
  });

  it("list_vat_receipts answers the VAT return receipts as name, form bundle number and day filed only", async () => {
    const answer = await call("list_vat_receipts");
    expect(sorted(fieldPaths(answer))).toEqual(sorted(ANSWER_FIELDS.list_vat_receipts));
    expect(answer.receipts).toEqual([{ name: RECEIPT_NAME, formBundleNumber: "990458700288", filedOn: "2026-09-22" }]);
  });

  it("get_vat_receipt answers the four fields HMRC gave when it accepted the return only", async () => {
    const answer = await call("get_vat_receipt", { name: RECEIPT_NAME });
    expect(sorted(fieldPaths(answer))).toEqual(sorted(ANSWER_FIELDS.get_vat_receipt));
    expect(answer).toEqual(STORED_VAT_RECEIPT);
  });
});

describe("the privacy policy's part on the hosted MCP endpoint", () => {
  const page = readFileSync(new URL("../../web/public/privacy.html", import.meta.url), "utf8");
  const start = page.indexOf('<h3 id="hosted-mcp-answers">');
  const part = page.slice(start, page.indexOf("<h3", start + 1)).replaceAll(/\s+/g, " ");

  it("names each category of data the six tools send, the purpose, the recipients and the retention", () => {
    expect(start).toBeGreaterThan(0);
    const categories = ["saved books", "open book", "VAT registration number", "journal line", "counterparty", "link to the VAT form"];
    categories.push("form bundle number", "payment indicator", "charge reference");
    for (const phrase of [...categories, "Purpose", "Recipient", "OpenAI", "Anthropic", "Google", "Retention", "24 hours"]) {
      expect(part, phrase).toContain(phrase);
    }
  });
});
