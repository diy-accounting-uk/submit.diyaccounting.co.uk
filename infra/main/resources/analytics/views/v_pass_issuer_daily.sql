-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- For each pass issuer and day: passes generated, pass link visits, passes redeemed and
-- redeemed passes converted to a paid subscription.
--
-- The issuer is the issuer's hashed sub. Generation is the pass-generated event, whose hashed_sub
-- is the issuer. A visit is the pass-link-visited event that passGet.js publishes when
-- bundles.html checks a pass code; the event carries the issuer in detail_json and no hashed_sub,
-- because the visitor is not signed in. A redemption is one redemption item per code and account in
-- dynamo_passes, written again on a repeat redemption, so redemptions group on code and account and
-- count on the first redeemed_at. A conversion is a redeemer with a live commission line under the
-- issuer: the day is the day of the redeemer's first charged line. A redeemer's later lines add none.
CREATE OR REPLACE VIEW v_pass_issuer_daily AS
WITH generated AS (
  SELECT date(event_ts) AS day,
         hashed_sub AS issuer_hash,
         count(*) AS passes_generated
  FROM   activity_events_all
  WHERE  event = 'pass-generated' AND hashed_sub IS NOT NULL
  GROUP  BY 1, 2),
visits AS (
  SELECT date(event_ts) AS day,
         json_extract_scalar(detail_json, '$.issuedBy') AS issuer_hash,
         count(*) AS link_clicks
  FROM   activity_events_all
  WHERE  event = 'pass-link-visited' AND json_extract_scalar(detail_json, '$.issuedBy') IS NOT NULL
  GROUP  BY 1, 2),
redemptions AS (
  SELECT redemption_code, redeemed_by,
         arbitrary(issued_by) AS issuer_hash,
         min(redeemed_at) AS redeemed_at
  FROM   dynamo_passes
  WHERE  redemption_code IS NOT NULL AND redeemed_by IS NOT NULL AND issued_by IS NOT NULL
  GROUP  BY redemption_code, redeemed_by),
redeemed AS (
  SELECT date(from_iso8601_timestamp(redeemed_at)) AS day,
         issuer_hash,
         count(*) AS passes_redeemed
  FROM   redemptions
  GROUP  BY 1, 2),
latest_lines AS (
  SELECT referrer_hash, line_id,
         max_by(redeemer_hash, change_ts) AS redeemer_hash,
         max_by(charged_at, change_ts) AS charged_at,
         max_by(livemode, change_ts) AS livemode
  FROM   dynamo_commissions
  WHERE  change_type <> 'REMOVE'
  GROUP  BY referrer_hash, line_id),
first_charged AS (
  SELECT referrer_hash AS issuer_hash, redeemer_hash, min(charged_at) AS charged_at
  FROM   latest_lines
  WHERE  livemode = true AND charged_at IS NOT NULL AND redeemer_hash IS NOT NULL
  GROUP  BY referrer_hash, redeemer_hash),
converted AS (
  SELECT date(from_iso8601_timestamp(charged_at)) AS day,
         issuer_hash,
         count(*) AS passes_converted
  FROM   first_charged
  GROUP  BY 1, 2),
keys AS (
  SELECT day, issuer_hash FROM generated
  UNION SELECT day, issuer_hash FROM visits
  UNION SELECT day, issuer_hash FROM redeemed
  UNION SELECT day, issuer_hash FROM converted)
SELECT k.day,
       k.issuer_hash,
       coalesce(g.passes_generated, 0) AS passes_generated,
       coalesce(v.link_clicks, 0) AS link_clicks,
       coalesce(r.passes_redeemed, 0) AS passes_redeemed,
       coalesce(c.passes_converted, 0) AS passes_converted
FROM   keys k
LEFT   JOIN generated g ON g.day = k.day AND g.issuer_hash = k.issuer_hash
LEFT   JOIN visits v ON v.day = k.day AND v.issuer_hash = k.issuer_hash
LEFT   JOIN redeemed r ON r.day = k.day AND r.issuer_hash = k.issuer_hash
LEFT   JOIN converted c ON c.day = k.day AND c.issuer_hash = k.issuer_hash
