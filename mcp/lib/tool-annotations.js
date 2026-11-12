// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// tool-annotations.js -- the MCP tool annotations the tool tables share. Every tool states all three
// hints, because the connector directories require each one set.

const annotations = (readOnlyHint, destructiveHint, openWorldHint) => ({ readOnlyHint, destructiveHint, openWorldHint });

// Reads and derives; touches no outside service.
export const READS = annotations(true, false, false);
// Reads from HMRC or Companies House.
export const READS_OUTSIDE = annotations(true, false, true);
// Writes or sends something that replaces or cannot be taken back; touches no outside service.
export const CHANGES = annotations(false, true, false);
// Files, invites or hands out an authorisation at HMRC or Companies House.
export const CHANGES_OUTSIDE = annotations(false, true, true);
// Adds something new and replaces nothing; touches no outside service.
export const ADDS = annotations(false, false, false);
