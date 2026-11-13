<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# DIY Accounting Submit for ChatGPT

The package source for the OpenAI plugin directory. It names one MCP server, `https://submit.diyaccounting.co.uk/mcp`, and one skill.

## Build the ZIP

```bash
npm run build:chatgpt-plugin
```

This writes `target/chatgpt-plugin/diya-submit.zip`. The ZIP holds `plugin.json`, `mcp.json`, `LICENSE`, `assets/` and `skills/`. It leaves out this README and `review/`.

## Review test cases

`review/test-cases.json` holds the five positive and three negative cases that the submission form asks for. They stay outside the ZIP.

## What the plugin offers

Six read tools: `list_books`, `open_book`, `derive_vat_return`, `prepare_vat_return`, `get_vat_receipt` and `list_vat_receipts`. No tool files a return or pays. A person files in the browser from the link `prepare_vat_return` gives.

The plugin shows no plan, starts no subscription and links to no checkout. `https://submit.diyaccounting.co.uk/bundles.html` is an information page.
