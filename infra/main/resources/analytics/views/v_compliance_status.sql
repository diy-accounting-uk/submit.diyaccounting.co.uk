-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- The compliance objective's headline: open findings each day, by area.
--
-- compliance_accessibility carries one row per page per tool per WCAG standard; violations
-- summed across pages and tools is "how much is broken today", not a per-page breakdown (the
-- raw export keeps the per-page detail for anyone who needs it). compliance_fraud_headers
-- carries one row per month, so needs_action stands in for that month's open-finding count
-- (0 or 1) rather than a violation total.
CREATE OR REPLACE VIEW v_compliance_status AS
SELECT dt                        AS day,
       'accessibility'           AS area,
       standard                  AS detail,
       sum(violations)           AS open_findings
FROM   compliance_accessibility
GROUP  BY dt, standard
UNION ALL
SELECT dt                                AS day,
       'fraud-prevention-headers'        AS area,
       status                            AS detail,
       CAST(needs_action AS integer)     AS open_findings
FROM   compliance_fraud_headers
