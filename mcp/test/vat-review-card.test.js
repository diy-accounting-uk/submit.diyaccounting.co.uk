// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// vat-review-card.test.js -- the card's ui:// resource is listed and read through a client, the two
// VAT tools name it, and the page draws the nine boxes from a tool result with no network call.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Window } from "happy-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createSession, openBook } from "../lib/book-tools.js";
import { createServer } from "../lib/server.js";
import { HOSTED_TOOL_NAMES, hostedToolNames } from "../lib/hosted-tools.js";
import { prepareVatReturn } from "../lib/handoff-tools.js";
import { deriveVatReturn } from "../lib/vat-tools.js";
import { MCP_APP_MIME_TYPE, VAT_REVIEW_CARD_URI, vatReviewCardHtml } from "../lib/vat-review-card.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function connect(server) {
  const client = new Client({ name: "card-test", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
  return client;
}

// The card's page in a window whose parent records what the card posts.
function openCard() {
  const window = new Window({ settings: { disableJavaScriptEvaluation: false } });
  const posted = [];
  const parent = { postMessage: (message) => posted.push(message) };
  Object.defineProperty(window, "parent", { value: parent, configurable: true });
  const html = vatReviewCardHtml();
  window.document.write(html);
  // happy-dom does not run inline scripts of a written document, so the page's one script runs here.
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const deliver = (data) => window.dispatchEvent(new window.MessageEvent("message", { data, source: parent }));
  return { window, posted, deliver };
}

const text = (window, selector) => window.document.querySelector(selector)?.textContent;

describe("the review card resource", () => {
  let client;
  afterEach(async () => {
    await client?.close();
  });

  it("is listed and read as an MCP Apps html resource", async () => {
    client = await connect(createServer(createSession()));
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual([VAT_REVIEW_CARD_URI]);
    expect(resources[0].mimeType).toBe(MCP_APP_MIME_TYPE);
    const { contents } = await client.readResource({ uri: VAT_REVIEW_CARD_URI });
    expect(contents).toHaveLength(1);
    expect(contents[0].mimeType).toBe(MCP_APP_MIME_TYPE);
    expect(contents[0].text).toBe(vatReviewCardHtml());
    expect(contents[0]._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [] });
  });

  it("is named by derive_vat_return and prepare_vat_return and by no other tool", async () => {
    client = await connect(createServer(createSession()));
    const { tools } = await client.listTools();
    const named = tools.filter((tool) => tool._meta?.ui?.resourceUri === VAT_REVIEW_CARD_URI).map((tool) => tool.name);
    expect(named.sort()).toEqual(["derive_vat_return", "prepare_vat_return"]);
  });

  it("is registered on the prod hosted server, which serves derive_vat_return", async () => {
    expect(HOSTED_TOOL_NAMES).toContain("derive_vat_return");
    client = await connect(createServer(createSession(), { toolNames: hostedToolNames("prod") }));
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual([VAT_REVIEW_CARD_URI]);
  });

  it("is left out of a server that registers neither VAT tool", async () => {
    client = await connect(createServer(createSession(), { toolNames: ["list_books"] }));
    await expect(client.listResources()).rejects.toThrow(/Method not found/);
  });
});

describe("the review card page", () => {
  it("makes no network call and loads nothing from outside", () => {
    const html = vatReviewCardHtml();
    expect(html).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|import\s*\(/);
    expect(html).not.toMatch(/\b(?:src|href|action)\s*=\s*["']?(?:https?:)?\/\//i);
    expect(html).not.toMatch(/@import|\burl\(/);
  });

  describe("over the BrickWork Pro book", () => {
    let session;
    beforeAll(async () => {
      session = createSession();
      await openBook(session, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
      process.env.DIYA_SUBMIT_BASE_URL = "https://ci-example.submit.diyaccounting.co.uk";
      process.env.DIY_SUBMIT_BASE_URL = "https://ci-example.submit.diyaccounting.co.uk";
    });

    it("starts the handshake, then draws the nine boxes of derive_vat_return's result", async () => {
      const derived = await deriveVatReturn(session, { periodEnd: "2025-06-30" });
      const { window, posted, deliver } = openCard();
      expect(posted[0]).toMatchObject({ jsonrpc: "2.0", id: 1, method: "ui/initialize" });
      expect(posted[0].params.protocolVersion).toBe("2026-01-26");
      deliver({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2026-01-26" } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(posted.some((message) => message.method === "ui/notifications/initialized")).toBe(true);

      deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { content: [], structuredContent: derived } });
      const rows = [...window.document.querySelectorAll("tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));
      expect(rows).toHaveLength(9);
      expect(rows.map((row) => row[0])).toEqual(["Box 1", "Box 2", "Box 3", "Box 4", "Box 5", "Box 6", "Box 7", "Box 8", "Box 9"]);
      expect(rows[0][2]).toBe("£5,610.00");
      expect(rows[4][2]).toBe("£1,821.00");
      expect(rows[5][2]).toBe("£28,050");
      expect(rows[6][2]).toBe("£18,945");
      expect(text(window, ".period")).toBe("2025-04-01 to 2025-06-30");
      expect(window.document.getElementById("open-form")).toBeNull();
    });

    it("draws the nine boxes of prepare_vat_return's result and asks the host to open its link", async () => {
      const prepared = await prepareVatReturn(session, { periodEnd: "2025-06-30" });
      const { window, posted, deliver } = openCard();
      deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { content: [], structuredContent: prepared } });
      const amounts = [...window.document.querySelectorAll("tbody tr")].map((row) => row.lastElementChild.textContent);
      expect(amounts).toEqual(["£5,610.00", "£0.00", "£5,610.00", "£3,789.00", "£1,821.00", "£28,050", "£18,945", "£0", "£0"]);
      const button = window.document.getElementById("open-form");
      expect(button.textContent).toBe("Open the VAT form to check and file");
      button.click();
      const open = posted.find((message) => message.method === "ui/open-link");
      expect(open.params.url).toBe(prepared.link);
    });

    it("ignores a message that does not come from its parent", async () => {
      const derived = await deriveVatReturn(session, { periodEnd: "2025-06-30" });
      const { window } = openCard();
      window.dispatchEvent(
        new window.MessageEvent("message", {
          data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: derived } },
          source: window,
        }),
      );
      expect(window.document.querySelectorAll("tbody tr")).toHaveLength(0);
    });

    it("shows the tool's error text in place of the boxes", () => {
      const { window, deliver } = openCard();
      deliver({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { isError: true, content: [{ type: "text", text: "No book is loaded. Call open_book first." }] },
      });
      expect(text(window, "#card")).toBe("No book is loaded. Call open_book first.");
    });
  });
});
