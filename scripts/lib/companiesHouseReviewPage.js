// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/companiesHouseReviewPage.js
// The per-case text and the one page of a Companies House review: the company line, the gateway
// answer, the walk-through sections and index.html. The page parts and their order are listed in
// .claude/skills/companies-house-judge/SKILL.md "The page".

import { basename } from "node:path";

export const FIXTURE_PATH = "scripts/fixtures/companies-house-test-service-cases.json";
const REVIEW_SKILL = ".claude/skills/companies-house-review/SKILL.md";
const TRIAGE = "../private.diyaccounting.co.uk/companies-house/correspondence/TRIAGE_XMLGW_ACCOUNTS_2026-10-24.md";
const REGISTER_URL = "https://find-and-update.company-information.service.gov.uk/company/";

// Why each criterion is checked: the rule or request it comes from.
const WHY = {
  "Nothing of the iXBRL header is visible":
    'XML team, 23 Oct 2026, on submission 000038: the accounts "include information in the header and footer that should not appear".',
  "A readable balance sheet with labels and both years":
    'XML team, 23 Oct 2026: "missing significant data ... follow the examples"; every published example shows a labelled line with both years.',
  "Nothing after the last note": 'XML team, 23 Oct 2026: information in the footer "that should not appear".',
  "Every fact the example carries is in ours": 'XML team, 23 Oct 2026: "missing significant data ... follow the examples".',
  "Production software name and version":
    "Accounts technical interface specification (TIS): software name and version are mandatory facts.",
  "AccountsTypeDimension": "TIS and the FRC taxonomy: the accounts type member must match the accounts filed.",
  "AccountingStandardsDimension": "TIS and the FRC taxonomy: the standards member must match the regime (FRS 105 micro, FRS 102 1A small).",
  "ApplicableLegislationDimension": "TIS and the FRC taxonomy: small companies regime accounts name the applicable legislation.",
  "EntityTradingStatusDimension": "TIS: a dormant company that has never traded carries this member.",
  "EntityDormantTruefalse": "TIS: the dormant flag is mandatory and must match the accounts type.",
  "Companies House test validator passes": "Companies House's own validator: what their system checks before a person reads the filing.",
  "iXBRL structure": "Inline XBRL 1.1 specification: one hidden header, every fact in a declared context and unit.",
  "Section 477": "Companies Act 2006 s477: a small company claiming audit exemption must say so on the balance sheet.",
  "Section 480": "Companies Act 2006 s480: a dormant company claiming audit exemption must say so on the balance sheet.",
  "Members have not required an audit": "Companies Act 2006 s475(3) and s476: the statement that members have not required an audit.",
  "Directors acknowledge": "Companies Act 2006 s475(3)(b): the directors' responsibility statement.",
  "Prepared in accordance with the micro-entity provisions": "Companies Act 2006 s414(3): micro-entity accounts state the regime.",
  "Prepared in accordance with the small companies regime": "Companies Act 2006 s414(3): small companies regime accounts state the regime.",
  "Section 444(5)": "Companies Act 2006 s444(5): accounts delivered under the small companies regime say so.",
  "Section 444(5A)": "Companies Act 2006 s444(5A): filleted accounts state that the profit and loss account is not delivered.",
  "Directors' approval line": "Companies Act 2006 s414(1)-(2): the balance sheet is approved by the board and signed by a director, named.",
  "The company's category":
    "Companies Act 2006 s384(1)(a) and s478(a): a public company is outside the small companies regime and cannot claim s477.",
  "The s396(A1)":
    "Companies Act 2006 s396(A1): the accounts state the legal form, the part of the UK of registration, the number and the registered office.",
  "The period has ended": "Companies Act 2006 s414(1): the balance sheet is approved after the period it covers has ended.",
  "No narrative fact": "A reader sees only the visible page: a statement tagged only in the hidden header is not shown to them.",
  "The dormant accounts show": "Companies Act 2006 s480 and the TIS dormant accounts: a company that has never traded says so.",
  "No placeholder text": "XML team, 7 Sep 2026: test data \"should closely resemble 'real life' data\".",
  "One company's cases": "The same company files one balance sheet date in a year; the reviewer compares the submissions.",
  "Look":
    'XML team, 23 Oct 2026: "follow the examples"; the reviewer compares the rendered page with a published example of the same type.',
};

export function whyFor(criterion) {
  for (const [key, value] of Object.entries(WHY)) {
    if (criterion.startsWith(key) || criterion.includes(key)) return value;
  }
  return `Companies House review skill criteria table (${REVIEW_SKILL}).`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

// The line of the case name in the fixture file, for the "Figures from" card.
export function fixtureLineOf(fixtureText, caseName) {
  const index = fixtureText.split("\n").findIndex((line) => line.includes(`"name": "${caseName}"`));
  return index < 0 ? "?" : index + 1;
}

export function companySource(input) {
  if (input.fictional) {
    return {
      page: "Fictional private company in our fixture (<code>source/case-input.json</code>); not on any register",
      walkthrough: "Company number, name and director are made up in our fixture; the company is not on any register.",
    };
  }
  const url = `${REGISTER_URL}${input.companyNumber}`;
  const priorYear = Number(input.periodEnd.slice(0, 4)) - 1;
  const priorFiled = /Prior year equals the filed/i.test(input.expectedOutcome?.note ?? "");
  return {
    page: `Companies House register: ${escapeHtml(input.companyNumber)} ${escapeHtml(input.companyName)}, <a href="${url}">company profile</a>${
      priorFiled ? `; ${priorYear} column from its filed ${priorYear} accounts` : ""
    }`,
    walkthrough: `Company number, name and director from the Companies House register entry for ${input.companyNumber} (${url}).`,
  };
}

// What the gateway said, from the case's source/ files. `submitResponse` and `lastPoll` are XML
// text, or null when no filing run was given for the case.
export function gatewayState(submitResponse, lastPoll) {
  if (submitResponse === null) return { known: false, statuses: [], acknowledged: false, text: "no filing run was given for this case" };
  const qualifier = submitResponse.match(/<Qualifier>([^<]+)/);
  const timestamp = submitResponse.match(/<GatewayTimestamp>([^<]+)/);
  const errors = submitResponse.includes("<GovTalkErrors") ? [...submitResponse.matchAll(/<Text>([^<]+)<\/Text>/g)].map((m) => m[1]) : [];
  const acknowledged = Boolean(qualifier && qualifier[1] === "response" && errors.length === 0);
  return {
    known: true,
    acknowledged,
    statuses: [...(lastPoll ?? "").matchAll(/<StatusCode>([^<]+)/g)].map((m) => m[1]),
    text: acknowledged
      ? `yes: Qualifier response, no GovTalk errors, gateway time ${timestamp ? timestamp[1] : "?"}`
      : `no: ${escapeHtml(errors.join("; ") || (qualifier ? qualifier[1] : "no qualifier"))}`,
  };
}

function provenText(review) {
  const { reconciliation, directory, validator, gateway } = review;
  const validatorText =
    validator.verdict === "valid" ? "answers valid" : validator.verdict === "skipped" ? "was not run" : `answers ${validator.verdict}`;
  const gatewayText = !gateway.known
    ? "no filing run was given, so the gateway answer is not read"
    : gateway.acknowledged
      ? "the gateway acknowledged the submission"
      : "the gateway did not acknowledge the submission";
  return `the ${reconciliation.rows.length} input fields appear in the filed accounts as tagged and as visible text, and the ${reconciliation.totals.length} totals recompute from the tagged figures (${reconciliation.mismatches} mismatches, \`${directory}/reconciliation.md\`); Companies House's validator ${validatorText}; ${gatewayText}.`;
}

function notProvenText(gateway) {
  const synthetic = "The figures are synthetic test data, so nothing proves them true of a real company.";
  if (!gateway.known) return `Acceptance: no filing run was given, so the gateway answer is not read. ${synthetic}`;
  if (gateway.statuses.includes("PENDING")) {
    return `acceptance. Companies House answered PENDING to every poll, so the outcome is POLL_TIMEOUT, neither ACCEPT nor REJECT. ${synthetic}`;
  }
  return `acceptance beyond the last poll, which answered ${gateway.statuses.join(", ") || "nothing"}. ${synthetic}`;
}

export function walkthroughSection(review, judge) {
  const { directory, title, submissionNumber, input } = review;
  const lines = [
    `## ${directory}: ${title}, submission ${submissionNumber}`,
    "",
    `- **Proven:** ${provenText(review)}`,
    `- **Not proven:** ${notProvenText(review.gateway)}`,
    `- **Source:** figures from our fixture, \`source/case-input.json\`. ${companySource(input).walkthrough} The example in \`reference/\` is a different company, for layout only.`,
  ];
  if (judge) lines.push(`- **Judge:** ${judge.verdict}. ${judge.summary} Reasoning in \`index.html\`.`);
  lines.push("");
  const steps = [
    [
      `${directory}/reconciliation.md`,
      `our input against our output. Every input figure, its tagged value and whether it shows as text, then every total recomputed. Source: \`source/case-input.json\`, \`${directory}/facts.json\`, \`${directory}/visible-text.txt\`.`,
    ],
    [`${directory}/submission.txt`, "the submission number and the last poll outcome."],
    [
      `${directory}/rendered.png`,
      "our document as the XML team sees it. Check the top for header text, the balance sheet for labels and two years, the end for anything after the notes.",
    ],
    [`${directory}/reference/example.png`, "the Companies House example of the same type. Compare the layout and the statements."],
    [`${directory}/fact-comparison.md`, "the facts the example tags that ours lacks. Each missing row needs a fix or a reason."],
    [
      `${directory}/visible-text.txt`,
      "the statements word for word: section 477 or 480, the audit and responsibility statements, section 444(5) and 444(5A), the approval line.",
    ],
    [`${directory}/validator.txt`, "the Companies House test validator's answer."],
    [`${directory}/filed.xhtml`, "the source, only if a finding needs the tag."],
  ];
  steps.forEach(([file, what], index) => lines.push(`${index}. \`${file}\`: ${what}`));
  lines.push("");
  return lines.join("\n");
}

export function walkthroughMarkdown(date, reviews, judgeJson) {
  const lines = [
    `# Walk-through of the Companies House review, ${date}`,
    "",
    "Open `index.html` first. Then `findings.md` for the script's rows. Then each case below, in order.",
    "",
    ...reviews.map((review) => walkthroughSection(review, judgeJson[review.directory])),
  ];
  return lines.join("\n");
}

// A judge `added[].data` path is relative to its case folder, or to the review folder when it
// starts with a case folder's name, or goes up with "../".
export function dataHref(directory, data, directories) {
  if (data.startsWith("..")) return data;
  if (directories.some((name) => data.startsWith(`${name}/`))) return data;
  return `${directory}/${data}`;
}

const CSS = `
:root{--bg:#fbfaf7;--ink:#1d1f21;--muted:#5d6166;--rule:#d9d6cf;--card:#ffffff;--ok:#1f7a3a;--bad:#b3261e;--warn:#8a5a00;--accent:#2c5aa0}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#16181b;--ink:#e8e6e1;--muted:#a3a7ad;--rule:#33373c;--card:#1e2125;--ok:#6fcf8a;--bad:#ff8a80;--warn:#e0b45c;--accent:#8fb4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 80px}h1{font-size:26px;margin:0 0 4px}h2{font-size:21px;margin:40px 0 8px;padding-top:16px;border-top:2px solid var(--rule)}
h3{font-size:16px;margin:24px 0 8px}.muted{color:var(--muted)}a{color:var(--accent)}
nav{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--rule);z-index:2;display:flex;gap:12px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--rule);border-radius:8px;padding:12px 16px;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--rule)}th{font-weight:600}
.scroll{overflow-x:auto}.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn);font-weight:600}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pair img{width:100%;border:1px solid var(--rule);border-radius:4px;background:#fff}
@media (max-width:760px){.pair{grid-template-columns:1fr}}
pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--rule);border-radius:6px;padding:8px;font-size:12.5px;max-height:240px;overflow:auto}
details summary{cursor:pointer;font-weight:600}code,.kv span{overflow-wrap:anywhere}table{table-layout:auto}td{overflow-wrap:anywhere}.kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px}
`;

export function resultClass(result) {
  const lower = result.toLowerCase();
  if (lower.startsWith("pass") || lower.startsWith("match") || lower === "yes") return "ok";
  return lower.includes("fail") || lower.includes("mismatch") ? "bad" : "warn";
}

// `reviews` carry: directory, title, submissionNumber, input, fixtureLine, rows (findings rows),
// reconciliation, validator, validatorText, visibleText, gateway, source files (submitResponse,
// lastPoll), exampleRaw, exampleCompany. `judgeJson` is the parsed judge.json, or {}.
export function renderIndex(date, reviews, judgeJson) {
  const directories = reviews.map((review) => review.directory);
  const out = [
    "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
    `<title>Companies House review</title><style>${CSS}</style></head><body><main>`,
    `<h1>Companies House review, ${date}</h1>`,
    `<p class='muted'>${reviews.length === 4 ? "Four" : reviews.length} test filings to the Companies House XML Gateway test service. Per case: what we checked, why, what we found, and the data behind it. Links open the files in this folder.</p>`,
    `<nav>${directories.map((name) => `<a href='#${name}'>${name}</a>`).join("")}</nav>`,
  ];
  for (const review of reviews) {
    const { directory: c, input, reconciliation, gateway } = review;
    const judge = judgeJson[c] ?? {};
    const verdict = judge.verdict ?? "pending";
    out.push(`<h2 id='${c}'>${c}: ${escapeHtml(review.title)}, submission ${review.submissionNumber}</h2>`);
    const proven = `${reconciliation.rows.length} input fields in the filed accounts and ${reconciliation.totals.length} totals recomputed: <span class='${
      reconciliation.mismatches === 0 ? "ok" : "bad"
    }'>${reconciliation.mismatches} mismatches</span>. Companies House's validator: ${review.validator.verdict}. Gateway: ${
      gateway.known ? (gateway.acknowledged ? "acknowledged" : "not acknowledged") : "not read"
    }.`;
    const notProven = !gateway.known
      ? "Acceptance: no filing run was given, so the gateway answer is not read. The figures are synthetic test data."
      : gateway.statuses.includes("PENDING")
        ? "Acceptance: PENDING at every poll (POLL_TIMEOUT). The figures are synthetic test data."
        : `Acceptance: the last poll answered ${escapeHtml(gateway.statuses.join(", ") || "nothing")}. The figures are synthetic test data.`;
    const card = [
      ["Proven", proven],
      ["Not proven", notProven],
      [
        "Figures from",
        `<a href='${c}/source/case-input.json'>source/case-input.json</a> (our fixture, <code>${FIXTURE_PATH}</code> line ${review.fixtureLine})`,
      ],
      ["Company from", companySource(input).page],
      ["Judge", `<span class='${resultClass(verdict)}'>${escapeHtml(verdict)}</span> ${escapeHtml(judge.summary ?? "")}`],
    ];
    out.push(`<div class='card'><div class='kv'>${card.map(([key, value]) => `<b>${key}</b><span>${value}</span>`).join("")}</div></div>`);
    out.push(
      `<h3>1. Our input against our output</h3><p class='muted'>Why: the figures filed must be the figures we meant to file, and the totals must add up. Data: <a href='${c}/source/case-input.json'>case-input.json</a>, <a href='${c}/facts.json'>facts.json</a>, <a href='${c}/visible-text.txt'>visible-text.txt</a>, <a href='${c}/reconciliation.md'>reconciliation.md</a>.</p>`,
    );
    out.push(
      `<div class='scroll'><table><tr><th>Input field</th><th>Input</th><th>Tagged as</th><th>Tagged</th><th>Shown</th><th>Result</th></tr>${reconciliation.rows
        .map(
          (x) =>
            `<tr><td>${escapeHtml(x.field)}</td><td>${escapeHtml(x.input)}</td><td class='muted'>${escapeHtml(x.taggedAs)}</td><td>${escapeHtml(x.tagged)}</td><td>${escapeHtml(x.shown)}</td><td class='${resultClass(x.result)}'>${escapeHtml(x.result)}</td></tr>`,
        )
        .join("")}</table></div>`,
    );
    out.push(
      `<div class='scroll'><table><tr><th>Total</th><th>Rule</th><th>Tagged</th><th>Recomputed</th><th>Result</th></tr>${reconciliation.totals
        .map(
          (a) =>
            `<tr><td>${escapeHtml(a.label)}</td><td class='muted'>${escapeHtml(a.rule)}</td><td>${escapeHtml(a.tagged)}</td><td>${escapeHtml(a.recomputed)}</td><td class='${resultClass(a.result)}'>${escapeHtml(a.result)}</td></tr>`,
        )
        .join("")}</table></div>`,
    );
    out.push(
      `<h3>2. Companies House's rules and requests</h3><p class='muted'>Why each row is checked comes from the XML team's emails (record: <code>${TRIAGE}</code>), the accounts technical interface specification, and the Companies Act 2006. Criteria and how the script judges them: <code>${REVIEW_SKILL}</code>.</p>`,
    );
    out.push(
      "<div class='scroll'><table><tr><th>Check</th><th>Why we check it</th><th>Result</th><th>What we found</th><th>Data</th><th>Judge</th></tr>",
    );
    for (const found of review.rows) {
      const evidence = found.evidence.replaceAll("|", "/").replaceAll("\n", " ");
      const link = `<a href='${c}/${found.file}'>${escapeHtml(basename(found.file))}</a>`;
      const judged = Object.entries(judge.rows ?? {}).find(([key]) => found.criterion.startsWith(key.slice(0, 30)));
      out.push(
        `<tr><td>${escapeHtml(found.criterion)}</td><td class='muted'>${escapeHtml(whyFor(found.criterion))}</td><td class='${resultClass(found.result)}'>${escapeHtml(found.result)}</td><td>${escapeHtml(evidence)}</td><td>${link}</td><td>${escapeHtml(judged ? judged[1] : "")}</td></tr>`,
      );
    }
    out.push("</table></div>");
    if (judge.added?.length) {
      out.push(
        "<h3>2b. Checks the judge added</h3><p class='muted'>Rules the script does not check yet; a reviewer at Companies House would.</p><div class='scroll'><table><tr><th>Check</th><th>Why we check it</th><th>Result</th><th>What we found</th><th>Data</th></tr>",
      );
      for (const added of judge.added) {
        out.push(
          `<tr><td>${escapeHtml(added.check)}</td><td class='muted'>${escapeHtml(added.why)}</td><td class='${resultClass(added.result)}'>${escapeHtml(added.result)}</td><td>${escapeHtml(added.found)}</td><td><a href='${dataHref(c, added.data, directories)}'>${escapeHtml(basename(added.data))}</a></td></tr>`,
        );
      }
      out.push("</table></div>");
    }
    out.push(
      `<details><summary>The visible text of our accounts (visible-text.txt)</summary><pre>${escapeHtml(review.visibleText)}</pre></details>`,
    );
    out.push(
      `<details><summary>The validator's answer (validator.txt)</summary><pre>${escapeHtml(review.validator.output)}</pre></details>`,
    );
    out.push(
      `<h3>3. What the gateway answered</h3><p class='muted'>Why: a filing is accepted only when Companies House answers ACCEPT. Data: <a href='${c}/source/submit-request.xml'>submit-request.xml</a> (carries filed.xhtml), <a href='${c}/source/submit-response.xml'>submit-response.xml</a>, <a href='${c}/source/last-poll-response.xml'>last-poll-response.xml</a>, <a href='${c}/submission.txt'>submission.txt</a>.</p>`,
    );
    out.push(
      `<div class='card'><div class='kv'><b>Taken for processing</b><span class='${gateway.acknowledged ? "ok" : gateway.known ? "bad" : "warn"}'>${gateway.text}</span><b>Last status</b><span class='warn'>${escapeHtml(gateway.statuses.join(", ") || "none")}</span></div></div>`,
    );
    out.push(
      `<h3>4. Our layout beside a published example</h3><p class='muted'>Why: the XML team asked us to "follow the examples". The example is a different company's accepted filing of the same type (<a href='${c}/reference/${review.exampleRaw}'>${review.exampleRaw}</a>, origin in <a href='${c}/reference/example-source.txt'>example-source.txt</a>), for layout only; its figures are not ours.</p>`,
    );
    out.push(
      `<div class='pair'><figure><figcaption><b>Ours</b> (filed.xhtml)</figcaption><a href='${c}/rendered.png'><img loading='lazy' src='${c}/rendered.png' alt='Our accounts, ${c}'></a></figure><figure><figcaption><b>Example</b> (company ${review.exampleCompany})</figcaption><a href='${c}/reference/example.png'><img loading='lazy' src='${c}/reference/example.png' alt='Companies House example'></a></figure></div>`,
    );
    out.push(`<p>Facts the example tags that ours lacks, and why: <a href='${c}/fact-comparison.md'>fact-comparison.md</a>.</p>`);
    if (judge.reasoning?.length) {
      out.push(
        `<h3>5. Judge's reasoning</h3><div class='card'>${judge.reasoning.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>`,
      );
    }
  }
  out.push("</main></body></html>");
  return out.join("\n");
}
