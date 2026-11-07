// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/dashboard-review-report.mjs
//
// Renders the nightly dashboard review as Markdown from checked values only. Every cell is
// escaped so that no model or page text can form a link, an image or markup. The report ends
// with a figures block that the next night's run reads back.

import { figuresBlockSchema } from "../app/lib/dashboardReviewSchema.js";
import { HEADLINE_PATHS, readHeadlines } from "./dashboard-review-checks.mjs";

export const FIGURES_MARKER = "<!-- dashboard-review-figures:v1 -->";
export const MOVEMENT_THRESHOLD = 0.25;
export const DASHBOARD_URL = "https://submit.diyaccounting.co.uk/operator/dashboard.html";

// The tab and the board prefix of each headline figure, by its label in HEADLINE_PATHS.
const HEADLINE_PLACEMENT = {
  "Revenue, gross": { tab: "adoption", prefix: "MKT" },
  "Revenue, net": { tab: "adoption", prefix: "MKT" },
  "Donations": { tab: "adoption", prefix: "MKT" },
  "Subscriptions": { tab: "adoption", prefix: "MKT" },
  "Contribution": { tab: "adoption", prefix: "MKT" },
  "Google Ads cost": { tab: "adoption", prefix: "MKT" },
  "Microsoft Ads cost": { tab: "adoption", prefix: "MKT" },
  "Paid landings": { tab: "adoption", prefix: "MKT" },
  "AWS cost": { tab: "main", prefix: "COST" },
  "Cash at bank": { tab: "main", prefix: "OPS" },
  "Marketing budget": { tab: "adoption", prefix: "MKT" },
  "Marketing spent this month": { tab: "adoption", prefix: "MKT" },
  "New accounts": { tab: "adoption", prefix: "DASH" },
  "New accounts that submitted": { tab: "adoption", prefix: "DASH" },
  "Active customers, 7 days": { tab: "adoption", prefix: "DASH" },
};

export function figureKey(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The headline figures: the key of each in the figures block, its label, its path and where it lands. */
export const HEADLINE_FIGURES = Object.freeze(
  HEADLINE_PATHS.map(({ label, path }) => {
    const placement = HEADLINE_PLACEMENT[label];
    if (!placement) throw new Error(`the headline ${label} has no placement`);
    return { key: figureKey(label), label, path, movement: path.endsWith(".last30.value"), ...placement };
  }),
);

/** @returns {Record<string, number>} the headline figures that the snapshot holds, by key */
export function figuresFromSnapshot(snapshot) {
  const figures = {};
  readHeadlines(snapshot).forEach(({ label, value }) => {
    if (value !== null && Number.isFinite(value)) figures[figureKey(label)] = value;
  });
  return figuresBlockSchema.parse(figures);
}

/** @returns {Record<string, number>|null} the figures block of a report, or null when it has none */
export function parseFiguresBlock(markdown) {
  const text = String(markdown ?? "");
  const at = text.lastIndexOf(FIGURES_MARKER);
  if (at < 0) return null;
  const match = /^```json\n([^\n]*)\n```/m.exec(text.slice(at + FIGURES_MARKER.length));
  if (!match) return null;
  try {
    const parsed = figuresBlockSchema.safeParse(JSON.parse(match[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Escapes text for a table cell or a list line: no pipe, link, image, markup or bare address survives. */
export function escapeText(text) {
  return String(text)
    .replace(/\r?\n/g, " ")
    .replace(/:\/\//g, ":\\/\\/")
    .replace(/[\\|[\]<>`]/g, (char) => `\\${char}`);
}

function movementFindings(figures, previous) {
  if (!previous) return [];
  const found = [];
  for (const headline of HEADLINE_FIGURES) {
    if (!headline.movement) continue;
    const current = figures[headline.key];
    const before = previous[headline.key];
    if (current === undefined || before === undefined || before === 0) continue;
    const change = (current - before) / Math.abs(before);
    if (Math.abs(change) <= MOVEMENT_THRESHOLD) continue;
    found.push({
      tab: headline.tab,
      panel: "headline-figures",
      label: headline.label,
      tag: "movement",
      list: "observation",
      finding: `${headline.label} moved ${formatChange(change)} in its 30 day figure since the last nightly report.`,
      evidence: `${headline.key} ${before} to ${current}`,
      change: `Find the cause of the move in ${headline.label} and decide whether it needs a change.`,
      source: "code",
      prefix: headline.prefix,
    });
  }
  return found;
}

function formatChange(change) {
  const percent = Math.round(change * 1000) / 10;
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

function formatFigure(value) {
  return value === undefined ? "not measured" : String(Math.round(value * 100) / 100);
}

function tagCell(finding) {
  return `${finding.tag}, ${finding.source}`;
}

function improvementTable(rows) {
  const lines = ["| Tab | Panel | Tag | Finding | Evidence | Change |", "|---|---|---|---|---|---|"];
  for (const row of rows) {
    lines.push(`| ${[row.tab, row.panel, tagCell(row), row.finding, row.evidence, row.change].map(escapeText).join(" | ")} |`);
  }
  return lines;
}

function proposedRowLine({ prefix, title, action, tab, tag, date }) {
  const escaped = escapeText(title);
  const cleanTitle = escaped.endsWith(".") ? escaped.slice(0, -1) : escaped;
  return `- [ ] **${prefix}n. ${cleanTitle}.** ${escapeText(action)} Tab ${escapeText(tab)}, tag ${escapeText(tag)}. **Source**: nightly dashboard review ${date}. **Owner**: Claude Code. **Model**: Sonnet. **Size**: unknown.`;
}

function headlineRows(figures, previous) {
  const lines = [];
  for (const headline of HEADLINE_FIGURES) {
    const current = figures[headline.key];
    const before = previous ? previous[headline.key] : undefined;
    lines.push(
      `| ${escapeText(headline.label)} | ${formatFigure(current)} | ${previous ? formatFigure(before) : "none"} | ${changeCell(previous, current, before)} |`,
    );
  }
  return lines;
}

function changeCell(previous, current, before) {
  if (!previous) return "no previous report";
  if (current === undefined || before === undefined) return "not comparable";
  if (before === 0) return current === 0 ? "none" : "from zero";
  return formatChange((current - before) / Math.abs(before));
}

function tabSection({ tab, findings, count, rejected, masked, keptImages, date }) {
  const lines = ["", `### Tab: ${escapeText(tab.tabId)}`, ""];
  lines.push(
    `${tab.imageCount} images; ${count(tab.tabId, "improvement")} improvements, ${count(tab.tabId, "observation")} observations.`,
    "",
  );
  for (const panel of tab.panels) lines.push(`- [${escapeText(panel)}](${DASHBOARD_URL}#${encodeURIComponent(panel)})`);
  if (rejected) {
    const issues = rejected.issues.map((issue) => `${issue.path} ${issue.code}`).join("; ");
    lines.push("", `The model's answer for this tab was rejected, so its text is dropped. Schema issues: ${issues}.`);
  }
  if (masked) lines.push("", "The guardrail masked personal data in the model's text.");
  for (const list of ["improvement", "observation"]) {
    const listed = findings.filter((finding) => finding.tab === tab.tabId && finding.list === list);
    if (listed.length === 0) continue;
    lines.push("", list === "improvement" ? "Dashboard improvements:" : "Changes the observations call for:", "");
    for (const finding of listed) {
      lines.push(
        `- ${escapeText(finding.panel)} (${escapeText(tagCell(finding))}): ${escapeText(finding.finding)} Evidence: ${escapeText(finding.evidence)}.`,
      );
    }
  }
  for (const key of Object.keys(keptImages).filter((name) => name.startsWith(`${tab.tabId}/`))) {
    const alt = escapeText(key.slice(tab.tabId.length + 1));
    lines.push("", `![${alt}](${date}-nightly/${keptImages[key]})`);
  }
  return lines;
}

/**
 * @param {object} input
 * @param {string} input.date YYYY-MM-DD
 * @param {string} input.liveSet the live prod deployment set, or "unknown"
 * @param {string} input.generatedAt the snapshot's time
 * @param {string} input.modelId the judge's model id
 * @param {{ tabId: string, panels: string[], imageCount: number }[]} input.tabs in the page's order
 * @param {Record<string, number>} input.figures this run's headline figures
 * @param {Record<string, number>|null} input.previous the last nightly report's figures, null on the first run
 * @param {object[]} input.codeFindings from runCodeChecks; `tab` is a tab id or "all"
 * @param {object[]} input.modelFindings from answerFindings
 * @param {object[]} input.modelRows proposed rows from answerFindings
 * @param {{ tabId: string, issues: { path: string, code: string }[] }[]} input.rejectedTabs
 * @param {string[]} input.maskedTabs tabs whose model text the guardrail masked
 * @param {string[]} input.injectionTabs tabs where the model flagged an injection
 * @param {Record<string, string>} input.keptImages file name under the report's image folder, by `<tab>/<panel>`
 * @param {string[]} input.notes fixed lines for the method section
 * @returns {{ markdown: string, movements: object[] }}
 */
export function renderReport({
  date,
  liveSet,
  generatedAt,
  modelId,
  tabs,
  figures,
  previous,
  codeFindings,
  modelFindings,
  modelRows,
  rejectedTabs,
  maskedTabs,
  injectionTabs,
  keptImages,
  notes,
}) {
  const movements = movementFindings(figures, previous);
  const improvements = [...codeFindings, ...modelFindings].filter((finding) => finding.list === "improvement");
  const observations = [...codeFindings, ...movements, ...modelFindings].filter((finding) => finding.list === "observation");
  const findings = [...improvements, ...observations];
  const count = (tabId, list) => findings.filter((finding) => finding.tab === tabId && finding.list === list).length;
  const perTab = ["all", ...tabs.map((tab) => tab.tabId)]
    .map((tabId) => `${escapeText(tabId)} ${count(tabId, "improvement")}/${count(tabId, "observation")}`)
    .join(", ");

  const out = [`# Dashboard review ${date} (nightly)`, ""];
  for (const tabId of injectionTabs) {
    out.push(
      `The model reports that text in the ${escapeText(tabId)} tab tried to instruct it. Treat its findings for that tab with care.`,
      "",
    );
  }
  out.push(
    `Snapshot ${escapeText(generatedAt)}; live set ${escapeText(liveSet)}; findings as improvements/observations: ${perTab}.`,
    "",
    `Method: nightly run. The page is the checkout's own, rendered from the stored snapshot. Code ran checks 1 to 6, 8 and 9 of the skill, and the model judged what a reader sees, with check 9 (judge ${escapeText(modelId)}, no tools). Check 7 (AWS link hosts and accounts) did not run. The model's text is in the rows marked model.`,
    ...notes.map((note) => `\n${escapeText(note)}`),
    "",
    "## Headline figures",
    "",
    "| Figure | This run | Last report | Change |",
    "|---|---|---|---|",
    ...headlineRows(figures, previous),
  );
  if (!previous) out.push("", "No earlier nightly report holds a figures block, so no movement is judged this run.");

  out.push("", "## Dashboard improvements", "");
  out.push(...(improvements.length === 0 ? ["None."] : improvementTable(improvements)));

  out.push("", "## Changes the observations call for", "");
  const rows = [...movements.map((movement) => ({ ...movement, title: `${movement.label} moved`, action: movement.change })), ...modelRows];
  out.push(...(rows.length === 0 ? ["None."] : rows.map((row) => proposedRowLine({ ...row, date }))));

  out.push("", "## Tab by tab");
  for (const tab of tabs) {
    const rejected = rejectedTabs.find((entry) => entry.tabId === tab.tabId);
    out.push(...tabSection({ tab, findings, count, rejected, masked: maskedTabs.includes(tab.tabId), keptImages, date }));
  }

  out.push("", FIGURES_MARKER, "```json", JSON.stringify(figures), "```", "");
  return { markdown: out.join("\n"), movements };
}
