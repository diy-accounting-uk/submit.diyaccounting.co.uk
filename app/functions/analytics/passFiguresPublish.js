// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-64 Publish per-pass figures nightly
// - **Use when:** a pass issuer's page must show how each pass performed without a live query on customer tables.
// - **Does:** passFiguresPublish.js reads the v_pass_performance view through Athena and writes one figures#<code> item per pass into the passes table. It skips a pass whose figures did not change. passMyPassesGet.js reads these items by key; PassFiguresPublish.java provisions the Lambda and NightlyIngestionWorkflow.java runs it as the last step.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/analytics/passFiguresPublish.js:handler`
// - **Files:** app/functions/analytics/passFiguresPublish.js, app/unit-tests/analytics/passFiguresPublish.test.js, infra/main/resources/analytics/views/v_pass_performance.sql, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/PassFiguresPublish.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/PassFiguresPublishTest.java, app/data/dynamoDbPassRepository.js
// - **Keywords:** pass figures, my generated passes, v_pass_performance, referral pass, nightly publish, affiliate
// - **Related:** BILL-09, DATA-18, DATA-22
// @end-capability

// app/functions/analytics/passFiguresPublish.js

import { createLogger } from "../../lib/logger.js";
import { getPassFigures, putPassFigures } from "../../data/dynamoDbPassRepository.js";
import { runAthenaQuery, toObjects } from "./rawExportPublish.js";

const logger = createLogger({ source: "app/functions/analytics/passFiguresPublish.js" });

// Athena returns a first page of at most 1000 rows; a result that fills it may be cut short.
const ATHENA_PAGE_LIMIT = 1000;

const FIGURE_FIELDS = ["uses", "newAccounts", "filed", "subscribers", "paidCharges", "lastUsed"];

export function toFigures(row) {
  return {
    code: row.code,
    uses: Number(row.uses),
    newAccounts: Number(row.new_accounts),
    filed: Number(row.filed),
    subscribers: Number(row.subscribers),
    paidCharges: Number(row.paid_charges),
    lastUsed: row.last_used ?? null,
  };
}

export function figuresChanged(existing, figures) {
  if (!existing) return true;
  return FIGURE_FIELDS.some((field) => existing[field] !== figures[field]);
}

export async function handler() {
  const workGroup = process.env.ATHENA_WORK_GROUP_NAME;
  const database = process.env.GLUE_DATABASE_NAME;
  if (!workGroup || !database) {
    throw new Error("ATHENA_WORK_GROUP_NAME and GLUE_DATABASE_NAME are required");
  }

  const result = await runAthenaQuery({ workGroup, database, sql: "SELECT * FROM v_pass_performance" });
  if (result.rows.length >= ATHENA_PAGE_LIMIT) {
    throw new Error(`v_pass_performance returned ${result.rows.length} rows, which may be cut short`);
  }
  const figuresList = toObjects(result).map(toFigures);

  const existingByCode = await getPassFigures(figuresList.map((figures) => figures.code));
  const computedAt = new Date().toISOString();
  let written = 0;
  for (const figures of figuresList) {
    if (!figuresChanged(existingByCode.get(figures.code), figures)) continue;
    await putPassFigures({ ...figures, computedAt });
    written += 1;
  }

  logger.info({ message: "Pass figures published", passes: figuresList.length, written });
  return { passes: figuresList.length, written };
}
