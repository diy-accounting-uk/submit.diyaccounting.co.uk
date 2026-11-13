// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Reads the period end, the filing frequency and the ticked late returns, and shows the due date,
// the points, the threshold and what removes the points. The rules are also text in the page.

import { FREQUENCIES, PENALTY_POUNDS, assessLateReturns, returnDueDate, returnsInWindow } from "./penalty-rules.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const byId = (id) => document.getElementById(id);

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function renderReturnTicks(periodEnd, frequency) {
  const ticks = byId("vatReturnTicks");
  const ticked = new Set([...ticks.querySelectorAll("input:checked")].map((input) => input.value));
  ticks.replaceChildren();
  for (const entry of returnsInWindow(periodEnd, frequency)) {
    const row = document.createElement("div");
    row.className = "form-group";
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = entry.periodEnd;
    input.checked = ticked.has(entry.periodEnd);
    label.append(input, ` Return for the period ending ${formatDate(entry.periodEnd)}, due ${formatDate(entry.dueDate)}, was late`);
    row.append(label);
    ticks.append(row);
  }
}

function renderResult(periodEnd, frequency) {
  const rule = FREQUENCIES[frequency];
  const late = byId("vatReturnTicks").querySelectorAll("input:checked").length;
  const result = assessLateReturns(frequency, late);
  byId("vatDueDate").textContent = formatDate(returnDueDate(periodEnd));
  byId("vatPoints").textContent = `${result.points} of ${result.threshold}`;
  byId("vatThreshold").textContent = `${rule.label.toLowerCase()} returns: ${rule.threshold} points`;
  const penaltyWord = result.penalties === 1 ? "penalty" : "penalties";
  const penaltyText = `${result.penalties} ${penaltyWord} of £${PENALTY_POUNDS}, £${result.penaltyPounds} in all.`;
  byId("vatPenalties").textContent = result.penalties === 0 ? "No £200 penalty yet." : penaltyText;
  byId("vatRemoval").textContent =
    `To remove the points, send every return on time for ${rule.complianceMonths} months (${rule.complianceReturns} returns) ` +
    "and send every outstanding return of the previous 24 months.";
}

function update(rebuildTicks) {
  const periodEnd = byId("vatPeriodEnd").value;
  const frequency = byId("vatFrequency").value;
  const result = byId("vatResult");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    result.hidden = true;
    return;
  }
  if (rebuildTicks) renderReturnTicks(periodEnd, frequency);
  renderResult(periodEnd, frequency);
  result.hidden = false;
}

const calculator = byId("vatCalculator");
if (calculator) {
  calculator.hidden = false;
  byId("vatPeriodEnd").addEventListener("input", () => update(true));
  byId("vatFrequency").addEventListener("input", () => update(true));
  byId("vatReturnTicks").addEventListener("change", () => update(false));
}
