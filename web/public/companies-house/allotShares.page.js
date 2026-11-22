// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Return an allotment of shares: companyView -> formView -> reviewView -> resultView. The return
// carries the company's statement of capital after the allotment, so the page reads the capital the
// register holds (the read takes the company authentication code), the reader checks it and types
// the shares allotted, and the page adds the two up as they type.

const FORM_KIND = "allotment-of-shares";
const CURRENCIES = ["GBP", "EUR", "USD"];

let company = null;
let filing = null;
let shareCapital = null;
// The rights typed for each class the allotment starts, by the class in lower case.
const newClassRights = new Map();

function showView(name) {
  ["companyView", "formView", "reviewView", "resultView"].forEach((id) => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}

function showError(message) {
  if (window.showStatus) window.showStatus(message, "error");
}

// One labelled field of a row. Each row's fields share the row's number in their ids.
function field({ id, label, hint, value = "", multiline = false, className = "" }) {
  const group = document.createElement("div");
  group.className = "form-group";
  const labelElement = document.createElement("label");
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  group.appendChild(labelElement);
  const input = document.createElement(multiline ? "textarea" : "input");
  input.id = id;
  input.name = id;
  if (multiline) input.rows = 3;
  else input.type = "text";
  if (className) input.className = className;
  input.value = value;
  if (hint) {
    const hintElement = document.createElement("p");
    hintElement.id = `${id}-hint`;
    hintElement.className = "hint";
    hintElement.textContent = hint;
    group.appendChild(hintElement);
    input.setAttribute("aria-describedby", hintElement.id);
  }
  group.appendChild(input);
  return group;
}

function rowHolder(container, className, heading, removable) {
  const row = document.createElement("div");
  row.className = `form-section ${className}`;
  const title = document.createElement("h4");
  title.textContent = heading;
  row.appendChild(title);
  if (removable) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-small remove-row";
    remove.textContent = window.siteText("ch.allot.remove", "Remove");
    remove.addEventListener("click", () => {
      row.remove();
      renderAfter();
    });
    row.appendChild(remove);
  }
  container.appendChild(row);
  return row;
}

let rowNumber = 0;

function addAllotmentRow() {
  const container = document.getElementById("allotmentRows");
  const n = ++rowNumber;
  const row = rowHolder(container, "allotment-row", window.siteText("ch.allot.allotment", "Allotment"), container.children.length > 0);
  row.dataset.row = String(n);
  row.append(
    field({
      id: `allot-class-${n}`,
      label: window.siteText("ch.allot.class", "Class of shares"),
      hint: window.siteText("ch.allot.class-hint", "For example, Ordinary or Preference."),
    }),
    field({ id: `allot-number-${n}`, label: window.siteText("ch.allot.number", "Number of shares allotted") }),
    field({ id: `allot-nominal-${n}`, label: window.siteText("ch.allot.nominal", "Nominal value of each share") }),
    field({ id: `allot-paid-${n}`, label: window.siteText("ch.allot.paid", "Amount paid (including share premium) on each share") }),
    field({
      id: `allot-unpaid-${n}`,
      label: window.siteText("ch.allot.unpaid", "Amount (if any) unpaid (including share premium) on each share"),
      value: "0",
    }),
    field({
      id: `allot-consideration-${n}`,
      label: window.siteText("ch.allot.consideration", "Details of non-cash consideration (optional)"),
      hint: window.siteText(
        "ch.allot.consideration-hint",
        "If the allotted shares are fully or partly paid up otherwise than in cash, state the consideration for which the shares were allotted.",
      ),
      multiline: true,
    }),
  );
}

function addBeforeRow(share = {}) {
  const container = document.getElementById("beforeRows");
  const n = ++rowNumber;
  const row = rowHolder(container, "before-row", window.siteText("ch.allot.before-class", "Class of shares held before"), true);
  row.dataset.row = String(n);
  row.append(
    field({ id: `before-class-${n}`, label: window.siteText("ch.allot.class", "Class of shares"), value: share.shareClass }),
    field({ id: `before-number-${n}`, label: window.siteText("ch.allot.before-number", "Number of shares"), value: share.numShares }),
    field({
      id: `before-nominal-${n}`,
      label: window.siteText("ch.allot.before-nominal", "Aggregate nominal value"),
      hint: window.siteText("ch.allot.before-nominal-hint", "Number of shares issued multiplied by nominal value."),
      value: share.aggregateNominalValue,
    }),
    field({
      id: `before-rights-${n}`,
      label: window.siteText("ch.allot.rights", "Prescribed particulars of rights attached to the shares"),
      hint: window.siteText(
        "ch.allot.rights-hint",
        "Voting rights, rights to dividends, rights to capital on a distribution (including on winding up), and whether the shares are to be redeemed.",
      ),
      value: share.prescribedParticulars,
      multiline: true,
    }),
  );
}

const typed = (id) => document.getElementById(id).value.trim();

function readAllotments() {
  return Array.from(document.querySelectorAll("#allotmentRows .allotment-row")).map((row) => {
    const n = row.dataset.row;
    return {
      row: n,
      shareClass: typed(`allot-class-${n}`),
      numShares: typed(`allot-number-${n}`),
      nominalValue: typed(`allot-nominal-${n}`),
      amountPaidPerShare: typed(`allot-paid-${n}`),
      amountUnpaidPerShare: typed(`allot-unpaid-${n}`),
      consideration: typed(`allot-consideration-${n}`),
    };
  });
}

function readBefore() {
  return {
    totalAmountUnpaid: typed("unpaidBefore"),
    shares: Array.from(document.querySelectorAll("#beforeRows .before-row")).map((row) => {
      const n = row.dataset.row;
      return {
        row: n,
        shareClass: typed(`before-class-${n}`),
        numShares: typed(`before-number-${n}`),
        aggregateNominalValue: typed(`before-nominal-${n}`),
        prescribedParticulars: typed(`before-rights-${n}`),
      };
    }),
  };
}

// The capital after the allotment, with the rights typed for each class the allotment starts.
function capitalAfter() {
  const after = shareCapital.capitalAfterAllotments(readBefore(), readAllotments());
  after.shares.forEach((share) => {
    if (share.added) share.prescribedParticulars = newClassRights.get(share.shareClass.toLowerCase()) || "";
  });
  return after;
}

function renderAfter() {
  if (!shareCapital) return;
  document
    .querySelectorAll("#newClassParticulars textarea")
    .forEach((area) => newClassRights.set(area.dataset.shareClass, area.value.trim()));
  const after = capitalAfter();
  const body = document.getElementById("afterBody");
  body.replaceChildren(
    ...after.shares.map((share) => {
      const row = document.createElement("tr");
      const labels = Array.from(document.querySelectorAll("#afterTable thead th")).map((heading) => heading.textContent.trim());
      [share.shareClass, share.numShares, share.aggregateNominalValue].forEach((value, index) => {
        const cell = document.createElement("td");
        if (index > 0) cell.className = "amount";
        cell.dataset.label = labels[index];
        cell.textContent = value;
        row.appendChild(cell);
      });
      return row;
    }),
  );
  const [, numberLabel, nominalLabel] = Array.from(document.querySelectorAll("#afterTable thead th")).map((heading) =>
    heading.textContent.trim(),
  );
  const totalNumber = document.getElementById("afterTotalNumber");
  totalNumber.textContent = after.totalNumberOfIssuedShares;
  totalNumber.dataset.label = numberLabel;
  const totalNominal = document.getElementById("afterTotalNominal");
  totalNominal.textContent = after.totalAggregateNominalValue;
  totalNominal.dataset.label = nominalLabel;
  document.getElementById("afterUnpaid").textContent = after.totalAmountUnpaid;
  const holder = document.getElementById("newClassParticulars");
  const wanted = after.shares.filter((share) => share.added).map((share) => share.shareClass);
  const shown = Array.from(holder.querySelectorAll("textarea")).map((area) => area.dataset.label);
  if (wanted.join("\n") === shown.join("\n")) return;
  holder.replaceChildren(
    ...wanted.map((shareClass, index) => {
      const group = field({
        id: `new-rights-${index}`,
        label: window.siteText("ch.allot.new-rights", "Prescribed particulars of rights attached to the new class {name}", {
          name: shareClass,
        }),
        hint: window.siteText(
          "ch.allot.rights-hint",
          "Voting rights, rights to dividends, rights to capital on a distribution (including on winding up), and whether the shares are to be redeemed.",
        ),
        value: newClassRights.get(shareClass.toLowerCase()) || "",
        multiline: true,
      });
      const area = group.querySelector("textarea");
      area.dataset.shareClass = shareClass.toLowerCase();
      area.dataset.label = shareClass;
      return group;
    }),
  );
}

function fillBefore(capital) {
  document.getElementById("beforeRows").replaceChildren();
  const source = document.getElementById("beforeSource");
  if (capital && capital.shares && capital.shares.length > 0) {
    capital.shares.forEach(addBeforeRow);
    document.getElementById("unpaidBefore").value = capital.totalAmountUnpaid || "0";
    if (CURRENCIES.includes(capital.shareCurrency)) document.getElementById("currency").value = capital.shareCurrency;
    source.textContent = window.siteText(
      "ch.allot.before-from-register",
      "This is the share capital Companies House holds for the company. Check it, and correct it if an earlier allotment is not on the register yet.",
    );
  } else {
    addBeforeRow();
    source.textContent = window.siteText(
      "ch.allot.before-typed",
      "Companies House gave no statement of capital for this company. Enter each class of shares the company had before the allotment.",
    );
  }
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber", "companyAuthCode"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  const companyAuthCode = typed("companyAuthCode");
  showLoading();
  try {
    shareCapital = shareCapital || (await import("/lib/share-capital.js"));
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber, companyName: profile.companyName, companyAuthCode };
    let registerCapital = null;
    try {
      const data = await window.getConfirmationStatementFilingData(companyNumber, {
        companyAuthCode,
        madeUpDate: profile.confirmationStatementNextMadeUpTo || new Date().toISOString().slice(0, 10),
        companyType: profile.companyType,
      });
      registerCapital = data.statementOfCapital || null;
    } catch (error) {
      console.warn("Could not read the company's share capital from Companies House:", error);
      if (error && error.status === 400) {
        showError(window.companiesHouseFormPage.errorText(error));
        return;
      }
    }
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    document.getElementById("allotmentRows").replaceChildren();
    newClassRights.clear();
    addAllotmentRow();
    fillBefore(registerCapital);
    renderAfter();
    showView("formView");
  } catch (error) {
    console.error("Could not read the company from Companies House:", error);
    showError(window.siteText("ch.allot.lookup-failed", "Could not read this company from Companies House."));
  } finally {
    hideLoading();
  }
}

// What is wrong with what the reader typed, as a sentence, or null.
function problemOf(allotments, before, after) {
  const number = (value) => shareCapital.toMillionths(value);
  for (const share of before.shares) {
    if (!share.shareClass && !share.numShares && !share.aggregateNominalValue && !share.prescribedParticulars) continue;
    if (!share.shareClass || !number(share.numShares) || !number(share.aggregateNominalValue) || !share.prescribedParticulars) {
      return window.siteText(
        "ch.allot.problem-before",
        "Give each class of shares held before the allotment its name, its number of shares, its aggregate nominal value and the rights attached to it.",
      );
    }
  }
  for (const allotment of allotments) {
    if (!allotment.shareClass || !number(allotment.numShares) || !number(allotment.nominalValue)) {
      return window.siteText(
        "ch.allot.problem-allotment",
        "Give each allotment its class of shares, the number of shares allotted and the nominal value of each share.",
      );
    }
    const paid = number(allotment.amountPaidPerShare);
    const unpaid = number(allotment.amountUnpaidPerShare);
    if (paid === null || unpaid === null) {
      return window.siteText(
        "ch.allot.problem-amounts",
        "Enter the amount paid and the amount unpaid on each share as numbers. Enter 0 where there is none.",
      );
    }
    if (paid + unpaid < number(allotment.nominalValue)) {
      return window.siteText(
        "ch.allot.problem-discount",
        "The amount paid and the amount unpaid on each {name} share add up to less than its nominal value of {nominal}.",
        { name: allotment.shareClass, nominal: allotment.nominalValue },
      );
    }
  }
  if (number(before.totalAmountUnpaid) === null) {
    return window.siteText(
      "ch.allot.problem-unpaid",
      "Enter the total aggregate amount unpaid before the allotment as a number. Enter 0 if the shares are fully paid.",
    );
  }
  const withoutRights = after.shares.find((share) => !share.prescribedParticulars);
  if (withoutRights) {
    return window.siteText("ch.allot.problem-rights", "Give the prescribed particulars of rights attached to the {name} shares.", {
      name: withoutRights.shareClass,
    });
  }
  return null;
}

function handleAllotmentSubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["startDate"])) return;
  const startDate = typed("startDate");
  const endDate = typed("endDate");
  if (endDate && endDate < startDate) {
    showError(window.siteText("ch.allot.problem-dates", "The to date cannot be before the from date."));
    return;
  }
  renderAfter();
  const allotments = readAllotments();
  const before = readBefore();
  const after = capitalAfter();
  const problem = problemOf(allotments, before, after);
  if (problem) {
    showError(problem);
    return;
  }
  const currency = document.getElementById("currency").value;
  filing = {
    after,
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: company.companyAuthCode,
      dateSigned: new Date().toISOString().slice(0, 10),
      startDate,
      ...(endDate ? { endDate } : {}),
      allotments: allotments.map(({ row, consideration, ...allotment }) => ({
        ...allotment,
        currency,
        ...(consideration ? { consideration } : {}),
      })),
      statementOfCapital: [
        {
          currency,
          totalAmountUnpaid: after.totalAmountUnpaid,
          shares: after.shares.map(({ shareClass, prescribedParticulars, numShares, aggregateNominalValue }) => ({
            shareClass,
            prescribedParticulars,
            numShares,
            aggregateNominalValue,
          })),
        },
      ],
    },
  };
  if (window.hideStatus) window.hideStatus();
  renderReview();
  showView("reviewView");
}

function reviewRows() {
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  const { form, after } = filing;
  const currency = form.statementOfCapital[0].currency;
  const rows = [
    [window.siteText("ch.allot.review-company", "Company"), `${company.companyName} (${company.companyNumber})`],
    [
      window.siteText("ch.allot.review-dates", "Allotment dates"),
      form.endDate
        ? window.siteText("ch.allot.review-period", "{from} to {to}", { from: formatDate(form.startDate), to: formatDate(form.endDate) })
        : formatDate(form.startDate),
    ],
  ];
  form.allotments.forEach((allotment) => {
    rows.push([
      window.siteText("ch.allot.review-allotted", "Shares allotted"),
      window.siteText(
        "ch.allot.review-allotment",
        "{number} {name} shares of {currency} {nominal} each; {paid} paid and {unpaid} unpaid on each share",
        {
          number: allotment.numShares,
          name: allotment.shareClass,
          currency,
          nominal: allotment.nominalValue,
          paid: allotment.amountPaidPerShare,
          unpaid: allotment.amountUnpaidPerShare,
        },
      ),
    ]);
    if (allotment.consideration)
      rows.push([window.siteText("ch.allot.review-consideration", "Non-cash consideration"), allotment.consideration]);
  });
  after.shares.forEach((share) => {
    rows.push([
      window.siteText("ch.allot.review-class", "Capital after: {name}", { name: share.shareClass }),
      window.siteText("ch.allot.review-class-line", "{number} shares, aggregate nominal value {currency} {nominal}. {rights}", {
        number: share.numShares,
        currency,
        nominal: share.aggregateNominalValue,
        rights: share.prescribedParticulars,
      }),
    ]);
  });
  rows.push([
    window.siteText("ch.allot.review-totals", "Capital after: totals"),
    window.siteText(
      "ch.allot.review-totals-line",
      "{number} shares, aggregate nominal value {currency} {nominal}, total aggregate amount unpaid {currency} {unpaid}",
      {
        number: after.totalNumberOfIssuedShares,
        currency,
        nominal: after.totalAggregateNominalValue,
        unpaid: after.totalAmountUnpaid,
      },
    ),
  ]);
  return rows;
}

function renderReview() {
  const list = document.getElementById("reviewList");
  list.replaceChildren();
  reviewRows().forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  });
}

async function handleFile() {
  const scenario = document.getElementById("govTestScenario").value.trim();
  const headers = scenario ? { "Gov-Test-Scenario": scenario } : {};
  showView("resultView");
  showLoading();
  try {
    await window.companiesHouseFormPage.fileAndShowOutcome({
      kind: FORM_KIND,
      form: filing.form,
      result: document.getElementById("filingResult"),
      headers,
    });
  } finally {
    hideLoading();
  }
}

function startAgain() {
  company = null;
  filing = null;
  document.getElementById("companyForm").reset();
  document.getElementById("allotmentForm").reset();
  document.getElementById("filingResult").replaceChildren();
  showView("companyView");
}

function updateGovTestScenarioVisibility() {
  const developerModeEnabled = sessionStorage.getItem("showDeveloperOptions") === "true";
  document.getElementById("govTestScenarioGroup").style.display = developerModeEnabled ? "block" : "none";
}

document.getElementById("companyForm").addEventListener("submit", handleCompanySubmit);
document.getElementById("allotmentForm").addEventListener("submit", handleAllotmentSubmit);
document.getElementById("allotmentForm").addEventListener("input", renderAfter);
document.getElementById("addAllotmentBtn").addEventListener("click", addAllotmentRow);
document.getElementById("addClassBtn").addEventListener("click", () => addBeforeRow());
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
