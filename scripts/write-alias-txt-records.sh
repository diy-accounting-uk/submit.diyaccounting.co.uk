#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Usage: scripts/write-alias-txt-records.sh <hosted-zone-id> <target-domain-name> <alias> [<alias> ...]
#
# Writes (UPSERT) one DNS TXT record for each <alias> in the hosted zone <hosted-zone-id>, named
# _<alias>, with the value <target-domain-name> (the dxxxx.cloudfront.net name of the distribution
# the alias moves to), TTL 60. Then waits until Route 53 reports the change INSYNC.
#
# CloudFront refuses `associate-alias` without this record. The record stays after the move; the
# next move overwrites it. scripts/move-cloudfront-aliases.sh --plan names the aliases and the
# target domain name.
#
# Needs AWS credentials for the account that holds the hosted zone. Works on bash 3.2.

set -euo pipefail

if [ $# -lt 3 ] || [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <hosted-zone-id> <target-domain-name> <alias> [<alias> ...]" >&2
  exit 2
fi

HOSTED_ZONE_ID="$1"
TARGET_DOMAIN_NAME="$2"
shift 2

log() { echo "$*" >&2; }

if [[ ! "$TARGET_DOMAIN_NAME" =~ ^[a-z0-9]+\.cloudfront\.net$ ]]; then
  log "ERROR: [${TARGET_DOMAIN_NAME}] is not a CloudFront distribution domain name."
  exit 2
fi

CHANGE_BATCH=$(printf '%s\n' "$@" | jq -R . | jq -s -c --arg value "\"${TARGET_DOMAIN_NAME}\"" '{
  Comment: "CloudFront alias move: the TXT record that names the target distribution",
  Changes: map({
    Action: "UPSERT",
    ResourceRecordSet: {Name: ("_" + . + "."), Type: "TXT", TTL: 60, ResourceRecords: [{Value: $value}]}
  })
}')

for ALIAS in "$@"; do
  log "Upserting DNS TXT record [_${ALIAS}] = [${TARGET_DOMAIN_NAME}] in hosted zone [${HOSTED_ZONE_ID}]."
done
CHANGE_ID=$(aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch "$CHANGE_BATCH" --query 'ChangeInfo.Id' --output text) || {
  log "ERROR: could not write the DNS TXT records in hosted zone [${HOSTED_ZONE_ID}]"
  exit 1
}

log "Waiting for Route 53 change [${CHANGE_ID}] to reach INSYNC..."
aws route53 wait resource-record-sets-changed --id "$CHANGE_ID" || {
  log "ERROR: Route 53 change [${CHANGE_ID}] did not reach INSYNC"
  exit 1
}
log "Route 53 change [${CHANGE_ID}] is INSYNC; the DNS TXT records are written."
