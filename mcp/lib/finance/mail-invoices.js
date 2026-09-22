// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// mail-invoices.js -- supplier invoices staged into diya-gl purchases lines,
// read from the already-indexed mailbox through corpus-loom's CLI rather than
// a Gmail harvester: the invoice emails and their PDF attachments already sit
// under the mail mirror and are already searchable, so this module only
// shells out to `corpus search` and `corpus doc` and turns what comes back
// into lines. It stages nothing to disk and reads no .eml file itself.

import { execFile } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// This file lives at <workspace>/submit.diyaccounting.co.uk/mcp/lib/finance/,
// and the corpus CLI and its config live at <workspace>/index/. Four levels
// up from here is the workspace root every sibling repository shares.
const WORKSPACE_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CORPUS_BIN = resolvePath(WORKSPACE_ROOT, "index", ".venv", "bin", "corpus");
const CORPUS_CONFIG = resolvePath(WORKSPACE_ROOT, "index", "corpus.toml");

/**
 * Run the corpus CLI and parse its JSON stdout. The one seam tests replace:
 * every other function in this module takes it as a parameter instead of
 * calling it directly, so a test can hand in two recorded, redacted
 * documents instead of shelling out to a live index.
 * @param {string[]} args - full argv after the `corpus` binary, e.g.
 *   ["search", "--config", CORPUS_CONFIG, "--source", "mail-antony", ..., "--json", query]
 * @returns {Promise<Object|Array>} the parsed JSON the CLI printed
 */
export async function runCorpus(args) {
  const { stdout } = await execFileAsync(CORPUS_BIN, args, { maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout);
}

const CURRENCY_SYMBOLS = { "£": "GBP", "$": "USD", "€": "EUR" };

// The mailbox renders a non-breaking space between a currency amount and its
// code ("196.00" + NBSP + "GBP"). Built from a character code rather than
// typed into a regex or string literal, so the source carries no invisible
// character for a reader or a linter to trip over.
const NON_BREAKING_SPACE = String.fromCharCode(160);

// A TOML/European amount uses a comma as its decimal point ("196,39"); a
// thousands-grouped amount uses both ("1,234.56"). Either way the last comma
// or dot in the string is the decimal point and everything before it is an
// integer part with its grouping characters stripped.
function parseAmount(raw) {
  const cleaned = raw.trim();
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalAt = Math.max(lastComma, lastDot);
  if (decimalAt === -1) return Number(cleaned);
  const wholePart = cleaned.slice(0, decimalAt).replace(/[.,]/g, "");
  const fractionPart = cleaned.slice(decimalAt + 1);
  return Number(`${wholePart}.${fractionPart}`);
}

// A token such as "$84.00", "£196.00 GBP", "196.00 GBP" or "EUR 165.28": an
// optional leading currency symbol or three-letter code, the digits, and an
// optional trailing three-letter code. A trailing code wins over a leading
// one, and either wins over a symbol, when more than one is present.
function extractAmountToken(text) {
  const cleaned = text.split(NON_BREAKING_SPACE).join(" ").trim();
  const numberMatch = cleaned.match(/\d[\d.,]*/);
  if (!numberMatch) return null;
  const symbolMatch = cleaned.match(/^([£$€])/);
  const leadingCodeMatch = cleaned.match(/^([A-Z]{3})\b/);
  const trailingCodeMatch = cleaned.match(/([A-Z]{3})$/);
  const currency =
    (trailingCodeMatch && trailingCodeMatch[1]) ||
    (leadingCodeMatch && leadingCodeMatch[1]) ||
    (symbolMatch && CURRENCY_SYMBOLS[symbolMatch[1]]) ||
    "GBP";
  return { currency, amount: parseAmount(numberMatch[0]) };
}

// AWS's VAT invoice PDF prints its total in a two-column layout that
// pdftotext (-layout) collapses onto one line: the label anywhere in the
// line, the amount as the line's last token, e.g.
// "...  TOTAL AMOUNT                    EUR 165.28" or, on a receipt,
// "Total amount due    USD 12.34". Matched case-insensitively because the
// billing-statement email and the invoice PDF capitalise it differently.
// eslint-disable-next-line security/detect-unsafe-regex -- linear time regex, no backtracking risk
const AWS_PDF_TOTAL_LABEL = /total amount(?:\s+due)?/i;

// Google Workspace/Cloud's invoice PDF prints the same way, with the
// currency in the label rather than the amount: "Total in GBP ... £28.00".
// The lookbehind keeps this off the PDF's "Subtotal in GBP" line (the
// pre-VAT figure), which would otherwise match as a substring.
const GOOGLE_PDF_TOTAL_LABEL = /(?<!sub)total in [A-Z]{3}\b/i;

// Three shapes seen in the mailbox: an AWS billing-statement email body
// ("Total in USD: $84.00"), a Google/PayPal-style receipt block where
// "Total" stands alone on its own line and the amount is the next non-blank
// line, and a PDF invoice attachment's own total line (AWS's "TOTAL AMOUNT"
// or Google's "Total in <CCY>", both trailing the amount at line end,
// pdftotext having collapsed the printed layout onto one line). A hit with
// none of these is not an invoice this module can post -- most search hits
// are account-security notices, not bills -- so it is skipped rather than
// guessed at.
function findInvoiceTotal(content) {
  if (!content) return null;

  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    const statementMatch = line.match(/^Total in ([A-Z]{3}):/);
    if (statementMatch) {
      const [prefix, currency] = statementMatch;
      const numberMatch = line.slice(prefix.length).match(/\d[\d.,]*/);
      if (numberMatch) return { currency, amount: parseAmount(numberMatch[0]) };
    }

    if (line === "Total") {
      for (let next = index + 1; next < lines.length; next += 1) {
        const candidate = lines[next].trim();
        if (candidate === "") continue;
        return extractAmountToken(candidate);
      }
    }

    const awsPdfMatch = line.match(AWS_PDF_TOTAL_LABEL);
    if (awsPdfMatch) {
      const token = extractAmountToken(line.slice(awsPdfMatch.index + awsPdfMatch[0].length));
      if (token) return token;
    }

    const googlePdfMatch = line.match(GOOGLE_PDF_TOTAL_LABEL);
    if (googlePdfMatch) {
      const token = extractAmountToken(line.slice(googlePdfMatch.index + googlePdfMatch[0].length));
      if (token) return token;
    }
  }

  return null;
}

function findDocumentReference(title, content) {
  const titleMatch = title && title.match(/Invoice (?:ID|number):\s*([\w-]+)/i);
  if (titleMatch) return titleMatch[1];
  const contentMatch = content && content.match(/Invoice (?:number|ID)[:\s]+([\w-]+)/i);
  if (contentMatch) return contentMatch[1];
  return undefined;
}

function compact(line) {
  return Object.fromEntries(Object.entries(line).filter(([, value]) => value !== undefined));
}

/**
 * Supplier invoices for a period, read through the mailbox index rather
 * than harvested and stored: each configured supplier is searched for by
 * name over `mail-antony` within the period, every hit's extracted text is
 * fetched, and every hit that carries a recognisable total becomes one
 * `purchases`/`invoice` diya-gl line.
 * @param {{from: string, to: string, suppliers: Array<{name: string, taxCode: string, accountMainID: string, accountMainDescription?: string}>}} period
 * @param {{runCorpus?: (args: string[]) => Promise<Object|Array>}} [deps]
 * @returns {Promise<Array<Object>>} diya-gl lines, unvalidated against any book
 */
export async function invoiceLinesForPeriod({ from, to, suppliers }, { runCorpus: runCorpusFn = runCorpus } = {}) {
  if (!from || !to) throw new Error("invoiceLinesForPeriod requires from and to dates");
  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    throw new Error("invoiceLinesForPeriod requires at least one supplier");
  }

  const lines = [];
  for (const supplier of suppliers) {
    const hits = await runCorpusFn([
      "search",
      "--config",
      CORPUS_CONFIG,
      "--source",
      "mail-antony",
      "--since",
      from,
      "--until",
      to,
      "--json",
      supplier.name,
    ]);

    for (const hit of hits) {
      const doc = await runCorpusFn(["doc", "--config", CORPUS_CONFIG, "--json", hit.source, hit.path]);
      const total = findInvoiceTotal(doc.content);
      if (!total) continue;

      const postingDate = (hit.date || doc.doc_date || "").slice(0, 10);
      lines.push(
        compact({
          sourceJournalID: "purchases",
          documentType: "invoice",
          postingDate,
          documentDate: postingDate,
          accountMainID: supplier.accountMainID,
          accountMainDescription: supplier.accountMainDescription,
          amount: total.amount,
          amountCurrency: total.currency,
          taxCode: supplier.taxCode,
          documentReference: findDocumentReference(doc.title, doc.content),
          detailComment: supplier.name,
        }),
      );
    }
  }
  return lines;
}
