---
title: "A VAT return from an AI assistant: what the assistant does and what the browser does"
published: false
description: "An AI assistant works out the nine VAT boxes from your book. You check them and file in the browser."
tags: mcp, ai, tax, webdev
cover_image:
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

This post describes how an AI assistant and a browser share the work of one UK VAT return, and why we split the work the way we did. It is about DIY Accounting Submit™, a service that sends VAT returns to HMRC under Making Tax Digital.

## What the assistant does

The assistant reaches Submit through a hosted MCP connector. MCP is the Model Context Protocol, an open standard that lets an AI application call tools on another service.

To add the connector in Claude, open Settings, then Connectors, and add a custom connector with this address:

```
https://submit.diyaccounting.co.uk/mcp
```

Claude opens the sign-in page. You sign in with your Submit account, the same account the web app uses. In Claude Code the command is:

```
claude mcp add --transport http diya-submit https://submit.diyaccounting.co.uk/mcp
```

The connector has six tools:

| Tool | What it does |
| --- | --- |
| `list_books` | Lists the books saved in your DIYA cloud, newest first. |
| `open_book` | Opens one book. It reports the product, the period covered and the book's checks. |
| `derive_vat_return` | Works out the nine VAT return boxes for one period, with the lines that fed them. |
| `prepare_vat_return` | Works out the same figures and gives a link that opens the VAT form with them filled in. It files nothing. |
| `list_vat_receipts` | Lists the VAT receipts Submit stored for your account. |
| `get_vat_receipt` | Reads one stored receipt. |

A book is a small set of files behind a DIY Accounting Spreadsheets workbook. The figures come from the book's own lines, and the tool shows the lines that fed each box.

The connector does not reach HMRC and it files nothing.

## What the browser does

A VAT return ends in a legal declaration that the figures are true and complete. We keep that step in the browser, where a person ticks the declaration box and presses the submit button.

<!-- handoff-sentence -->
The assistant can also give you a link that opens the VAT form with the figures filled in. You check them, declare and file there, in your browser.

The web app signs you in to HMRC with HMRC's own permission page. HMRC's own page asks for the permission, and the person gives it there.

## Why we split it this way

Three facts decided the split.

1. The figures are arithmetic on a book, so a tool can produce them and show its working.
2. The declaration is a decision, so it needs a person.
3. The permission to act for the business belongs on HMRC's sign-in page.

An assistant can find the right book and the right period, and explain a box. It needs no HMRC permission to do that.

## Try it

Sign in to https://submit.diyaccounting.co.uk/ and take the free day pass. It opens the VAT activities for a day. After that Submit costs £9.99/yr or £0.99/mo. The connector page is https://submit.diyaccounting.co.uk/mcp.html.

If you build MCP tools for regulated filings, I would like to hear where you put the human step.
