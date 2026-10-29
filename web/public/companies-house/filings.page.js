// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Your copy of one Companies House accounts filing or Company Tax Return: the stored receipt,
// drawn as the customer copy. The list of filings is the receipts page; its rows link here.

const element = (id) => document.getElementById(id);

function showNotice(text) {
  const notice = element("filingNotice");
  notice.textContent = text;
  notice.style.display = "block";
}

function fitFrameToDocument(frame) {
  const fit = () => {
    const height = frame.contentDocument?.documentElement?.scrollHeight;
    if (height) frame.style.height = `${height + 8}px`;
  };
  frame.addEventListener("load", fit);
  if (frame.contentDocument?.readyState === "complete") fit();
}

async function mountFilingCopy(container, receipt, receiptName) {
  const { filingCopyHtml } = await import("../lib/filing-record.js");
  const html = filingCopyHtml(receipt, { receiptName });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  container.replaceChildren(...parsed.body.childNodes);
  container.querySelectorAll("iframe.filed-document").forEach(fitFrameToDocument);
}

// A Company Tax Return that carries the answers it was made from can be amended: the filing page
// refills the form from them.
function showAmendLink(receipt, receiptName) {
  const link = element("amendFilingLink");
  const amendable = receipt.kind === "company-tax-return" && receipt.statusCode === "ACCEPT" && Boolean(receipt.formRequest);
  link.style.display = amendable ? "inline-block" : "none";
  if (amendable) link.href = `fileCompanyTaxReturn.html?amend=${encodeURIComponent(receiptName)}`;
}

async function showFiling(receiptName) {
  const res = await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(receiptName)}`, {});
  if (!res.ok) {
    showNotice("We could not load this filing. Go back to your receipts and try again.");
    return;
  }
  const receipt = await res.json();
  const { isFilingReceipt } = await import("../lib/filing-record.js");
  if (!isFilingReceipt(receipt)) {
    showNotice("This receipt is not an accounts or Company Tax Return filing. Open it from your receipts.");
    return;
  }
  await mountFilingCopy(element("filingContent"), receipt, receiptName);
  showAmendLink(receipt, receiptName);
  element("filingActions").style.display = "flex";
}

function start() {
  const receiptName = new URLSearchParams(window.location.search).get("receipt");
  if (!localStorage.getItem("cognitoIdToken")) {
    return;
  }
  if (!receiptName) {
    showNotice("Choose a filing from your receipts to see your copy of it.");
    return;
  }
  return showFiling(receiptName);
}

element("printFilingBtn").addEventListener("click", () => window.print());
window.showFiling = showFiling;

if (window.__submitReady__) {
  start();
} else {
  document.addEventListener("submit-ready", start, { once: true });
}
