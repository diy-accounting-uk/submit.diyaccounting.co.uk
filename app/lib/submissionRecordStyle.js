// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Generated from web/public/submission-record.css by scripts/generate-submission-record.mjs. Edit the source and run
// npm run generate:submission-record.

// The record layer of the submission record house style, for a document that can link to no
// stylesheet.
export const RECORD_STYLE = `
body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; background: #fff; margin: 0; }
.page { max-width: 180mm; margin: 0 auto; padding: 12mm 10mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.cover { text-align: center; padding-top: 40mm; }
.cover-name { font-size: 16pt; font-weight: bold; margin-bottom: 18mm; }
.cover-title { font-size: 13pt; font-weight: bold; margin-top: 14mm; }
.cover-line { margin: 2mm 0; }
.entity { text-align: center; font-size: 13pt; font-weight: bold; margin: 0; }
.reference { text-align: center; margin: 1mm 0 4mm 0; }
h2 { text-align: center; font-size: 12pt; margin: 2mm 0; }
h3 { font-size: 11pt; margin: 6mm 0 2mm 0; }
.subtitle { text-align: center; margin: 0 0 6mm 0; }
table.statement { width: 100%; border-collapse: collapse; margin: 4mm 0; }
table.statement th, table.statement td { padding: 1mm 2mm; vertical-align: bottom; }
table.statement th.label, table.statement td.label { text-align: left; }
table.statement td.indent { padding-left: 8mm; }
table.statement th.note, table.statement td.note { width: 10mm; text-align: center; }
table.statement th.figure { text-align: right; width: 24mm; font-weight: bold; }
table.statement td.figure { text-align: right; width: 24mm; white-space: nowrap; }
table.statement td.positive { padding-right: 3.2mm; }
table.statement tr.heading td { font-weight: bold; padding-top: 3mm; }
table.statement tr.subtotal td.figure { border-top: 1px solid #000; }
table.statement tr.total td { font-weight: bold; }
table.statement tr.total td.figure { border-top: 1px solid #000; border-bottom: 3px double #000; }
.approval { margin-top: 6mm; }
.signature { margin-top: 8mm; }
`;
