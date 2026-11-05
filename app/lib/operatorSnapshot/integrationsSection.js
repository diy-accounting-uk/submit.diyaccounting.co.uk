// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/integrationsSection.js

// The snapshot's `integrations` section: the live calls to HMRC, Companies House and Stripe, as
// one summary row per organisation and status and a list of recent calls per organisation. The
// rows come from the call records in the lake (v_integration_calls and v_integration_calls_daily).
// A row holds the api template, the timing, the status and the header rule result, so it holds no
// customer identifier and no request content.

export const INTEGRATION_ORGS = ["hmrc", "companies-house", "stripe"];

// The newest calls of each organisation, and the newest calls with a status outside 2xx.
export const INTEGRATION_RECENT_CALLS = 100;
export const INTEGRATION_FAILED_CALLS = 100;
export const INTEGRATION_FAILED_DAYS = 30;

const SUMMARY_WINDOW_ALIASES = ["today", "prev_1", "last_7", "last_30", "prev_30", "last_90", "prev_90"];

/**
 * One query: for each organisation and status, the live call counts in every standard window.
 * The windows are the dashboard's own (`windowedColumns`), so Today starts at UK midnight as in
 * every other table.
 *
 * @param {Array<[string, (day: string) => string]>} windowedColumns
 * @returns {string}
 */
export function buildIntegrationSummarySql(windowedColumns) {
  const columns = windowedColumns
    .filter(([alias]) => SUMMARY_WINDOW_ALIASES.includes(alias))
    .map(([alias, condition]) => `cast(sum(CASE WHEN ${condition("day")} THEN calls END) AS double) AS ${alias}`);
  return (
    `SELECT org, status_label AS status,\n       ${columns.join(",\n       ")},\n` +
    `       cast(min(day) AS varchar) AS first_day\n` +
    `FROM   v_integration_calls_daily\n` +
    `WHERE  target = 'live' AND day > date_add('day', -180, current_date)\n` +
    `GROUP  BY 1, 2\nORDER  BY 1, 2`
  );
}

/**
 * One query: per organisation the newest INTEGRATION_RECENT_CALLS live calls, plus the newest
 * INTEGRATION_FAILED_CALLS live calls of the last INTEGRATION_FAILED_DAYS days whose status is
 * not 2xx, without duplicates. The call id is the table's sort key.
 *
 * @returns {string}
 */
export function buildIntegrationCallsSql() {
  return (
    `SELECT org, call_id, api, method, duration_ms, status_label, fph_rules, fph_rules_failed\n` +
    `FROM (\n` +
    `  SELECT *,\n` +
    `         row_number() OVER (PARTITION BY org ORDER BY started_at DESC) AS recent_rank,\n` +
    `         row_number() OVER (PARTITION BY org, is_failed ORDER BY started_at DESC) AS failed_rank\n` +
    `  FROM (\n` +
    `    SELECT *, (status IS NULL OR status < 200 OR status >= 300) AS is_failed\n` +
    `    FROM   v_integration_calls\n` +
    `    WHERE  target = 'live' AND day > date_add('day', -90, current_date)\n` +
    `  )\n` +
    `)\n` +
    `WHERE recent_rank <= ${INTEGRATION_RECENT_CALLS}\n` +
    `   OR (is_failed AND failed_rank <= ${INTEGRATION_FAILED_CALLS} AND day > date_add('day', -${INTEGRATION_FAILED_DAYS}, current_date))\n` +
    `ORDER  BY org, call_id DESC`
  );
}

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// A status sorts by its number; an outcome with no status (timeout, network-error, refused) follows.
function compareStatus(a, b) {
  const [x, y] = [Number(a), Number(b)];
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
  if (Number.isFinite(x)) return -1;
  if (Number.isFinite(y)) return 1;
  return a.localeCompare(b);
}

/**
 * The section from the two queries' rows.
 *
 * @param {{summaryRows: Array<object>, callRows: Array<object>, tableName: string, region: string, toWindows: (row: object, aggregation: string, today: Date) => object, now?: Date}} params
 * @returns {{table: string, region: string, summary: Array<object>, calls: Record<string, Array<object>>}}
 */
export function shapeIntegrationsSection({ summaryRows, callRows, tableName, region, toWindows, now = new Date() }) {
  const summary = summaryRows
    .filter((row) => INTEGRATION_ORGS.includes(row.org) && row.status)
    .sort((a, b) => INTEGRATION_ORGS.indexOf(a.org) - INTEGRATION_ORGS.indexOf(b.org) || compareStatus(a.status, b.status))
    .map((row) => ({ org: row.org, status: row.status, unit: "count", ...toWindows(row, "sum", now) }));
  const calls = Object.fromEntries(INTEGRATION_ORGS.map((org) => [org, []]));
  callRows
    .filter((row) => INTEGRATION_ORGS.includes(row.org))
    .forEach((row) => {
      const failedRules = row.fph_rules_failed ? String(row.fph_rules_failed).split(",") : [];
      calls[row.org].push({
        id: row.call_id,
        at: String(row.call_id).split("#")[0],
        api: row.api,
        method: row.method,
        ms: numberOrNull(row.duration_ms),
        status: row.status_label,
        rules: row.fph_rules || null,
        rulesFailed: failedRules,
      });
    });
  return { table: tableName, region, summary, calls };
}
