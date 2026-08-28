-- How many passes were issued and how many redeemed, by pass type?
--
-- Issuance comes from the activity event, which carries the pass type. Redemption does not:
-- the pass-redeemed event carries the bundle granted, not the pass type, so redemptions are
-- read off the passes table's own change log instead, where every change record (insert or
-- update) carries the pass type. A redemption is a change record whose use_count rose over
-- the previous change record for the same pass.
CREATE OR REPLACE VIEW v_pass_redemptions_daily AS
WITH issued AS (
  SELECT date(event_ts) AS day,
         pass_type_id,
         count(*) AS passes_issued
  FROM   activity_events_all
  WHERE  actor = 'customer' AND event = 'pass-generated' AND pass_type_id IS NOT NULL
  GROUP  BY 1, 2),
redemption_candidates AS (
  SELECT change_ts,
         pass_type_id,
         use_count,
         lag(use_count) OVER (PARTITION BY pass_id ORDER BY change_ts) AS previous_use_count
  FROM   dynamo_passes
  WHERE  change_type = 'MODIFY'),
redeemed AS (
  SELECT date(change_ts) AS day,
         pass_type_id,
         count(*) AS passes_redeemed
  FROM   redemption_candidates
  WHERE  previous_use_count IS NOT NULL AND use_count > previous_use_count
  GROUP  BY 1, 2)
SELECT coalesce(issued.day, redeemed.day) AS day,
       coalesce(issued.pass_type_id, redeemed.pass_type_id) AS pass_type_id,
       coalesce(issued.passes_issued, 0) AS passes_issued,
       coalesce(redeemed.passes_redeemed, 0) AS passes_redeemed
FROM   issued
FULL OUTER JOIN redeemed
  ON issued.day = redeemed.day AND issued.pass_type_id = redeemed.pass_type_id
