#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# @capability DEV-68 Check that each AWS SSO profile is live for the CLI and the SDK
# - **Use when:** a skill or session is about to call AWS, or must decide whether to ask the operator for an SSO login.
# - **Does:** sso-check.sh runs aws sts get-caller-identity and a Node default-chain GetCallerIdentity for each profile. It prints one line per profile: live, CLI cache only, or expired. The CLI answers from its cached role credentials for 8 hours, while Node scripts need the SSO token itself. It reads the token's expiresAt from the ~/.aws/sso/cache file of the profile's sso_session. It exits 1 when any profile is not live.
# - **Run:** `scripts/sso-check.sh`; `scripts/sso-check.sh diya-submit-ci diya-submit-prod`; `scripts/sso-check.sh --expires-at diya-submit-ci`
# - **Entry:** `scripts/sso-check.sh:check_profile`
# - **Files:** scripts/sso-check.sh, app/unit-tests/scripts/ssoCheck.test.js
# - **Keywords:** sso check, sso login, expired token, cli cache, get-caller-identity, aws profile, sso session, expiresAt
# - **Related:** DEV-43
# @end-capability

# Says, for each AWS profile, whether both the AWS CLI and a Node script on the AWS SDK can call AWS.
#
#   scripts/sso-check.sh [profile ...]            (default: diya-submit-ci diya-submit-prod)
#   scripts/sso-check.sh --expires-at <profile>   (prints the profile's SSO token expiresAt, or nothing)
#
# Per profile, one line:
#   <profile>: live
#   <profile>: CLI cache only (SSO token expired at <expiresAt>)
#   <profile>: expired (SSO token expired at <expiresAt>)
#
# The CLI keeps role credentials in ~/.aws/cli/cache for hours after the SSO token expires, so the CLI
# call alone can pass while every SDK client fails with "Token is expired". AWS_CONFIG_DIR overrides
# ~/.aws for the expiresAt lookup only; the two calls read the CLI's and SDK's own configuration.
# Exit status: 0 when every profile is live, 1 otherwise, 2 on a usage error.

set -u

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
aws_dir="${AWS_CONFIG_DIR:-$HOME/.aws}"

# The value of key in the [header] section of an INI file, or nothing.
ini_value() {
  local file="$1" header="$2" key="$3"
  [ -f "$file" ] || return 0
  awk -v header="[$header]" -v key="$key" '
    /^[[:space:]]*\[/ { gsub(/^[[:space:]]+|[[:space:]]+$/, ""); in_section = ($0 == header); next }
    in_section {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      split(line, parts, "=")
      name = parts[1]; sub(/[[:space:]]+$/, "", name)
      if (name == key) {
        value = substr(line, index(line, "=") + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        print value
        exit
      }
    }' "$file"
}

# The expiresAt of the profile's SSO token: the latest one among the cache files whose sessionName is
# the profile's sso_session or whose startUrl is that session's (or the profile's own) sso_start_url.
expires_at() {
  local profile="$1" config="$aws_dir/config" section session start_url
  section="profile $profile"
  [ "$profile" = "default" ] && section="default"
  session="$(ini_value "$config" "$section" sso_session)"
  if [ -n "$session" ]; then
    start_url="$(ini_value "$config" "sso-session $session" sso_start_url)"
  else
    start_url="$(ini_value "$config" "$section" sso_start_url)"
  fi
  [ -d "$aws_dir/sso/cache" ] || return 0
  SSO_SESSION="$session" SSO_START_URL="$start_url" SSO_CACHE_DIR="$aws_dir/sso/cache" node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = process.env.SSO_CACHE_DIR;
    const { SSO_SESSION: session, SSO_START_URL: startUrl } = process.env;
    let latest = "";
    for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".json"))) {
      let token;
      try {
        token = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      } catch {
        continue;
      }
      const matches = (session && token.sessionName === session) || (startUrl && token.startUrl === startUrl);
      if (matches && typeof token.expiresAt === "string" && token.expiresAt > latest) latest = token.expiresAt;
    }
    if (latest) console.log(latest);
  '
}

# 0 when the AWS CLI answers for the profile.
cli_live() {
  env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
    aws --profile "$1" sts get-caller-identity --output text >/dev/null 2>&1
}

# 0 when a Node AWS SDK client on the default credential chain answers for the profile.
sdk_live() {
  (cd "$repo_root" && env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
    AWS_PROFILE="$1" AWS_REGION="${AWS_REGION:-eu-west-2}" node --input-type=module -e '
      import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
      await new STSClient({}).send(new GetCallerIdentityCommand({}));
    ' >/dev/null 2>&1)
}

# Prints the profile's line; returns 0 when it is live.
check_profile() {
  local profile="$1" expiry cli=1 sdk=1
  cli_live "$profile" && cli=0
  sdk_live "$profile" && sdk=0
  if [ "$cli" -eq 0 ] && [ "$sdk" -eq 0 ]; then
    echo "$profile: live"
    return 0
  fi
  expiry="$(expires_at "$profile")"
  [ -n "$expiry" ] || expiry="an unknown time (no SSO cache file for this profile)"
  if [ "$cli" -eq 0 ]; then
    echo "$profile: CLI cache only (SSO token expired at $expiry)"
  else
    echo "$profile: expired (SSO token expired at $expiry)"
  fi
  return 1
}

main() {
  if [ "${1:-}" = "--expires-at" ]; then
    if [ "$#" -ne 2 ]; then
      echo "Usage: $0 --expires-at <profile>" >&2
      return 2
    fi
    expires_at "$2"
    return 0
  fi
  if [ "$#" -eq 0 ]; then
    set -- diya-submit-ci diya-submit-prod
  fi
  local status=0 profile
  for profile in "$@"; do
    check_profile "$profile" || status=1
  done
  return "$status"
}

main "$@"
