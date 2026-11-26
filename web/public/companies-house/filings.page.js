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

const CT600_KIND = "ct600";

// The filing as the receipts route lists it, or null when it is no longer waiting or rejected. A
// Company Tax Return (kind ct600) is found by its correlation ID among the returns in progress.
async function filingInProgress(id, kind, clientId) {
  const url = clientId ? `/api/v1/hmrc/receipt?clientId=${encodeURIComponent(clientId)}` : "/api/v1/hmrc/receipt";
  const res = await window.fetchWithIdToken(url, {});
  if (!res.ok) return { failed: true };
  const json = await res.json();
  if (kind === CT600_KIND) {
    return { filing: (json.companyTaxReturnsInProgress ?? []).find((ctReturn) => ctReturn.correlationId === id) ?? null };
  }
  return { filing: (json.filingsInProgress ?? []).find((filing) => filing.submissionNumber === id) ?? null };
}

function notAskedYet() {
  return window.siteText("ch.filing.status-not-asked-yet", "Not yet");
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
  const { failed, filing } = await filingInProgress(submissionNumber, kind, clientId);
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
  const { next } = scheduledChecks(new Date());
  const pending = filing.status === "pending";
  // A filing under the customer's own presenter is answered only to that presenter, so the
  // scheduled poll never asks about it.
  const onSchedule = filing.askedOnSchedule !== false;
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
              filing.lastCheckedAt ? momentText(filing.lastCheckedAt) : notAskedYet(),
            ),
            statusRow(
              "filingStatusNextAsk",
              window.siteText("ch.filing.status-next-ask", "Submit asks next"),
              onSchedule ? (next ? momentText(next) : "") : window.siteText("ch.filing.status-next-ask-own", "When you press Check now"),
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
      { class: "hint", id: "filingStatusHow" },
      onSchedule
        ? window.siteText(
            "ch.filing.status-how",
            "Submit asks Companies House for its decision every 15 minutes on weekdays from 07:00 to 18:45 UTC, the hours it checks filings by hand. Companies House emails the company when it decides.",
          )
        : window.siteText(
            "ch.filing.status-how-own",
            "This filing went under your own presenter ID, so Companies House answers only to you: Submit asks when you press Check now. Companies House emails the company when it decides.",
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

// --- A Company Tax Return HMRC has not answered finally yet -----------------------------------

function ctReturnStatusPath(correlationId, clientId) {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return `/api/v1/hmrc/ct/return/${encodeURIComponent(correlationId)}${query}`;
}

function ctPendingAnswer() {
  return window.siteText("ch.filing.ct-status-pending", "HMRC has the return and has not given its final answer yet.");
}

function ctErrorList(result) {
  const entries = [...(result.errors ?? []), ...(result.businessErrors ?? [])];
  return create(
    "ul",
    { id: "filingStatusReasons" },
    ...entries.map((entry) =>
      create("li", {}, window.siteText("ch.ct.error-line", "Error {number}: {text}", { number: entry.number, text: entry.text })),
    ),
  );
}

function showCtDecision(result, correlationId) {
  const answer = element("filingStatusAnswer");
  const check = element("checkNowBtn");
  element("filingStatusReasons")?.remove();
  if (result.statusCode === "ACCEPT") {
    check.hidden = true;
    answer.replaceChildren(
      window.siteText("ch.filing.ct-status-accepted", "HMRC accepted the return. Open "),
      create(
        "a",
        { href: `filings.html?receipt=${encodeURIComponent(result.receiptId + ".json")}`, id: "filingStatusReceiptLink" },
        window.siteText("ch.filing.ct-status-receipt", "your copy of the return and HMRC's receipt"),
      ),
      ".",
    );
    element("filingStatusWarning").hidden = true;
    return;
  }
  if (result.statusCode === "REJECT") {
    check.hidden = true;
    answer.textContent =
      result.message ||
      window.siteText("ch.filing.ct-status-rejected", "HMRC rejected the return with correlation ID {id}:", { id: correlationId });
    answer.after(ctErrorList(result));
    element("filingStatusWarning").hidden = true;
    return;
  }
  answer.textContent = ctPendingAnswer();
}

async function checkCtNow(correlationId, clientId) {
  const check = element("checkNowBtn");
  check.disabled = true;
  try {
    const res = await window.fetchWithIdToken(ctReturnStatusPath(correlationId, clientId), { method: "GET" });
    element("filingStatusYouAsked").hidden = false;
    element("filingStatusYouAskedAt").textContent = momentText(new Date());
    if (res.status === 404) {
      element("filingStatusAnswer").textContent = ctGoneText(correlationId);
      check.hidden = true;
      return;
    }
    if (!res.ok) {
      element("filingStatusAnswer").textContent = window.siteText(
        "ch.filing.ct-status-check-failed",
        "Submit could not ask HMRC just now. Try again in a few minutes.",
      );
      return;
    }
    showCtDecision(await res.json(), correlationId);
  } finally {
    check.disabled = false;
  }
}

function ctGoneText(correlationId) {
  return window.siteText(
    "ch.filing.ct-status-gone",
    "The return with correlation ID {id} is no longer waiting for HMRC. Its receipt is in your receipts once HMRC accepts it.",
    { id: correlationId },
  );
}

async function showCtReturnStatus(correlationId, clientId) {
  const { failed, filing } = await filingInProgress(correlationId, CT600_KIND, clientId);
  if (failed) {
    showNotice(window.siteText("ch.filing.load-failed", "We could not load this filing. Go back to your receipts and try again."));
    return;
  }
  if (!filing) {
    showNotice(ctGoneText(correlationId));
    return;
  }
  const { longDateText } = await import("../lib/long-period.js");
  const company = [filing.companyName, filing.companyNumber].filter(Boolean).join(", ");
  const panel = element("filingStatus");
  panel.replaceChildren(
    create("h2", { id: "filingStatusHeading" }, window.siteText("ch.filing.ct-status-title", "Company Tax Return")),
    create("p", { id: "filingStatusAnswer" }, ctPendingAnswer()),
    create(
      "dl",
      { class: "filing-status-list" },
      ...(company ? [statusRow("filingStatusCompany", window.siteText("ch.filing.ct-status-company", "Company"), company)] : []),
      ...(filing.utr
        ? [statusRow("filingStatusUtr", window.siteText("ch.filing.ct-status-utr", "Unique Taxpayer Reference"), filing.utr)]
        : []),
      ...(filing.periodStart && filing.periodEnd
        ? [
            statusRow(
              "filingStatusPeriod",
              window.siteText("ch.filing.ct-status-period", "Period"),
              window.siteText("widget.date-range", "{start} to {end}", {
                start: longDateText(filing.periodStart),
                end: longDateText(filing.periodEnd),
              }),
            ),
          ]
        : []),
      statusRow(
        "filingStatusSent",
        window.siteText("ch.filing.status-sent", "Sent"),
        filing.submittedAt ? momentText(filing.submittedAt) : "",
      ),
      statusRow("filingStatusNumber", window.siteText("ch.filing.ct-status-correlation-id", "Correlation ID"), filing.correlationId),
      statusRow(
        "filingStatusLastAsked",
        window.siteText("ch.filing.ct-status-last-asked", "Submit last asked HMRC"),
        filing.lastCheckedAt ? momentText(filing.lastCheckedAt) : notAskedYet(),
      ),
    ),
    create(
      "p",
      { id: "filingStatusYouAsked", hidden: "" },
      window.siteText("ch.filing.ct-status-you-asked", "You asked HMRC at "),
      create("span", { id: "filingStatusYouAskedAt" }),
      ".",
    ),
    create(
      "p",
      { class: "hint", id: "filingStatusHow" },
      window.siteText(
        "ch.filing.ct-status-how",
        "Submit asks HMRC for its answer when you press Check now. HMRC usually answers within minutes.",
      ),
    ),
    create(
      "p",
      { id: "filingStatusWarning", class: "filing-notice" },
      window.siteText(
        "ch.filing.ct-status-warning",
        "Do not file it again while it waits: a new return for this company and period would go to HMRC beside the return with correlation ID {id}.",
        { id: filing.correlationId },
      ),
    ),
    create("button", { type: "button", id: "checkNowBtn", class: "btn" }, window.siteText("ch.filing.status-check-now", "Check now")),
  );
  element("checkNowBtn").addEventListener("click", () => checkCtNow(filing.correlationId, filing.clientId ?? clientId));
  panel.hidden = false;
}

function start() {
  const query = new URLSearchParams(window.location.search);
  const receiptName = query.get("receipt");
  if (!localStorage.getItem("cognitoIdToken")) {
    return;
  }
  if (!receiptName && query.get("filing") && query.get("kind") === CT600_KIND) {
    return showCtReturnStatus(query.get("filing"), query.get("clientId"));
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
window.showCtReturnStatus = showCtReturnStatus;

if (window.__submitReady__) {
  start();
} else {
  document.addEventListener("submit-ready", start, { once: true });
}
