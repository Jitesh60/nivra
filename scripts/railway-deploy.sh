#!/usr/bin/env bash
# Points a Railway service at an exact image digest and deploys it, then waits
# for the deployment to finish. Used by .github/workflows/deploy.yml.
#
#   RAILWAY_TOKEN           project token for the target environment
#   RAILWAY_ENVIRONMENT_ID  the environment (staging or production)
#   scripts/railway-deploy.sh <service-id> <image@sha256:digest>
#
# Deploying by digest (not a moving tag) is what makes "promote to production"
# run the very bytes that were tested on staging.
set -euo pipefail

SERVICE_ID="${1:?service id}"
IMAGE="${2:?image reference with digest}"
: "${RAILWAY_TOKEN:?}" "${RAILWAY_ENVIRONMENT_ID:?}"
API="${RAILWAY_API_URL:-https://backboard.railway.com/graphql/v2}"
TIMEOUT_SEC="${RAILWAY_DEPLOY_TIMEOUT_SEC:-900}"

case "$IMAGE" in *@sha256:*) ;; *) echo "Refusing to deploy a tag; pass image@sha256:…" >&2; exit 2 ;; esac

gql() {
  local body
  body=$(jq -nc --arg q "$1" --argjson v "$2" '{query: $q, variables: $v}')
  local out
  out=$(curl -fsS "$API" -H "Project-Access-Token: $RAILWAY_TOKEN" -H 'Content-Type: application/json' -d "$body")
  if [ "$(jq '.errors // [] | length' <<<"$out")" != 0 ]; then
    echo "Railway API error: $(jq -c '.errors' <<<"$out")" >&2
    exit 1
  fi
  echo "$out"
}

vars=$(jq -nc --arg s "$SERVICE_ID" --arg e "$RAILWAY_ENVIRONMENT_ID" --arg i "$IMAGE" \
  '{serviceId: $s, environmentId: $e, input: {source: {image: $i}}}')
gql 'mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
  serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }' "$vars" >/dev/null

vars=$(jq -nc --arg s "$SERVICE_ID" --arg e "$RAILWAY_ENVIRONMENT_ID" '{serviceId: $s, environmentId: $e}')
deployment=$(gql 'mutation($serviceId: String!, $environmentId: String!) {
  serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) }' "$vars" |
  jq -r '.data.serviceInstanceDeployV2')
echo "Deployment $deployment started for service $SERVICE_ID with $IMAGE"

deadline=$((SECONDS + TIMEOUT_SEC))
while :; do
  status=$(gql 'query($id: String!) { deployment(id: $id) { status } }' \
    "$(jq -nc --arg id "$deployment" '{id: $id}')" | jq -r '.data.deployment.status')
  case "$status" in
    SUCCESS) echo "Deployment $deployment succeeded"; exit 0 ;;
    FAILED | CRASHED | REMOVED | SKIPPED) echo "Deployment $deployment ended as $status" >&2; exit 1 ;;
  esac
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Deployment $deployment still $status after ${TIMEOUT_SEC}s" >&2
    exit 1
  fi
  sleep 10
done
