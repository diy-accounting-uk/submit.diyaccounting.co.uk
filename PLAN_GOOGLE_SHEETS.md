<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Google Sheets support

Status: introduction only, 2026-09-26. No tasks yet.

## User assertions (verbatim)

> I think the artefact whether diya-gl or spreadsheets or .zip or .xlsx should have been saved as
> a DIY format. If someone converts it to Google Sheets I don't think we can reliably predict the
> conversion to handle a further conversion back to .xlxs. Create a separate plan doc with just an
> intro for Google Sheets support, here we are offering Google Drive storeage and retrival of DIY
> Accounting authored files.

## Introduction

`PLAN_BOOKS_TO_SUBMIT.md` stores and retrieves DIY Accounting authored files on the customer's
own Google Drive: a diya-gl zip, a spreadsheets `.xlsx` or package zip, and a books zip. Those
files keep the exact structure the diya-gl reader recognises by content. A file Drive holds as a
native Google Sheet is refused there with a message asking for the DIY Accounting file.

Customers who keep their books in Google Sheets are the audience for this plan. A workbook
converted to a native Sheet can change in ways the reader does not expect: formulas Google
rewrites, formats and named ranges it drops or renames, sheets a customer reorders or edits in
place. Converting it back to `.xlsx` through Drive's export does not restore the original
structure reliably.

The open problem is reading the customer's figures from a native Sheet without relying on a
round trip to `.xlsx`. Candidate directions for when this plan is designed: reading the Sheet
directly through the Google Sheets API with a mapping that tolerates Google's rewrites; a DIY
Accounting template published as a Google Sheet, whose structure the reader knows; or a check
that compares an exported `.xlsx` with the expected structure and names what differs. Until a
design is chosen, a native Sheet is refused with a message.
