// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Carry the current page across a sign-in round trip: the login link built by
// auth-status.js has no return-to of its own, so without this an operator who
// clicks "Log in" from here lands on the home page instead of back on the
// dashboard. loginWithCognitoCallback.html reads this same key.
document.addEventListener("click", function (event) {
  const link = event.target.closest(".login-link");
  if (!link) return;
  const href = link.getAttribute("href") || "";
  if (href.indexOf("login.html") === -1) return; // logout mode: no redirect to store
  try {
    sessionStorage.setItem("postLoginRedirect", window.location.pathname + window.location.search);
  } catch {
    // sessionStorage can be unavailable (private browsing); login then lands on
    // the default page instead of back here.
  }
});

// Not one of the eight above: operatorSnapshotPublish.js still queries these through the
// same buildSnapshot loop, so they arrive in snapshot.objectives under "company-accounts",
// but renderCompanyAccounts reads them into their own block instead of a generic trend
// table.
const COMPANY_PROFIT_AND_LOSS_ROWS = [
  ["company-turnover", "Turnover"],
  ["company-costs", "Costs"],
  ["company-profit", "Profit"],
];
const COMPANY_BALANCE_SHEET_ROWS = [
  ["company-fixed-assets", "Fixed assets"],
  ["company-current-assets", "Current assets"],
  ["company-creditors-within-one-year", "Creditors: within one year"],
  ["company-creditors-after-one-year", "Creditors: after one year"],
  ["company-called-up-share-capital", "Called up share capital"],
  ["company-profit-and-loss-account", "Profit and loss account"],
  ["company-capital-and-reserves", "Capital and reserves"],
];

const COMPANY_CONTRIBUTION_ROWS = [
  ["company-contribution-gbp", "Contribution, last 30 days"],
  ["company-net-monthly-burn-gbp", "Net monthly burn"],
  ["company-runway-months", "Runway"],
];

const RESERVE_FLOOR_GBP = 2000;

const NOT_MEASURED = "not measured";
const NOT_COLLECTED = "not collected";
const NONE = "none";
const NO_BASE = "no base";
const NOT_APPLICABLE = "n/a";

const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const gbpFormat = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const usdFormat = new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD" });
const timestampFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

// "not measured" is a figure the source did not report; "none" is a measured count of zero, or
// a window the source covered in which nothing happened (the window carries noEvents).
function formatWindowValue(unit, window) {
  if (window && window.noEvents && (window.value === null || window.value === undefined)) return NONE;
  return formatValue(unit, window && window.value);
}

function formatValue(unit, value) {
  if (value === null || value === undefined) return NOT_MEASURED;
  if (unit === "ratio") return percentFormat.format(value * 100) + "%";
  if (unit === "gbp") return gbpFormat.format(value);
  if (unit === "usd") return usdFormat.format(value);
  if (unit === "hours") return numberFormat.format(value) + " h";
  if (unit === "months") return numberFormat.format(value) + (value === 1 ? " month" : " months");
  if (unit === "runs") return numberFormat.format(value) + (value === 1 ? " run" : " runs");
  if (unit === "count" && value === 0) return NONE;
  return numberFormat.format(value);
}

// Whether a rise is good decides the colour; an observation with no preferred direction
// (better is null or absent) is never coloured.
function trendClassFor(sign, better) {
  if (better !== "up" && better !== "down") return "trend-flat";
  const rising = sign > 0;
  return rising === (better === "up") ? "trend-good" : "trend-bad";
}

function formatTrend(trend, isNew, better) {
  if (isNew) return { text: "new", className: "trend-flat" };
  if (trend === null || trend === undefined) return { text: NO_BASE, className: "trend-unknown" };
  const pct = percentFormat.format(Math.abs(trend) * 100) + "%";
  if (trend > 0) return { text: "↑ " + pct, className: trendClassFor(1, better) };
  if (trend < 0) return { text: "↓ " + pct, className: trendClassFor(-1, better) };
  return { text: "flat", className: "trend-flat" };
}

const clockFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const readingDayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// The day the daily readings are for: the latest day any source in the table reports for itself
// (a window's asOf), otherwise the day the snapshot was generated.
function dailyReadingDay(observations, generatedAt) {
  const reported = observations.flatMap((observation) =>
    ["today", "previousDay", "last7", "last30", "last90"]
      .map((key) => observation && observation[key] && observation[key].asOf)
      .filter(Boolean),
  );
  return reported.length > 0 ? reported.sort().at(-1) : generatedAt.slice(0, 10);
}

// A second header row under the window columns: the hourly reading's time under Today and
// Previous day, the daily reading's day under the 7, 30 and 90 day columns. `trailingColumns`
// is the count of columns after Last 90 days.
function setLastUpdated(table, observations, generatedAt, trailingColumns) {
  const head = table.querySelector("thead");
  head.querySelectorAll("tr.last-updated").forEach((row) => row.remove());
  const row = document.createElement("tr");
  row.className = "last-updated";
  const cell = (text, span, kind) => {
    const th = document.createElement("th");
    th.scope = "colgroup";
    th.colSpan = span;
    th.className = "last-updated-cell";
    if (kind) th.dataset.reading = kind;
    th.textContent = text;
    return th;
  };
  row.appendChild(cell("", 1));
  row.appendChild(cell("Last updated " + clockFormat.format(new Date(generatedAt)) + " UTC", 2, "hourly"));
  row.appendChild(
    cell("Last updated " + readingDayFormat.format(new Date(dailyReadingDay(observations, generatedAt) + "T00:00:00Z")), 4, "daily"),
  );
  for (let index = 0; index < trailingColumns; index += 1) row.appendChild(cell("", 1));
  head.appendChild(row);
}

function formatTimestamp(iso) {
  return timestampFormat.format(new Date(iso)) + " UTC";
}

// What the link opens, read from the address so the snapshot carries no second copy of it.
function linkHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function linkLabel(observation) {
  const url = observation.deepLink || "";
  const host = linkHost(url);
  if (url.includes("cloudwatch/home") && url.includes("#alarmsV2")) return "CloudWatch alarms";
  if (url.includes("/athena/")) return "Athena saved queries" + (observation.source ? " (" + observation.source + ")" : "");
  if (host === "github.com" && url.includes("/workflows/")) return "GitHub workflow " + url.split("/workflows/")[1];
  if (host === "analytics.google.com") return "Google Analytics reports";
  return "Source console";
}

function renderObservationRow(observation) {
  const row = document.createElement("tr");
  row.className = "observation";
  row.dataset.observationId = observation.id;

  const label = document.createElement("td");
  label.textContent = observation.label;
  if (observation.description) label.title = observation.description;
  if (observation.source) {
    const source = document.createElement("small");
    source.className = "observation-source";
    source.textContent = "Source: " + observation.source + (observation.measure ? ", " + observation.measure : "");
    label.appendChild(source);
  }
  row.appendChild(label);

  ["today", "previousDay", "last7"].forEach((key) => row.appendChild(windowCell(observation, key)));
  row.appendChild(windowCell(observation, "last30"));

  const trend30 = formatTrend(
    observation.last30 && observation.last30.trend,
    observation.last30 && observation.last30.isNew,
    observation.better,
  );
  const trend30Cell = document.createElement("td");
  trend30Cell.textContent = trend30.text;
  trend30Cell.className = trend30.className;
  row.appendChild(trend30Cell);

  row.appendChild(windowCell(observation, "last90"));

  const linkCell = document.createElement("td");
  if (observation.deepLink) {
    const link = document.createElement("a");
    link.href = observation.deepLink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "deep-link";
    link.textContent = linkLabel(observation);
    linkCell.appendChild(link);
  }
  row.appendChild(linkCell);

  return row;
}

function renderObjective(objective, generatedAt) {
  const section = document.createElement("section");
  section.className = "objective";
  section.id = "table-" + objective.id;
  section.dataset.objectiveId = objective.id;

  const heading = document.createElement("h2");
  heading.textContent = objective.name;
  section.appendChild(heading);
  window.decorateSectionHeading(heading, section.id);

  const guidance = [
    ["What it measures", objective.sli],
    ["Target", objective.target],
    ["What moves it", objective.levers],
  ].filter(([, text]) => Boolean(text));
  if (guidance.length > 0) {
    const list = document.createElement("dl");
    list.className = "objective-guidance";
    guidance.forEach(([term, text]) => {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = text;
      list.appendChild(dt);
      list.appendChild(dd);
    });
    section.appendChild(list);
  }

  if (!objective.observations || objective.observations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "objective-empty";
    empty.textContent = "No observations yet.";
    section.appendChild(empty);
    return section;
  }

  const table = document.createElement("table");
  table.className = "observations data-table";
  const thead = document.createElement("thead");
  thead.innerHTML =
    '<tr><th>Observation</th><th title="Since midnight UK time">Today</th><th>Previous day</th><th>Last 7 days</th><th>Last 30 days</th><th title="Last 30 days against the 30 days before them">30 day trend</th><th>Last 90 days</th><th>Where to look</th></tr>';
  table.appendChild(thead);
  setLastUpdated(table, objective.observations, generatedAt, 1);

  const tbody = document.createElement("tbody");
  objective.observations.forEach((observation) => tbody.appendChild(renderObservationRow(observation)));
  table.appendChild(tbody);

  section.appendChild(table);
  return section;
}

// Operator, authenticated user and human come from GA4 sessions; synthetic and bot from the
// CloudFront access log, which has no hourly reading.
const VISITOR_KINDS = [
  ["sessions-operator", "Operator"],
  ["sessions-authenticated", "Authenticated user"],
  ["sessions-human", "Human"],
  ["sessions-synthetic", "Synthetic"],
  ["sessions-bot", "Bot"],
];

const VISITORS_WINDOW_UNAVAILABLE =
  "Not available: no sessions in this window, or this environment's GA4 property has no streaming export and its daily export reaches the lake two days late.";

function renderVisitors(snapshot) {
  const tbody = document.getElementById("visitorsBody");
  tbody.innerHTML = "";
  document.getElementById("visitorsPanel").hidden = false;

  const conversion = (snapshot.objectives || []).find((objective) => objective.id === "conversion-to-submission") || {
    observations: [],
  };
  const observationsById = {};
  conversion.observations.forEach((observation) => {
    observationsById[observation.id] = observation;
  });

  setLastUpdated(
    document.getElementById("visitorsTable"),
    VISITOR_KINDS.map(([observationId]) => observationsById[observationId]).filter(Boolean),
    snapshot.generatedAt,
    0,
  );

  VISITOR_KINDS.forEach(([observationId, kindLabel]) => {
    const observation = observationsById[observationId];
    const row = document.createElement("tr");
    row.className = "visitors-kind";
    row.dataset.kind = observationId.replace("sessions-", "");

    const kindCell = document.createElement("td");
    kindCell.textContent = kindLabel;
    row.appendChild(kindCell);

    // GA4 kinds read the hourly streaming export; a property that only exports daily (ci)
    // leaves it empty, and GA4's daily export reaches the lake two days late. Synthetic and bot
    // come from the access log, read as whole days.
    ["today", "previousDay", "last7", "last30"].forEach((key) =>
      row.appendChild(windowCell(observation, key, VISITORS_WINDOW_UNAVAILABLE)),
    );
    row.appendChild(activityTrendCell(observation));
    row.appendChild(windowCell(observation, "last90"));

    tbody.appendChild(row);
  });
}

function renderCompanyAccountsRow(observationsById, id, label) {
  const row = document.createElement("tr");
  row.className = "company-accounts-row";
  row.dataset.observationId = id;

  const labelCell = document.createElement("td");
  labelCell.textContent = label;
  row.appendChild(labelCell);

  const observation = observationsById[id];
  if (observation && observation.description) labelCell.title = observation.description;
  const valueCell = document.createElement("td");
  valueCell.textContent = formatValue(
    (observation && observation.unit) || "gbp",
    observation && observation.last30 && observation.last30.value,
  );
  row.appendChild(valueCell);

  return row;
}

// company_accounts (CompanyBookTables.java) carries no rows until the book is named, so
// an empty table answers every observation with a null value rather than failing the
// query; that reads here as nothing to show, not an error, so the whole panel stays
// hidden rather than rendering a table of dashes.
function renderCompanyAccounts(snapshot) {
  const panel = document.getElementById("companyAccountsPanel");
  const objective = (snapshot.objectives || []).find((candidate) => candidate.id === "company-accounts") || {
    observations: [],
  };
  const observationsById = {};
  objective.observations.forEach((observation) => {
    observationsById[observation.id] = observation;
  });

  const hasFigures = [...COMPANY_PROFIT_AND_LOSS_ROWS, ...COMPANY_BALANCE_SHEET_ROWS].some(([id]) => {
    const observation = observationsById[id];
    return Boolean(observation && observation.last30 && observation.last30.value !== null && observation.last30.value !== undefined);
  });
  if (!hasFigures) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const plBody = document.getElementById("companyProfitAndLossBody");
  plBody.innerHTML = "";
  COMPANY_PROFIT_AND_LOSS_ROWS.forEach(([id, label]) => plBody.appendChild(renderCompanyAccountsRow(observationsById, id, label)));

  const bsBody = document.getElementById("companyBalanceSheetBody");
  bsBody.innerHTML = "";
  COMPANY_BALANCE_SHEET_ROWS.forEach(([id, label]) => bsBody.appendChild(renderCompanyAccountsRow(observationsById, id, label)));

  const contributionBody = document.getElementById("companyContributionBody");
  contributionBody.innerHTML = "";
  COMPANY_CONTRIBUTION_ROWS.forEach(([id, label]) => contributionBody.appendChild(renderCompanyAccountsRow(observationsById, id, label)));
}

function appendReserveRow(body, id, label, text) {
  const row = document.createElement("tr");
  row.dataset.figureId = id;
  const labelCell = document.createElement("td");
  labelCell.textContent = label;
  const valueCell = document.createElement("td");
  valueCell.textContent = text;
  row.appendChild(labelCell);
  row.appendChild(valueCell);
  body.appendChild(row);
}

// The bank balance from the company book against the reserve floor. A null cash value (no
// book snapshot yet) shows the empty state; a balance under the floor is marked.
function renderReserve(snapshot) {
  const panel = document.getElementById("reservePanel");
  const objective = (snapshot.objectives || []).find((candidate) => candidate.id === "company-accounts");
  const observation = objective && objective.observations.find((candidate) => candidate.id === "company-cash-at-bank");
  const cash = observation && observation.last30 ? observation.last30.value : null;
  const hasCash = cash !== null && cash !== undefined;

  const body = document.getElementById("reserveBody");
  const state = document.getElementById("reserveState");
  body.innerHTML = "";
  panel.hidden = false;

  if (!hasCash) {
    document.getElementById("reserveTable").hidden = true;
    state.textContent = "No book snapshot exists yet.";
    state.className = "status-message status-info";
    state.dataset.state = "empty";
    return;
  }

  document.getElementById("reserveTable").hidden = false;
  const headroom = cash - RESERVE_FLOOR_GBP;
  const bookDate = observation.today && observation.today.asOf ? observation.today.asOf : null;
  appendReserveRow(body, "reserve-cash-at-bank", bookDate ? `Cash at bank, book to ${bookDate}` : "Cash at bank", formatValue("gbp", cash));
  appendReserveRow(body, "reserve-floor", "Reserve floor", formatValue("gbp", RESERVE_FLOOR_GBP));
  appendReserveRow(body, "reserve-headroom", "Headroom", formatValue("gbp", headroom));
  const below = cash < RESERVE_FLOOR_GBP;
  state.textContent = below ? "Below the reserve floor." : "At or above the reserve floor.";
  state.className = below ? "status-message status-error" : "status-message status-success";
  state.dataset.state = below ? "below-floor" : "above-floor";
}

function renderMonthlyMarketingBudget(snapshot) {
  const panel = document.getElementById("monthlyMarketingBudgetPanel");
  const budget = snapshot.monthlyMarketingBudget;
  if (!budget) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const rows = [
    ["net-income-last-month", "Net income last month", formatValue("gbp", budget.netIncomeLastMonthGbp)],
    ["net-income-three-month-mean", "3-month mean", formatValue("gbp", budget.netIncomeThreeMonthMeanGbp)],
    ["income-used", "Income used", formatValue("gbp", budget.incomeUsedGbp)],
    ["running-costs-last-month", "Running costs last month", formatValue("gbp", budget.runningCostsLastMonthGbp)],
    ["running-costs-this-month", "Running costs this month (projected)", formatValue("gbp", budget.runningCostsThisMonthProjectedGbp)],
    ["costs-used", "Costs used", formatValue("gbp", budget.costsUsedGbp)],
    ["exchange-rate", "Exchange rate (GBP per USD)", formatValue("rate", budget.gbpPerUsd)],
    ["fixed-suppliers", "Fixed suppliers, monthly", formatValue("gbp", budget.fixedSuppliersMonthlyGbp)],
    ["share", "Share", formatValue("ratio", budget.share)],
    ["active-paid-base", "Active paid base", formatValue("count", budget.activePaidBase)],
    ["budget-before-cash-guard", "Budget before cash guard", formatValue("gbp", budget.budgetBeforeCashGuardGbp)],
    ["cash-above-reserve", "Cash at bank less £2,000 reserve", formatValue("gbp", budget.cashAboveReserveGbp)],
    ["budget", "Budget", formatValue("gbp", budget.budgetGbp)],
    ["spent-this-month", "Spent this month", formatValue("gbp", budget.spentThisMonthGbp)],
    ["left-to-spend", "Left to spend", formatValue("gbp", budget.leftToSpendGbp)],
    ["search-floor", "Search floor (outside the budget)", formatValue("gbp", budget.searchFloorMonthGbp)],
  ];
  const body = document.getElementById("monthlyMarketingBudgetBody");
  body.innerHTML = "";
  const overBudget = typeof budget.leftToSpendGbp === "number" && budget.leftToSpendGbp < 0;
  rows.forEach(([id, label, text]) => {
    const row = document.createElement("tr");
    row.dataset.figureId = id;
    const labelCell = document.createElement("td");
    labelCell.textContent = label;
    const valueCell = document.createElement("td");
    valueCell.textContent = text;
    if (id === "left-to-spend" && overBudget) {
      const state = document.createElement("span");
      state.className = "status-message status-error";
      state.dataset.state = "over-budget";
      state.textContent = `Over budget by ${formatValue("gbp", -budget.leftToSpendGbp)}`;
      valueCell.appendChild(state);
    }
    row.appendChild(labelCell);
    row.appendChild(valueCell);
    body.appendChild(row);
  });
}

// One window of one observation. A monthly figure has no Today or Previous day; a whole-day
// source's Today is its latest reading, and the tooltip says which day that reading is for.
function windowCell(observation, key, unavailableTitle) {
  const cell = document.createElement("td");
  const window = observation && observation[key];
  const unit = (observation && observation.unit) || "count";
  if (window && window.notApplicable) {
    cell.textContent = NOT_APPLICABLE;
    cell.title = window.notApplicableReason || "This figure is reported by month or quarter, so it has no daily window.";
    return cell;
  }
  if (observation && observation.notCollected) {
    cell.textContent = NOT_COLLECTED;
    cell.title = "This environment does not run the source of this figure.";
    return cell;
  }
  cell.textContent = formatWindowValue(unit, window);
  if (window && window.asOf) {
    cell.title = "Latest reading, reported for " + window.asOf + ". This source reports whole days.";
  } else if (unavailableTitle && (!window || window.value === null || window.value === undefined)) {
    cell.title = unavailableTitle;
  }
  return cell;
}

function activityTrendCell(observation) {
  const last30 = observation && observation.last30;
  const trend = formatTrend(last30 && last30.trend, last30 && last30.isNew, observation && observation.better);
  const cell = document.createElement("td");
  cell.textContent = trend.text;
  cell.className = trend.className;
  return cell;
}

// A window of 90 days reaches back before the data begins when the earliest day the
// view holds is inside it; the note says from which day each side's counts start.
function activitiesDataSinceNote(observations, generatedAt) {
  const windowStart = new Date(generatedAt);
  windowStart.setUTCDate(windowStart.getUTCDate() - 90);
  const windowStartDay = windowStart.toISOString().slice(0, 10);
  const earliestByKind = {};
  observations.forEach((observation) => {
    const kind = observation.id.split("::")[1];
    if (!observation.dataSince) return;
    if (!earliestByKind[kind] || observation.dataSince < earliestByKind[kind]) earliestByKind[kind] = observation.dataSince;
  });
  return [
    ["started", "Started"],
    ["completed", "Completed"],
  ]
    .filter(([kind]) => earliestByKind[kind] && earliestByKind[kind] > windowStartDay)
    .map(([kind, name]) => name + " counts begin " + earliestByKind[kind])
    .join(". ");
}

// The pair's own label carries " — started"/" — completed" (operatorSnapshotPublish.js);
// stripping it back off here is what turns the pair into one row's activity name, rather
// than the page carrying its own copy of every catalogue activity's display name.
function activityDisplayName(activityId, started, completed) {
  if (started) return started.label.replace(/ — started$/, "");
  if (completed) return completed.label.replace(/ — completed$/, "");
  return activityId;
}

function renderActivitiesRow(activityId, label, observation) {
  const row = document.createElement("tr");
  row.className = "activity-row";
  row.dataset.activityId = activityId;

  const labelCell = document.createElement("td");
  labelCell.textContent = label;
  row.appendChild(labelCell);

  ["today", "previousDay", "last7", "last30"].forEach((key) => row.appendChild(windowCell(observation, key)));
  row.appendChild(activityTrendCell(observation));
  row.appendChild(windowCell(observation, "last90"));

  return row;
}

// Every prod-listed catalogue activity is already in the snapshot (buildActivityObservations
// in operatorSnapshotPublish.js reads submit.catalogue.toml at publish time), so this page
// pairs the "id::started"/"id::completed" observations it is given back into one row per
// activity id rather than reading the catalogue itself.
function renderActivities(snapshot) {
  const panel = document.getElementById("activitiesPanel");
  const objective = (snapshot.objectives || []).find((candidate) => candidate.id === "activity-started-and-completed") || {
    observations: [],
  };

  const byActivityId = {};
  objective.observations.forEach((observation) => {
    const [activityId, kind] = observation.id.split("::");
    if (!byActivityId[activityId]) byActivityId[activityId] = {};
    byActivityId[activityId][kind] = observation;
  });

  const activityIds = Object.keys(byActivityId).sort();
  if (activityIds.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const dataSinceNote = document.getElementById("activitiesDataSince");
  dataSinceNote.textContent = activitiesDataSinceNote(objective.observations, snapshot.generatedAt);
  dataSinceNote.hidden = dataSinceNote.textContent === "";

  ["started", "completed"].forEach((kind) => {
    setLastUpdated(
      document.getElementById(kind === "started" ? "activitiesStartedTable" : "activitiesCompletedTable"),
      objective.observations.filter((observation) => observation.id.split("::")[1] === kind),
      snapshot.generatedAt,
      0,
    );
    const body = document.getElementById(kind === "started" ? "activitiesStartedBody" : "activitiesCompletedBody");
    body.innerHTML = "";
    activityIds.forEach((activityId) => {
      const pair = byActivityId[activityId];
      body.appendChild(renderActivitiesRow(activityId, activityDisplayName(activityId, pair.started, pair.completed), pair[kind]));
    });
  });
}

// Engaged time per visitor as minutes and seconds: "2m 05s", or "45s" under a minute.
function formatEngagedTime(engagedMs, visitors) {
  if (!visitors) return NOT_MEASURED;
  const totalSeconds = Math.round(engagedMs / visitors / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? seconds + "s" : minutes + "m " + String(seconds).padStart(2, "0") + "s";
}

// One row per page the customers read most. A snapshot with no rows, or from before the table
// existed, shows the empty note.
function renderPageVisitors(snapshot) {
  const panel = document.getElementById("pageVisitorsPanel");
  const body = document.getElementById("pageVisitorsBody");
  const empty = document.getElementById("pageVisitorsEmpty");
  const table = document.getElementById("pageVisitorsTable");
  body.innerHTML = "";
  panel.hidden = false;
  const rows = snapshot.pageVisitors ? snapshot.pageVisitors.rows : [];
  empty.hidden = rows.length > 0;
  table.hidden = rows.length === 0;
  rows.forEach((entry) => {
    const row = document.createElement("tr");
    row.className = "page-visitors-row";
    row.dataset.page = entry.page;
    [
      entry.page,
      formatValue("count", entry.signedInVisitors),
      formatEngagedTime(entry.signedInEngagedMs, entry.signedInVisitors),
      formatValue("count", entry.otherVisitors),
      formatEngagedTime(entry.otherEngagedMs, entry.otherVisitors),
      formatValue("count", entry.operatorVisitors),
    ].forEach((text) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
}

// ---- Integrations tab -------------------------------------------------------------------------

const INTEGRATION_ORG_NAMES = { "hmrc": "HMRC", "companies-house": "Companies House", "stripe": "Stripe" };
const INTEGRATION_PANEL_IDS = {
  "hmrc": "integrationsHmrcPanel",
  "companies-house": "integrationsCompaniesHousePanel",
  "stripe": "integrationsStripePanel",
};
const RAW_RECORD_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatCallDuration(ms) {
  if (ms === null || ms === undefined) return NOT_MEASURED;
  return ms >= 1000 ? numberFormat.format(ms / 1000) + " s" : numberFormat.format(ms) + " ms";
}

// "Rules: pass", "Rules: fail (2)" or n/a for a call the header rules do not cover.
function formatHeadersChecked(call) {
  if (call.rules === "pass") return "Rules: pass";
  if (call.rules === "fail") return "Rules: fail (" + call.rulesFailed.length + ")";
  return NOT_APPLICABLE;
}

// The link to the call's item in the DynamoDB console. The item's key is built from the
// organisation and the call id, so the snapshot holds no URL. The item leaves the table after
// 90 days.
function rawRecordCell(integrations, org, call, generatedAt) {
  const cell = document.createElement("td");
  if (new Date(generatedAt).getTime() - new Date(call.at).getTime() > RAW_RECORD_DAYS * DAY_MS) {
    cell.textContent = "expired";
    cell.title = "The raw record is kept for " + RAW_RECORD_DAYS + " days.";
    return cell;
  }
  const anchor = document.createElement("a");
  anchor.href = window.dynamoItemUrl(integrations.region, integrations.table, "call#" + org + "#" + call.id.slice(0, 10), call.id);
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = "View raw record";
  cell.appendChild(anchor);
  return cell;
}

function renderIntegrationsSummary(integrations) {
  const body = document.getElementById("integrationsSummaryBody");
  body.innerHTML = "";
  document.getElementById("integrationsSummaryPanel").hidden = false;
  const rows = integrations ? integrations.summary : [];
  document.getElementById("integrationsSummaryEmpty").hidden = rows.length > 0;
  document.getElementById("integrationsSummaryTable").hidden = rows.length === 0;
  rows.forEach((observation) => {
    const row = document.createElement("tr");
    row.className = "integrations-summary-row";
    row.dataset.org = observation.org;
    row.dataset.status = observation.status;
    [INTEGRATION_ORG_NAMES[observation.org] || observation.org, observation.status].forEach((text) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.appendChild(cell);
    });
    ["today", "previousDay", "last7", "last30"].forEach((key) => row.appendChild(windowCell(observation, key)));
    row.appendChild(activityTrendCell(observation));
    row.appendChild(windowCell(observation, "last90"));
    body.appendChild(row);
  });
}

function renderIntegrationDetail(integrations, org, generatedAt) {
  const panel = document.getElementById(INTEGRATION_PANEL_IDS[org]);
  const body = document.getElementById(INTEGRATION_PANEL_IDS[org] + "Body");
  const calls = integrations ? integrations.calls[org] || [] : [];
  body.innerHTML = "";
  panel.hidden = false;
  document.getElementById(INTEGRATION_PANEL_IDS[org] + "Empty").hidden = calls.length > 0;
  panel.querySelector(".integrations-scroll").hidden = calls.length === 0;
  panel.querySelector(".integrations-detail-note").textContent =
    "Live calls, newest first: the latest calls, and the latest that did not return 2xx in the last 30 days.";
  calls.forEach((call) => {
    const row = document.createElement("tr");
    row.className = "integrations-call-row";
    row.dataset.callId = call.id;
    [timestampFormat.format(new Date(call.at)), call.api, formatCallDuration(call.ms), call.status, formatHeadersChecked(call)].forEach(
      (text, index) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (index === 4 && call.rulesFailed.length > 0) cell.title = "Failed: " + call.rulesFailed.join(", ");
        row.appendChild(cell);
      },
    );
    row.appendChild(rawRecordCell(integrations, org, call, generatedAt));
    body.appendChild(row);
  });
}

// A snapshot with no integrations section, or one from before the call table existed, shows
// the empty notes.
function renderIntegrations(snapshot) {
  const integrations = snapshot.integrations || null;
  renderIntegrationsSummary(integrations);
  Object.keys(INTEGRATION_PANEL_IDS).forEach((org) => renderIntegrationDetail(integrations, org, snapshot.generatedAt));
  const note = document.getElementById("integrationsAccountNote");
  const account = window.awsConsoleAccount(snapshot.environment);
  note.hidden = !integrations || !account;
  if (account)
    note.textContent =
      "Sign in to " + account + " in the AWS console before opening a raw record. The console cannot switch account from a link.";
}

// ---- Data tab ---------------------------------------------------------------------------------

const DATA_WINDOW_KEYS = ["today", "d1", "d7", "d30", "d90"];
const NO_FIGURE = "no figure";

// A stored count, or "no figure" for a day the history does not hold. An absent day is never 0.
function dataCountCell(count) {
  const cell = document.createElement("td");
  const known = count !== null && count !== undefined;
  cell.textContent = known ? numberFormat.format(count) : NO_FIGURE;
  if (!known) cell.classList.add("data-no-figure");
  return cell;
}

function dataTextCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function dataTtlText(ttl) {
  if (!ttl) return NOT_MEASURED;
  return ttl.enabled ? "On, " + ttl.attribute : "Off";
}

function renderDataTables(data) {
  const body = document.getElementById("dataTablesBody");
  body.innerHTML = "";
  const rows = data ? data.tables : [];
  document.getElementById("dataTablesPanel").hidden = false;
  document.getElementById("dataTablesEmpty").hidden = rows.length > 0;
  document.getElementById("dataTablesTable").hidden = rows.length === 0;
  rows.forEach((table) => {
    const row = document.createElement("tr");
    row.className = "data-table-row";
    row.dataset.table = table.name;
    row.appendChild(dataTextCell(table.name));
    DATA_WINDOW_KEYS.forEach((key) => row.appendChild(dataCountCell(table.items[key])));
    row.appendChild(dataTextCell(dataTtlText(table.ttl)));
    body.appendChild(row);
  });
}

function renderDataSplit(data) {
  const body = document.getElementById("dataSplitBody");
  body.innerHTML = "";
  const rows = data ? data.tables.filter((table) => table.split) : [];
  document.getElementById("dataSplitPanel").hidden = false;
  document.getElementById("dataSplitEmpty").hidden = rows.length > 0;
  document.getElementById("dataSplitTable").hidden = rows.length === 0;
  rows.forEach((table) => {
    const row = document.createElement("tr");
    row.className = "data-split-row";
    row.dataset.table = table.name;
    row.appendChild(dataTextCell(table.name));
    ["customer", "test", "synthetic", "other", "unknown"].forEach((key) => row.appendChild(dataCountCell(table.split[key])));
    body.appendChild(row);
  });
}

function renderDataBuckets(data) {
  const body = document.getElementById("dataBucketsBody");
  body.innerHTML = "";
  const rows = data
    ? [
        ...data.buckets.map((bucket) => [bucket.name, bucket.objects]),
        ...data.books.map((entry) => ["diya-gl " + entry.type.toLowerCase(), entry.count]),
      ]
    : [];
  document.getElementById("dataBucketsPanel").hidden = false;
  document.getElementById("dataBucketsEmpty").hidden = rows.length > 0;
  document.getElementById("dataBucketsTable").hidden = rows.length === 0;
  document.getElementById("dataBooksNote").hidden = !(data && data.booksTruncated);
  rows.forEach(([name, figures]) => {
    const row = document.createElement("tr");
    row.className = "data-bucket-row";
    row.dataset.name = name;
    row.appendChild(dataTextCell(name));
    DATA_WINDOW_KEYS.forEach((key) => row.appendChild(dataCountCell(figures[key])));
    body.appendChild(row);
  });
}

// A snapshot with no data section shows the empty notes.
function renderData(snapshot) {
  const data = snapshot.data || null;
  renderDataTables(data);
  renderDataSplit(data);
  renderDataBuckets(data);
}

// The operator list. The emails come from the authenticated snapshot only.
function renderOperators(snapshot) {
  const panel = document.getElementById("operatorsPanel");
  const operators = snapshot.operators;
  const body = document.getElementById("operatorsBody");
  body.innerHTML = "";
  if (!operators) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  operators.emails.forEach((email) => {
    const row = document.createElement("tr");
    row.className = "operator-row";
    const cell = document.createElement("td");
    cell.textContent = email;
    row.appendChild(cell);
    body.appendChild(row);
  });
}

// One table per measure, one row per email on the family affiliate list, the standard windows.
function renderFamilyAffiliates(snapshot) {
  const panel = document.getElementById("familyAffiliatesPanel");
  const family = snapshot.familyAffiliates;
  if (!family) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  family.measures.forEach((measure) => {
    const suffix = measure.key.charAt(0).toUpperCase() + measure.key.slice(1);
    const table = document.getElementById("familyAffiliates" + suffix + "Table");
    const body = document.getElementById("familyAffiliates" + suffix + "Body");
    body.innerHTML = "";
    const observations = family.affiliates.map((affiliate) => affiliate[measure.key]);
    setLastUpdated(table, observations, snapshot.generatedAt, 0);
    family.affiliates.forEach((affiliate) => {
      const observation = affiliate[measure.key];
      const row = document.createElement("tr");
      row.className = "family-affiliate-row";
      row.dataset.affiliateEmail = affiliate.email;
      const labelCell = document.createElement("td");
      labelCell.textContent = affiliate.email;
      if (!affiliate.issuerFound) labelCell.title = "This account has not generated a pass yet.";
      row.appendChild(labelCell);
      ["today", "previousDay", "last7", "last30"].forEach((key) => row.appendChild(windowCell(observation, key)));
      row.appendChild(activityTrendCell(observation));
      row.appendChild(windowCell(observation, "last90"));
      body.appendChild(row);
    });
  });
}

function poundsFromPence(pence) {
  return gbpFormat.format((pence || 0) / 100);
}

// Referrers grouped by tier: a header row for each group, then a row for each referrer.
function renderAffiliateGroups(snapshot) {
  const panel = document.getElementById("affiliateGroupsPanel");
  const affiliates = snapshot.affiliateGroups;
  if (!affiliates) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const figureBody = document.getElementById("affiliateFamilyPayableBody");
  figureBody.innerHTML = "";
  const figureRow = document.createElement("tr");
  figureRow.dataset.figureId = "family-payable-this-month";
  const figureLabel = document.createElement("td");
  figureLabel.textContent = "Family payable this month, to transfer";
  const figureValue = document.createElement("td");
  figureValue.textContent = poundsFromPence(affiliates.familyPayableThisMonthPence);
  figureRow.appendChild(figureLabel);
  figureRow.appendChild(figureValue);
  figureBody.appendChild(figureRow);

  const body = document.getElementById("affiliateGroupsBody");
  body.innerHTML = "";
  affiliates.groups.forEach((group) => {
    const header = document.createElement("tr");
    header.className = "affiliate-group-row";
    header.dataset.groupId = group.id;
    const title = document.createElement("th");
    title.colSpan = 9;
    title.scope = "colgroup";
    title.textContent = group.label + " (" + group.referrers.length + ")";
    header.appendChild(title);
    body.appendChild(header);
    group.referrers.forEach((referrer) => {
      const row = document.createElement("tr");
      row.className = "affiliate-referrer-row";
      row.dataset.groupId = group.id;
      const hashCell = document.createElement("td");
      hashCell.textContent = referrer.referrerHash.slice(0, 8);
      hashCell.title = referrer.referrerHash;
      row.appendChild(hashCell);
      [
        referrer.tier,
        referrer.latestLineState,
        formatValue("count", referrer.referrals),
        formatValue("count", referrer.payingAccounts),
        poundsFromPence(referrer.heldPence),
        poundsFromPence(referrer.payablePence),
        poundsFromPence(referrer.paidPence),
        poundsFromPence(referrer.payableThisMonthPence),
      ].forEach((text) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
  });
}

const STALE_SNAPSHOT_HOURS = 36;

function snapshotAgeHours(generatedAt) {
  return (Date.now() - new Date(generatedAt).getTime()) / 3600000;
}

function renderSnapshotNotices(snapshot) {
  const age = document.getElementById("snapshotAge");
  const ageHours = snapshotAgeHours(snapshot.generatedAt);
  age.hidden = ageHours <= STALE_SNAPSHOT_HOURS;
  age.textContent = age.hidden
    ? ""
    : "This snapshot is " + Math.floor(ageHours) + " hours old. The nightly publish should have replaced it within 36 hours.";

  const source = document.getElementById("snapshotSource");
  source.textContent =
    "Figures come from Athena views over the " +
    snapshot.environment +
    " analytics lake" +
    (snapshot.environment === "prod" ? "." : ". This is ci test data: test traffic, not customers.");
}

function renderSnapshot(snapshot) {
  const meta = document.getElementById("snapshotMeta");
  meta.textContent = "Generated " + formatTimestamp(snapshot.generatedAt) + " for " + snapshot.environment + ".";
  renderSnapshotNotices(snapshot);

  const objectivesById = {};
  (snapshot.objectives || []).forEach((objective) => {
    objectivesById[objective.id] = objective;
  });

  document.querySelectorAll("[data-objective-slot]").forEach((slot) => {
    const objectiveId = slot.dataset.objectiveSlot;
    const objective = objectivesById[objectiveId] || { id: objectiveId, name: objectiveId, observations: [] };
    const section = renderObjective(objective, snapshot.generatedAt);
    if (objectiveId === "low-running-cost") section.appendChild(renderCostDrivers(snapshot.costDrivers));
    if (objectiveId === "conversion-to-paid") section.appendChild(renderPaidSubscribers(snapshot.paidSubscribers));
    slot.replaceChildren(section);
  });
}

// The most expensive CloudWatch charges, each a resource and the charge on it.
function renderCostDrivers(costDrivers) {
  const wrapper = document.createElement("div");
  wrapper.className = "cost-drivers";
  const heading = document.createElement("h3");
  heading.textContent =
    "Top " +
    ((costDrivers && costDrivers.rows.length) || 10) +
    " CloudWatch charges, last " +
    ((costDrivers && costDrivers.days) || 30) +
    " days";
  wrapper.appendChild(heading);
  if (!costDrivers || costDrivers.rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "cost-drivers-empty";
    empty.textContent = "No CloudWatch charges published yet.";
    wrapper.appendChild(empty);
    return wrapper;
  }
  const table = document.createElement("table");
  table.className = "observations data-table cost-drivers-table";
  table.innerHTML = "<thead><tr><th>Resource</th><th>Charge</th><th>Cost</th></tr></thead>";
  const tbody = document.createElement("tbody");
  costDrivers.rows.forEach((driver) => {
    const row = document.createElement("tr");
    row.className = "cost-driver";
    const resource = document.createElement("td");
    resource.textContent = driver.resource;
    resource.title = driver.resourceId;
    const charge = document.createElement("td");
    charge.textContent = driver.charge;
    const cost = document.createElement("td");
    cost.textContent = formatValue("usd", driver.costUsd);
    row.appendChild(resource);
    row.appendChild(charge);
    row.appendChild(cost);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

// The paying subscribers of the latest month, by acquisition channel and bundle.
function renderPaidSubscribers(paidSubscribers) {
  const wrapper = document.createElement("div");
  wrapper.className = "paid-subscribers";
  const heading = document.createElement("h3");
  heading.textContent =
    "Paying subscribers by channel and bundle" + (paidSubscribers && paidSubscribers.month ? ", " + paidSubscribers.month.slice(0, 7) : "");
  heading.title =
    "Customers with a paid subscription charge in the latest month, by the channel that first brought the account (from the click id or utm source) and by bundle. Monthly recurring revenue is the month's charges net of refunds; annual is twelve times that.";
  wrapper.appendChild(heading);
  if (!paidSubscribers || paidSubscribers.rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "paid-subscribers-empty";
    empty.textContent = "No paying subscribers published yet.";
    wrapper.appendChild(empty);
    return wrapper;
  }
  const table = document.createElement("table");
  table.className = "observations data-table paid-subscribers-table";
  table.innerHTML =
    '<thead><tr><th>Channel</th><th>Bundle</th><th title="Customers with a paid charge in the month">Subscribers</th><th title="The month\'s charges net of refunds">MRR</th><th title="Twelve times the monthly recurring revenue">ARR</th></tr></thead>';
  const tbody = document.createElement("tbody");
  const addRow = (className, cells) => {
    const row = document.createElement("tr");
    row.className = className;
    cells.forEach((text) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  };
  paidSubscribers.rows.forEach((entry) =>
    addRow("paid-subscribers-row", [
      entry.source,
      entry.bundleId,
      formatValue("count", entry.subscribers),
      formatValue("gbp", entry.mrrGbp),
      formatValue("gbp", entry.arrGbp),
    ]),
  );
  addRow("paid-subscribers-total", [
    "All channels",
    "All bundles",
    formatValue("count", paidSubscribers.totals.subscribers),
    formatValue("gbp", paidSubscribers.totals.mrrGbp),
    formatValue("gbp", paidSubscribers.totals.arrGbp),
  ]);
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

async function fetchJson(path) {
  const idToken = window.localStorage ? window.localStorage.getItem("cognitoIdToken") : null;
  const init = idToken ? { headers: { Authorization: "Bearer " + idToken } } : {};
  const fetcher = window.fetchWithIdToken || window.fetch;
  const response = await fetcher(path, init);
  if (!response.ok) {
    const error = new Error("request-failed");
    error.status = response.status;
    try {
      const body = await response.json();
      error.apiMessage = body && body.message;
    } catch {
      // response body was not JSON; error.apiMessage stays undefined
    }
    throw error;
  }
  return response.json();
}

// A null message leaves the explanation to the shared status message that the API client
// already raised, so the reader sees it once.
function showError(message) {
  const container = document.getElementById("objectivesContainer");
  container.querySelectorAll("[data-objective-slot]").forEach((slot) => slot.replaceChildren());
  container.querySelectorAll(":scope > .objective").forEach((panel) => {
    panel.hidden = true;
  });
  document.getElementById("chartsPanel").hidden = true;
  if (message === null) return;
  const notice = document.createElement("p");
  notice.id = "snapshotError";
  notice.className = "status-message status-error";
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  container.appendChild(notice);
}

const STATIC_TABLE_PANELS = [
  "visitorsPanel",
  "activitiesPanel",
  "pageVisitorsPanel",
  "integrationsSummaryPanel",
  "integrationsHmrcPanel",
  "integrationsCompaniesHousePanel",
  "integrationsStripePanel",
  "companyAccountsPanel",
  "reservePanel",
  "monthlyMarketingBudgetPanel",
  "operatorsPanel",
  "familyAffiliatesPanel",
  "affiliateGroupsPanel",
];

function decorateStaticPanels() {
  STATIC_TABLE_PANELS.forEach((id) => {
    const heading = document.querySelector("#" + id + " > h2");
    if (heading) window.decorateSectionHeading(heading, id);
  });
}

// With ?refresh=N the page reloads every N minutes; the hash is kept, so the reader returns to
// the same section.
function armAutoRefresh() {
  const minutes = window.parseRefreshMinutes(window.location.search);
  if (minutes === null) return;
  setTimeout(() => window.location.reload(), minutes * 60000);
  const note = document.getElementById("refreshNote");
  note.textContent = "Reloads every " + (minutes === 1 ? "1 minute" : minutes + " minutes") + ". ";
  const off = document.createElement("a");
  off.className = "refresh-off-link";
  off.href = window.location.pathname + window.location.hash;
  off.textContent = "Turn off";
  note.appendChild(off);
  note.hidden = false;
}

// The sections are built after the snapshot arrives, so the browser's own jump to the hash
// finds nothing; scroll once they exist.
function scrollToHash() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  showTabHolding(id);
  const target = id ? document.getElementById(id) : null;
  if (target && !target.hidden) target.scrollIntoView();
}

// The held passes are listed apart from the snapshot: a held pass needs the operator whether or
// not a snapshot has been published. A caller who is not an operator gets 403 and sees no panel.
const RELEASE_RAISE_BY = 1000;

function renderHeldPasses(passes) {
  const panel = document.getElementById("heldPassesPanel");
  const table = document.getElementById("heldPassesTable");
  const body = document.getElementById("heldPassesBody");
  panel.hidden = false;
  document.getElementById("heldPassesEmpty").hidden = passes.length > 0;
  table.hidden = passes.length === 0;
  body.replaceChildren();
  passes.forEach((pass) => {
    const row = document.createElement("tr");
    row.setAttribute("data-held-code", pass.code);
    const cell = (text, title) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (title) td.title = title;
      row.appendChild(td);
      return td;
    };
    cell(pass.code);
    cell(pass.issuedBy ? pass.issuedBy.slice(0, 12) : "operator", pass.issuedBy || "");
    cell(numberFormat.format(pass.useCount));
    cell(numberFormat.format(pass.reviewLimit));
    cell(pass.heldAt ? timestampFormat.format(new Date(pass.heldAt)) : "unknown");
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-small btn-primary held-pass-release";
    button.textContent = "Release";
    button.setAttribute("data-pass-code", pass.code);
    actionCell.appendChild(button);
    row.appendChild(actionCell);
    body.appendChild(row);
  });
}

async function loadHeldPasses() {
  try {
    const answer = await fetchJson("/api/v1/pass/held");
    renderHeldPasses(answer.passes || []);
  } catch (error) {
    if (error.status !== 401 && error.status !== 403) {
      const notice = document.getElementById("heldPassesEmpty");
      document.getElementById("heldPassesPanel").hidden = false;
      notice.textContent = "The held passes did not load. Reload the page to try again.";
      notice.hidden = false;
    }
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".held-pass-release");
  if (!button) return;
  button.disabled = true;
  const code = button.getAttribute("data-pass-code");
  try {
    const fetcher = window.fetchWithIdToken || window.fetch;
    const response = await fetcher("/api/v1/pass/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, raiseBy: RELEASE_RAISE_BY }),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    await loadHeldPasses();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Release failed, try again";
  }
});

// The tabs show the sections whose data-tab names them (a section can name several, separated by
// spaces); a section with no data-tab is always drawn. The chosen tab is a per-viewer convenience.
const TAB_STORAGE_KEY = "operatorDashboardTab";
const TAB_IDS = ["main", "adoption", "behaviour", "integrations", "data", "ops", "affiliates", "aws-prod", "aws-ci"];

function storedTab() {
  try {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    return TAB_IDS.includes(stored) ? stored : "main";
  } catch {
    return "main";
  }
}

let currentTab = "main";

function showTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll("[data-tab]").forEach((section) => {
    section.classList.toggle("tab-off", !section.dataset.tab.split(" ").includes(tabId));
  });
  document.querySelectorAll(".dashboard-tab").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.tabId === tabId));
  });
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tabId);
  } catch {
    // storage is unavailable; the tab only lasts for this visit
  }
  window.dispatchEvent(new Event("resize"));
}

// A link to a section on another tab opens that tab first.
function showTabHolding(id) {
  const target = id ? document.getElementById(id) : null;
  const holder = target && target.closest(".tab-off");
  if (!holder) return;
  const wanted = holder.dataset.tab.split(" ")[0];
  showTab(wanted);
}

function armTabs() {
  document.querySelectorAll(".dashboard-tab").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tabId));
  });
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    if (anchor) showTabHolding(decodeURIComponent(anchor.getAttribute("href").slice(1)));
  });
  showTab(storedTab());
}

// The tab bar appears with the panels, after the entitlement check has passed. Sections built
// since the page loaded take the chosen tab.
function showTabs() {
  const tabs = document.getElementById("dashboardTabs");
  tabs.hidden = false;
  tabs.classList.remove("dashboard-tabs-pending");
  showTab(currentTab);
}

async function initPage() {
  armTabs();
  armAutoRefresh();
  loadHeldPasses();
  decorateStaticPanels();
  try {
    const snapshot = await fetchJson("/api/v1/operator/snapshot");
    renderSnapshot(snapshot);
    renderMonthlyMarketingBudget(snapshot);
    renderReserve(snapshot);
    renderCompanyAccounts(snapshot);
    renderActivities(snapshot);
    renderPageVisitors(snapshot);
    renderIntegrations(snapshot);
    renderData(snapshot);
    window.renderDailyCharts(snapshot);
    renderVisitors(snapshot);
    renderOperators(snapshot);
    renderFamilyAffiliates(snapshot);
    renderAffiliateGroups(snapshot);
    window.renderAwsLinks(snapshot.console);
    showTabs();
    document.dispatchEvent(new CustomEvent("activity-completed", { detail: "operator-dashboard" }));
  } catch (error) {
    if (error.status === 403) {
      document.getElementById("dashboardTabs").hidden = true;
      showError(null);
    } else if (error.status === 401) {
      document.getElementById("dashboardTabs").hidden = true;
      showError("Sign in with an operator account to see this page.");
    } else if (error.status === 404) {
      window.renderAwsLinks();
      showTabs();
      showError("No snapshot has been published yet.");
    } else {
      showTabs();
      showError("The operator snapshot did not load. Reload the page to try again.");
    }
  }
  scrollToHash();
}

document.addEventListener("DOMContentLoaded", initPage);
