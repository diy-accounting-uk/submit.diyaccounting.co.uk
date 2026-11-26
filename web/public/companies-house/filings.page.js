// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Your copy of one Companies House accounts filing or Company Tax Return: the stored receipt,
// drawn as the customer copy. The list of filings is the receipts page; its rows link here. A filing
// Companies House has not decided yet opens here too, as its status: where it is, when Submit asks
// Companies House, and Check now.

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

// --- A filing Companies House has not decided yet ------------------------------------------------

const isWelsh = () => window.siteLanguage?.chrome?.() === "cy";

function momentText(value) {
  return new Date(value).toLocaleString(isWelsh() ? "cy-GB" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

function create(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function statusRow(id, term, value) {
  return create("div", { class: "filing-status-row" }, create("dt", {}, term), create("dd", { id }, value));
}

function rejectionList(rejections) {
  return create(
    "ul",
    { id: "filingStatusReasons" },
    ...(rejections ?? []).map((rejection) => create("li", {}, window.companiesHouseRejections.rejectionDescription(rejection))),
  );
}

// The filing as the receipts route lists it, or null when it is no longer waiting or rejected.
async function filingInProgress(submissionNumber, clientId) {
  const url = clientId ? `/api/v1/hmrc/receipt?clientId=${encodeURIComponent(clientId)}` : "/api/v1/hmrc/receipt";
  const res = await window.fetchWithIdToken(url, {});
  if (!res.ok) return { failed: true };
  const json = await res.json();
  return { filing: (json.filingsInProgress ?? []).find((filing) => filing.submissionNumber === submissionNumber) ?? null };
}

function pendingAnswer(submissionNumber, result) {
  if (result?.notYetIndexed) {
    return window.siteText(
      "ch.filing.status-not-indexed",
      "Companies House has received submission {number} and has not yet added it to its records. It does so within the hour; ask again then.",
      { number: submissionNumber },
    );
  }
  return window.siteText("ch.filing.status-pending", "Companies House has the filing and has not decided yet.");
}

function showDecision(result, submissionNumber) {
  const answer = element("filingStatusAnswer");
  const check = element("checkNowBtn");
  element("filingStatusReasons")?.remove();
  if (result.statusCode === "ACCEPT") {
    check.hidden = true;
    answer.replaceChildren(
      window.siteText("ch.filing.status-accepted", "Companies House accepted the filing. Its receipt is in your receipts: "),
      create("a", { href: "../hmrc/receipt/receipts.html" }, window.siteText("ch.filing.status-receipts", "your receipts")),
      ".",
    );
    element("filingStatusWarning").hidden = true;
    return;
  }
  if (result.statusCode === "REJECT") {
    check.hidden = true;
    answer.textContent = window.siteText("ch.filing.status-rejected", "Companies House rejected submission {number}:", {
      number: submissionNumber,
    });
    answer.after(rejectionList(result.rejections));
    element("filingStatusWarning").hidden = true;
    return;
  }
  answer.textContent = pendingAnswer(submissionNumber, result);
}

async function checkNow(kind, submissionNumber) {
  const check = element("checkNowBtn");
  check.disabled = true;
  try {
    const { companiesHouseStatusPath } = await import("../lib/companies-house-forms.js");
    const res = await window.fetchWithIdToken(companiesHouseStatusPath(kind, submissionNumber), { method: "GET" });
    element("filingStatusYouAsked").hidden = false;
    element("filingStatusYouAskedAt").textContent = momentText(new Date());
    if (!res.ok) {
      element("filingStatusAnswer").textContent = window.siteText(
        "ch.filing.status-check-failed",
        "Submit could not ask Companies House just now. Try again in a few minutes.",
      );
      return;
    }
    showDecision(await res.json(), submissionNumber);
  } finally {
    check.disabled = false;
  }
}

async function showFilingStatus(submissionNumber, kind, clientId) {
  const { COMPANIES_HOUSE_FORMS } = await import("../lib/companies-house-forms.js");
  const { scheduledChecks } = await import("../lib/presenter-poll-schedule.js");
  const { failed, filing } = await filingInProgress(submissionNumber, clientId);
  if (failed) {
    showNotice(window.siteText("ch.filing.load-failed", "We could not load this filing. Go back to your receipts and try again."));
    return;
  }
  if (!filing) {
    showNotice(
      window.siteText(
        "ch.filing.status-gone",
        "Submission {number} is no longer waiting for Companies House. Its receipt, or its rejection, is in your receipts.",
        { number: submissionNumber },
      ),
    );
    return;
  }
  const form = COMPANIES_HOUSE_FORMS[filing.kind ?? kind];
  const title = form
    ? isWelsh()
      ? form.receiptTitleCy
      : form.receiptTitle
    : window.siteText("ch.filing.status-filing", "Companies House filing");
  const { last, next } = scheduledChecks(new Date());
  const pending = filing.status === "pending";
  const panel = element("filingStatus");
  panel.replaceChildren(
    create("h2", { id: "filingStatusHeading" }, title),
    create("p", { id: "filingStatusAnswer" }),
    create(
      "dl",
      { class: "filing-status-list" },
      ...(filing.companyNumber
        ? [statusRow("filingStatusCompany", window.siteText("ch.filing.status-company", "Company number"), filing.companyNumber)]
        : []),
      statusRow(
        "filingStatusSent",
        window.siteText("ch.filing.status-sent", "Sent"),
        filing.submittedAt ? momentText(filing.submittedAt) : "",
      ),
      statusRow("filingStatusNumber", window.siteText("ch.filing.status-number", "Submission number"), filing.submissionNumber),
      ...(pending
        ? [
            statusRow(
              "filingStatusLastAsked",
              window.siteText("ch.filing.status-last-asked", "Submit last asked Companies House"),
              last ? momentText(last) : "",
            ),
            statusRow(
              "filingStatusNextAsk",
              window.siteText("ch.filing.status-next-ask", "Submit asks next"),
              next ? momentText(next) : "",
            ),
          ]
        : []),
    ),
    create(
      "p",
      { id: "filingStatusYouAsked", hidden: "" },
      window.siteText("ch.filing.status-you-asked", "You asked Companies House at "),
      create("span", { id: "filingStatusYouAskedAt" }),
      ".",
    ),
    create(
      "p",
      { class: "hint" },
      window.siteText(
        "ch.filing.status-how",
        "Submit asks Companies House for its decision every 15 minutes on weekdays from 07:00 to 18:45 UTC, the hours it checks filings by hand. Companies House emails the company when it decides.",
      ),
    ),
    create(
      "p",
      { id: "filingStatusWarning", class: "filing-notice" },
      window.siteText(
        "ch.filing.status-warning",
        "Do not file it again while it waits: a new filing for this company and period would go to Companies House beside submission {number}.",
        { number: filing.submissionNumber },
      ),
    ),
    create("button", { type: "button", id: "checkNowBtn", class: "btn" }, window.siteText("ch.filing.status-check-now", "Check now")),
  );
  if (pending) {
    element("filingStatusAnswer").textContent = pendingAnswer(filing.submissionNumber);
    element("checkNowBtn").addEventListener("click", () => checkNow(filing.kind ?? kind, filing.submissionNumber));
  } else {
    showDecision({ statusCode: "REJECT", rejections: filing.rejections }, filing.submissionNumber);
  }
  panel.hidden = false;
}

function start() {
  const query = new URLSearchParams(window.location.search);
  const receiptName = query.get("receipt");
  if (!localStorage.getItem("cognitoIdToken")) {
    return;
  }
  if (!receiptName && query.get("filing")) {
    return showFilingStatus(query.get("filing"), query.get("kind"), query.get("clientId"));
  }
  if (!receiptName) {
    showNotice(window.siteText("ch.filing.choose", "Choose a filing from your receipts to see your copy of it."));
    return;
  }
  return showFiling(receiptName);
}

element("printFilingBtn").addEventListener("click", () => window.print());
window.showFiling = showFiling;
window.showFilingStatus = showFilingStatus;

if (window.__submitReady__) {
  start();
} else {
  document.addEventListener("submit-ready", start, { once: true });
}
