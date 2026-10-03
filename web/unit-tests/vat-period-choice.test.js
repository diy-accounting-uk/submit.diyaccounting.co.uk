// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/vat-period-choice.test.js

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Window } from "happy-dom";

const obligations = [
  { periodKey: "18A1", start: "2017-01-01", end: "2017-03-31", due: "2017-05-07", status: "F" },
  { periodKey: "18A3", start: "2017-07-01", end: "2017-09-30", due: "2017-11-07", status: "O" },
  { periodKey: "18A2", start: "2017-04-01", end: "2017-06-30", due: "2017-08-07", status: "O" },
];

describe("vat-period-choice", () => {
  let choice;

  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/vat-period-choice.js");
    choice = window.vatPeriodChoice;
  });

  describe("pure functions", () => {
    it("keeps only open obligations, earliest period first", () => {
      expect(choice.openObligations(obligations).map((o) => o.periodKey)).toEqual(["18A2", "18A3"]);
      expect(choice.openObligations(undefined)).toEqual([]);
    });

    it("labels an obligation with its period and due date", () => {
      expect(choice.obligationLabel(obligations[2])).toBe("1 April 2017 to 30 June 2017, due 7 August 2017");
      expect(choice.obligationLabel({ start: "2017-04-01", end: "2017-06-30" })).toBe("1 April 2017 to 30 June 2017");
    });

    it("matches an obligation on both start and end", () => {
      expect(choice.findMatchingObligation(obligations, "2017-04-01", "2017-06-30")).toBe(obligations[2]);
      expect(choice.findMatchingObligation(obligations, "2017-04-01", "2017-06-29")).toBeNull();
    });

    it("searches the 365 days up to today", () => {
      expect(choice.obligationSearchWindow(Date.UTC(2026, 9, 2))).toEqual({ from: "2025-10-03", to: "2026-10-02" });
    });
  });

  describe("bound to the form", () => {
    let document;
    let select;
    let startInput;
    let endInput;
    let freeDates;
    let group;
    let open;

    function bind() {
      choice.bindChoice({ select, startInput, endInput, freeDates, group }, open);
    }

    function choose(value) {
      select.value = value;
      select.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
    }

    beforeEach(() => {
      document = new Window().document;
      document.body.innerHTML = `
        <div id="group" hidden><select id="select"></select></div>
        <div id="freeDates"><input type="date" id="start" /><input type="date" id="end" /></div>`;
      select = document.getElementById("select");
      startInput = document.getElementById("start");
      endInput = document.getElementById("end");
      freeDates = document.getElementById("freeDates");
      group = document.getElementById("group");
      open = choice.openObligations(obligations);
    });

    it("lists each open obligation then another period, and shows the group", () => {
      bind();
      expect([...select.options].map((o) => o.textContent)).toEqual([
        "1 April 2017 to 30 June 2017, due 7 August 2017",
        "1 July 2017 to 30 September 2017, due 7 November 2017",
        "Another period",
      ]);
      expect(group.hidden).toBe(false);
    });

    it("fills both dates with the first open obligation when none are typed", () => {
      bind();
      expect(startInput.value).toBe("2017-04-01");
      expect(endInput.value).toBe("2017-06-30");
      expect(select.value).toBe("0");
      expect(freeDates.hidden).toBe(true);
    });

    it("fills both dates when an obligation is chosen", () => {
      bind();
      choose("1");
      expect(startInput.value).toBe("2017-07-01");
      expect(endInput.value).toBe("2017-09-30");
      expect(freeDates.hidden).toBe(true);
    });

    it("reports the status and period key of the chosen obligation, and nothing for another period or an unbound select", () => {
      expect(choice.chosenObligation(select)).toBeNull();
      open = obligations;
      bind();
      choose("0");
      expect(choice.chosenObligation(select)).toBe(obligations[0]);
      expect(choice.chosenObligation(select).status).toBe("F");
      choose("2");
      expect(choice.chosenObligation(select)).toBe(obligations[2]);
      expect(choice.chosenObligation(select).periodKey).toBe("18A2");
      choose(choice.ANOTHER_PERIOD);
      expect(choice.chosenObligation(select)).toBeNull();
    });

    it("leaves the dates editable and unchanged when another period is chosen", () => {
      bind();
      choose(choice.ANOTHER_PERIOD);
      expect(freeDates.hidden).toBe(false);
      expect(startInput.value).toBe("2017-04-01");
      expect(endInput.value).toBe("2017-06-30");
    });

    it("selects the obligation matching dates already in the form", () => {
      startInput.value = "2017-07-01";
      endInput.value = "2017-09-30";
      bind();
      expect(select.value).toBe("1");
      expect(freeDates.hidden).toBe(true);
    });

    it("selects another period when the dates in the form match no open obligation", () => {
      startInput.value = "2017-01-01";
      endInput.value = "2017-03-31";
      bind();
      expect(select.value).toBe(choice.ANOTHER_PERIOD);
      expect(freeDates.hidden).toBe(false);
      expect(startInput.value).toBe("2017-01-01");
    });

    it("follows dates typed after binding", () => {
      bind();
      startInput.value = "2017-01-01";
      startInput.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
      expect(select.value).toBe(choice.ANOTHER_PERIOD);
      expect(freeDates.hidden).toBe(false);
    });

    it("drops the earlier binding when bound again", () => {
      bind();
      open = [open[1]];
      bind();
      choose("0");
      expect(startInput.value).toBe("2017-07-01");
      expect([...select.options]).toHaveLength(2);
    });
  });
});
