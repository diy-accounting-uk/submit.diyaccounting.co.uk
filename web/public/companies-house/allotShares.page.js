// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

// Return an allotment of shares: companyView -> formView -> reviewView -> resultView. The return
// carries the company's statement of capital after the allotment, a table for each currency, so the
// page reads the capital the register holds in each currency (the read takes the company
// authentication code), the reader checks it and types the shares allotted, each in its currency, and
// the page adds them up as they type, keeping each class in its own currency.

const FORM_KIND = "allotment-of-shares";
const CURRENCIES = ["GBP", "EUR", "USD"];

let company = null;
let filing = null;
let shareCapital = null;
let allotmentDates = null;
let approvalDateCheck = null;

// Today's date in the UK, as YYYY-MM-DD, by the rule the route applies.
const todayInLondon = () => approvalDateCheck.todayInLondon(new Date());
// The rights typed for each class the allotment starts, by its currency and its class in lower case.
const newClassRights = new Map();
const rightsKey = (currency, shareClass) => `${currency} ${shareClass.toLowerCase()}`;

function currencyName(currency) {
  if (currency === "EUR") return window.siteText("ch.allot.currency-eur", "Euro (EUR)");
  if (currency === "USD") return window.siteText("ch.allot.currency-usd", "US dollar (USD)");
  return window.siteText("ch.allot.currency-gbp", "Pound sterling (GBP)");
}

function showView(name) {
  ["companyView", "formView", "reviewView", "resultView"].forEach((id) => {
    document.getElementById(id).style.display = id === name ? "block" : "none";
  });
}

function showError(message) {
  if (window.showStatus) window.showStatus(message, "error");
}

// One labelled field of a row. Each row's fields share the row's number in their ids.
// gatewayText false marks a box the gateway takes any text in, so the page's character check passes it.
function field({ id, label, hint, value = "", multiline = false, className = "", gatewayText = true }) {
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
  if (!gatewayText) input.dataset.gatewayText = "off";
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
      offerRemovalWhileAnotherIsLeft(container);
      renderAfter();
    });
    row.appendChild(remove);
  }
  container.appendChild(row);
  offerRemovalWhileAnotherIsLeft(container);
  return row;
}

// A row can be removed while another row of its kind is left.
function offerRemovalWhileAnotherIsLeft(container) {
  const buttons = container.querySelectorAll(":scope > .form-section > .remove-row");
  buttons.forEach((button) => {
    button.hidden = container.children.length < 2;
  });
}

let rowNumber = 0;

// A labelled choice of the currencies a return is taken in.
function currencyField(id, value) {
  const group = document.createElement("div");
  group.className = "form-group";
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = window.siteText("ch.allot.currency", "Currency");
  const select = document.createElement("select");
  select.id = id;
  select.name = id;
  CURRENCIES.forEach((currency) => {
    const option = document.createElement("option");
    option.value = currency;
    option.textContent = currencyName(currency);
    select.appendChild(option);
  });
  select.value = CURRENCIES.includes(value) ? value : CURRENCIES[0];
  select.addEventListener("change", renderAfter);
  group.append(label, select);
  return group;
}

// The currency of the first capital table, which a new allotment starts in.
function firstTableCurrency() {
  const select = document.querySelector("#beforeTables .capital-table select");
  return select ? select.value : CURRENCIES[0];
}

function addAllotmentRow() {
  const container = document.getElementById("allotmentRows");
  const n = ++rowNumber;
  const row = rowHolder(container, "allotment-row", window.siteText("ch.allot.allotment", "Allotment"), true);
  row.dataset.row = String(n);
  row.append(
    field({
      id: `allot-class-${n}`,
      label: window.siteText("ch.allot.class", "Class of shares"),
      hint: window.siteText("ch.allot.class-hint", "For example, Ordinary or Preference."),
    }),
    currencyField(`allot-currency-${n}`, firstTableCurrency()),
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

// A table of the classes held before the allotment in one currency, with its total unpaid.
function addCapitalTable(capital = {}) {
  const container = document.getElementById("beforeTables");
  const n = ++rowNumber;
  const table = rowHolder(
    container,
    "capital-table",
    window.siteText("ch.allot.currency-table", "Shares held before, in one currency"),
    container.children.length > 0,
  );
  table.dataset.table = String(n);
  const classes = document.createElement("div");
  classes.className = "capital-classes";
  const addClass = document.createElement("button");
  addClass.type = "button";
  addClass.className = "btn-small";
  addClass.textContent = window.siteText("ch.allot.add-class", "Add a class of shares");
  addClass.addEventListener("click", () => addBeforeRow(classes));
  table.append(
    currencyField(`capital-currency-${n}`, capital.shareCurrency),
    classes,
    addClass,
    field({
      id: `capital-unpaid-${n}`,
      label: window.siteText("ch.allot.unpaid-before", "Total aggregate amount unpaid before the allotment"),
      hint: window.siteText(
        "ch.allot.unpaid-before-hint",
        "Including both the nominal value and any share premium. Enter 0 if the shares are fully paid.",
      ),
      value: capital.totalAmountUnpaid || "0",
    }),
  );
  const shares = capital.shares && capital.shares.length > 0 ? capital.shares : [{}];
  shares.forEach((share) => addBeforeRow(classes, share));
  return table;
}

function addBeforeRow(container, share = {}) {
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
      gatewayText: false,
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
      currency: typed(`allot-currency-${n}`),
      numShares: typed(`allot-number-${n}`),
      nominalValue: typed(`allot-nominal-${n}`),
      amountPaidPerShare: typed(`allot-paid-${n}`),
      amountUnpaidPerShare: typed(`allot-unpaid-${n}`),
      consideration: typed(`allot-consideration-${n}`),
    };
  });
}

// The capital before the allotment, a table for each currency.
function readBefore() {
  return Array.from(document.querySelectorAll("#beforeTables .capital-table")).map((table) => {
    const n = table.dataset.table;
    return {
      currency: typed(`capital-currency-${n}`),
      totalAmountUnpaid: typed(`capital-unpaid-${n}`),
      shares: Array.from(table.querySelectorAll(".before-row")).map((row) => {
        const r = row.dataset.row;
        return {
          shareClass: typed(`before-class-${r}`),
          numShares: typed(`before-number-${r}`),
          aggregateNominalValue: typed(`before-nominal-${r}`),
          prescribedParticulars: typed(`before-rights-${r}`),
        };
      }),
    };
  });
}

const isBlankClass = (share) => !share.shareClass && !share.numShares && !share.aggregateNominalValue && !share.prescribedParticulars;

// The capital after the allotment in each currency the company holds or allots shares in, with the
// rights typed for each class the allotment starts. A currency with no shares after is left out.
function capitalsAfter() {
  const before = readBefore();
  const allotments = readAllotments();
  const currencies = [...new Set([...before.map((table) => table.currency), ...allotments.map((allotment) => allotment.currency)])];
  return currencies
    .map((currency) => {
      const table = before.find((each) => each.currency === currency) || { totalAmountUnpaid: "0", shares: [] };
      const after = shareCapital.capitalAfterAllotments(
        { totalAmountUnpaid: table.totalAmountUnpaid, shares: table.shares.filter((share) => !isBlankClass(share)) },
        allotments.filter((allotment) => allotment.currency === currency),
      );
      after.shares.forEach((share) => {
        if (share.added) share.prescribedParticulars = newClassRights.get(rightsKey(currency, share.shareClass)) || "";
      });
      return { currency, ...after };
    })
    .filter((capital) => capital.shares.length > 0);
}

function afterTable(capital) {
  const holder = document.createElement("div");
  holder.className = "after-capital";
  holder.dataset.currency = capital.currency;
  const heading = document.createElement("h4");
  heading.textContent = currencyName(capital.currency);
  const labels = [
    window.siteText("ch.allot.after-class", "Class of shares"),
    window.siteText("ch.allot.after-number", "Number of shares"),
    window.siteText("ch.allot.after-nominal", "Aggregate nominal value"),
  ];
  const table = document.createElement("table");
  table.className = "results-table";
  const head = table.createTHead().insertRow();
  labels.forEach((label, index) => {
    const th = document.createElement("th");
    th.scope = "col";
    if (index > 0) th.className = "amount";
    th.textContent = label;
    head.appendChild(th);
  });
  const body = table.createTBody();
  const addRow = (values, total) => {
    const row = body.insertRow();
    if (total) row.className = "after-totals";
    values.forEach((value, index) => {
      const cell = row.insertCell();
      if (index > 0) cell.className = "amount";
      if (total && index === 0) {
        const strong = document.createElement("strong");
        strong.textContent = value;
        cell.appendChild(strong);
        return;
      }
      cell.dataset.label = labels[index];
      cell.textContent = value;
    });
  };
  capital.shares.forEach((share) => addRow([share.shareClass, share.numShares, share.aggregateNominalValue]));
  addRow([window.siteText("ch.allot.after-totals", "Totals"), capital.totalNumberOfIssuedShares, capital.totalAggregateNominalValue], true);
  const unpaid = document.createElement("p");
  unpaid.className = "after-unpaid";
  unpaid.textContent = window.siteText("ch.allot.after-unpaid", "Total aggregate amount unpaid: {amount}", {
    amount: capital.totalAmountUnpaid,
  });
  holder.append(heading, table, unpaid);
  return holder;
}

function renderAfter() {
  if (!shareCapital) return;
  document.querySelectorAll("#newClassParticulars textarea").forEach((area) => newClassRights.set(area.dataset.key, area.value.trim()));
  const capitals = capitalsAfter();
  document.getElementById("afterTables").replaceChildren(...capitals.map(afterTable));
  document.getElementById("addCurrencyBtn").disabled =
    document.querySelectorAll("#beforeTables .capital-table").length >= CURRENCIES.length;
  const holder = document.getElementById("newClassParticulars");
  const wanted = capitals.flatMap((capital) =>
    capital.shares.filter((share) => share.added).map((share) => ({ currency: capital.currency, shareClass: share.shareClass })),
  );
  const shown = Array.from(holder.querySelectorAll("textarea")).map((area) => area.dataset.label);
  const wantedLabels = wanted.map(({ currency, shareClass }) => `${currency} ${shareClass}`);
  if (wantedLabels.join("\n") === shown.join("\n")) return;
  holder.replaceChildren(
    ...wanted.map(({ currency, shareClass }, index) => {
      const group = field({
        id: `new-rights-${index}`,
        label: window.siteText(
          "ch.allot.new-rights-currency",
          "Prescribed particulars of rights attached to the new class {name} ({currency})",
          { name: shareClass, currency },
        ),
        hint: window.siteText(
          "ch.allot.rights-hint",
          "Voting rights, rights to dividends, rights to capital on a distribution (including on winding up), and whether the shares are to be redeemed.",
        ),
        value: newClassRights.get(rightsKey(currency, shareClass)) || "",
        multiline: true,
        gatewayText: false,
      });
      const area = group.querySelector("textarea");
      area.dataset.key = rightsKey(currency, shareClass);
      area.dataset.label = `${currency} ${shareClass}`;
      return group;
    }),
  );
}

function fillBefore(capitals, { readFailed = false } = {}) {
  document.getElementById("beforeTables").replaceChildren();
  const source = document.getElementById("beforeSource");
  const held = capitals.filter((capital) => capital.shares && capital.shares.length > 0);
  if (held.length > 0) {
    held.forEach(addCapitalTable);
    source.textContent = window.siteText(
      "ch.allot.before-from-register",
      "This is the share capital Companies House holds for the company. The return must start from it: Submit checks it against the register again when you file and sends no return that differs. File an earlier allotment that is not on the register yet first.",
    );
  } else {
    addCapitalTable();
    source.textContent = readFailed
      ? window.siteText(
          "ch.allot.before-read-failed",
          "Submit could not read the company's share capital from Companies House. Enter each class of shares the company had before the allotment as the register holds it: Submit checks it against the register when you file and sends no return that differs.",
        )
      : window.siteText(
          "ch.allot.before-typed",
          "Companies House holds no share capital for this company, so the return starts from none. Enter only the shares allotted below.",
        );
  }
}

// The register's capital in each currency; an answer that gives only the first currency's is read as that one.
function registerCapitalsOf(data) {
  if (Array.isArray(data.statementsOfCapital)) return data.statementsOfCapital;
  return data.statementOfCapital ? [data.statementOfCapital] : [];
}

async function handleCompanySubmit(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyNumber", "companyAuthCode"])) return;
  const companyNumber = window.normaliseCompanyNumber(document.getElementById("companyNumber").value);
  const companyAuthCode = typed("companyAuthCode");
  showLoading();
  try {
    shareCapital = shareCapital || (await import("/lib/share-capital.js"));
    allotmentDates = allotmentDates || (await import("/lib/allotment-dates.js"));
    approvalDateCheck = approvalDateCheck || (await import("/lib/approval-date-check.js"));
    const profile = await window.getCompanyProfile(companyNumber);
    company = { companyNumber, companyName: profile.companyName, companyAuthCode };
    let registerCapitals = [];
    let capitalReadFailed = false;
    try {
      // Dated today, as the filing route's own read of the register is.
      const data = await window.getConfirmationStatementFilingData(companyNumber, {
        companyAuthCode,
        madeUpDate: new Date().toISOString().slice(0, 10),
      });
      registerCapitals = registerCapitalsOf(data);
    } catch (error) {
      console.warn("Could not read the company's share capital from Companies House:", error);
      if (error && error.status === 400) {
        showError(window.companiesHouseFormPage.errorText(error));
        return;
      }
      capitalReadFailed = true;
    }
    const otherCurrency = registerCapitals.find((capital) => !CURRENCIES.includes(capital.shareCurrency));
    if (otherCurrency) {
      showError(
        window.siteText(
          "ch.allot.other-currency",
          "The company has shares in {currency}. This page files a return of allotment for shares in pounds sterling, euros and US dollars only.",
          { currency: otherCurrency.shareCurrency },
        ),
      );
      return;
    }
    document.getElementById("formCompanyName").textContent = company.companyName;
    document.getElementById("formCompanyNumber").textContent = company.companyNumber;
    document.getElementById("allotmentRows").replaceChildren();
    newClassRights.clear();
    fillBefore(registerCapitals, { readFailed: capitalReadFailed });
    addAllotmentRow();
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
function problemOf(allotments, before, capitals) {
  const number = (value) => shareCapital.toMillionths(value);
  const currencies = before.map((table) => table.currency);
  const repeated = currencies.find((currency, index) => currencies.indexOf(currency) !== index);
  if (repeated) {
    return window.siteText(
      "ch.allot.problem-currency-twice",
      "The shares held before the allotment have two tables in {currency}. Put every class in that currency in one table.",
      { currency: repeated },
    );
  }
  for (const table of before) {
    for (const share of table.shares) {
      if (isBlankClass(share)) continue;
      if (!share.shareClass || !number(share.numShares) || !number(share.aggregateNominalValue) || !share.prescribedParticulars) {
        return window.siteText(
          "ch.allot.problem-before",
          "Give each class of shares held before the allotment its name, its number of shares, its aggregate nominal value and the rights attached to it.",
        );
      }
    }
    if (number(table.totalAmountUnpaid) === null) {
      return window.siteText(
        "ch.allot.problem-unpaid",
        "Enter the total aggregate amount unpaid before the allotment as a number. Enter 0 if the shares are fully paid.",
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
    if (
      shareCapital.multiplyDecimals(allotment.numShares, allotment.nominalValue) === null ||
      shareCapital.multiplyDecimals(allotment.numShares, allotment.amountUnpaidPerShare) === null
    ) {
      return window.siteText(
        "ch.allot.problem-decimal-places",
        "The number of {name} shares times the nominal value or the amount unpaid on each share has more than 6 decimal places. Companies House takes amounts to 6 decimal places.",
        { name: allotment.shareClass },
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
  const withoutRights = capitals.flatMap((capital) => capital.shares).find((share) => !share.prescribedParticulars);
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
  if ((endDate || startDate) > todayInLondon()) {
    showError(
      window.siteText("ch.allot.problem-future", "The shares cannot have been allotted after today. Enter the dates they were allotted."),
    );
    return;
  }
  renderAfter();
  const allotments = readAllotments();
  const before = readBefore();
  const capitals = capitalsAfter();
  const problem = problemOf(allotments, before, capitals);
  if (problem) {
    showError(problem);
    return;
  }
  filing = {
    capitals,
    form: {
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      companyAuthCode: company.companyAuthCode,
      dateSigned: new Date().toISOString().slice(0, 10),
      startDate,
      ...(endDate ? { endDate } : {}),
      allotments: allotments.map(({ row, consideration, ...allotment }) => ({
        ...allotment,
        ...(consideration ? { consideration } : {}),
      })),
      statementOfCapital: capitals.map((capital) => ({
        currency: capital.currency,
        totalAmountUnpaid: capital.totalAmountUnpaid,
        shares: capital.shares.map(({ shareClass, prescribedParticulars, numShares, aggregateNominalValue }) => ({
          shareClass,
          prescribedParticulars,
          numShares,
          aggregateNominalValue,
        })),
      })),
    },
  };
  if (window.hideStatus) window.hideStatus();
  document.getElementById("capitalWarning").hidden = true;
  renderReview();
  showView("reviewView");
}

function reviewRows() {
  const formatDate = (iso) => window.companiesHouseLabels.formatCompanyDate(iso);
  const { form, capitals } = filing;
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
          currency: allotment.currency,
          nominal: allotment.nominalValue,
          paid: allotment.amountPaidPerShare,
          unpaid: allotment.amountUnpaidPerShare,
        },
      ),
    ]);
    if (allotment.consideration)
      rows.push([window.siteText("ch.allot.review-consideration", "Non-cash consideration"), allotment.consideration]);
  });
  capitals.forEach((capital) => {
    const currency = capital.currency;
    capital.shares.forEach((share) => {
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
      window.siteText("ch.allot.review-totals-currency", "Capital after: totals in {currency}", { currency }),
      window.siteText(
        "ch.allot.review-totals-line",
        "{number} shares, aggregate nominal value {currency} {nominal}, total aggregate amount unpaid {currency} {unpaid}",
        {
          number: capital.totalNumberOfIssuedShares,
          currency,
          nominal: capital.totalAggregateNominalValue,
          unpaid: capital.totalAmountUnpaid,
        },
      ),
    ]);
  });
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
  renderLateNote();
}

// A return filed more than one month after the first allotment it returns is late. Companies House
// still takes it; the review says so, with the date the first allotment set.
function renderLateNote() {
  document.getElementById("lateReturn")?.remove();
  if (!allotmentDates.isLateReturn(filing.form, todayInLondon())) return;
  const note = document.createElement("p");
  note.id = "lateReturn";
  note.className = "hint";
  note.setAttribute("role", "note");
  const date = window.companiesHouseLabels.formatCompanyDate(allotmentDates.returnDueDateFor(filing.form));
  // A return for a period names its first allotment, whose month runs first.
  note.textContent = filing.form.endDate
    ? window.siteText(
        "ch.allot.late-return-period",
        "This return is late. The law asks for it within one month of the first allotment, by {date}. Companies House still takes it, and a fine can follow.",
        { date },
      )
    : window.siteText(
        "ch.allot.late-return",
        "This return is late. The law asks for it within one month of the allotment, by {date}. Companies House still takes it, and a fine can follow.",
        { date },
      );
  document.getElementById("reviewList").after(note);
}

const CAPITAL_MISMATCH_REASON = "capital-before-differs-from-register";

// One difference between the capital before the allotment that the return states and the register's,
// in the reader's language.
function mismatchText(mismatch) {
  if (mismatch.totalAmountUnpaid) {
    return window.siteText(
      "ch.allot.mismatch-unpaid",
      "Total amount unpaid in {currency} before the allotment: {stated} in this return, {register} on the register.",
      { currency: mismatch.currency, stated: mismatch.stated.totalAmountUnpaid, register: mismatch.register.totalAmountUnpaid },
    );
  }
  return window.siteText(
    "ch.allot.mismatch-class",
    "{currency} {name} shares before the allotment: {returnnumber} shares of aggregate nominal value {returnvalue} in this return, {registernumber} shares of aggregate nominal value {registervalue} on the register.",
    {
      currency: mismatch.currency,
      name: mismatch.shareClass,
      returnnumber: mismatch.stated.numShares,
      returnvalue: mismatch.stated.aggregateNominalValue,
      registernumber: mismatch.register.numShares,
      registervalue: mismatch.register.aggregateNominalValue,
    },
  );
}

// The route's refusal of a capital that differs from the register: back to the review, with both
// capitals and the confirmation the filing then needs.
function showCapitalWarning(error) {
  if (error?.body?.reason !== CAPITAL_MISMATCH_REASON || !Array.isArray(error.body.mismatches)) return false;
  document.getElementById("capitalWarningList").replaceChildren(
    ...error.body.mismatches.map((mismatch) => {
      const item = document.createElement("li");
      item.textContent = mismatchText(mismatch);
      return item;
    }),
  );
  document.getElementById("confirmCapital").checked = false;
  document.getElementById("capitalWarning").hidden = false;
  showView("reviewView");
  document.getElementById("capitalWarning").scrollIntoView({ block: "start" });
  return true;
}

async function handleFile() {
  const warningShown = !document.getElementById("capitalWarning").hidden;
  if (warningShown && !document.getElementById("confirmCapital").checked) {
    showError(
      window.siteText(
        "ch.allot.confirm-capital",
        "Tick the confirmation that the capital this return states is the company's capital at the date the return is made up to.",
      ),
    );
    return;
  }
  const form = warningShown ? { ...filing.form, capitalDifferenceConfirmed: true } : filing.form;
  const scenario = document.getElementById("govTestScenario").value.trim();
  const headers = scenario ? { "Gov-Test-Scenario": scenario } : {};
  showView("resultView");
  showLoading();
  try {
    await window.companiesHouseFormPage.fileAndShowOutcome({
      kind: FORM_KIND,
      form,
      result: document.getElementById("filingResult"),
      headers,
      onRefusal: showCapitalWarning,
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
document.getElementById("addCurrencyBtn").addEventListener("click", () => {
  const used = readBefore().map((table) => table.currency);
  const table = addCapitalTable({ shareCurrency: CURRENCIES.find((currency) => !used.includes(currency)) });
  table.querySelector("select").focus();
  renderAfter();
});
document.getElementById("submitFilingBtn").addEventListener("click", handleFile);
document.getElementById("changeBtn").addEventListener("click", () => showView("formView"));
document.getElementById("startAgainBtn").addEventListener("click", startAgain);
updateGovTestScenarioVisibility();
window.addEventListener("developer-mode-changed", updateGovTestScenarioVisibility);
