// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The markup of one FAQ entry, written without the DOM so the help page script in the browser and
// the build script that writes the committed help page produce the same HTML from faqs.toml.

const CATEGORY_LABELS = {
  "connection": "Connection",
  "submission": "Submission",
  "bundles": "Bundles",
  "receipts": "Receipts",
  "vat-basics": "VAT Basics",
  "errors": "Errors",
};

export function formatFaqCategory(category) {
  return CATEGORY_LABELS[category] || category;
}

export function escapeFaqHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Bold text (**text**) and markdown links ([text](url)). Links are read by position, not by one
// regular expression, so a long entry cannot make the match backtrack.
export function renderFaqInline(text) {
  const bold = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  let output = "";
  let i = 0;
  while (i < bold.length) {
    if (bold[i] === "[") {
      const closeBracket = bold.indexOf("]", i + 1);
      if (closeBracket !== -1 && bold[closeBracket + 1] === "(") {
        const closeParen = bold.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = bold.slice(i + 1, closeBracket);
          const url = bold.slice(closeBracket + 2, closeParen);
          output += `<a href="${url}" target="_blank" rel="noopener">${linkText}</a>`;
          i = closeParen + 1;
          continue;
        }
      }
    }
    output += bold[i];
    i++;
  }
  return output;
}

function renderFaqTable(rows) {
  if (rows.length === 0) return "";
  const parseRow = (row) =>
    row
      .split("|")
      .filter((cell) => cell.trim())
      .map((cell) => cell.trim());
  const header = parseRow(rows[0]).map((cell) => `<th>${renderFaqInline(cell)}</th>`);
  const body = rows.slice(1).map(
    (row) =>
      `<tr>${parseRow(row)
        .map((cell) => `<td>${renderFaqInline(cell)}</td>`)
        .join("")}</tr>`,
  );
  return `<table class="faq-table"><thead><tr>${header.join("")}</tr></thead><tbody>${body.join("")}</tbody></table>`;
}

export function renderFaqMarkdown(text) {
  const lines = text.trim().split("\n");
  const result = [];
  let listTag = null;
  let tableRows = null;

  const closeList = () => {
    if (listTag) result.push(`</${listTag}>`);
    listTag = null;
  };
  const closeTable = () => {
    if (tableRows) result.push(renderFaqTable(tableRows));
    tableRows = null;
  };
  const openList = (tag) => {
    if (listTag === tag) return;
    closeList();
    result.push(`<${tag}>`);
    listTag = tag;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeList();
      tableRows ??= [];
      if (!/^\|[-\s|]+\|$/.test(trimmed)) tableRows.push(line);
      continue;
    }
    closeTable();
    if (/^\d+\.\s+/.test(trimmed)) {
      openList("ol");
      result.push(`<li>${renderFaqInline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
    } else if (trimmed.startsWith("- ")) {
      openList("ul");
      result.push(`<li>${renderFaqInline(trimmed.substring(2))}</li>`);
    } else if (trimmed === "") {
      closeList();
    } else {
      closeList();
      result.push(`<p>${renderFaqInline(trimmed)}</p>`);
    }
  }
  closeList();
  closeTable();
  return result.join("\n");
}

// One entry as the help page shows it: the question is a heading that holds the accordion button,
// the answer follows hidden until the button opens it.
export function renderFaqItem(faq) {
  return `
      <div class="faq-item" data-id="${faq.id}">
        <h2 class="faq-heading">
          <button class="faq-question" aria-expanded="false">
            <span class="faq-category-badge">${formatFaqCategory(faq.category)}</span>
            <span class="faq-question-text">${escapeFaqHtml(faq.question)}</span>
            <svg class="faq-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </h2>
        <div class="faq-answer" hidden>
          ${renderFaqMarkdown(faq.answer)}
        </div>
      </div>
    `;
}
