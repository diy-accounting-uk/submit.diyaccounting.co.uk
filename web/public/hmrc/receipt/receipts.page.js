// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

function getIdToken() {
  return localStorage.getItem("cognitoIdToken");
}

// Accounts and Company Tax Return filings open on their own page, which draws the filed documents.
const FILING_KINDS = new Set(["companies-house-accounts", "company-tax-return"]);

async function fetchReceipts() {
  const idToken = getIdToken();
  const exportControls = document.getElementById("exportControls");
  const table = document.getElementById("receiptsTable");
  const tbody = table.querySelector("tbody");
  const empty = document.getElementById("emptyState");

  if (!idToken) return;

  const res = await window.fetchWithIdToken("/api/v1/hmrc/receipt", {});
  if (!res.ok) {
    tbody.innerHTML = "";
    table.style.display = "none";
    empty.textContent = "Failed to load receipts";
    empty.style.display = "block";
    exportControls.style.display = "none";
    return;
  }
  const json = await res.json();
  const items = Array.isArray(json.receipts) ? json.receipts : [];
  tbody.innerHTML = "";
  if (items.length === 0) {
    table.style.display = "none";
    empty.textContent = "No receipts yet.";
    empty.style.display = "block";
    exportControls.style.display = "none";
  } else {
    empty.style.display = "none";
    table.style.display = "table";
    exportControls.style.display = "block";
    for (const it of items) {
      const tr = document.createElement("tr");

      // Date cell
      const dateCell = document.createElement("td");
      dateCell.textContent = HmrcDisplayFormat.formatDateTime(it.timestamp);
      dateCell.className = "date-column";
      dateCell.setAttribute("data-label", "Date");

      // Receipt cell with clickable label and download icon
      const receiptCell = document.createElement("td");
      receiptCell.className = "receipt-cell";
      receiptCell.setAttribute("data-label", "Receipt");
      const receiptLabel = document.createElement("a");
      receiptLabel.className = "receipt-label";
      receiptLabel.textContent = it.formBundleNumber || it.name || "Unnamed receipt";
      if (FILING_KINDS.has(it.kind)) {
        receiptLabel.href = `../../companies-house/filings.html?receipt=${encodeURIComponent(it.name)}`;
      } else {
        receiptLabel.href = "#";
        receiptLabel.onclick = (e) => {
          e.preventDefault();
          viewReceipt(it.name);
        };
      }

      const downloadIcon = document.createElement("a");
      downloadIcon.className = "download-icon";
      downloadIcon.href = "#";
      downloadIcon.innerHTML = "⬇";
      downloadIcon.title = "Download receipt";
      downloadIcon.onclick = (e) => {
        e.preventDefault();
        downloadReceipt(it.name);
      };

      receiptCell.appendChild(receiptLabel);
      receiptCell.appendChild(downloadIcon);

      tr.appendChild(dateCell);
      tr.appendChild(receiptCell);
      tbody.appendChild(tr);
    }
  }
}

async function viewReceipt(name) {
  const res = await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(name)}`, {});
  if (!res.ok) return alert("Failed to fetch receipt");
  const text = await res.text();

  let receiptData;
  try {
    receiptData = JSON.parse(text);
  } catch (e) {
    // If not JSON, display as text
    receiptData = { content: text };
  }
  if (receiptData === null || typeof receiptData !== "object") receiptData = { content: receiptData };
  await displayReceiptTable(receiptData, name);
}

const RECEIPT_FIELD_NAMES = {
  processingDate: "Processing date",
  paymentIndicator: "Payment indicator",
  formBundleNumber: "Form bundle number",
  chargeRefNumber: "Charge reference number",
  periodId: "Period ID",
  submissionId: "Submission ID",
  calculationId: "Calculation ID",
  correlationId: "Correlation ID",
  taxYear: "Tax year",
  periodStartDate: "Start date",
  periodEndDate: "End date",
  href: "Link",
  rel: "Relation",
};

function receiptFieldName(key) {
  if (RECEIPT_FIELD_NAMES[key]) return RECEIPT_FIELD_NAMES[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// One entry per leaf value. Nested objects and arrays become "Parent: field" names.
function flattenReceipt(value, path, labelPrefix, entries) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      flattenReceipt(item, `${path}.${index}`, `${labelPrefix} ${index + 1}`, entries);
    });
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const label = receiptFieldName(key);
      flattenReceipt(child, path ? `${path}.${key}` : key, labelPrefix ? `${labelPrefix}: ${label.toLowerCase()}` : label, entries);
    }
  } else {
    entries.push({ field: path, label: labelPrefix, value });
  }
}

function receiptRows(data) {
  const entries = [];
  if (Array.isArray(data)) {
    flattenReceipt(data, "receipt", "Item", entries);
  } else {
    flattenReceipt(data, "", "", entries);
  }
  return entries;
}

function isHttpUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function displayAssistMessages(container, messages, acknowledgedAt) {
  container.replaceChildren();
  if (!messages) return;
  const section = document.createElement("section");
  section.className = "assist-messages-section";

  const heading = document.createElement("h4");
  heading.textContent = "HMRC feedback";
  section.appendChild(heading);

  const status = document.createElement("p");
  status.className = "assist-acknowledgement";
  status.textContent = acknowledgedAt
    ? `Acknowledged to HMRC on ${HmrcDisplayFormat.formatDateTime(acknowledgedAt)}`
    : "Not acknowledged to HMRC";
  section.appendChild(status);

  const messagesList = document.createElement("ol");
  messagesList.className = "assist-messages-list";

  for (const message of messages) {
    const li = document.createElement("li");
    li.className = "assist-message";

    const title = document.createElement("strong");
    title.textContent = HmrcDisplayFormat.formatText(message.title);
    li.appendChild(title);

    const body = document.createElement("p");
    body.className = "assist-message-body";
    body.textContent = HmrcDisplayFormat.formatText(message.body);
    li.appendChild(body);

    if (message.links && Array.isArray(message.links) && message.links.length > 0) {
      const linksSection = document.createElement("div");
      linksSection.className = "assist-message-links";
      for (const link of message.links.filter((candidate) => isHttpUrl(candidate.url))) {
        const a = document.createElement("a");
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "assist-message-link";
        a.textContent = link.title || link.url;
        linksSection.appendChild(a);
      }
      li.appendChild(linksSection);
    }

    if (message.path) {
      const pathDiv = document.createElement("div");
      pathDiv.className = "assist-message-path";
      const pathLabel = document.createElement("em");
      pathLabel.textContent = `Related to: ${message.path}`;
      pathDiv.appendChild(pathLabel);
      li.appendChild(pathDiv);
    }

    messagesList.appendChild(li);
  }

  section.appendChild(messagesList);
  container.appendChild(section);
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

const VAT_RECEIPT_EXPLANATION =
  "HMRC gives this receipt when it accepts a VAT return. The form bundle number is HMRC's reference for your return. Keep it: HMRC asks for it if you ask about the return.";

const PAYMENT_INDICATORS = {
  DD: "DD means Direct Debit.",
  BANK: "BANK means a payment through your bank.",
};

// A VAT return's receipt carries HMRC's processing date and form bundle number and no report kind.
function isVatReceipt(data) {
  return !data.kind && Boolean(data.formBundleNumber) && Boolean(data.processingDate);
}

function receiptCopyExplanation(data) {
  const indicator = Object.hasOwn(PAYMENT_INDICATORS, data.paymentIndicator) ? PAYMENT_INDICATORS[data.paymentIndicator] : "";
  const charge = data.chargeRefNumber ? `Quote charge reference ${data.chargeRefNumber} when you pay.` : "";
  return [VAT_RECEIPT_EXPLANATION, indicator, charge].filter(Boolean).join(" ");
}

// The customer copy of a VAT receipt: HMRC's receipt as the record, DIY Accounting's frame around it.
async function mountVatReceiptCopy(container, data) {
  const [{ customerCopyHtml }, { vatReceiptRecordHtml }] = await Promise.all([
    import("../../lib/submission-record.js"),
    import("../../lib/vat-return-record.js"),
  ]);
  const processingDateText = HmrcDisplayFormat.formatDateTime(data.processingDate);
  const html = customerCopyHtml({
    title: "Your copy of the receipt for a VAT return",
    reference: { label: "Form bundle number", value: String(data.formBundleNumber) },
    status: { kind: "accepted", text: "Accepted by HMRC" },
    date: processingDateText,
    sections: [
      {
        heading: "Receipt from HMRC",
        explanation: receiptCopyExplanation(data),
        recordHtml: vatReceiptRecordHtml({ ...data, processingDateText }),
      },
    ],
    links: [
      { href: "receipts.html", text: "Back to your receipts" },
      { href: "../vat/vatObligations.html", text: "See your VAT obligations" },
      { href: "../vat/vatPayments.html", text: "See your VAT payments" },
    ],
  });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  container.replaceChildren(...parsed.body.childNodes);
}

async function displayReceiptTable(data, name) {
  const receiptDisplay = document.getElementById("receiptDisplay");
  const receiptContent = document.getElementById("receiptContent");

  const isAssistReport = data && (data.kind === "vat-assist-report" || data.kind === "itsa-assist-report");
  const hasMessages = isAssistReport && Array.isArray(data.messages) && data.messages.length > 0;
  displayAssistMessages(document.getElementById("assistMessages"), hasMessages ? data.messages : null, data?.acknowledgedAt);

  let dataToDisplay = data;
  if (isAssistReport) {
    const { messages, ...rest } = data;
    dataToDisplay = rest;
  }

  const vatBoxes = Object.fromEntries(HmrcFieldTable.VAT_RETURN_BOXES.map((box) => [box.field, box]));
  const dataRows = receiptRows(dataToDisplay).map((entry) => {
    const isAmount = typeof entry.value === "number" && Number.isFinite(entry.value);
    const box = vatBoxes[entry.field];
    const isTimestamp = typeof entry.value === "string" && ISO_TIMESTAMP.test(entry.value);
    const value = isTimestamp ? HmrcDisplayFormat.formatDateTime(entry.value) : entry.value;
    const row = { ...entry, value, kind: isAmount ? "money" : "text" };
    return box ? { ...row, label: box.label, definition: box.definition, source: box.source } : row;
  });
  const rows = [{ field: "receiptName", label: "Receipt name", value: name, kind: "text" }, ...dataRows];

  const showCopy = isVatReceipt(data);
  document.getElementById("receiptHeading").hidden = showCopy;
  if (showCopy) {
    await mountVatReceiptCopy(receiptContent, data);
  } else {
    HmrcFieldTable.mountFieldTable(receiptContent, rows, { caption: "Receipt details" });
  }

  receiptDisplay.style.display = "block";
  receiptDisplay.scrollIntoView({ behavior: "smooth" });
}

async function downloadReceipt(name) {
  const res = await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(name)}`, {});
  if (!res.ok) return alert("Failed to download receipt");
  const blob = new Blob([await res.text()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function exportCsv(rows) {
  const header = ["Date", "Form bundle", "Size"];
  const lines = [header.join(",")];
  for (const r of rows) lines.push(r.join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "receipts.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

document.getElementById("exportCsvBtn").addEventListener("click", async () => {
  const res = await window.fetchWithIdToken("/api/v1/hmrc/receipt", {});
  if (!res.ok) return alert("Failed to export CSV");
  const json = await res.json();
  const items = Array.isArray(json.receipts) ? json.receipts : [];
  const rows = items.map((it) => [it.timestamp, it.formBundleNumber || "", it.size || ""]);
  exportCsv(rows);
});

// Auto-refresh on page focus
window.addEventListener("focus", () => {
  fetchReceipts();
});

// Initialize page - wait for submit.js module to be ready
function initPage() {
  checkAuthStatus();
  fetchReceipts();
}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}
