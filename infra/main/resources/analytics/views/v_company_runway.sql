-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many months does the cash last?
--
-- From each day's company book: the net monthly burn is the period's costs less its turnover,
-- spread over the months of the accounting period; the runway is the cash at bank less the
-- creditors due within one year, divided by that burn. A book that turns a profit has no burn,
-- so its runway reads NULL rather than a number of months without an end.
CREATE OR REPLACE VIEW v_company_runway AS
SELECT dt AS dt,
       cashatbank                                                       AS cash_at_bank_gbp,
       accounts.balancesheet.currentyear.creditorswithinoneyear         AS creditors_within_one_year_gbp,
       (accounts.profitandloss.costs - accounts.profitandloss.turnover)
         / (date_diff('day', date(accounts.periodstart), date(accounts.periodend)) + 1) * (365.25 / 12)
                                                                        AS net_monthly_burn_gbp,
       CASE WHEN accounts.profitandloss.costs - accounts.profitandloss.turnover > 0
            THEN (cashatbank - accounts.balancesheet.currentyear.creditorswithinoneyear)
                 / ((accounts.profitandloss.costs - accounts.profitandloss.turnover)
                    / (date_diff('day', date(accounts.periodstart), date(accounts.periodend)) + 1) * (365.25 / 12))
       END                                                              AS runway_months
FROM   company_accounts
