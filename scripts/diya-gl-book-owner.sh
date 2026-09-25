#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Prints every cloud book with its owner's masked login: owner prefix, masked login, book id,
# title, product, period covered and last update, tab-separated. Reads S3 and Athena only.
# Usage: ! scripts/diya-gl-book-owner.sh prod

set -euo pipefail

env="${1:-}"
if [[ ! "$env" =~ ^(ci|prod)$ ]]; then
  echo "Usage: $0 ci|prod" >&2
  exit 1
fi

export AWS_PROFILE="submit-${env}"
export AWS_REGION="eu-west-2"

account=$(aws sts get-caller-identity --query Account --output text)
bucket="${env}-env-diya-gl-${account}"
database="${env}_env_analytics"
workgroup="${env}-env-analytics"

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

# One query: the latest login summary ("Login: a***@domain") for every owner.
query_id=$(aws athena start-query-execution \
  --work-group "$workgroup" \
  --query-execution-context "Database=${database}" \
  --query-string "SELECT hashed_sub, max_by(summary, event_ts) AS summary FROM activity_events WHERE event = 'login' AND hashed_sub IS NOT NULL GROUP BY hashed_sub" \
  --query QueryExecutionId --output text)

state="QUEUED"
for _ in $(seq 1 120); do
  state=$(aws athena get-query-execution --query-execution-id "$query_id" --query QueryExecution.Status.State --output text)
  [[ "$state" == "SUCCEEDED" || "$state" == "FAILED" || "$state" == "CANCELLED" ]] && break
  sleep 2
done
if [[ "$state" != "SUCCEEDED" ]]; then
  reason=$(aws athena get-query-execution --query-execution-id "$query_id" --query QueryExecution.Status.StateChangeReason --output text)
  echo "Athena query ${query_id} ended ${state}: ${reason}" >&2
  exit 1
fi

aws athena get-query-results --query-execution-id "$query_id" --output json \
  | jq -r '.ResultSet.Rows[1:][] | [.Data[0].VarCharValue // "", ((.Data[1].VarCharValue // "") | sub("^[^:]*: "; ""))] | @tsv' \
  > "${workdir}/logins.tsv"

aws s3 ls "s3://${bucket}/users/" --recursive | awk '{print $4}' | grep '/metadata\.json$' > "${workdir}/keys.txt" || true

printf 'owner_prefix\tlogin\tbook_id\ttitle\tproduct\tperiod\tupdated_at\n'
while read -r key; do
  [[ "$key" =~ ^users/(.+)/books/([^/]+)/metadata\.json$ ]] || continue
  owner_prefix="${BASH_REMATCH[1]}"
  book_id="${BASH_REMATCH[2]}"
  hashed_sub="${owner_prefix%%/*}"
  login=$(awk -F'\t' -v sub_="$hashed_sub" '$1 == sub_ {print $2; exit}' "${workdir}/logins.tsv")
  aws s3 cp "s3://${bucket}/${key}" - \
    | jq -r --arg owner "$owner_prefix" --arg login "${login:--}" --arg book "$book_id" \
      '[$owner, $login, $book, .title // "", .product // "", "\(.periodCoveredStart // "")..\(.periodCoveredEnd // "")", .updatedAt // ""] | @tsv'
done < "${workdir}/keys.txt"
