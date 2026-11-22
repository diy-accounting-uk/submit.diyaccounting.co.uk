// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/companies-house/companyReports.page.js
// The company reports on the lookup's drill-down: the index at /companies-house/company/<number>/reports
// and one view for each report at /reports/<report>. Each view shows the report's rows, the time
// Submit read the record from Companies House, what the words mean, and the source line. A report
// states figures, dates and changes from the company's own filings and never rates the company.

(function () {
  "use strict";

  const siteText = (id, english, values) => (window.siteText ? window.siteText(id, english, values) : english);

  // The reports in the order the index lists them: each one's title, one line on what it shows,
  // and the words its view defines.
  const REPORTS = () => [
    {
      name: "filings",
      title: siteText("ch.reports.filings-title", "Filing record and timeliness"),
      summary: siteText(
        "ch.reports.filings-summary",
        "Each accounts filing and confirmation statement, the date Companies House processed it, and the usual time limit for it.",
      ),
      definitions: [
        [
          siteText("ch.reports.def.made-up-date", "Made-up date"),
          siteText("ch.reports.def.made-up-date-meaning", "The last day of the period the filing covers."),
        ],
        [
          siteText("ch.reports.def.processed", "Processed"),
          siteText("ch.reports.def.processed-meaning", "The date Companies House put the filing on the register."),
        ],
        [
          siteText("ch.reports.def.time-limit", "Usual time limit"),
          siteText(
            "ch.reports.def.time-limit-meaning",
            "The time GOV.UK gives a private company to file. A change of accounting reference date or an extension can move it.",
          ),
        ],
      ],
    },
    {
      name: "people",
      title: siteText("ch.reports.people-title", "People over time"),
      summary: siteText(
        "ch.reports.people-summary",
        "Appointments and resignations of directors and secretaries, and persons with significant control notified and ceased.",
      ),
      definitions: [
        [
          siteText("ch.reports.def.officer", "Officer"),
          siteText("ch.reports.def.officer-meaning", "A director or company secretary on the register."),
        ],
        [
          siteText("ch.reports.def.psc", "Person with significant control"),
          siteText(
            "ch.reports.def.psc-meaning",
            "Someone who owns or controls the company in one of the ways the law lists, for example more than 25% of the shares or votes.",
          ),
        ],
        [
          siteText("ch.reports.def.notified", "Notified"),
          siteText("ch.reports.def.notified-meaning", "The date the company told Companies House."),
        ],
      ],
    },
    {
      name: "capital",
      title: siteText("ch.reports.capital-title", "Share capital"),
      summary: siteText(
        "ch.reports.capital-summary",
        "Allotments of shares, statements of capital, and the shares stated in the last filed accounts.",
      ),
      definitions: [
        [
          siteText("ch.reports.def.allotment", "Allotment"),
          siteText("ch.reports.def.allotment-meaning", "New shares issued by the company."),
        ],
        [
          siteText("ch.reports.def.statement-of-capital", "Statement of capital"),
          siteText("ch.reports.def.statement-of-capital-meaning", "The number, class and value of the company's shares on a date."),
        ],
        [
          siteText("ch.reports.def.nominal-value", "Nominal value"),
          siteText("ch.reports.def.nominal-value-meaning", "The face value of a share, which can differ from what it was sold for."),
        ],
      ],
    },
    {
      name: "charges",
      title: siteText("ch.reports.charges-title", "Charges and insolvency"),
      summary: siteText("ch.reports.charges-summary", "Charges registered and satisfied, and any insolvency case with its practitioners."),
      definitions: [
        [
          siteText("ch.reports.def.charge", "Charge"),
          siteText("ch.reports.def.charge-meaning", "Security the company gives a lender over its assets, registered at Companies House."),
        ],
        [
          siteText("ch.reports.def.satisfied", "Satisfied"),
          siteText(
            "ch.reports.def.satisfied-meaning",
            "The company told Companies House that what the charge secures is paid or released.",
          ),
        ],
        [
          siteText("ch.reports.def.fixed-floating", "Fixed and floating charge"),
          siteText(
            "ch.reports.def.fixed-floating-meaning",
            "A charge over named assets, and a charge over assets that change, such as stock.",
          ),
        ],
      ],
    },
    {
      name: "history",
      title: siteText("ch.reports.history-title", "Registered office and name history"),
      summary: siteText("ch.reports.history-summary", "Previous company names and each change of registered office."),
      definitions: [
        [
          siteText("ch.reports.def.registered-office", "Registered office"),
          siteText("ch.reports.def.registered-office-meaning", "The official address for letters from Companies House and the courts."),
        ],
        [
          siteText("ch.reports.def.previous-name", "Previous name"),
          siteText("ch.reports.def.previous-name-meaning", "A name the company was registered under before."),
        ],
      ],
    },
    {
      name: "accounts",
      title: siteText("ch.reports.accounts-title", "Accounts figures year on year"),
      summary: siteText(
        "ch.reports.accounts-summary",
        "The main figures from each filed set of accounts, and the change between the two latest years.",
      ),
      definitions: [
        [
          siteText("ch.reports.def.net-assets", "Net assets"),
          siteText("ch.reports.def.net-assets-meaning", "What the company owns less what it owes, from the balance sheet."),
        ],
        [
          siteText("ch.reports.def.cash", "Cash at bank"),
          siteText("ch.reports.def.cash-meaning", "Money in the bank and in hand on the year end."),
        ],
        [siteText("ch.reports.def.debtors", "Debtors"), siteText("ch.reports.def.debtors-meaning", "Money owed to the company.")],
        [
          siteText("ch.reports.def.creditors-within", "Creditors due within one year"),
          siteText("ch.reports.def.creditors-within-meaning", "Money the company owes and must pay within a year."),
        ],
        [
          siteText("ch.reports.def.creditors-after", "Creditors due after one year"),
          siteText("ch.reports.def.creditors-after-meaning", "Money the company owes and pays later."),
        ],
        [siteText("ch.reports.def.turnover", "Turnover"), siteText("ch.reports.def.turnover-meaning", "The value of sales in the year.")],
        [
          siteText("ch.reports.def.profit", "Profit or loss for the year"),
          siteText("ch.reports.def.profit-meaning", "What is left after all costs and tax. A negative figure is a loss."),
        ],
        [
          siteText("ch.reports.def.employees", "Average employees"),
          siteText("ch.reports.def.employees-meaning", "The average number of people employed in the year, as the accounts state it."),
        ],
      ],
    },
  ];

  // Each report's rows, by its name: (container, report) => void, where report is the route's
  // answer. A report with no entry here shows its read time, definitions and source line only.
  const REPORT_VIEWS = {};

  const reportNamed = (name) => REPORTS().find((report) => report.name === name);

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  // The time Submit read the record, in London time: { time: "14:05", date: "22 November 2026" }.
  function readTime(readAt) {
    const when = new Date(readAt);
    if (Number.isNaN(when.getTime())) return null;
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(when);
    const isoDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
    return { time, date: window.companiesHouseLabels.formatCompanyDate(isoDate) };
  }

  function rateLimitText(retryAfterSeconds) {
    return retryAfterSeconds
      ? siteText("ch.search.rate-limited-seconds", "Companies House is rate limiting our lookups. Try again in {seconds} seconds.", {
          seconds: retryAfterSeconds,
        })
      : siteText("ch.search.rate-limited", "Companies House is rate limiting our lookups. Try again in a few minutes.");
  }

  const callLimitText = () =>
    siteText(
      "ch.reports.call-limit",
      "Submit stopped reading this company's record at its limit of calls to Companies House for one report.",
    );

  // The note an account without the reports activity sees: the bundle that has it, or that the
  // reports are not offered here.
  function accessNote(access) {
    if (!access || access.held) return null;
    const note = element("p", "hint company-reports-access");
    note.setAttribute("role", "note");
    note.textContent =
      access.bundleNames.length > 0
        ? siteText("ch.reports.needs-bundle", "These reports come with {bundles}.", { bundles: access.bundleNames.join(", ") })
        : siteText("ch.reports.not-offered", "These reports are not offered here yet.");
    return note;
  }

  function appendDefinitions(container, report) {
    container.appendChild(element("h5", "company-report-terms-heading", siteText("ch.reports.terms-heading", "What these words mean")));
    const list = element("dl", "company-report-terms");
    report.definitions.forEach(([term, meaning]) => {
      list.appendChild(element("dt", null, term));
      list.appendChild(element("dd", null, meaning));
    });
    container.appendChild(list);
  }

  /**
   * The reports index: one link and one line for each report.
   * @param {HTMLElement} container
   * @param {{companyNumber: string, viewLink: Function, access: Promise<{held: boolean, bundleNames: string[]}|null>}} context
   * @returns {Promise<boolean>} true: the index is always found
   */
  async function renderReportsIndex(container, { companyNumber, viewLink, access }) {
    container.appendChild(element("h4", null, siteText("ch.reports.index-title", "Reports on this company")));
    container.appendChild(
      element(
        "p",
        null,
        siteText(
          "ch.reports.index-intro",
          "Each report states figures and dates from the company's own filings at Companies House, with the filing each one comes from.",
        ),
      ),
    );
    const note = accessNote(await access);
    if (note) container.appendChild(note);
    const list = element("ul", "company-reports-list");
    REPORTS().forEach((report) => {
      const item = element("li");
      item.appendChild(viewLink({ companyNumber, view: "report", report: report.name }, report.title));
      item.appendChild(element("span", "company-reports-summary", report.summary));
      list.appendChild(item);
    });
    container.appendChild(list);
    return true;
  }

  /**
   * One report's view.
   * @param {HTMLElement} container
   * @param {{companyNumber: string, report: string, viewLink: Function, access: Promise<{held: boolean, bundleNames: string[]}|null>}} context
   * @returns {Promise<boolean>} true: every report the address names has a view
   */
  async function renderReportView(container, { companyNumber, report: name, viewLink, access }) {
    const report = reportNamed(name);
    container.appendChild(element("h4", null, report.title));
    container.appendChild(viewLink({ companyNumber, view: "reports" }, siteText("ch.reports.all-reports", "All reports on this company")));

    let answer;
    try {
      answer = await window.getCompanyReport(companyNumber, name);
    } catch (error) {
      const state = element("p", "company-report-state");
      state.setAttribute("role", "status");
      if (error && error.status === 429 && error.callLimitReached) {
        state.textContent = callLimitText();
      } else if (error && error.status === 429) {
        state.textContent = rateLimitText(error.retryAfterSeconds);
      } else if (error && (error.status === 413 || error.tooLarge)) {
        state.textContent = siteText("ch.reports.too-large", "This company's record is too large for Submit to show in this report.");
      } else if (error && error.status === 404 && error.reason === "unknown_report") {
        state.textContent = siteText("ch.reports.not-ready", "This report is not ready yet.");
      } else if (error && error.status === 403) {
        const note = accessNote(await access);
        state.textContent = note ? note.textContent : siteText("ch.reports.not-offered", "These reports are not offered here yet.");
      } else {
        throw error;
      }
      container.appendChild(state);
      appendDefinitions(container, report);
      return true;
    }

    const read = readTime(answer.readAt);
    if (read) {
      container.appendChild(
        element("p", "company-report-read", siteText("ch.reports.read-at", "Read from Companies House at {time} on {date}.", read)),
      );
    }
    if (answer.partial || answer.callLimitReached) {
      const partial = element("p", "company-report-state");
      partial.setAttribute("role", "status");
      partial.textContent = `${answer.callLimitReached ? callLimitText() : rateLimitText(answer.retryAfterSeconds)} ${siteText(
        "ch.reports.partial",
        "This report shows only the parts Submit had already read.",
      )}`;
      container.appendChild(partial);
    }
    const rows = element("div", "company-report-rows");
    if (REPORT_VIEWS[name]) REPORT_VIEWS[name](rows, answer);
    container.appendChild(rows);
    appendDefinitions(container, report);
    if (read) {
      container.appendChild(
        element(
          "p",
          "hint company-report-source",
          siteText(
            "ch.reports.source",
            "Source: the Companies House register, read at {time} on {date}. Companies House does not check the information companies send it.",
            read,
          ),
        ),
      );
    }
    return true;
  }

  window.companyReports = { renderReportsIndex, renderReportView };
})();
