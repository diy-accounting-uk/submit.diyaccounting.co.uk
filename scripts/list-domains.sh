#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# @capability OPS-135 Look up domains and CloudFront distributions
# - **Use when:** the live ci-/prod- DNS records under submit need listing, or a CloudFront distribution ID needs finding for an origin.
# - **Does:** list-domains.sh lists every ci- and prod- DNS record under the submit subdomain from Route53. lookup-cloudfront-distribution.sh prints the live CloudFront distribution ID serving an origin domain, preferring the EdgeStack stack output and falling back to the OriginFor tag, confirming every candidate against get-distribution since the tag index can lag a deletion.
# - **Run:** `./scripts/list-domains.sh`; `./scripts/lookup-cloudfront-distribution.sh <origin-domain> [edge-stack-name]`
# - **Entry:** `scripts/list-domains.sh`; `scripts/lookup-cloudfront-distribution.sh`
# - **Files:** scripts/list-domains.sh, scripts/lookup-cloudfront-distribution.sh
# - **Keywords:** list domains, route53 records, cloudfront distribution id, originfor tag, deployment lookup
# - **Related:** OPS-115
# @end-capability

ZONE_ID="Z0315522208PWZSSBI9AL"  # hosted zone ID for diyaccounting.co.uk
ZONE_NAME="diyaccounting.co.uk"
SUBDOMAIN="submit"  # the subdomain under the zone

aws route53 list-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --start-record-name "$SUBDOMAIN.$ZONE_NAME" \
  --output json \
| jq -r --arg suf ".${SUBDOMAIN}.${ZONE_NAME}." '
    .ResourceRecordSets
  | map(.Name)
  | map(select(endswith($suf)))
  | map(select(test("^(ci-|prod-).*\\Q" + $suf + "\\E$")))
  | map(.[:-1])
  | unique
  | .[]
'

# list distributions by id with their aliases
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Quantity > \`0\` && contains(Aliases.Items, '"ci.${SUBDOMAIN}.${ZONE_NAME}"')].[Id, DomainName, Aliases.Items]" \
  --output json \
| jq --raw-output \
  '.[].[]' \
;
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Quantity > \`0\` && contains(Aliases.Items, '"prod.${SUBDOMAIN}.${ZONE_NAME}"')].[Id, DomainName, Aliases.Items]" \
  --output json \
| jq --raw-output \
  '.[].[]' \
;

