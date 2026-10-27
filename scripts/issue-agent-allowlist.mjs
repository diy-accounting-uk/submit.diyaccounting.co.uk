#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/issue-agent-allowlist.mjs
//
// The one list of logins that may start an agent run from an issue event. Anyone can open an
// issue or a comment in a public repository, so every workflow that runs an agent on an
// `issues` or `issue_comment` event asks this script first: the issue's author and the event's
// sender must both be on the list. A `workflow_dispatch` run needs write access to the
// repository already, so it passes.
//
// Reads EVENT_NAME, ISSUE_AUTHOR and EVENT_SENDER from the environment, prints `allowed=true`
// or `allowed=false`, and appends the same line to $GITHUB_OUTPUT when that is set. Fails
// closed: a missing author or sender is not allowed.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const OPERATOR_LOGIN = "antonycc";
export const AGENT_APP_LOGIN = "diyaccounting-agent[bot]";
export const ALLOWED_LOGINS = [OPERATOR_LOGIN, "diyaccounting-ops[bot]", AGENT_APP_LOGIN];

function onList(login) {
  if (typeof login !== "string" || login.trim() === "") return false;
  return ALLOWED_LOGINS.includes(login.trim().toLowerCase());
}

export function isAllowed({ eventName, author, sender }) {
  if (eventName === "workflow_dispatch") return true;
  return onList(author) && onList(sender);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowed = isAllowed({
    eventName: process.env.EVENT_NAME,
    author: process.env.ISSUE_AUTHOR,
    sender: process.env.EVENT_SENDER,
  });
  const line = `allowed=${allowed}`;
  console.log(line);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
}
