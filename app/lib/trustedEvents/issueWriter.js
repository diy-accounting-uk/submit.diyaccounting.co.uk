// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/trustedEvents/issueWriter.js
//
// The write path for one fact. Reserved concurrency 1 on the function runs invocations one at a
// time, so this order needs no lock. A crash between the issue call and the ledger writes gives
// one duplicate comment on the retry, and a fact is never lost.

import * as ledgerRepository from "../../data/dynamoDbTrustedEventLedgerRepository.js";
import * as githubIssueApi from "../githubIssueApi.js";
import { buildBody, buildComment, buildTitle, fullLines, factHash } from "./issueFormat.js";

const STANDING_LABELS = ["trusted-event", "maintainer-review", "origin:machine"];

export function labelsFor(fact, env) {
  return [...STANDING_LABELS, `source:${fact.sourceLabel}`, `env:${env}`];
}

/**
 * @returns {Promise<{action: "opened"|"commented"|"unchanged", key: string, issueNumber: number}>}
 */
export async function writeFact({ fact, context, token, repo, ledger = ledgerRepository, github = githubIssueApi }) {
  const versionItem = await ledger.getLedgerItem(`${fact.key}#${fact.version}`);
  if (versionItem) return { action: "unchanged", key: fact.key, issueNumber: versionItem.issueNumber };

  const keyItem = await ledger.getLedgerItem(fact.key);
  const existing = keyItem?.issueNumber ? await github.getGitHubIssue(token, repo, keyItem.issueNumber) : null;

  let action;
  let issueNumber;
  if (existing && existing.state === "open") {
    await github.commentOnGitHubIssue(token, repo, existing.number, buildComment(fact, context));
    action = "commented";
    issueNumber = existing.number;
  } else {
    const created = await github.createGitHubIssue(token, repo, {
      title: buildTitle(fact, context),
      body: buildBody(fact, context),
      labels: labelsFor(fact, context.env),
    });
    action = "opened";
    issueNumber = created.number;
  }

  await ledger.putVersion({
    key: fact.key,
    version: fact.version,
    factHash: factHash(fact.source, fact.key, fact.version, fullLines(fact, context)),
    sourceId: context.sourceId,
    issueNumber,
    observedAt: context.observed,
  });
  await ledger.putKey({ key: fact.key, issueNumber, lastVersion: fact.version });
  return { action, key: fact.key, issueNumber };
}
