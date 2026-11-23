// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

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

async function mountFilingCopy(container, receipt, receiptName, amendHref) {
  const { filingCopyHtml } = await import("../lib/filing-record.js");
  const html = filingCopyHtml(receipt, { receiptName, ...(amendHref ? { linksTo: { correct: amendHref } } : {}) });
  const parsed = new DOMParser().parseFromString(html, "text/html");
  container.replaceChildren(...parsed.body.childNodes);
  container.querySelectorAll("iframe.filed-document").forEach(fitFrameToDocument);
}

// A Company Tax Return that carries the answers it was made from can be amended: the filing page
// refills the form from them. Accepted micro-entity and small company accounts filed on their own can
// be revised where revised accounts are offered: the accounts form refills from the document filed.
async function amendHrefOf(receipt, receiptName) {
  if (receipt.kind === "company-tax-return") {
    const amendable = receipt.statusCode === "ACCEPT" && Boolean(receipt.formRequest);
    return amendable ? `fileCompanyTaxReturn.html?amend=${encodeURIComponent(receiptName)}` : null;
  }
  const revisionModule = await import("../lib/accounts-revision.js");
  if (revisionModule.refusalOf(receipt) || !(await revisionModule.isRevisionOfferedHere())) return null;
  const bundle = await import("../lib/books-bundle.js");
  try {
    const { regime } = revisionModule.revisionSourceOf(receipt, bundle);
    const form = { micro: "fileMicroEntityAccounts.html", small: "fileSmallCompanyAccounts.html" }[regime];
    return form ? `${form}?amend=${encodeURIComponent(receiptName)}` : null;
  } catch (error) {
    console.warn("These accounts cannot be revised here because the filed document could not be read:", error);
    if (filedWithoutComparatives(receipt, bundle)) {
      showNotice(
        window.siteText(
          "ch.filing.no-comparatives-why",
          "These accounts were filed without the previous year's figures, which accounts show unless they are the company's first. This site reads the previous year back to amend accounts, so they cannot be amended here.",
        ),
      );
    }
    return null;
  }
}

// The reader asks for both years unless the company is new; accounts that read once the prior year is
// excused were filed with one year only.
function filedWithoutComparatives(receipt, bundle) {
  try {
    bundle.mapIxbrlAccounts(receipt.filedDocument, { regime: "any", firstAccounts: true });
    return true;
  } catch {
    return false;
  }
}

function showAmendLink(amendHref) {
  const link = element("amendFilingLink");
  link.hidden = !amendHref;
  if (amendHref) link.href = amendHref;
}

async function showFiling(receiptName) {
  const res = await window.fetchWithIdToken(`/api/v1/hmrc/receipt/${encodeURIComponent(receiptName)}`, {});
  if (!res.ok) {
    showNotice(window.siteText("ch.filing.load-failed", "We could not load this filing. Go back to your receipts and try again."));
    return;
  }
  const receipt = await res.json();
  const { isFilingReceipt } = await import("../lib/filing-record.js");
  if (!isFilingReceipt(receipt)) {
    showNotice(
      window.siteText(
        "ch.filing.not-a-filing",
        "This receipt is not an accounts or Company Tax Return filing. Open it from your receipts.",
      ),
    );
    return;
  }
  const amendHref = await amendHrefOf(receipt, receiptName);
  await mountFilingCopy(element("filingContent"), receipt, receiptName, amendHref);
  showAmendLink(amendHref);
  element("filingActions").style.display = "flex";
}

function start() {
  const receiptName = new URLSearchParams(window.location.search).get("receipt");
  if (!localStorage.getItem("cognitoIdToken")) {
    return;
  }
  if (!receiptName) {
    showNotice(window.siteText("ch.filing.choose", "Choose a filing from your receipts to see your copy of it."));
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
