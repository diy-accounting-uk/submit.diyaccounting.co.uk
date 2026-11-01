// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/supportTicketKinds.js
//
// The kinds of support ticket the quarantine reader records. The triage workflow's handle job
// runs scripts with no npm install, so this module imports nothing.

export const TICKET_KINDS = ["change-request", "complaint", "other"];
