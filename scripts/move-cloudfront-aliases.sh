#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Usage: scripts/move-cloudfront-aliases.sh <target-distribution-id> <aws-account-id> <origin-domain> <alias> [<alias> ...]
#
# Puts each <alias> and <origin-domain> on the CloudFront distribution <target-distribution-id>, so
# that no moment exists in which no distribution holds an alias.
#
# - Another distribution in this account holds the alias: one `associate-alias` call moves it to the
#   target. CloudFront removes the alias from the holder and adds it to the target in the same call,
#   and the holder keeps its other aliases.
# - The target holds the alias: no change.
# - No distribution holds the alias, or the holder is deleted before the move: the alias is added to
#   the target with update-distribution.
# - The move is refused and the holder still holds the alias: the script stops with exit 1. The
#   holder keeps serving the alias.
#
# A holder can disappear between two calls: the self-destruct of an old deployment deletes its
# distribution. So the script reads the holder again after a refused move to decide.
#
# Then the script waits until the target is deployed, because DNS moves to the target next.
#
# stdout holds only the deployment name of the first holder found, from its OriginFor tag (empty
# when the holder had no such tag, or its OriginFor is the first alias). Progress goes to stderr.
#
# Needs AWS credentials for the account that holds the distributions. Works on bash 3.2.

set -uo pipefail

if [ $# -lt 4 ] || [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
  echo "Usage: $0 <target-distribution-id> <aws-account-id> <origin-domain> <alias> [<alias> ...]" >&2
  exit 2
fi

TARGET_ID="$1"
ACCOUNT_ID="$2"
ORIGIN_DOMAIN="$3"
shift 3
FIRST_ALIAS="$1"

log() { echo "$*" >&2; }

# Prints the id of the distribution in this account that holds alias $1, or nothing.
holder_of() {
  local id
  id=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Aliases.Items!=null && contains(Aliases.Items, '$1')].Id | [0]" \
    --output text) || return 1
  [ "$id" = "None" ] && id=""
  printf '%s' "$id"
}

# Prints the deployment name of distribution $1 from its OriginFor tag. A holder that is gone
# (NoSuchDistribution) gives an empty name. Any other failure returns 1.
deployment_name_of() {
  local out rc
  out=$(aws cloudfront list-tags-for-resource \
    --resource "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/$1" \
    --query "Tags.Items[?Key=='OriginFor'].Value | [0]" \
    --output text 2>&1) && rc=0 || rc=$?
  if [ $rc -ne 0 ]; then
    if printf '%s' "$out" | grep -q "NoSuchDistribution"; then
      log "Distribution [$1] no longer exists (NoSuchDistribution); it names no deployment."
      return 0
    fi
    printf '%s\n' "$out" >&2
    return 1
  fi
  if [ -n "$out" ] && [ "$out" != "None" ] && [ "$out" != "$FIRST_ALIAS" ]; then
    log "Distribution [$1] is OriginFor [${out}]."
    printf '%s' "${out%%.*}"
  fi
}

EXISTING_DEPLOYMENT_NAME=""
NAME_READ=false
TO_ADD=()
CHANGED=false

for ALIAS in "$@"; do
  HOLDER=$(holder_of "$ALIAS") || { log "ERROR: could not list the CloudFront distributions"; exit 1; }

  if [ "$HOLDER" = "$TARGET_ID" ]; then
    log "Distribution [${TARGET_ID}] already holds [${ALIAS}]; no change."
    continue
  fi

  if [ -z "$HOLDER" ]; then
    log "No distribution holds [${ALIAS}]; it is added to [${TARGET_ID}]."
    TO_ADD+=("$ALIAS")
    continue
  fi

  if [ "$NAME_READ" = "false" ]; then
    EXISTING_DEPLOYMENT_NAME=$(deployment_name_of "$HOLDER") || { log "ERROR: could not read the tags of [${HOLDER}]"; exit 1; }
    NAME_READ=true
  fi

  log "Moving [${ALIAS}] from distribution [${HOLDER}] to [${TARGET_ID}] with associate-alias."
  if aws cloudfront associate-alias --target-distribution-id "$TARGET_ID" --alias "$ALIAS" >&2; then
    CHANGED=true
    continue
  fi

  HOLDER_NOW=$(holder_of "$ALIAS") || { log "ERROR: could not list the CloudFront distributions"; exit 1; }
  if [ "$HOLDER_NOW" = "$TARGET_ID" ]; then
    log "Distribution [${TARGET_ID}] holds [${ALIAS}] after the call; continuing."
    CHANGED=true
  elif [ -z "$HOLDER_NOW" ]; then
    log "The holder [${HOLDER}] is gone and no distribution holds [${ALIAS}]; it is added to [${TARGET_ID}]."
    TO_ADD+=("$ALIAS")
  else
    log "ERROR: associate-alias refused to move [${ALIAS}] to [${TARGET_ID}]; distribution [${HOLDER_NOW}] still holds it and serves it."
    exit 1
  fi
done

ETAG=$(aws cloudfront get-distribution-config --id "$TARGET_ID" --query 'ETag' --output text) || {
  log "ERROR: could not read the configuration of [${TARGET_ID}]"
  exit 1
}
CONFIG=$(aws cloudfront get-distribution-config --id "$TARGET_ID" --query 'DistributionConfig' --output json) || {
  log "ERROR: could not read the configuration of [${TARGET_ID}]"
  exit 1
}

NEEDED=$(printf '%s\n' "$ORIGIN_DOMAIN" ${TO_ADD[@]+"${TO_ADD[@]}"} | jq -R . | jq -s .)
MISSING=$(printf '%s' "$CONFIG" | jq -c --argjson needed "$NEEDED" '$needed - (.Aliases.Items // [])')
if [ "$MISSING" != "[]" ]; then
  log "Adding ${MISSING} to the aliases of [${TARGET_ID}]."
  CONFIG_FILE=$(mktemp)
  printf '%s' "$CONFIG" | jq --argjson missing "$MISSING" '
    .Aliases = (((.Aliases.Items // []) + $missing) as $items | {Quantity: ($items | length), Items: $items})
  ' > "$CONFIG_FILE"
  aws cloudfront update-distribution --id "$TARGET_ID" --if-match "$ETAG" \
    --distribution-config "file://${CONFIG_FILE}" >&2 || {
    log "ERROR: could not add ${MISSING} to [${TARGET_ID}]"
    rm -f "$CONFIG_FILE"
    exit 1
  }
  rm -f "$CONFIG_FILE"
  CHANGED=true
fi

if [ "$CHANGED" = "true" ]; then
  log "Waiting for CloudFront distribution [${TARGET_ID}] to deploy its aliases..."
  aws cloudfront wait distribution-deployed --id "$TARGET_ID" >&2 || {
    log "ERROR: distribution [${TARGET_ID}] did not reach Deployed"
    exit 1
  }
fi

log "CloudFront aliases of [${TARGET_ID}] now:"
aws cloudfront get-distribution --id "$TARGET_ID" --query 'Distribution.DistributionConfig.Aliases.Items' --output json >&2

printf '%s' "$EXISTING_DEPLOYMENT_NAME"
