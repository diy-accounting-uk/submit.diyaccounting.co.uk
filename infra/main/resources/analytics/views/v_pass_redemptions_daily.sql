-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many passes were issued and how many redeemed, by pass type?
--
-- Issuance comes from the activity event, which carries the pass type. Redemption does not:
-- the pass-redeemed event carries the bundle granted, not the pass type, so redemptions are
-- read off the passes table's own change log instead, where every change record (insert or
-- update) carries the pass type. A redemption is a change record whose use_count rose over
-- the previous change record for the same pass.
--
-- The lag() has to run over every change record (insert and modify), not just the modifies:
-- almost every pass is single-use, so its only modify is the redemption itself, and the
-- use_count it needs to compare against is the insert's starting 0. Filtering to modifies
-- before computing the lag left that first (and usually only) modify with no previous row to
-- compare against, so passes_redeemed was always zero.
--
-- dynamo_passes carries its own actor from the write that created it, constant across every
-- later change record for the same pass (redemption and revocation each SET only their own
-- fields, so the actor set at creation rides along on the item's later change records too). A
-- pass issued before that write shipped has no actor on the item, so this also keeps the
-- pass-type-id suffix filter: submit.passes.toml suffixes an automated-test type with
-- "-test-pass" (day-guest-test-pass, resident-pro-test-pass, resident-vat-test-pass), so those
-- are excluded here regardless of actor; a production type id (day-guest, resident-vat,
-- invited-guest) issued before the actor column existed still mixes real and test-lane
-- redemptions.
CREATE OR REPLACE VIEW v_pass_redemptions_daily AS
WITH issued AS (
  SELECT date(event_ts) AS day,
         pass_type_id,
         count(*) AS passes_issued
  FROM   activity_events_all
  WHERE  actor = 'customer' AND event = 'pass-generated' AND pass_type_id IS NOT NULL
  GROUP  BY 1, 2),
pass_history AS (
  SELECT change_ts,
         change_type,
         pass_type_id,
         use_count,
         actor,
         lag(use_count) OVER (PARTITION BY pass_id ORDER BY change_ts) AS previous_use_count
  FROM   dynamo_passes
  WHERE  pass_type_id NOT LIKE '%-test-pass'),
redeemed AS (
  SELECT date(change_ts) AS day,
         pass_type_id,
         count(*) AS passes_redeemed
  FROM   pass_history
  WHERE  change_type = 'MODIFY' AND previous_use_count IS NOT NULL AND use_count > previous_use_count
    AND  coalesce(actor, 'customer') NOT IN ('test-user', 'probe', 'synthetic')
  GROUP  BY 1, 2)
SELECT coalesce(issued.day, redeemed.day) AS day,
       coalesce(issued.pass_type_id, redeemed.pass_type_id) AS pass_type_id,
       coalesce(issued.passes_issued, 0) AS passes_issued,
       coalesce(redeemed.passes_redeemed, 0) AS passes_redeemed
FROM   issued
FULL OUTER JOIN redeemed
  ON issued.day = redeemed.day AND issued.pass_type_id = redeemed.pass_type_id
