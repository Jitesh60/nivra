#!/usr/bin/env bash
# Waits until the API answers /v1/health with status ok and the expected version.
#   scripts/smoke-test.sh https://api.staging.sajha.app <git-sha>
set -euo pipefail

URL="${1:?API base URL}"
SHA="${2:?expected version (GIT_SHA)}"
TIMEOUT_SEC="${SMOKE_TIMEOUT_SEC:-300}"
deadline=$((SECONDS + TIMEOUT_SEC))

while :; do
  body=$(curl -fsS --max-time 10 "$URL/v1/health" || true)
  status=$(jq -r '.status // empty' <<<"$body" 2>/dev/null || true)
  version=$(jq -r '.version // empty' <<<"$body" 2>/dev/null || true)
  if [ "$status" = ok ] && [ "$version" = "$SHA" ]; then
    echo "$URL is healthy on $SHA"
    exit 0
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "$URL not healthy on $SHA after ${TIMEOUT_SEC}s; last answer: ${body:-none}" >&2
    exit 1
  fi
  sleep 10
done
