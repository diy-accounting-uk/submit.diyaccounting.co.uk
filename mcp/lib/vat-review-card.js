// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-25 Show a VAT return as a card inside the assistant
// - **Use when:** an assistant that renders MCP Apps views should show the nine VAT boxes as a card with a button that opens the VAT form.
// - **Does:** vat-review-card.js serves vat-review-card.html as the ui:// resource that derive_vat_return and prepare_vat_return name in their _meta. The page is static HTML and script with no network call; it reads the tool result the host posts to it and draws the nine boxes, and for prepare_vat_return it asks the host to open the link.
// - **Run:** no command; an MCP Apps host reads the resource when it lists the tools
// - **Entry:** `mcp/lib/vat-review-card.js:registerVatReviewCard`; `mcp/lib/vat-review-card.html`
// - **Files:** mcp/lib/vat-review-card.js, mcp/lib/vat-review-card.html, mcp/test/vat-review-card.test.js
// - **Keywords:** mcp apps, ui resource, review card, vat boxes card, ui://, text/html;profile=mcp-app
// - **Related:** MCP-01, MCP-05, MCP-24
// @end-capability

// vat-review-card.js -- the review card's resource and the _meta the two VAT tools carry to name it.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VAT_REVIEW_CARD_URI = "ui://diya-submit/vat-review-card.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

// The tools that show the card; the resource is registered only when one of them is.
export const VAT_REVIEW_CARD_TOOLS = ["derive_vat_return", "prepare_vat_return"];

export const VAT_REVIEW_CARD_TOOL_META = { ui: { resourceUri: VAT_REVIEW_CARD_URI } };

const CARD_HTML_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "vat-review-card.html");

export function vatReviewCardHtml() {
  return readFileSync(CARD_HTML_PATH, "utf8");
}

/**
 * Registers the card's ui:// resource on the server. The empty domain lists state the card's
 * content security policy: it loads nothing and connects to nothing.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerVatReviewCard(server) {
  server.registerResource(
    "vat-review-card",
    VAT_REVIEW_CARD_URI,
    {
      title: "VAT return review card",
      description: "The nine VAT boxes of a derived return as a card, with a button that opens the VAT form to check and file.",
      mimeType: MCP_APP_MIME_TYPE,
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MCP_APP_MIME_TYPE,
          text: vatReviewCardHtml(),
          _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
        },
      ],
    }),
  );
}
