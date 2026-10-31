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
  if (url.includes("cloudwatch/home")) {
    const match = url.match(/dashboards:name=([^&]+)/);
    return match ? "CloudWatch dashboard " + decodeURIComponent(match[1]) : "CloudWatch dashboards";
  }
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
  appendReserveRow(body, "reserve-cash-at-bank", "Cash at bank", formatValue("gbp", cash));
  appendReserveRow(body, "reserve-floor", "Reserve floor", formatValue("gbp", RESERVE_FLOOR_GBP));
  appendReserveRow(body, "reserve-headroom", "Headroom", formatValue("gbp", headroom));
  const below = cash < RESERVE_FLOOR_GBP;
  state.textContent = below ? "Below the reserve floor." : "At or above the reserve floor.";
  state.className = below ? "status-message status-error" : "status-message status-success";
  state.dataset.state = below ? "below-floor" : "above-floor";
}

function renderReinvestment(snapshot) {
  const panel = document.getElementById("reinvestmentPanel");
  const reinvestment = snapshot.reinvestment;
  if (!reinvestment) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const rows = [
    ["reinvestment-fraction", "Reinvestment fraction", formatValue("ratio", reinvestment.fraction)],
    ["trailing-30-income", "Trailing 30-day income", formatValue("gbp", reinvestment.trailing30IncomeGbp)],
    ["reinvestment-budget", "Budget", formatValue("gbp", reinvestment.budgetGbp)],
  ];
  const body = document.getElementById("reinvestmentBody");
  body.innerHTML = "";
  rows.forEach(([id, label, text]) => {
    const row = document.createElement("tr");
    row.dataset.figureId = id;
    const labelCell = document.createElement("td");
    labelCell.textContent = label;
    const valueCell = document.createElement("td");
    valueCell.textContent = text;
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
    cell.title = "This figure is reported by month or quarter, so it has no daily window.";
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
  container.classList.add("objectives-failed");
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

const STATIC_TABLE_PANELS = ["visitorsPanel", "activitiesPanel", "companyAccountsPanel", "reservePanel", "reinvestmentPanel"];

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
    if (error.status !== 403) {
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

async function initPage() {
  armAutoRefresh();
  loadHeldPasses();
  decorateStaticPanels();
  try {
    const snapshot = await fetchJson("/api/v1/operator/snapshot");
    renderSnapshot(snapshot);
    document.getElementById("objectivesContainer").classList.add("objectives-settled");
    renderReinvestment(snapshot);
    renderReserve(snapshot);
    renderCompanyAccounts(snapshot);
    renderActivities(snapshot);
    window.renderDailyCharts(snapshot);
    renderVisitors(snapshot);
  } catch (error) {
    if (error.status === 403) {
      showError(null);
    } else if (error.status === 404) {
      showError("No snapshot has been published yet.");
    } else {
      showError("The operator snapshot did not load. Reload the page to try again.");
    }
  }
  scrollToHash();
}

document.addEventListener("DOMContentLoaded", initPage);
