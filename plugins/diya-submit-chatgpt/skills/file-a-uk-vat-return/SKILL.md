---
name: file-a-uk-vat-return
description: Work out a UK VAT return from the user's saved books and show the nine boxes. Use when the user asks to do, prepare, check or file a VAT return, a quarter's VAT, Making Tax Digital VAT, or asks what a past VAT receipt said.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

Use the DIY Accounting Submit plugin. It works out the return. The user files it in the browser.

1. Call `list_books` to list the user's saved books. Ask which book and which VAT quarter if the user has not said.
2. Call `open_book` with that book's `bookId`. Say which business and period the book covers. Stop if the book is not VAT registered.
3. Call `derive_vat_return` with `periodEnd` set to the last day of the quarter, as `YYYY-MM-DD`. The book must carry that month end. If the tool refuses, give its reason in plain words and ask for another period.
4. Show the nine boxes in a table: box number, what it holds, amount. Boxes 1 to 5 are in pounds and pence. Boxes 6 to 9 are in whole pounds. Say that the figures come from the user's own book, and name the three or four largest lines behind boxes 1 and 4.
5. Call `prepare_vat_return` with the same `periodEnd`. It answers a link to the VAT form with the figures filled in. Give the user the link and tell them to check and file in the browser:
   1. Open the link and sign in.
   2. Connect to HMRC when the page asks, then choose the obligation for this period.
   3. Read the figures on the page. They must match your table. The page works out boxes 3 and 5.
   4. Tick the declaration and submit.
6. When the user comes back, call `list_vat_receipts` to find the receipt, then `get_vat_receipt` with its name. Read out the receipt: the period, the boxes filed and the date and time HMRC received it.

What you never do:

- Never say that a return is filed, or that you filed it. No tool in this plugin files a return or pays HMRC. The user files on the Submit page, from the link `prepare_vat_return` gave.
- Never fill in, change or round a figure that `derive_vat_return` returned. Show it as it is.
- Never tick or describe the legal declaration for the user. The user reads it and ticks it.
- Never guess a period, a VAT registration number or a figure. Ask.
- Never give tax advice. Say what the book shows and where the rule lives on gov.uk.
