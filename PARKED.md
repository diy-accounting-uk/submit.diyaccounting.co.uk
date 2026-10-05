<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PARKED

Found during cool-down, held off the board until the operator triages it.

- **M4 steps 3 and 5 to 9 as board rows.** `PLAN_SUBMISSION_MCP.md` "The hosted surface (M4)", build table: step 3 (hosted tool set and HTTP transport, 6 files, Sonnet) is ready now that step 1 is on main; 5 (MCP Lambda handler and session repository, 3 files, Sonnet) after 3; 6 (Express parity, env files, system test, 6 files, Sonnet) after 2 and 5; 7 (McpStack, wiring, image, blob-key secret, Sonnet) after 4 and 5; 8 (Edge and workflows) after 7; 9 (behaviour test and public page) after a ci deploy of 8. M8's hosted video waits on 9.
