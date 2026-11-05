#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

#
# Usage: scripts/transfer-apigw-domain.sh <api-id> <regional-certificate-arn> <domain> [<domain> ...]
#
# Points each API Gateway custom domain at the HTTP API <api-id>, stage $default, empty mapping key.
# CloudFront forwards the Host header to the regional endpoint, and API Gateway picks the API from
# the domain's mapping, so a domain or a mapping that is absent answers 403 for every /api call.
#
# - The domain exists with <regional-certificate-arn>: its one mapping moves to the new API in place
#   (update-api-mapping), so the domain always has a mapping. No domain is deleted or created.
# - The domain exists with another certificate: the domain is deleted and created again.
# - The domain does not exist: it is created, then its mapping.
#
# A domain can disappear between two calls: the destroy of a set deletes a domain whose mappings all
# name that set's API. A NotFoundException on the domain sends that domain to the create path.
# CreateDomainName and DeleteDomainName have a low rate limit, so only the create path waits.
#
# Needs AWS credentials and AWS_REGION for the account that holds the API. Works on bash 3.2.

set -uo pipefail

if [ $# -lt 3 ] || [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <api-id> <regional-certificate-arn> <domain> [<domain> ...]" >&2
  exit 2
fi

API_ID="$1"
CERT_ARN="$2"
shift 2

# The stage and the query are literal text for the AWS CLI.
# shellcheck disable=SC2016
STAGE='$default'
# One line per mapping: id,api,stage,key. The key is empty for the root mapping.
# shellcheck disable=SC2016
MAPPING_QUERY='Items[].join(`","`, [ApiMappingId, ApiId, Stage, ApiMappingKey || `""`])'

# Set by a function that called CreateDomainName or DeleteDomainName.
RATE_LIMITED_CALL_MADE=false

# Runs "$@" (an apigatewayv2 call against DOMAIN). Prints stdout and returns 0 on success, returns 2
# when the call answers NotFoundException, and prints the error and returns 1 on any other failure.
aws_call() {
  local out rc
  out=$("$@" 2>&1)
  rc=$?
  if [ $rc -eq 0 ]; then
    printf '%s' "$out"
    return 0
  fi
  if printf '%s' "$out" | grep -q "NotFoundException"; then
    echo "  [${DOMAIN}] answered NotFoundException: ${out}" >&2
    return 2
  fi
  printf '%s\n' "$out" >&2
  return 1
}

# Prints the mappings of DOMAIN, one per line, in the MAPPING_QUERY shape.
read_mappings() {
  local out rc
  out=$(aws_call aws apigatewayv2 get-api-mappings --domain-name "${DOMAIN}" --query "${MAPPING_QUERY}" --output text) && rc=0 || rc=$?
  [ $rc -eq 0 ] || return $rc
  printf '%s\n' "$out" | tr '\t' '\n' | sed '/^[[:space:]]*$/d'
}

count_lines() {
  local n=0 line
  while IFS= read -r line; do
    [ -n "$line" ] && n=$((n + 1))
  done <<< "$1"
  echo "$n"
}

# Points the one mapping of DOMAIN at API_ID without a moment with no mapping. Returns 0 when the
# mapping names API_ID, 2 when DOMAIN or its mapping disappeared, and 1 on any other failure.
move_mapping_in_place() {
  local mappings count rc mapping_id mapped_api mapped_stage mapped_key
  mappings=$(read_mappings) && rc=0 || rc=$?
  [ $rc -eq 0 ] || return $rc
  count=$(count_lines "$mappings")

  if [ "$count" -eq 0 ]; then
    echo "  [${DOMAIN}] has no API mapping; creating one to API [${API_ID}]"
    aws_call aws apigatewayv2 create-api-mapping --domain-name "${DOMAIN}" --api-id "${API_ID}" --stage "${STAGE}" > /dev/null
    return $?
  fi

  if [ "$count" -gt 1 ]; then
    echo "ERROR: [${DOMAIN}] has ${count} API mappings (id,api,stage,key); expected one:" >&2
    printf '%s\n' "$mappings" | sed 's/^/  /' >&2
    return 1
  fi

  IFS=, read -r mapping_id mapped_api mapped_stage mapped_key <<< "$mappings"
  if [ -n "$mapped_key" ]; then
    echo "ERROR: [${DOMAIN}] has one API mapping [${mapping_id}] with key [${mapped_key}]; expected the empty key" >&2
    return 1
  fi
  if [ "$mapped_api" = "$API_ID" ] && [ "$mapped_stage" = "$STAGE" ]; then
    echo "  [${DOMAIN}] mapping [${mapping_id}] already names API [${API_ID}] stage [${STAGE}]; no change"
    return 0
  fi

  echo "  Moving mapping [${mapping_id}] on [${DOMAIN}] in place: API [${mapped_api}] stage [${mapped_stage}] -> API [${API_ID}] stage [${STAGE}]"
  aws_call aws apigatewayv2 update-api-mapping --domain-name "${DOMAIN}" --api-mapping-id "${mapping_id}" \
    --api-id "${API_ID}" --stage "${STAGE}" > /dev/null
}

# Deletes every mapping of DOMAIN and then DOMAIN. A domain that disappears on the way counts as deleted.
delete_domain() {
  local mappings rc line mapping_id delay attempt
  mappings=$(read_mappings) && rc=0 || rc=$?
  if [ $rc -eq 2 ]; then
    echo "  [${DOMAIN}] is already gone"
    return 0
  fi
  [ $rc -eq 0 ] || return 1

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    mapping_id="${line%%,*}"
    echo "  Deleting mapping [${mapping_id}]"
    aws_call aws apigatewayv2 delete-api-mapping --domain-name "${DOMAIN}" --api-mapping-id "${mapping_id}" > /dev/null && rc=0 || rc=$?
    [ $rc -ne 1 ] || return 1
  done <<< "$mappings"

  echo "  Deleting domain [${DOMAIN}]"
  RATE_LIMITED_CALL_MADE=true
  delay=15
  for attempt in 1 2 3 4 5; do
    aws_call aws apigatewayv2 delete-domain-name --domain-name "${DOMAIN}" > /dev/null && rc=0 || rc=$?
    if [ $rc -eq 0 ]; then
      echo "  Waiting 10s after domain deletion to avoid rate limiting..."
      sleep 10
      return 0
    fi
    if [ $rc -eq 2 ]; then
      echo "  [${DOMAIN}] was already gone at the delete; no wait"
      return 0
    fi
    echo "  Delete attempt ${attempt}/5 failed (likely rate limited), retrying in ${delay}s..."
    sleep "${delay}"
    delay=$((delay * 2))
  done
  echo "ERROR: Failed to delete API GW custom domain [${DOMAIN}] after 5 attempts" >&2
  return 1
}

# Creates DOMAIN with CERT_ARN and its mapping to API_ID.
create_domain_and_mapping() {
  local delay attempt create_output rc
  echo "Creating API GW custom domain [${DOMAIN}] with cert [${CERT_ARN}]"
  RATE_LIMITED_CALL_MADE=true
  delay=15
  for attempt in 1 2 3 4 5; do
    create_output=$(aws apigatewayv2 create-domain-name \
      --domain-name "${DOMAIN}" \
      --domain-name-configurations "CertificateArn=${CERT_ARN},EndpointType=REGIONAL" 2>&1) && rc=0 || rc=$?
    if [ $rc -eq 0 ]; then
      break
    fi
    if printf '%s' "$create_output" | grep -q "already exists"; then
      echo "  Domain [${DOMAIN}] exists now; moving its mapping in place"
      move_mapping_in_place
      return $?
    fi
    if [ "$attempt" -eq 5 ]; then
      echo "ERROR: Failed to create API GW custom domain [${DOMAIN}] after 5 attempts (${create_output})" >&2
      return 1
    fi
    echo "  Attempt ${attempt}/5 failed (${create_output}), retrying in ${delay}s..."
    sleep "${delay}"
    delay=$((delay * 2))
  done

  echo "Creating API mapping for domain [${DOMAIN}] -> API [${API_ID}]"
  if aws apigatewayv2 create-api-mapping --domain-name "${DOMAIN}" --api-id "${API_ID}" --stage "${STAGE}"; then
    return 0
  fi
  echo "  Mapping failed, retrying with full delete+recreate cycle..."
  aws apigatewayv2 delete-domain-name --domain-name "${DOMAIN}" > /dev/null 2>&1
  sleep 10
  aws apigatewayv2 create-domain-name \
    --domain-name "${DOMAIN}" \
    --domain-name-configurations "CertificateArn=${CERT_ARN},EndpointType=REGIONAL" || return 1
  aws apigatewayv2 create-api-mapping --domain-name "${DOMAIN}" --api-id "${API_ID}" --stage "${STAGE}" || return 1
}

# Fails unless exactly one mapping of DOMAIN names API_ID.
verify_mapping() {
  local mappings rc mapped_api ours=0
  mappings=$(read_mappings) && rc=0 || rc=$?
  if [ $rc -ne 0 ]; then
    echo "ERROR: could not read the API mappings of [${DOMAIN}] to verify them" >&2
    return 1
  fi
  while IFS=, read -r _ mapped_api _; do
    [ "$mapped_api" = "$API_ID" ] && ours=$((ours + 1))
  done <<< "$mappings"
  if [ "$ours" -ne 1 ]; then
    echo "ERROR: [${DOMAIN}] has ${ours} API mappings to API [${API_ID}]; expected exactly one. Mappings (id,api,stage,key):" >&2
    printf '%s\n' "$mappings" | sed 's/^/  /' >&2
    return 1
  fi
  echo "Verified: [${DOMAIN}] has exactly one API mapping to API [${API_ID}]"
}

transfer_domain() {
  local current_cert rc
  echo "Transferring API Gateway custom domain [${DOMAIN}] to API [${API_ID}]"
  current_cert=$(aws_call aws apigatewayv2 get-domain-name --domain-name "${DOMAIN}" \
    --query 'DomainNameConfigurations[0].CertificateArn' --output text) && rc=0 || rc=$?

  if [ $rc -eq 1 ]; then
    echo "ERROR: could not read API GW custom domain [${DOMAIN}]" >&2
    return 1
  fi

  if [ $rc -eq 0 ] && [ "$current_cert" = "$CERT_ARN" ]; then
    move_mapping_in_place && rc=0 || rc=$?
    if [ $rc -eq 1 ]; then
      return 1
    fi
    if [ $rc -eq 2 ]; then
      echo "  [${DOMAIN}] disappeared during the move; creating it"
      create_domain_and_mapping || return 1
    fi
  elif [ $rc -eq 0 ]; then
    echo "  [${DOMAIN}] has certificate [${current_cert}], expected [${CERT_ARN}]; replacing the domain"
    delete_domain || return 1
    create_domain_and_mapping || return 1
  else
    echo "  [${DOMAIN}] does not exist"
    create_domain_and_mapping || return 1
  fi

  verify_mapping || return 1
  echo "API GW custom domain [${DOMAIN}] configured successfully"
}

for DOMAIN in "$@"; do
  if [ "$RATE_LIMITED_CALL_MADE" = "true" ]; then
    echo "Waiting 15s before next API Gateway domain operation to avoid rate limiting..."
    sleep 15
  fi
  RATE_LIMITED_CALL_MADE=false
  transfer_domain || exit 1
done
