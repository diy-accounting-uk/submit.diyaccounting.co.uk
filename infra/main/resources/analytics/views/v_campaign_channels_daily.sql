-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- @capability DATA-68 SQL view: campaign results by place
-- - **Use when:** a campaign report must say which place (utm source, medium, campaign or referral code) produced sessions, pass uses, subscribers and commission.
-- - **Does:** v_campaign_channels_daily joins the session beacon's ref and utm_* values (new-session events), pass redemptions and live commission lines on one key per day: utm source, medium, campaign and ref. Redemptions and commission lines reach the key through the redeemer's first bundle record, which carries the acquisition captured at landing. BusinessViews.java registers the view.
-- - **Run:** no command; `SELECT * FROM v_campaign_channels_daily WHERE day >= current_date - INTERVAL '30' DAY`
-- - **Entry:** `infra/main/resources/analytics/views/v_campaign_channels_daily.sql:`
-- - **Files:** infra/main/resources/analytics/views/v_campaign_channels_daily.sql, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViews.java
-- - **Keywords:** campaign, channel, utm_source, utm_campaign, ref, pass uses, subscribers, commission, attribution, new-session
-- - **Related:** DATA-10, DATA-27, DEV-57
-- @end-capability

-- Which place produced each session, pass use, subscriber and commission pound?
--
-- One row per day, utm_source, utm_medium, utm_campaign and ref ('' when the value is absent).
--
-- sessions counts new-session events from people (actor visitor) whose beacon carried a landing,
-- read from detail_json (utmSource, utmMedium, utmCampaign, ref). The beacon is sent after consent,
-- so a visit without consent has no row here.
--
-- A pass use is one redemption item per code and account in dynamo_passes; the day is the first
-- redeemed_at. The use takes the acquisition of the redeemer's earliest bundle record that names
-- one (acq_utm_source, acq_utm_medium, acq_utm_campaign, acq_ref); a redeemer with none reports
-- the pass code as ref and empty utm values.
--
-- A subscriber and its commission come from dynamo_commissions: each ledger line reduces to its
-- newest change record, live mode only. The day is the day of the line's charge; subscribers
-- counts distinct redeemers with a line that day, commission_pence sums the lines, and a reversed
-- line counts for nothing. The line takes the acquisition of its redeemer's earliest sourced
-- bundle record, or the referral code as ref when there is none.
CREATE OR REPLACE VIEW v_campaign_channels_daily AS
WITH acquisition AS (
  SELECT hashed_sub,
         min_by(acq_utm_source, change_ts)   AS utm_source,
         min_by(acq_utm_medium, change_ts)   AS utm_medium,
         min_by(acq_utm_campaign, change_ts) AS utm_campaign,
         min_by(acq_ref, change_ts)          AS ref
  FROM   aliased_dynamo_bundles
  WHERE  hashed_sub IS NOT NULL
    AND  (acq_utm_source IS NOT NULL OR acq_ref IS NOT NULL)
  GROUP  BY hashed_sub),
session_rows AS (
  SELECT date(event_ts) AS day,
         coalesce(json_extract_scalar(detail_json, '$.utmSource'), '')   AS utm_source,
         coalesce(json_extract_scalar(detail_json, '$.utmMedium'), '')   AS utm_medium,
         coalesce(json_extract_scalar(detail_json, '$.utmCampaign'), '') AS utm_campaign,
         coalesce(json_extract_scalar(detail_json, '$.ref'), '')         AS ref,
         count(*) AS sessions
  FROM   activity_events_all
  WHERE  event = 'new-session'
    AND  actor = 'visitor'
    AND  (json_extract_scalar(detail_json, '$.utmSource') IS NOT NULL
          OR json_extract_scalar(detail_json, '$.ref') IS NOT NULL)
  GROUP  BY 1, 2, 3, 4, 5),
redemptions AS (
  SELECT redemption_code AS code,
         redeemed_by AS hashed_sub,
         min(redeemed_at) AS redeemed_at
  FROM   aliased_dynamo_passes
  WHERE  redemption_code IS NOT NULL AND redeemed_by IS NOT NULL
  GROUP  BY redemption_code, redeemed_by),
use_rows AS (
  SELECT date(from_iso8601_timestamp(r.redeemed_at)) AS day,
         coalesce(a.utm_source, '')   AS utm_source,
         coalesce(a.utm_medium, '')   AS utm_medium,
         coalesce(a.utm_campaign, '') AS utm_campaign,
         coalesce(a.ref, r.code)      AS ref,
         count(*) AS pass_uses
  FROM   redemptions r
  LEFT   JOIN acquisition a ON a.hashed_sub = r.hashed_sub
  WHERE  r.redeemed_at IS NOT NULL
  GROUP  BY 1, 2, 3, 4, 5),
latest_lines AS (
  SELECT referrer_hash,
         line_id,
         max_by(redeemer_hash, change_ts)  AS redeemer_hash,
         max_by(referral_code, change_ts)  AS referral_code,
         max_by(state, change_ts)          AS state,
         max_by(amount_pence, change_ts)   AS amount_pence,
         max_by(charged_at, change_ts)     AS charged_at,
         max_by(livemode, change_ts)       AS livemode
  FROM   aliased_dynamo_commissions
  WHERE  change_type <> 'REMOVE'
  GROUP  BY referrer_hash, line_id),
commission_rows AS (
  SELECT date(from_iso8601_timestamp(l.charged_at)) AS day,
         coalesce(a.utm_source, '')   AS utm_source,
         coalesce(a.utm_medium, '')   AS utm_medium,
         coalesce(a.utm_campaign, '') AS utm_campaign,
         coalesce(a.ref, l.referral_code, '') AS ref,
         count(DISTINCT l.redeemer_hash) AS subscribers,
         coalesce(sum(CASE WHEN l.state = 'reversed' THEN 0 ELSE l.amount_pence END), 0) AS commission_pence
  FROM   latest_lines l
  LEFT   JOIN acquisition a ON a.hashed_sub = l.redeemer_hash
  WHERE  l.livemode = true AND l.charged_at IS NOT NULL
  GROUP  BY 1, 2, 3, 4, 5)
SELECT day, utm_source, utm_medium, utm_campaign, ref,
       sum(sessions)         AS sessions,
       sum(pass_uses)        AS pass_uses,
       sum(subscribers)      AS subscribers,
       sum(commission_pence) AS commission_pence
FROM (
  SELECT day, utm_source, utm_medium, utm_campaign, ref, sessions, 0 AS pass_uses, 0 AS subscribers, 0 AS commission_pence FROM session_rows
  UNION ALL
  SELECT day, utm_source, utm_medium, utm_campaign, ref, 0, pass_uses, 0, 0 FROM use_rows
  UNION ALL
  SELECT day, utm_source, utm_medium, utm_campaign, ref, 0, 0, subscribers, commission_pence FROM commission_rows)
GROUP  BY 1, 2, 3, 4, 5
