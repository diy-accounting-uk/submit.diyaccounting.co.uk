-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
-- Copyright (C) 2006-2026 DIY Accounting Limited

-- How many passes were issued and how many redeemed, by pass type?
--
-- Issuance and redemption are both read off the passes table's own change log, where every
-- change record (insert or update) carries the pass type and the pass item's actor. An issue is
-- an insert record. The pass-generated activity event is not used: its actor can differ from the
-- item's, and the pass-redeemed event carries the bundle granted, not the pass type.
--
-- A redemption is a change record whose use_count rose over the previous change record for the
-- same pass.
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
--
-- A redemption counts only when the pass item carries an actor that is not automated. A pass
-- written before the actor column shipped has none, and so do the "system" passes of the weeks
-- after it: on prod every redemption of those two groups came from the automated test lanes
-- (hundreds a day, against two passes in the same ninety days that carry the customer actor),
-- so an item with no actor, or the system actor, is left out rather than read as a customer.
CREATE OR REPLACE VIEW v_pass_redemptions_daily AS
WITH issued AS (
  SELECT date(change_ts) AS day,
         pass_type_id,
         count(*) AS passes_issued
  FROM   aliased_dynamo_passes
  WHERE  change_type = 'INSERT' AND pass_type_id IS NOT NULL AND pass_type_id NOT LIKE '%-test-pass'
    AND  actor IS NOT NULL AND actor NOT IN ('system', 'test-user', 'probe', 'synthetic', 'operator')
  GROUP  BY 1, 2),
pass_history AS (
  SELECT change_ts,
         change_type,
         pass_type_id,
         use_count,
         actor,
         lag(use_count) OVER (PARTITION BY pass_id ORDER BY change_ts) AS previous_use_count
  FROM   aliased_dynamo_passes
  WHERE  pass_type_id NOT LIKE '%-test-pass'),
redeemed AS (
  SELECT date(change_ts) AS day,
         pass_type_id,
         count(*) AS passes_redeemed
  FROM   pass_history
  WHERE  change_type = 'MODIFY' AND previous_use_count IS NOT NULL AND use_count > previous_use_count
    AND  actor IS NOT NULL AND actor NOT IN ('system', 'test-user', 'probe', 'synthetic', 'operator')
  GROUP  BY 1, 2)
SELECT coalesce(issued.day, redeemed.day) AS day,
       coalesce(issued.pass_type_id, redeemed.pass_type_id) AS pass_type_id,
       coalesce(issued.passes_issued, 0) AS passes_issued,
       coalesce(redeemed.passes_redeemed, 0) AS passes_redeemed
FROM   issued
FULL OUTER JOIN redeemed
  ON issued.day = redeemed.day AND issued.pass_type_id = redeemed.pass_type_id
