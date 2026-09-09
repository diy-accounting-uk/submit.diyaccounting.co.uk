#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

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

