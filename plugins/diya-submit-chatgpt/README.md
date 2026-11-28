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

Version 0.1.8 lists the thirty tools prod's connector serves (`hostedToolNames("prod")` in `mcp/lib/hosted-tools.js`): the DIYA-GL book tools that list, open, read and check a person's records (`list_books`, `open_book`, `report`, `trial_balance`, `checks`, `lines`, `chart`, `book`), the ones that change them with an undo or start a new DIYA-GL book (`edit_lines`, `undo_book_change`, `new_book`, `roll_forward`, `new_book_from_register`), the upload and download links (`extract_book`, `save_workbook`), the VAT, accounts and Company Tax Return derivations and the links that open each form with the figures filled in, the rules, help and format tools (`look_up_rule`, `find_help`, `book_format`), the filing deadlines and the stored receipts. The subtitle is "Bookkeeping, VAT and accounts". No tool files a return or accounts, or pays. A person files in the browser from the link a `prepare_` tool gives.

The plugin sells nothing. No text in the package names a plan, a price or an offer, and its links go to the connector page `mcp.html`, the privacy policy, the terms, the walk-through video and the source repository. None of them goes to the Bundles page, where an account can subscribe, or to the home page, which states prices. `review.commerce` is `false`, and `review.commerce_description` says that a person signs in to an existing account and uses what it already has.
