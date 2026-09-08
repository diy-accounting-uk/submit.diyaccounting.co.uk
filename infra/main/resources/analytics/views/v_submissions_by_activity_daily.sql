CREATE OR REPLACE VIEW v_submissions_by_activity_daily AS
SELECT day, activity, outcome,
       count(*)                   AS completions,
       count(DISTINCT hashed_sub) AS customers
FROM  (SELECT date(event_ts) AS day, hashed_sub,
              coalesce(outcome, 'success') AS outcome,
              CASE event
                WHEN 'vat-return-submitted'                            THEN 'vat-return'
                WHEN 'vat-return-failed'                               THEN 'vat-return'
                WHEN 'itsa-self-employment-period-created'             THEN 'itsa-period'
                WHEN 'companies-house-accounts-submitted'              THEN 'ch-accounts'
                WHEN 'companies-house-accounts-accepted'               THEN 'ch-accounts'
                WHEN 'companies-house-accounts-failed'                 THEN 'ch-accounts'
                WHEN 'companies-house-registered-office-address-filed' THEN 'ch-registered-office'
                WHEN 'companies-house-registered-email-address-filed'  THEN 'ch-registered-email'
                WHEN 'company-profile-viewed'                          THEN 'company-lookup'
              END AS activity
       FROM   activity_events_all
       WHERE  actor = 'customer')
WHERE  activity IS NOT NULL
GROUP  BY 1, 2, 3
