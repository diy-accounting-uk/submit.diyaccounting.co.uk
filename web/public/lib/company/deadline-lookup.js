// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Reads the company name or number, calls the public lookup and shows the two due dates, the days
// left, the last accounts type and the filing for each. The rules are in deadline-rules.js.

import { LookupError, deadlineLine, fetchLookup, filingActions, formatDate, statusWords } from "./deadline-rules.js";

const byId = (id) => document.getElementById(id);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function paragraph(label, value) {
  const element = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  element.append(strong, value);
  return element;
}

function link(action) {
  const anchor = document.createElement("a");
  anchor.className = "btn";
  anchor.href = action.href;
  anchor.textContent = action.label;
  return anchor;
}

function showError(message) {
  const error = byId("companyError");
  error.textContent = message;
  error.hidden = false;
}

function clearOutput() {
  byId("companyError").hidden = true;
  for (const id of ["companyMatches", "companyResult"]) {
    const element = byId(id);
    element.replaceChildren();
    element.hidden = true;
  }
}

function showCompany(company) {
  const today = todayIso();
  const actions = filingActions(company);
  const result = byId("companyResult");
  const heading = document.createElement("h3");
  heading.textContent = `${company.companyName} (${company.companyNumber})`;
  const parts = [heading, paragraph("Status", statusWords(company.companyStatus))];
  if (actions.confirmationStatement === null) {
    parts.push(document.createElement("p"));
    parts[parts.length - 1].textContent = "This company is no longer filing, so there is nothing to file.";
  } else {
    const period = company.accountsNextPeriodEnd ? `, for the period ending ${formatDate(company.accountsNextPeriodEnd)}` : "";
    parts.push(paragraph("Accounts due", `${deadlineLine(company.accountsNextDue, today)}${period}`));
    parts.push(paragraph("Last accounts type", company.lastAccountsType ? statusWords(company.lastAccountsType) : "none filed"));
    const accountsActions = document.createElement("p");
    accountsActions.append(...actions.accounts.map(link));
    parts.push(accountsActions);
    parts.push(paragraph("Confirmation statement due", deadlineLine(company.confirmationStatementNextDue, today)));
    const statementAction = document.createElement("p");
    statementAction.append(link(actions.confirmationStatement));
    parts.push(statementAction);
  }
  result.replaceChildren(...parts);
  result.hidden = false;
}

function showMatches(matches) {
  const container = byId("companyMatches");
  if (matches.length === 0) {
    showError("Companies House has no company with that name.");
    return;
  }
  const list = document.createElement("ul");
  for (const match of matches) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.dataset.companyNumber = match.companyNumber;
    button.textContent = `${match.companyName} (${match.companyNumber}, ${statusWords(match.companyStatus)})`;
    item.append(button);
    list.append(item);
  }
  container.replaceChildren(list);
  container.hidden = false;
}

async function lookUp(query) {
  clearOutput();
  try {
    const body = await fetchLookup(query);
    if (Array.isArray(body.items)) showMatches(body.items);
    else showCompany(body);
  } catch (error) {
    showError(error instanceof LookupError ? error.message : "Something went wrong. Try again.");
  }
}

const lookup = byId("companyLookup");
if (lookup) {
  lookup.hidden = false;
  byId("companyLookupForm").addEventListener("submit", (event) => {
    event.preventDefault();
    lookUp(byId("companyQuery").value);
  });
  byId("companyMatches").addEventListener("click", (event) => {
    const number = event.target.closest("button")?.dataset.companyNumber;
    if (number) {
      byId("companyQuery").value = number;
      lookUp(number);
    }
  });
}
