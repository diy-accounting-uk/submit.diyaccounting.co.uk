<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# DIY Accounting Submit for ChatGPT

The package source for the OpenAI plugin directory. It names one MCP server, `https://submit.diyaccounting.co.uk/mcp`, and one skill.

## Build the ZIP

```bash
npm run build:chatgpt-plugin
```

This writes `target/chatgpt-plugin/diya-submit.zip`. The ZIP holds `plugin.json`, `mcp.json`, `LICENSE`, `assets/` and `skills/`. It leaves out this README.

## Review test cases

`plugin.json` holds the review data under `extensions.com.openai.review`: the five positive and three negative cases and the walk-through URL. The platform imports them from the ZIP and shows them read-only. Reviewer credentials go in the portal form, never in the package.

## What the plugin offers

Six read tools: `list_books`, `open_book`, `derive_vat_return`, `prepare_vat_return`, `get_vat_receipt` and `list_vat_receipts`. No tool files a return or pays. A person files in the browser from the link `prepare_vat_return` gives.

The plugin sells nothing. No text in the package names a plan, a price or an offer, and its links go to the connector page `mcp.html`, the privacy policy, the terms, the walk-through video and the source repository. None of them goes to the Bundles page, where an account can subscribe, or to the home page, which states prices. `review.commerce` is `false`, and `review.commerce_description` says that a person signs in to an existing account and uses what it already has.
