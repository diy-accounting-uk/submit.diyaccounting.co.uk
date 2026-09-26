#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/github-api-commit.sh
#
# Commits the working tree's uncommitted changes (relative to --base-sha) to a new branch
# through the GitHub GraphQL API (createCommitOnBranch), using the token in GH_TOKEN. GitHub
# signs and marks a commit made this way as verified for whichever identity the token belongs
# to - a GitHub App's installation token included - which a plain `git commit` pushed over git
# can never be, however the identity on it is set. Callers that used to `git commit` then
# `git push` switch to this script instead; nothing here calls either.
#
# Usage:
#   github-api-commit.sh --repo OWNER/NAME --branch BRANCH --base-sha SHA --message-file FILE [--dry-run]
#
# Reads the changed files from `git diff` between --base-sha and the current working tree, so
# run it after applying whatever patch or edits belong in the commit, and before anything else
# touches the working tree. --message-file holds the commit message: its first line is the
# GraphQL commit headline, a blank line then the rest is the body (the same shape `git commit
# -F` expects).
#
# On success, the new branch exists on the remote with one commit, and the local checkout of
# --branch is fast-forwarded to it, so `git diff main HEAD` and similar downstream checks see
# the change without a local `git commit`. Prints `commit-oid=<oid>` and `commit-url=<url>` on
# their own lines; a caller inside a GitHub Actions step redirects that into $GITHUB_OUTPUT.
#
# --dry-run builds and prints the GraphQL request body without creating the ref, calling the
# API, or touching the local branch - for proving the payload shape offline.

set -euo pipefail

REPO=""
BRANCH=""
BASE_SHA=""
MESSAGE_FILE=""
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --base-sha)
      BASE_SHA="$2"
      shift 2
      ;;
    --message-file)
      MESSAGE_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "unrecognised argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$REPO" ] || [ -z "$BRANCH" ] || [ -z "$BASE_SHA" ] || [ -z "$MESSAGE_FILE" ]; then
  echo "usage: github-api-commit.sh --repo OWNER/NAME --branch BRANCH --base-sha SHA --message-file FILE [--dry-run]" >&2
  exit 1
fi

if [ ! -f "$MESSAGE_FILE" ]; then
  echo "message file not found: $MESSAGE_FILE" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# First line is the headline; the rest (after the blank line git commit-style messages carry) is
# the body. sed prints line 1 for the headline and everything from line 3 on for the body, which
# is correct whether or not line 2 is actually blank.
HEADLINE=$(sed -n '1p' "$MESSAGE_FILE")
BODY=$(sed -n '3,$p' "$MESSAGE_FILE")

jq -n --arg headline "$HEADLINE" --arg body "$BODY" '{headline: $headline, body: $body}' \
  > "$WORK_DIR/message.json"

# Stage everything so a brand new file shows up in the diff below: plain `git diff` never lists
# an untracked file, only `git diff --cached` against the index does once it is staged. Staging
# does not commit, so this is still just building the list of files to send to the API.
git add -A

# git diff --no-renames turns every rename into a delete-plus-add pair, so the additions/
# deletions split below never has to special-case an R-status line. -z NUL-delimits status and
# path pairs so a path with a space or a tab in it still parses correctly.
: > "$WORK_DIR/additions.jsonl"
: > "$WORK_DIR/deletions.jsonl"

while IFS= read -r -d '' STATUS && IFS= read -r -d '' PATH_NAME; do
  case "$STATUS" in
    A | M)
      # base64, then strip every newline: GNU base64 wraps at 76 columns and BSD/macOS base64
      # does too, and the GraphQL field wants one unbroken base64 string.
      CONTENTS=$(base64 <"$PATH_NAME" | tr -d '\n')
      jq -n --arg path "$PATH_NAME" --arg contents "$CONTENTS" '{path: $path, contents: $contents}' \
        >> "$WORK_DIR/additions.jsonl"
      ;;
    D)
      jq -n --arg path "$PATH_NAME" '{path: $path}' >> "$WORK_DIR/deletions.jsonl"
      ;;
    *)
      echo "unhandled git diff status '$STATUS' for $PATH_NAME" >&2
      exit 1
      ;;
  esac
done < <(git diff --no-renames --name-status -z --cached "$BASE_SHA")

jq -s '.' "$WORK_DIR/additions.jsonl" > "$WORK_DIR/additions.json"
jq -s '.' "$WORK_DIR/deletions.jsonl" > "$WORK_DIR/deletions.json"

if ! jq -e '(. | length) > 0' "$WORK_DIR/additions.json" >/dev/null 2>&1 \
  && ! jq -e '(. | length) > 0' "$WORK_DIR/deletions.json" >/dev/null 2>&1; then
  echo "no file changes between $BASE_SHA and the working tree, nothing to commit" >&2
  exit 1
fi

QUERY='mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }'

jq -n \
  --arg query "$QUERY" \
  --arg owner_name "$REPO" \
  --arg branch "$BRANCH" \
  --arg base_sha "$BASE_SHA" \
  --slurpfile message "$WORK_DIR/message.json" \
  --slurpfile additions "$WORK_DIR/additions.json" \
  --slurpfile deletions "$WORK_DIR/deletions.json" \
  '{
    query: $query,
    variables: {
      input: {
        branch: { repositoryNameWithOwner: $owner_name, branchName: $branch },
        message: $message[0],
        fileChanges: { additions: $additions[0], deletions: $deletions[0] },
        expectedHeadOid: $base_sha
      }
    }
  }' > "$WORK_DIR/body.json"

if [ "$DRY_RUN" = true ]; then
  cat "$WORK_DIR/body.json"
  exit 0
fi

# The branch does not exist yet: create it at base-sha so createCommitOnBranch has something to
# commit onto. A rerun for the same issue can find the ref already there from an earlier attempt,
# which is not an error - the mutation below still applies as long as expectedHeadOid matches.
if ! gh api "repos/${REPO}/git/refs" -f ref="refs/heads/${BRANCH}" -f sha="${BASE_SHA}" >/dev/null 2>"$WORK_DIR/ref-create.log"; then
  if ! grep -q "Reference already exists" "$WORK_DIR/ref-create.log"; then
    cat "$WORK_DIR/ref-create.log" >&2
    exit 1
  fi
fi

RESPONSE=$(gh api graphql --input "$WORK_DIR/body.json")

if echo "$RESPONSE" | jq -e '.errors' >/dev/null 2>&1; then
  echo "$RESPONSE" | jq '.errors' >&2
  exit 1
fi

COMMIT_OID=$(echo "$RESPONSE" | jq -r '.data.createCommitOnBranch.commit.oid')
COMMIT_URL=$(echo "$RESPONSE" | jq -r '.data.createCommitOnBranch.commit.url')

# Advance the local branch to the commit the API just made, so a caller's later `git diff
# main HEAD` (or any other local read) sees it without ever running `git commit`. The caller is
# expected to already have --branch checked out locally (from applying the patch this commits),
# so this is a hard reset onto the new remote tip, not a switch to a different branch.
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo "commit-oid=${COMMIT_OID}"
echo "commit-url=${COMMIT_URL}"
