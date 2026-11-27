-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- MCP sessions each UTC day by the assistant that opened them (claude, chatgpt, gemini, copilot,
-- other, unknown): how many distinct customers and how many distinct sessions. A session item is
-- written once, when the session starts; a user's open-book item carries no client and is left out.
CREATE OR REPLACE VIEW v_mcp_sessions_by_client AS
SELECT date(change_ts)              AS day,
       client,
       count(DISTINCT hashed_sub)   AS customers,
       count(DISTINCT session_hash) AS sessions
FROM   dynamo_mcp_sessions
WHERE  change_type = 'INSERT' AND client IS NOT NULL
GROUP  BY 1, 2
