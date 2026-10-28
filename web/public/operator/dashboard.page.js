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

const OBJECTIVE_ORDER = [
  "uptime",
  "conversion-to-submission",
  "conversion-to-paid",
  "low-running-cost",
  "security",
  "retention",
  "operator-effort",
  "compliance",
];

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

const NOT_MEASURED = "not measured";
const NONE = "none";
const NO_BASE = "no base";

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

// "not measured" is a figure the pipeline could not produce; "none" is a measured count of zero.
function formatValue(unit, value) {
  if (value === null || value === undefined) return NOT_MEASURED;
  if (unit === "ratio") return percentFormat.format(value * 100) + "%";
  if (unit === "gbp") return gbpFormat.format(value);
  if (unit === "usd") return usdFormat.format(value);
  if (unit === "hours") return numberFormat.format(value) + " h";
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

function formatTimestamp(iso) {
  return timestampFormat.format(new Date(iso)) + " UTC";
}

// What the link opens, read from the address so the snapshot carries no second copy of it.
function linkLabel(observation) {
  const url = observation.deepLink || "";
  if (url.includes("cloudwatch/home") && url.includes("#alarmsV2")) return "CloudWatch alarms";
  if (url.includes("cloudwatch/home")) {
    const match = url.match(/dashboards:name=([^&]+)/);
    return match ? "CloudWatch dashboard " + decodeURIComponent(match[1]) : "CloudWatch dashboards";
  }
  if (url.includes("/athena/")) return "Athena saved queries" + (observation.source ? " (" + observation.source + ")" : "");
  if (url.includes("github.com") && url.includes("/workflows/")) return "GitHub workflow " + url.split("/workflows/")[1];
  if (url.includes("analytics.google.com")) return "Google Analytics reports";
  return "Source console";
}

function renderObservationRow(observation) {
  const row = document.createElement("tr");
  row.className = "observation";
  row.dataset.observationId = observation.id;

  const label = document.createElement("td");
  label.textContent = observation.label;
  if (observation.source) {
    const source = document.createElement("small");
    source.className = "observation-source";
    source.textContent = "Source: " + observation.source + (observation.measure ? ", " + observation.measure : "");
    label.appendChild(source);
  }
  row.appendChild(label);

  const last30 = document.createElement("td");
  last30.textContent = formatValue(observation.unit, observation.last30 && observation.last30.value);
  row.appendChild(last30);

  const trend30 = formatTrend(
    observation.last30 && observation.last30.trend,
    observation.last30 && observation.last30.isNew,
    observation.better,
  );
  const trend30Cell = document.createElement("td");
  trend30Cell.textContent = trend30.text;
  trend30Cell.className = trend30.className;
  row.appendChild(trend30Cell);

  const last90 = document.createElement("td");
  last90.textContent = formatValue(observation.unit, observation.last90 && observation.last90.value);
  row.appendChild(last90);

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

function renderObjective(objective) {
  const section = document.createElement("section");
  section.className = "objective";
  section.dataset.objectiveId = objective.id;

  const heading = document.createElement("h2");
  heading.textContent = objective.name;
  section.appendChild(heading);

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
    '<tr><th>Observation</th><th>Last 30 days</th><th title="Last 30 days against the 30 days before them">vs previous 30 days</th><th>Last 90 days</th><th>Where to look</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  objective.observations.forEach((observation) => tbody.appendChild(renderObservationRow(observation)));
  table.appendChild(tbody);

  section.appendChild(table);
  return section;
}

const VISITOR_KINDS = [
  ["sessions-human", "Human"],
  ["sessions-operator", "Operator"],
  ["sessions-bot", "Bot"],
  ["sessions-synthetic", "Synthetic"],
];

const VISITORS_FAST_WINDOW_UNAVAILABLE =
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

  VISITOR_KINDS.forEach(([observationId, kindLabel]) => {
    const observation = observationsById[observationId];
    const row = document.createElement("tr");
    row.className = "visitors-kind";
    row.dataset.kind = observationId.replace("sessions-", "");

    const kindCell = document.createElement("td");
    kindCell.textContent = kindLabel;
    row.appendChild(kindCell);

    // The fast windows read GA4's streaming export; a property that only exports daily
    // (ci) leaves them empty, and GA4's daily export reaches the lake two days late.
    ["last1h", "last1d", "last7d"].forEach((key) => row.appendChild(activityCountCell(observation, key, VISITORS_FAST_WINDOW_UNAVAILABLE)));
    row.appendChild(activityCountCell(observation, "last30"));
    row.appendChild(activityTrendCell(observation));
    row.appendChild(activityCountCell(observation, "last90"));

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
  const valueCell = document.createElement("td");
  valueCell.textContent = formatValue("gbp", observation && observation.last30 && observation.last30.value);
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

function activityCountCell(observation, key, unavailableTitle) {
  const cell = document.createElement("td");
  const value = observation && observation[key] && observation[key].value;
  cell.textContent = formatValue("count", value);
  if (unavailableTitle && (value === null || value === undefined)) cell.title = unavailableTitle;
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

  // Last 1 hour/1 day/7 days carry no trend: they are refreshed by the hourly
  // activity-only publish, which patches only these three fields onto whatever the last
  // nightly full publish wrote for last30/last90, so this row can mix a very fresh count
  // with a day-old trend.
  row.appendChild(activityCountCell(observation, "last1h"));
  row.appendChild(activityCountCell(observation, "last1d"));
  row.appendChild(activityCountCell(observation, "last7d"));
  row.appendChild(activityCountCell(observation, "last30"));
  row.appendChild(activityTrendCell(observation));
  row.appendChild(activityCountCell(observation, "last90"));

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

  const container = document.getElementById("objectivesContainer");
  container.innerHTML = "";

  const objectivesById = {};
  (snapshot.objectives || []).forEach((objective) => {
    objectivesById[objective.id] = objective;
  });

  OBJECTIVE_ORDER.forEach((objectiveId) => {
    const objective = objectivesById[objectiveId] || { id: objectiveId, name: objectiveId, observations: [] };
    container.appendChild(renderObjective(objective));
  });
}

function renderExperiments(experiments) {
  const list = document.getElementById("experimentsList");
  list.innerHTML = "";
  if (!experiments || experiments.length === 0) {
    showExperimentsMessage("No experiments published");
    return;
  }
  experiments.forEach((experiment) => {
    const item = document.createElement("li");
    item.className = "experiment";
    item.dataset.experimentId = experiment.id;
    const hypothesis = experiment.hypothesis && experiment.hypothesis.length > 0 ? experiment.hypothesis : "(no hypothesis yet)";
    item.textContent =
      experiment.id +
      " — " +
      experiment.objective +
      ": " +
      hypothesis +
      " (" +
      experiment.start +
      " to " +
      (experiment.end || "open") +
      ")";
    list.appendChild(item);
  });
}

function showExperimentsMessage(message) {
  const list = document.getElementById("experimentsList");
  list.innerHTML = "";
  const item = document.createElement("li");
  item.className = "experiments-empty";
  item.textContent = message;
  list.appendChild(item);
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

async function fetchToml(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("request-failed");
  const text = await response.text();
  return window.TOML ? window.TOML.parse(text) : JSON.parse(text);
}

// A null message leaves the explanation to the shared status message that the API client
// already raised, so the reader sees it once.
function showError(message) {
  const container = document.getElementById("objectivesContainer");
  container.innerHTML = "";
  container.classList.add("objectives-failed");
  document.getElementById("visitorsPanel").hidden = true;
  document.getElementById("chartsPanel").hidden = true;
  if (message === null) return;
  const notice = document.createElement("p");
  notice.id = "snapshotError";
  notice.className = "status-message status-error";
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  container.appendChild(notice);
}

async function initPage() {
  try {
    const snapshot = await fetchJson("/api/v1/operator/snapshot");
    renderSnapshot(snapshot);
    renderReinvestment(snapshot);
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

  try {
    const parsed = await fetchToml("/experiments.toml");
    renderExperiments(parsed.experiments);
  } catch {
    showExperimentsMessage("Experiments did not load.");
  }
}

document.addEventListener("DOMContentLoaded", initPage);
