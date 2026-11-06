// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/dashboard-review-checks.mjs
//
// The checks of the dashboard review that need no judgement: each is a comparison of numbers,
// times or names. A check is named by its number in the review skill's list.

export const STALE_SNAPSHOT_HOURS = 2;
export const STALE_CAPTURE_HOURS = 24;

// The review skill's check numbers that this module owns.
export const CODE_CHECK_NUMBERS = Object.freeze({
  freshness: 1,
  agreement: 2,
  notMeasured: 3,
  alarms: 6,
  hiddenPanels: 8,
  captureState: 9,
});

// The money and funnel figures of the report's headline table, each a path into the snapshot
// answer. A path is a dotted chain; `name[id]` picks the array entry whose `id` is `id`.
export const HEADLINE_PATHS = Object.freeze([
  { label: "Revenue, gross", path: "objectives[conversion-to-paid].observations[revenue-gbp].last30.value" },
  { label: "Revenue, net", path: "objectives[conversion-to-paid].observations[revenue-net-gbp].last30.value" },
  { label: "Donations", path: "objectives[conversion-to-paid].observations[revenue-donations-gbp].last30.value" },
  { label: "Subscriptions", path: "objectives[conversion-to-paid].observations[revenue-subscriptions-gbp].last30.value" },
  { label: "Contribution", path: "objectives[conversion-to-paid].observations[contribution-gbp].last30.value" },
  { label: "Google Ads cost", path: "objectives[conversion-to-paid].observations[ads-cost-gbp].last30.value" },
  { label: "Microsoft Ads cost", path: "objectives[conversion-to-paid].observations[ms-ads-cost-gbp].last30.value" },
  { label: "Paid landings", path: "objectives[conversion-to-paid].observations[paid-landings].last30.value" },
  { label: "AWS cost", path: "objectives[low-running-cost].observations[monthly-cost-usd].last30.value" },
  { label: "Cash at bank", path: "objectives[company-accounts].observations[company-cash-at-bank].last30.value" },
  { label: "Marketing budget", path: "monthlyMarketingBudget.budgetGbp" },
  { label: "Marketing spent this month", path: "monthlyMarketingBudget.spentThisMonthGbp" },
  { label: "New accounts", path: "objectives[conversion-to-submission].observations[new-accounts].last30.value" },
  { label: "New accounts that submitted", path: "objectives[conversion-to-submission].observations[new-accounts-submitted].last30.value" },
  { label: "Active customers, 7 days", path: "objectives[conversion-to-submission].observations[active-customers-7d].last30.value" },
]);

/**
 * @param {object|null} snapshot the snapshot answer
 * @param {string} path a path of HEADLINE_PATHS
 * @returns {*} the value at the path, or undefined when any step is missing
 */
export function readPath(snapshot, path) {
  let node = snapshot;
  for (const step of path.split(".")) {
    if (node === null || node === undefined) return undefined;
    const picked = /^([A-Za-z0-9_]+)\[([^\]]+)\]$/.exec(step);
    if (picked) {
      const list = node[picked[1]];
      node = Array.isArray(list) ? list.find((entry) => entry && entry.id === picked[2]) : undefined;
    } else {
      node = node[step];
    }
  }
  return node;
}

/**
 * @returns {{ label: string, path: string, value: number|null }[]} one entry for each HEADLINE_PATHS
 * entry; value is null when the snapshot holds no number there
 */
export function readHeadlines(snapshot) {
  return HEADLINE_PATHS.map(({ label, path }) => {
    const value = readPath(snapshot, path);
    return { label, path, value: typeof value === "number" ? value : null };
  });
}

function finding(check, tab, panel, tag, text, evidence, change) {
  return { check, tab, panel, tag, list: "improvement", finding: text, evidence, change, source: "code" };
}

function hoursBetween(laterMs, earlierIso) {
  return (laterMs - new Date(earlierIso).getTime()) / 3600000;
}

function observationsOf(snapshot) {
  return ((snapshot && snapshot.objectives) || []).flatMap((objective) =>
    (objective.observations || []).map((observation) => ({ objectiveId: objective.id, observation })),
  );
}

const WINDOW_KEYS = ["today", "previousDay", "last7", "last30", "last90"];

function windowsAreAllNull(observation) {
  return WINDOW_KEYS.every((key) => {
    const window = observation[key];
    return !window || window.value === null || window.value === undefined;
  });
}

function freshnessFindings({ snapshot, dom, now }) {
  const found = [];
  if (!snapshot) {
    found.push(
      finding(
        CODE_CHECK_NUMBERS.freshness,
        "main",
        "snapshotMeta",
        "fault",
        "No snapshot is published, so every panel is empty.",
        "snapshots/prod/latest.json missing",
        "Run the snapshot publish and find why latest.json is absent.",
      ),
    );
    return found;
  }
  const ageHours = hoursBetween(now, snapshot.generatedAt);
  if (ageHours > STALE_SNAPSHOT_HOURS) {
    found.push(
      finding(
        CODE_CHECK_NUMBERS.freshness,
        "all",
        "snapshotMeta",
        "stale",
        `The snapshot is ${Math.floor(ageHours)} hours old; prod publishes hourly.`,
        `generatedAt ${snapshot.generatedAt}`,
        "Find why the hourly snapshot publish has stopped.",
      ),
    );
  }
  if (snapshot.failedObservationCount > 0) {
    const empty = observationsOf(snapshot)
      .filter(({ observation }) => windowsAreAllNull(observation))
      .map(({ objectiveId, observation }) => `${objectiveId}.${observation.id}`);
    found.push(
      finding(
        CODE_CHECK_NUMBERS.freshness,
        "all",
        "snapshotMeta",
        "stale",
        `${snapshot.failedObservationCount} observation queries failed.`,
        `failedObservationCount ${snapshot.failedObservationCount}; every window null: ${empty.join(", ") || "none"}`,
        "Read the failed queries in the snapshot publish log and fix them.",
      ),
    );
  }
  for (const path of dom.unansweredApis) {
    found.push(
      finding(
        CODE_CHECK_NUMBERS.freshness,
        "all",
        "page",
        "fault",
        "The page called an API the nightly run does not answer.",
        `path ${path}`,
        "Add the route to the render's answers, or remove the call.",
      ),
    );
  }
  return found;
}

function agreementFindings({ dom }) {
  const found = [];
  const columns = [
    ["today", 1],
    ["previousDay", 2],
    ["last7", 3],
    ["last30", 4],
    ["trend", 5],
    ["last90", 6],
  ];
  for (const row of dom.rows) {
    if (!row.expected || row.cells.length !== 8) continue;
    for (const [name, index] of columns) {
      if (row.cells[index] !== row.expected[name]) {
        found.push(
          finding(
            CODE_CHECK_NUMBERS.agreement,
            row.tabId,
            row.objectiveId ? `table-${row.objectiveId}` : "page",
            "fault",
            `The page shows "${row.cells[index]}" for ${row.observationId} ${name}; the snapshot formats to "${row.expected[name]}".`,
            `observation ${row.observationId} ${name}`,
            "Find why the page and the snapshot differ for this cell.",
          ),
        );
      }
    }
  }
  return found;
}

function notMeasuredFindings({ snapshot, dom }) {
  const found = [];
  const byKey = new Map(observationsOf(snapshot).map((entry) => [`${entry.objectiveId}/${entry.observation.id}`, entry.observation]));
  for (const row of dom.rows) {
    if (row.cells.length !== 8) continue;
    const names = columnsShowing(row.cells, "not measured");
    if (names.length === 0) continue;
    const observation = byKey.get(`${row.objectiveId}/${row.observationId}`);
    const source = observation && (observation.view || observation.source);
    found.push(
      finding(
        CODE_CHECK_NUMBERS.notMeasured,
        row.tabId,
        row.objectiveId ? `table-${row.objectiveId}` : "page",
        "gap",
        `${row.observationId} shows "not measured" in ${names.join(", ")}.`,
        `observation ${row.observationId}${source ? `, source ${source}` : ""}`,
        "Name the reason for each empty window and fix the source, or show the reason on the page.",
      ),
    );
  }
  return found;
}

function columnsShowing(cells, text) {
  const names = ["label", "today", "previous day", "last 7 days", "last 30 days", "trend", "last 90 days"];
  return names.filter((name, index) => index > 0 && cells[index] === text);
}

function dataPresent(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

// One row of the skill's map: the snapshot keys it names (`key` or `key[id]`) and the panel
// tokens it names. A panel token is a panel id, or an objective id whose panel is table-<id>.
function parseMapRow(row) {
  const keys = [];
  const section = String(row.section);
  const ticked = [...section.matchAll(/`(\w+)(?:\[([^\]]+)\])?`/g)];
  // readCriteria returns the section without its backticks, a hand-written row keeps them.
  const parts = ticked.length > 0 ? ticked : section.split(",").map((part) => /^\s*(\w+)(?:\[([^\]]+)\])?\s*$/.exec(part));
  for (const match of parts) {
    if (match) keys.push({ key: match[1], id: match[2] || null });
  }
  const panels = [];
  const panelText = Array.isArray(row.panels) ? row.panels.map((panel) => `\`${panel}\``).join(" ") : String(row.panels);
  for (const match of panelText.matchAll(/`([^`]+)`/g)) panels.push(match[1]);
  return { keys, panels };
}

function keyHasData(snapshot, { key, id }) {
  if (id) {
    const objective = ((snapshot && snapshot[key]) || []).find((entry) => entry && entry.id === id);
    return Boolean(objective) && dataPresent(objective.observations);
  }
  return dataPresent(snapshot && snapshot[key]);
}

function mapFindings({ snapshot, dom, sectionMap }) {
  const found = [];
  if (!snapshot) return found;
  const rows = sectionMap.map(parseMapRow);
  const mappedKeys = new Set(rows.flatMap((row) => row.keys.map((entry) => entry.key)));
  const mappedObjectives = new Set(rows.flatMap((row) => row.keys.filter((entry) => entry.id).map((entry) => entry.id)));
  const panelById = new Map(dom.panels.map((panel) => [panel.id, panel]));

  for (const key of Object.keys(snapshot)) {
    if (key === "objectives" || mappedKeys.has(key)) continue;
    found.push(
      finding(
        CODE_CHECK_NUMBERS.hiddenPanels,
        "all",
        "page",
        "gap",
        `The snapshot key ${key} is in no row of the review map, so no panel is known to show it.`,
        `snapshot key ${key}`,
        "Add a panel for it and a row to the map in the review skill.",
      ),
    );
  }
  for (const objective of snapshot.objectives || []) {
    if (!mappedObjectives.has(objective.id)) {
      found.push(
        finding(
          CODE_CHECK_NUMBERS.hiddenPanels,
          "all",
          `table-${objective.id}`,
          "gap",
          `The objective ${objective.id} is in no row of the review map.`,
          `objectives[${objective.id}]`,
          "Add a row to the map in the review skill.",
        ),
      );
    }
  }

  const named = new Set();
  for (const row of rows) {
    const withData = row.keys.some((entry) => keyHasData(snapshot, entry));
    for (const token of row.panels) {
      const panel = panelById.get(token) || panelById.get(`table-${token}`);
      if (panel) named.add(panel.id);
      if (!panel || !withData || panel.openOn.length > 0) continue;
      found.push(
        finding(
          CODE_CHECK_NUMBERS.hiddenPanels,
          panel.tabs[0] || "all",
          panel.id,
          "fault",
          `The panel ${panel.id} stays hidden while its tab is open, and its snapshot data is present.`,
          `panel ${panel.id}, keys ${row.keys.map((entry) => (entry.id ? `${entry.key}[${entry.id}]` : entry.key)).join(", ")}`,
          "Find why the page does not show the panel.",
        ),
      );
    }
  }
  for (const panel of dom.panels) {
    const exempt = panel.id === "heldPassesPanel" || panel.id === "awsLinksPanel" || panel.id.startsWith("console-");
    if (exempt || named.has(panel.id)) continue;
    found.push(
      finding(
        CODE_CHECK_NUMBERS.hiddenPanels,
        panel.tabs[0] || "all",
        panel.id,
        "gap",
        `No row of the review map names the panel ${panel.id}.`,
        `panel ${panel.id}`,
        "Add the panel to the map in the review skill.",
      ),
    );
  }
  return found;
}

function captureFindings({ snapshot, dom }) {
  const found = [];
  const items = (snapshot && snapshot.console && snapshot.console.items) || {};
  for (const capture of dom.captures) {
    const panel = `console-${capture.captureId}`;
    const item = items[capture.captureId];
    if (capture.empty && /not captured yet/i.test(capture.empty)) {
      found.push(
        finding(
          CODE_CHECK_NUMBERS.captureState,
          capture.tabId,
          panel,
          "fault",
          "The capture has not run.",
          `capture ${capture.captureId}`,
          "Run the console capture and check its index entry.",
        ),
      );
      continue;
    }
    if (capture.error) {
      found.push(
        finding(
          CODE_CHECK_NUMBERS.captureState,
          capture.tabId,
          panel,
          "fault",
          capture.error.startsWith("Capture failed") ? "The capture failed." : "The capture image did not load.",
          `capture ${capture.captureId}: ${capture.error.slice(0, 120)}`,
          "Read the capture run's log for this item and fix it.",
        ),
      );
      continue;
    }
    if (capture.hasImage && !capture.imageLoaded) {
      found.push(
        finding(
          CODE_CHECK_NUMBERS.captureState,
          capture.tabId,
          panel,
          "fault",
          "The capture image did not load.",
          `capture ${capture.captureId}`,
          "Read the capture run's log for this item and fix it.",
        ),
      );
    }
    if (item && snapshot && item.capturedAt) {
      const lag = hoursBetween(new Date(snapshot.generatedAt).getTime(), item.capturedAt);
      if (lag > STALE_CAPTURE_HOURS) {
        found.push(
          finding(
            CODE_CHECK_NUMBERS.captureState,
            capture.tabId,
            panel,
            "stale",
            `The capture is ${Math.floor(lag)} hours older than the snapshot.`,
            `capture ${capture.captureId} capturedAt ${item.capturedAt}`,
            "Find why the daily console capture has stopped.",
          ),
        );
      }
    }
  }
  return found;
}

function alarmFindings({ snapshot, alarms }) {
  const found = [];
  const items = Object.values((snapshot && snapshot.console && snapshot.console.items) || {}).filter(
    (item) => item.kind === "alarms" && Array.isArray(item.rows),
  );
  for (const alarm of alarms) {
    const title = String(alarm.title).toLowerCase();
    const tab = title.includes("prod") ? "aws-prod" : title.includes("ci") ? "aws-ci" : "ops";
    const rows = items.flatMap((item) => item.rows.map((row) => ({ ...row, itemId: item.id })));
    const match = rows.find((row) => row.name && title.includes(String(row.name).toLowerCase()));
    if (!match) {
      found.push(
        finding(
          CODE_CHECK_NUMBERS.alarms,
          tab,
          "awsLinksPanel",
          "fault",
          `Open alarm issue ${alarm.number} has no row in the console alarm tables.`,
          `issue ${alarm.number}`,
          "Find why the alarms capture does not list this alarm.",
        ),
      );
    } else if (match.state !== "ALARM") {
      found.push(
        finding(
          CODE_CHECK_NUMBERS.alarms,
          tab,
          `console-${match.itemId}`,
          "fault",
          `Open alarm issue ${alarm.number} shows state ${match.state} in the console alarm table.`,
          `issue ${alarm.number}, alarm ${match.name}`,
          "Close the issue if the alarm cleared, or find why the capture is out of date.",
        ),
      );
    }
  }
  return found;
}

/**
 * Runs the checks that code owns (see CODE_CHECK_NUMBERS) and the map checks.
 *
 * @param {object} input
 * @param {object|null} input.snapshot the snapshot answer (snapshot plus `console`), null when none is published
 * @param {object} input.dom the `dom` of renderDashboard()
 * @param {{ number: number, title: string }[]} input.alarms the open alarm issues
 * @param {{ section: string, tabs: string, panels: string|string[] }[]} input.sectionMap `sectionMap` of readCriteria()
 * @param {number} input.now milliseconds since the epoch
 * @returns {{ check: number, tab: string, panel: string, tag: string, list: "improvement", finding: string,
 *   evidence: string, change: string, source: "code" }[]} `tab` is a tab id, or "all"
 */
export function runCodeChecks({ snapshot, dom, alarms, sectionMap, now }) {
  return [
    ...freshnessFindings({ snapshot, dom, now }),
    ...agreementFindings({ dom }),
    ...notMeasuredFindings({ snapshot, dom }),
    ...mapFindings({ snapshot, dom, sectionMap }),
    ...captureFindings({ snapshot, dom }),
    ...alarmFindings({ snapshot, alarms }),
  ];
}
