// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/vat-period-choice.js
// The VAT period choice on the return form: HMRC's open obligations as a
// select that fills the period start and end dates, plus "another period"
// which leaves the free date inputs in use.

(function () {
  "use strict";

  const ANOTHER_PERIOD = "another";
  const MAX_SEARCH_DAYS = 365;

  const activeBindings = new WeakMap();
  const boundObligations = new WeakMap();

  const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  function formatIsoDate(isoDate) {
    return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
  }

  function openObligations(obligations) {
    if (!Array.isArray(obligations)) return [];
    return obligations.filter((o) => o.status === "O").sort((a, b) => a.start.localeCompare(b.start));
  }

  function obligationLabel(obligation) {
    const period = `${formatIsoDate(obligation.start)} to ${formatIsoDate(obligation.end)}`;
    return obligation.due ? `${period}, due ${formatIsoDate(obligation.due)}` : period;
  }

  function findMatchingObligation(obligations, periodStart, periodEnd) {
    return obligations.find((o) => o.start === periodStart && o.end === periodEnd) || null;
  }

  // HMRC allows a search window of at most 366 days; the window ends today.
  function obligationSearchWindow(today) {
    const to = new Date(today);
    const from = new Date(to.getTime() - (MAX_SEARCH_DAYS - 1) * 24 * 60 * 60 * 1000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }

  /**
   * Fill the select with the open obligations and keep it and the two date
   * inputs in step. The date inputs stay the source of truth for the submit.
   *
   * @param {{select: HTMLSelectElement, startInput: HTMLInputElement, endInput: HTMLInputElement,
   *          freeDates: HTMLElement, group: HTMLElement}} elements
   * @param {Array} obligations - open obligations, from openObligations()
   */
  function bindChoice(elements, obligations) {
    const { select, startInput, endInput, freeDates, group } = elements;
    const doc = select.ownerDocument;

    activeBindings.get(select)?.abort();
    const binding = new AbortController();
    activeBindings.set(select, binding);
    boundObligations.set(select, obligations);
    const { signal } = binding;

    select.replaceChildren();
    obligations.forEach((obligation, index) => {
      const option = doc.createElement("option");
      option.value = String(index);
      option.textContent = obligationLabel(obligation);
      select.appendChild(option);
    });
    const another = doc.createElement("option");
    another.value = ANOTHER_PERIOD;
    another.textContent = "Another period";
    select.appendChild(another);

    function showChoice(value) {
      select.value = value;
      freeDates.hidden = value !== ANOTHER_PERIOD;
    }

    function syncChoiceFromDates() {
      const match = findMatchingObligation(obligations, startInput.value, endInput.value);
      if (match) {
        showChoice(String(obligations.indexOf(match)));
      } else {
        showChoice(ANOTHER_PERIOD);
      }
    }

    select.addEventListener(
      "change",
      () => {
        if (select.value === ANOTHER_PERIOD) {
          showChoice(ANOTHER_PERIOD);
          return;
        }
        const chosen = obligations[Number(select.value)];
        startInput.value = chosen.start;
        endInput.value = chosen.end;
        startInput.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        endInput.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        showChoice(select.value);
      },
      { signal },
    );
    startInput.addEventListener("change", syncChoiceFromDates, { signal });
    endInput.addEventListener("change", syncChoiceFromDates, { signal });

    group.hidden = false;
    if (!startInput.value && !endInput.value && obligations.length > 0) {
      select.value = "0";
      select.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    } else {
      syncChoiceFromDates();
    }
  }

  /**
   * The obligation the select currently shows: its status and period key. Null when the select
   * is unbound or on "another period", where no obligation is known.
   *
   * @param {HTMLSelectElement} select
   * @returns {{status: string, periodKey: string, start: string, end: string}|null}
   */
  function chosenObligation(select) {
    const obligations = boundObligations.get(select);
    if (!obligations || select.value === ANOTHER_PERIOD) return null;
    return obligations[Number(select.value)] || null;
  }

  window.vatPeriodChoice = {
    ANOTHER_PERIOD,
    openObligations,
    obligationLabel,
    findMatchingObligation,
    obligationSearchWindow,
    bindChoice,
    chosenObligation,
  };
})();
