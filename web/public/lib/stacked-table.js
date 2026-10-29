// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/stacked-table.js
// Copies each column heading onto the body cells of a data table as data-label, so the
// narrow-screen stylesheet can print each row as label and value pairs. Rows that script
// adds later are labelled too.

(function () {
  "use strict";

  const TABLE_SELECTOR = "table.data-table, table.rates-table";

  function columnLabels(table) {
    const head = table.tHead;
    const headingRows = head ? [...head.rows].filter((row) => !row.classList.contains("last-updated")) : [];
    if (headingRows.length === 0) return [];
    const labels = [];
    for (const cell of headingRows[headingRows.length - 1].cells) {
      for (let span = 0; span < cell.colSpan; span++) labels.push(cell.textContent.trim());
    }
    return labels;
  }

  function labelTable(table) {
    const labels = columnLabels(table);
    for (const body of table.tBodies) {
      for (const row of body.rows) {
        let column = 0;
        for (const cell of row.cells) {
          if (cell.tagName === "TD" && cell.colSpan === 1 && labels[column] && !cell.hasAttribute("data-label")) {
            cell.setAttribute("data-label", labels[column]);
          }
          column += cell.colSpan;
        }
      }
    }
  }

  function labelAllTables() {
    document.querySelectorAll(TABLE_SELECTOR).forEach(labelTable);
  }

  function start() {
    labelAllTables();
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        labelAllTables();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
