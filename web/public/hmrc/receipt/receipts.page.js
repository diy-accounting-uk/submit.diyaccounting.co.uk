// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives the text in the reader's language; without it (in a unit test) the English stands.
const siteText = (id, english, values) =>
  window.siteText
    ? window.siteText(id, english, values)
    : english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));

function getIdToken() {
  return localStorage.getItem("cognitoIdToken");
}

// Accounts and Company Tax Return filings open on their own page, which draws the filed documents.
const FILING_KINDS = new Set(["companies-house-accounts", "company-tax-return"]);

// The receipts route's address for the chosen client, or for the reader's own filings.
function receiptsUrl() {
  const clientId = document.getElementById("receiptsClient").value;
  return clientId ? `/api/v1/hmrc/receipt?clientId=${encodeURIComponent(clientId)}` : "/api/v1/hmrc/receipt";
}

// A practice chooses whose receipts to see; a reader with no client sees no choice.
async function showClientChoice() {
  const response = await window.fetchWithIdToken("/api/v1/practice/clients", {}).catch(() => null);
  if (!response?.ok) return;
  const clients = (await response.json())?.clients;
  if (!Array.isArray(clients)) return;
  const { clientChoices } = await import("../../lib/ct600-agent.js");
  const choices = clientChoices(clients);
  if (choices.length === 0) return;
  const select = document.getElementById("receiptsClient");
  select.append(...choices.map(({ clientId, label }) => new Option(label, clientId)));
  document.getElementById("receiptsClientChoice").hidden = false;
}

async function fetchReceipts() {
  const idToken = getIdToken();
  const exportControls = document.getElementById("exportControls");
  const table = document.getElementById("receiptsTable");
  const tbody = table.querySelector("tbody");
  const empty = document.getElementById("emptyState");

  if (!idToken) return;

  const requestedUrl = receiptsUrl();
  const res = await window.fetchWithIdToken(requestedUrl, {});
  // An answer for a choice the reader has since changed is dropped; the later request draws the page.
  if (requestedUrl !== receiptsUrl()) return;
  if (!res.ok) {
    tbody.innerHTML = "";
    table.style.display = "none";
    empty.textContent = siteText("receipts.load-failed", "Failed to load receipts");
    empty.style.display = "block";
    exportControls.style.display = "none";
    return;
  }
  const json = await res.json();
  const filingsInProgress = Array.isArray(json.filingsInProgress) ? json.filingsInProgress : [];
  const ctReturnsInProgress = Array.isArray(json.companyTaxReturnsInProgress) ? json.companyTaxReturnsInProgress : [];
  const items = Array.isArray(json.receipts) ? json.receipts : [];
  const { accountingPeriodDates, longDateText } = await import("../../lib/long-period.js");
  describeLongPeriodReturn = (longPeriod) => {
    const periods = accountingPeriodDates(longPeriod.periodOfAccountStart, longPeriod.periodOfAccountEnd)?.periods;
    const period = periods?.[longPeriod.part - 1];
    const dates = period
      ? ` (${siteText("widget.date-range", "{start} to {end}", { start: longDateText(period.periodStart), end: longDateText(period.periodEnd) })})`
      : "";
    return siteText("receipts.part-of", "{part} of {parts}", { part: longPeriod.part, parts: longPeriod.parts }) + dates;
  };
  tbody.innerHTML = "";
  if (items.length === 0 && filingsInProgress.length === 0 && ctReturnsInProgress.length === 0) {
    table.style.display = "none";
    empty.textContent = siteText("receipts.none", "No receipts yet.");
    empty.style.display = "block";
    exportControls.style.display = "none";
    return;
  }
  empty.style.display = "none";
  table.style.display = "table";
  exportControls.style.display = items.length ? "block" : "none";
  // A filing Companies House has not accepted, or a Company Tax Return HMRC has not answered
  // finally, is a row of its own, beside the receipts by date.
  const rows = [
    ...groupByJointFiling(items).map((group) => ({
      timestamp: group[0].timestamp,
      entries: group.map((it) => receiptEntry(it, group.length > 1)),
    })),
    ...filingsInProgress.map((filing) => ({ timestamp: filing.submittedAt, entries: [filingInProgressEntry(filing)], inProgress: filing })),
    ...ctReturnsInProgress.map((ctReturn) => ({
      timestamp: ctReturn.submittedAt,
      entries: [ctReturnInProgressEntry(ctReturn)],
      inProgress: ctReturn,
    })),
  ];
  rows.sort((first, second) => String(second.timestamp ?? "").localeCompare(String(first.timestamp ?? "")));
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (row.inProgress) {
      tr.className = "filing-in-progress";
      tr.dataset.status = row.inProgress.status;
    }

    const dateCell = document.createElement("td");
    dateCell.textContent = row.timestamp ? HmrcDisplayFormat.formatDateTime(row.timestamp) : "";
    dateCell.className = "date-column";
    dateCell.setAttribute("data-label", siteText("receipts.col-date", "Date"));

    // Receipt cell: one clickable label and download icon for each receipt of the filing
    const receiptCell = document.createElement("td");
    receiptCell.className = "receipt-cell";
    receiptCell.setAttribute("data-label", siteText("receipts.col-receipt", "Receipt"));
    receiptCell.append(...row.entries);

    tr.appendChild(dateCell);
    tr.appendChild(receiptCell);
    tbody.appendChild(tr);
  }
}

const FILING_IN_PROGRESS_TITLES = {
  "accounts": siteText("receipts.kind-accounts", "Accounts"),
  "confirmation-statement": siteText("receipts.kind-confirmation-statement", "Confirmation statement"),
  "psc-verification-statement": siteText("receipts.kind-psc-verification-statement", "PSC verification statement"),
  "psc-cessation": siteText("receipts.kind-psc-cessation", "PSC cessation"),
  "psc-change-details": siteText("receipts.kind-psc-change-details", "PSC change of details"),
  "accounting-reference-date": siteText("receipts.kind-accounting-reference-date", "Change of accounting reference date"),
  "officer-resignation": siteText("receipts.kind-officer-resignation", "Director or secretary removed"),
  "sail-address": siteText("receipts.kind-sail-address", "SAIL address"),
  "record-location": siteText("receipts.kind-record-location", "Location of company records"),
  "change-of-name": siteText("receipts.kind-change-of-name", "Change of company name"),
  "psc-statement-notification": siteText("receipts.kind-psc-statement-notification", "PSC statement"),
  "psc-statement-withdrawal": siteText("receipts.kind-psc-statement-withdrawal", "PSC statement withdrawal"),
  "psc-notification": siteText("receipts.kind-psc-notification", "New PSC notified"),
  "officer-appointment": siteText("receipts.kind-officer-appointment", "Director or secretary appointed"),
  "officer-change": siteText("receipts.kind-officer-change", "Director's or secretary's details changed"),
  "allotment-of-shares": siteText("receipts.kind-allotment-of-shares", "Return of allotment of shares"),
};

// A Companies House filing that is not a receipt yet: still waiting for Companies House, which checks
// some filings by hand in office hours, or rejected. Its submission number, the number Companies House
// knows it by, links to its status page, which can ask Companies House again.
function filingStatusHref(filing) {
  const query = new URLSearchParams({ filing: filing.submissionNumber, kind: filing.kind ?? "" });
  if (filing.clientId) query.set("clientId", filing.clientId);
  return `../../companies-house/filings.html?${query}`;
}

function filingInProgressEntry(filing) {
  const entry = document.createElement("div");
  entry.className = "receipt-entry filing-in-progress";
  entry.dataset.status = filing.status;
  const title = document.createElement("span");
  title.className = "receipt-kind";
  title.textContent = `${FILING_IN_PROGRESS_TITLES[filing.kind] || siteText("receipts.kind-filing", "Companies House filing")}: `;
  const status = document.createElement("span");
  status.className = "filing-status";
  status.textContent =
    filing.status === "rejected" && window.companiesHouseRejections.notReceived(filing.rejections)
      ? siteText("receipts.filing-not-received", "Not received by Companies House")
      : filing.status === "rejected"
        ? siteText("receipts.filing-rejected", "Rejected by Companies House")
        : siteText("receipts.filing-pending-tag", "Pending");
  const link = document.createElement("a");
  link.className = "submission-number";
  link.href = filingStatusHref(filing);
  link.textContent = siteText("receipts.submission-number", "submission number {number}", { number: filing.submissionNumber });
  entry.append(title, status, ", ", link);
  if (filing.status === "rejected" && filing.rejections?.length) {
    const reasons = document.createElement("ul");
    for (const rejection of filing.rejections) {
      const reason = document.createElement("li");
      reason.textContent = window.companiesHouseRejections.rejectionDescription(rejection);
      reasons.appendChild(reason);
    }
    entry.appendChild(reasons);
  }
  return entry;
}

// A Company Tax Return HMRC has not answered finally yet, or gave no answer to in the 30 days Submit
// waits. Its correlation ID, the number HMRC's Transaction Engine knows it by, links to its status page.
function ctReturnStatusHref(ctReturn) {
  const query = new URLSearchParams({ filing: ctReturn.correlationId, kind: "ct600" });
  if (ctReturn.clientId) query.set("clientId", ctReturn.clientId);
  return `../../companies-house/filings.html?${query}`;
}

function ctReturnInProgressEntry(ctReturn) {
  const entry = document.createElement("div");
  entry.className = "receipt-entry filing-in-progress";
  entry.dataset.status = ctReturn.status;
  const title = document.createElement("span");
  title.className = "receipt-kind";
  title.textContent = `${siteText("receipts.kind-company-tax-return", "Company Tax Return")}: `;
  const status = document.createElement("span");
  status.className = "filing-status";
  status.textContent =
    ctReturn.status === "no-answer"
      ? siteText("receipts.ct-no-answer-tag", "No answer from HMRC")
      : siteText("receipts.filing-pending-tag", "Pending");
  const link = document.createElement("a");
  link.className = "submission-number";
  link.href = ctReturnStatusHref(ctReturn);
  link.textContent = siteText("receipts.correlation-id", "correlation ID {id}", { id: ctReturn.correlationId });
  entry.append(title, status, ", ", link);
  return entry;
}

let describeLongPeriodReturn = (longPeriod) =>
  siteText("receipts.part-of", "{part} of {parts}", { part: longPeriod.part, parts: longPeriod.parts });

// One id names a filing: the jointFilingId when the accounts went with the return, and the long period's
// filingId for the two returns of a period of account over 12 months. Its receipts show as one entry.
function filingIdOf(it) {
  return it.jointFilingId ?? it.longPeriod?.filingId;
}

// Inside a long period's filing the accounts come first, then return 1, then return 2.
function filingOrder(it) {
  return it.kind === "companies-house-accounts" ? 0 : (it.longPeriod?.part ?? 0);
}

function groupByJointFiling(items) {
  const groups = [];
  const byFilingId = new Map();
  for (const it of items) {
    const filingId = filingIdOf(it);
    const existing = filingId ? byFilingId.get(filingId) : undefined;
    if (existing) {
      existing.push(it);
      continue;
    }
    const group = [it];
    groups.push(group);
    if (filingId) byFilingId.set(filingId, group);
  }
  for (const group of groups) if (group.some((it) => it.longPeriod)) group.sort((a, b) => filingOrder(a) - filingOrder(b));
  return groups;
}

const JOINT_RECEIPT_TITLES = {
  "companies-house-accounts": siteText("receipts.kind-accounts", "Accounts"),
  "company-tax-return": siteText("receipts.kind-ct600", "Company Tax Return"),
};
const AMENDED_RECEIPT_TITLES = {
  "companies-house-accounts": siteText("receipts.kind-revised-accounts", "Revised accounts"),
  "company-tax-return": siteText("receipts.kind-amended-ct600", "Amended Company Tax Return"),
};

function receiptEntry(it, inJointFiling) {
  const entry = document.createElement("div");
  entry.className = "receipt-entry";
  const returnLabel = it.longPeriod ? ` ${describeLongPeriodReturn(it.longPeriod)}` : "";
  const kindTitle = it.amended
    ? `${AMENDED_RECEIPT_TITLES[it.kind]}${returnLabel}`
    : inJointFiling || it.longPeriod
      ? `${JOINT_RECEIPT_TITLES[it.kind]}${returnLabel}`
      : undefined;
  if (kindTitle) {
    const title = document.createElement("span");
    title.className = "receipt-kind";
    title.textContent = `${kindTitle}: `;
    entry.appendChild(title);
  }
  const receiptLabel = document.createElement("a");
  receiptLabel.className = "receipt-label";
  receiptLabel.textContent = it.formBundleNumber || it.name || siteText("receipts.unnamed", "Unnamed receipt");
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
  downloadIcon.title = siteText("receipts.download", "Download receipt");
  downloadIcon.onclick = (e) => {
    e.preventDefault();
    downloadReceipt(it.name);
  };

  entry.appendChild(receiptLabel);
  entry.appendChild(downloadIcon);
  return entry;
}

async function viewReceipt(name) {
  const res = await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(name)}`, {});
  if (!res.ok) return alert(siteText("receipts.fetch-failed", "Failed to fetch receipt"));
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
  processingDate: siteText("receipt.processing-date", "Processing date"),
  paymentIndicator: siteText("receipt.payment-indicator", "Payment indicator"),
  formBundleNumber: siteText("receipt.form-bundle-number", "Form bundle number"),
  chargeRefNumber: siteText("receipt.charge-reference", "Charge reference number"),
  periodId: siteText("receipts.field-period-id", "Period ID"),
  submissionId: siteText("receipts.field-submission-id", "Submission ID"),
  calculationId: siteText("receipts.field-calculation-id", "Calculation ID"),
  correlationId: siteText("receipts.field-correlation-id", "Correlation ID"),
  taxYear: siteText("receipts.field-tax-year", "Tax year"),
  periodStartDate: siteText("receipts.field-start-date", "Start date"),
  periodEndDate: siteText("receipts.field-end-date", "End date"),
  href: siteText("receipts.field-link", "Link"),
  rel: siteText("receipts.field-relation", "Relation"),
  method: siteText("receipts.field-method", "Method"),
  kind: siteText("receipts.field-kind", "Record type"),
  reportId: siteText("receipts.field-report-id", "Report ID"),
  nino: siteText("receipts.field-nino", "National Insurance number"),
  vrn: siteText("receipts.field-vrn", "VAT registration number"),
  periodKey: siteText("receipts.field-period-key", "Period key"),
  requestedAt: siteText("receipts.field-requested-at", "Requested"),
  acknowledgedAt: siteText("receipts.field-acknowledged-at", "Acknowledged to HMRC"),
  presentedLanguage: siteText("widget.assist-feedback-language", "Language of HMRC feedback"),
  figures: siteText("receipts.field-figures", "Figures"),
  model: siteText("receipts.field-model", "Submission model"),
  businessId: siteText("receipts.field-business-id", "Business ID"),
  calculationType: siteText("receipts.field-calculation-type", "Calculation type"),
  totalIncomeTaxAndNicsDue: siteText("receipts.field-total-due", "Income Tax and National Insurance due"),
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
    flattenReceipt(data, "receipt", siteText("widget.field-item", "Item"), entries);
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

function displayAssistMessages(container, messages, acknowledgedAt, language) {
  container.replaceChildren();
  if (!messages) return;
  const section = document.createElement("section");
  section.className = "assist-messages-section";

  const heading = document.createElement("h4");
  heading.textContent = siteText("widget.assist-feedback-heading", "HMRC feedback");
  section.appendChild(heading);

  const status = document.createElement("p");
  status.className = "assist-acknowledgement";
  status.textContent = acknowledgedAt
    ? siteText("receipts.assist-acknowledged", "Acknowledged to HMRC on {date}", { date: HmrcDisplayFormat.formatDateTime(acknowledgedAt) })
    : siteText("receipts.assist-not-acknowledged", "Not acknowledged to HMRC");
  section.appendChild(status);

  const messagesList = document.createElement("ol");
  messagesList.className = "assist-messages-list";
  messagesList.lang = language;

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
      pathLabel.textContent = siteText("receipts.assist-related", "Related to: {path}", { path: message.path });
      pathDiv.appendChild(pathLabel);
      li.appendChild(pathDiv);
    }

    messagesList.appendChild(li);
  }

  section.appendChild(messagesList);
  container.appendChild(section);
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

const VAT_RECEIPT_EXPLANATION = siteText(
  "receipt.vat-explanation",
  "HMRC gives this receipt when it accepts a VAT return. The form bundle number is HMRC's reference for your return. Keep it: HMRC asks for it if you ask about the return.",
);

const PAYMENT_INDICATORS = {
  DD: siteText("receipt.indicator-dd", "DD means Direct Debit."),
  BANK: siteText("receipt.indicator-bank", "BANK means a payment through your bank."),
};

// A VAT return's receipt carries HMRC's processing date and form bundle number and no report kind.
function isVatReceipt(data) {
  return !data.kind && Boolean(data.formBundleNumber) && Boolean(data.processingDate);
}

function receiptCopyExplanation(data) {
  const indicator = Object.hasOwn(PAYMENT_INDICATORS, data.paymentIndicator) ? PAYMENT_INDICATORS[data.paymentIndicator] : "";
  const charge = data.chargeRefNumber
    ? siteText("receipt.quote-charge", "Quote charge reference {reference} when you pay.", { reference: data.chargeRefNumber })
    : "";
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
    title: siteText("receipt.copy-title", "Your copy of the receipt for a VAT return"),
    reference: { label: siteText("receipt.form-bundle-number", "Form bundle number"), value: String(data.formBundleNumber) },
    status: { kind: "accepted", text: siteText("vat.status-accepted", "Accepted by HMRC") },
    date: processingDateText,
    sections: [
      {
        heading: siteText("receipt.from-hmrc", "Receipt from HMRC"),
        explanation: receiptCopyExplanation(data),
        recordHtml: vatReceiptRecordHtml({ ...data, processingDateText }),
      },
    ],
    links: [
      { href: "receipts.html", text: siteText("receipts.back", "Back to your receipts") },
      { href: "../vat/vatObligations.html", text: siteText("receipts.see-obligations", "See your VAT obligations") },
      { href: "../vat/vatPayments.html", text: siteText("receipts.see-payments", "See your VAT payments") },
    ],
  });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  container.replaceChildren(...parsed.body.childNodes);
}

async function displayReceiptTable(data, name) {
  const receiptDisplay = document.getElementById("receiptDisplay");
  const receiptContent = document.getElementById("receiptContent");

  const isAssistReport = data && (data.kind === "vat-assist-report" || data.kind === "itsa-assist-report");
  const welshMessages = isAssistReport && Array.isArray(data.welshMessages) ? data.welshMessages : [];
  // HMRC's Welsh feedback shows when it was shown in Welsh or the reader reads the site in Welsh.
  const readsWelsh = data?.presentedLanguage === "cy" || window.siteLanguage?.current() === "cy";
  const language = readsWelsh && welshMessages.length > 0 ? "cy" : "en";
  const messages = language === "cy" ? welshMessages : isAssistReport ? data.messages : null;
  const hasMessages = Array.isArray(messages) && messages.length > 0;
  displayAssistMessages(document.getElementById("assistMessages"), hasMessages ? messages : null, data?.acknowledgedAt, language);

  let dataToDisplay = data;
  if (isAssistReport) {
    const { messages: _english, welshMessages: _welsh, ...rest } = data;
    dataToDisplay = rest;
  }

  const vatBoxes = Object.fromEntries(HmrcFieldTable.VAT_RETURN_BOXES.map((box) => [box.field, box]));
  const dataRows = receiptRows(dataToDisplay).map((entry) => {
    const isAmount = typeof entry.value === "number" && Number.isFinite(entry.value);
    // A VAT Assist report keeps the return's boxes under "figures".
    const box = vatBoxes[entry.field] || vatBoxes[entry.field.replace(/^figures\./, "")];
    const isTimestamp = typeof entry.value === "string" && ISO_TIMESTAMP.test(entry.value);
    const value = isTimestamp ? HmrcDisplayFormat.formatDateTime(entry.value) : entry.value;
    const row = { ...entry, value, kind: isAmount ? "money" : "text" };
    return box ? { ...row, label: box.label, definition: box.definition, source: box.source } : row;
  });
  const rows = [{ field: "receiptName", label: siteText("receipts.field-file-name", "File name"), value: name, kind: "text" }, ...dataRows];

  const showCopy = isVatReceipt(data);
  document.getElementById("receiptHeading").hidden = showCopy;
  if (showCopy) {
    await mountVatReceiptCopy(receiptContent, data);
  } else {
    HmrcFieldTable.mountFieldTable(receiptContent, rows, { caption: siteText("receipts.details", "Receipt details") });
  }

  receiptDisplay.style.display = "block";
  receiptDisplay.scrollIntoView({ behavior: "smooth" });
}

async function downloadReceipt(name) {
  const res = await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(name)}`, {});
  if (!res.ok) return alert(siteText("receipts.download-failed", "Failed to download receipt"));
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
  const res = await window.fetchWithIdToken(receiptsUrl(), {});
  if (!res.ok) return alert(siteText("receipts.export-failed", "Failed to export CSV"));
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
document.getElementById("receiptsClient").addEventListener("change", () => fetchReceipts());
// A receipt a filing page links to opens as the page loads: ?receipt=<receipt id>.json.
function openLinkedReceipt() {
  const name = new URLSearchParams(window.location.search).get("receipt");
  if (name && /^[\w:.-]+\.json$/.test(name)) viewReceipt(name);
}

function initPage() {
  checkAuthStatus();
  fetchReceipts();
  if (getIdToken()) showClientChoice();
  openLinkedReceipt();
}

if (window.__submitReady__) {
  initPage();
} else {
  document.addEventListener("submit-ready", initPage, { once: true });
}
