-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- The totals and the events of the accounts' life, each day and by the class of the account, so
-- each event count has its total beside it.
--
-- accounts_total            accounts with a record on or before the day. An account's first record is
--                           its earliest bundle grant, activity event or receipt, so an account
--                           opened before the lake began counts from its first record. A bundles
--                           item with no grant time (a migration marker) is not an account.
-- first_submissions         accounts whose first receipt is on the day.
-- second_submissions        accounts whose second receipt is on the day.
-- days_first_to_second      the days from the first receipt to the second, added over those accounts,
--                           so a window's total over its second_submissions is the average.
-- subscriptions_started     subscriptions that became active on the day.
-- subscriptions_ended       subscriptions that stopped being active on the day: cancelled, ended or
--                           deleted. A subscription set to cancel at the period end is active until
--                           its status changes.
-- subscriptions_net_change  started less ended.
-- active_subscriptions      subscriptions active at the end of the day.
-- subscriptions_ended_30d   subscriptions ended in the 30 days to the day.
-- active_subscriptions_30d_before  subscriptions active at the end of the day 30 days before, the base
--                           a 30 day churn rate divides by.
-- active_passes             passes open to redeem at the end of the day: not deleted, not revoked, not
--                           past their valid-until date and not at their use limit. A pass record from
--                           before the lake carried the limit and the date counts as open until a later
--                           record of the pass carries them.
--
-- actor_class is the account's class from v_account_class, unknown when no record names one; a pass
-- reads the class of its own actor, as v_pass_redemptions_daily does, and a pass type named
-- "-test-pass" is test. The days run from the first day of the lake, at most 400 days back, to
-- today, and every class has a row on every day.
CREATE OR REPLACE VIEW v_account_lifecycle_daily AS
WITH calendar AS (
  SELECT cast(d AS date) AS day
  FROM   (SELECT greatest(min(date(change_ts)), date_add('day', -400, current_date)) AS first_day FROM aliased_dynamo_bundles)
  CROSS JOIN UNNEST(sequence(first_day, current_date, interval '1' day)) AS t(d)),
classes AS (
  SELECT actor_class FROM (VALUES 'customer', 'test', 'synthetic', 'other', 'unknown') AS t(actor_class)),
first_records AS (
  SELECT hashed_sub, min(first_on) AS first_on
  FROM   (SELECT hashed_sub, date(event_ts) AS first_on FROM activity_events_all WHERE hashed_sub IS NOT NULL
          UNION ALL
          SELECT hashed_sub, date(from_iso8601_timestamp(granted_at))
          FROM   aliased_dynamo_bundles WHERE hashed_sub IS NOT NULL AND granted_at IS NOT NULL
          UNION ALL
          SELECT hashed_sub, date(from_iso8601_timestamp(created_at))
          FROM   aliased_dynamo_receipts WHERE hashed_sub IS NOT NULL AND created_at IS NOT NULL)
  GROUP  BY hashed_sub),
accounts AS (
  SELECT f.hashed_sub, f.first_on, coalesce(c.actor_class, 'unknown') AS actor_class
  FROM   first_records f
  LEFT JOIN v_account_class c ON c.hashed_sub = f.hashed_sub),
accounts_by_day AS (
  SELECT calendar.day, a.actor_class, count(*) AS accounts_total
  FROM   calendar
  JOIN   accounts a ON a.first_on <= calendar.day
  GROUP  BY 1, 2),
receipts_in_order AS (
  SELECT hashed_sub,
         submitted_at,
         row_number() OVER (PARTITION BY hashed_sub ORDER BY submitted_at, receipt_id) AS receipt_number
  FROM   (SELECT DISTINCT hashed_sub, receipt_id, from_iso8601_timestamp(created_at) AS submitted_at
          FROM   aliased_dynamo_receipts
          WHERE  change_type = 'INSERT' AND hashed_sub IS NOT NULL AND created_at IS NOT NULL)),
milestones AS (
  SELECT hashed_sub,
         max(CASE WHEN receipt_number = 1 THEN submitted_at END) AS first_at,
         max(CASE WHEN receipt_number = 2 THEN submitted_at END) AS second_at
  FROM   receipts_in_order
  WHERE  receipt_number <= 2
  GROUP  BY hashed_sub),
milestones_by_day AS (
  SELECT m.day, coalesce(c.actor_class, 'unknown') AS actor_class,
         sum(m.first_submission) AS first_submissions,
         sum(m.second_submission) AS second_submissions,
         sum(m.days_first_to_second) AS days_first_to_second
  FROM   (SELECT hashed_sub, date(first_at) AS day, 1 AS first_submission, 0 AS second_submission, 0 AS days_first_to_second
          FROM   milestones
          UNION ALL
          SELECT hashed_sub, date(second_at), 0, 1, date_diff('day', first_at, second_at)
          FROM   milestones WHERE second_at IS NOT NULL) m
  LEFT JOIN v_account_class c ON c.hashed_sub = m.hashed_sub
  GROUP  BY 1, 2),
subscription_owner AS (
  SELECT subscription_id, arbitrary(hashed_sub) AS hashed_sub
  FROM   aliased_dynamo_subscriptions
  WHERE  subscription_id IS NOT NULL AND hashed_sub IS NOT NULL
  GROUP  BY subscription_id),
subscription_days AS (
  SELECT subscription_id,
         date(change_ts) AS day,
         max_by(change_type <> 'REMOVE' AND status IN ('active', 'trialing', 'past_due'), change_ts) AS active_at_day_end
  FROM   aliased_dynamo_subscriptions
  WHERE  subscription_id IS NOT NULL
  GROUP  BY 1, 2),
subscription_changes AS (
  SELECT d.day,
         coalesce(c.actor_class, 'unknown') AS actor_class,
         count_if(d.active_at_day_end AND NOT coalesce(d.previous_active, false)) AS started,
         count_if(NOT d.active_at_day_end AND coalesce(d.previous_active, false)) AS ended
  FROM   (SELECT *, lag(active_at_day_end) OVER (PARTITION BY subscription_id ORDER BY day) AS previous_active
          FROM   subscription_days) d
  LEFT JOIN subscription_owner o ON o.subscription_id = d.subscription_id
  LEFT JOIN v_account_class c ON c.hashed_sub = o.hashed_sub
  GROUP  BY 1, 2),
pass_spans AS (
  SELECT pass_id,
         CASE WHEN max_by(pass_type_id, change_ts) LIKE '%-test-pass' THEN 'test'
              ELSE CASE max_by(actor, change_ts) WHEN 'customer' THEN 'customer' WHEN 'test-user' THEN 'test'
                        WHEN 'probe' THEN 'synthetic' WHEN 'synthetic' THEN 'synthetic'
                        WHEN 'operator' THEN 'other' WHEN 'system' THEN 'other' ELSE 'unknown' END END AS actor_class,
         min(date(change_ts)) AS first_day,
         min(CASE WHEN change_type = 'REMOVE' OR revoked_at IS NOT NULL OR (max_uses IS NOT NULL AND use_count >= max_uses)
                  THEN date(change_ts) END) AS closed_on,
         max_by(valid_until, change_ts) AS valid_until
  FROM   aliased_dynamo_passes
  WHERE  pass_type_id IS NOT NULL AND redeemed_by IS NULL AND redemption_code IS NULL
  GROUP  BY pass_id),
passes_by_day AS (
  SELECT calendar.day, p.actor_class, count(*) AS active_passes
  FROM   calendar
  JOIN   pass_spans p
    ON   p.first_day <= calendar.day
   AND   (p.closed_on IS NULL OR p.closed_on > calendar.day)
   AND   (p.valid_until IS NULL OR date(from_iso8601_timestamp(p.valid_until)) >= calendar.day)
  GROUP  BY 1, 2),
daily AS (
  SELECT calendar.day,
         classes.actor_class,
         coalesce(a.accounts_total, 0) AS accounts_total,
         coalesce(m.first_submissions, 0) AS first_submissions,
         coalesce(m.second_submissions, 0) AS second_submissions,
         coalesce(m.days_first_to_second, 0) AS days_first_to_second,
         coalesce(s.started, 0) AS subscriptions_started,
         coalesce(s.ended, 0) AS subscriptions_ended,
         coalesce(p.active_passes, 0) AS active_passes
  FROM   calendar
  CROSS JOIN classes
  LEFT JOIN accounts_by_day a ON a.day = calendar.day AND a.actor_class = classes.actor_class
  LEFT JOIN milestones_by_day m ON m.day = calendar.day AND m.actor_class = classes.actor_class
  LEFT JOIN subscription_changes s ON s.day = calendar.day AND s.actor_class = classes.actor_class
  LEFT JOIN passes_by_day p ON p.day = calendar.day AND p.actor_class = classes.actor_class),
-- The subscriptions active before the calendar's first day, so the running total starts from them.
opening AS (
  SELECT classes.actor_class, coalesce(sum(s.started - s.ended), 0) AS active_before
  FROM   classes
  LEFT JOIN subscription_changes s ON s.actor_class = classes.actor_class AND s.day < (SELECT min(day) FROM calendar)
  GROUP  BY classes.actor_class),
running AS (
  SELECT daily.*,
         opening.active_before
           + sum(subscriptions_started - subscriptions_ended)
               OVER (PARTITION BY daily.actor_class ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS active_subscriptions,
         sum(subscriptions_ended) OVER (PARTITION BY daily.actor_class ORDER BY day ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS subscriptions_ended_30d
  FROM   daily
  JOIN   opening ON opening.actor_class = daily.actor_class)
SELECT day,
       actor_class,
       accounts_total,
       first_submissions,
       second_submissions,
       days_first_to_second,
       subscriptions_started,
       subscriptions_ended,
       subscriptions_started - subscriptions_ended AS subscriptions_net_change,
       active_subscriptions,
       subscriptions_ended_30d,
       lag(active_subscriptions, 30) OVER (PARTITION BY actor_class ORDER BY day) AS active_subscriptions_30d_before,
       active_passes
FROM   running
