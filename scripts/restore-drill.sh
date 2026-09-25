#!/usr/bin/env bash
# Restore drill: restores a pg_dump into a throwaway PostGIS container, checks
# the schema is at the latest migration, prints sanity counts and the time it took.
#
#   scripts/restore-drill.sh <dump-file | s3://bucket/key>   # a nightly backup
#   scripts/restore-drill.sh --from-url "$DATABASE_URL"       # dump a live database first
#
# Needs Docker, the repo's dependencies (pnpm install) and, for s3://, the AWS CLI.
# Never touches the source database beyond a read-only pg_dump.
set -euo pipefail

IMAGE="${DRILL_IMAGE:-postgis/postgis:16-3.4}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
NAME="sajha-restore-drill-$$"
started=$SECONDS

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { printf '\n[%3ss] %s\n' "$((SECONDS - started))" "$*"; }

case "${1:-}" in
  --from-url)
    SOURCE_URL="${2:?database URL}"
    step "Dumping the source database (read-only)"
    docker run --rm --network host "$IMAGE" \
      pg_dump --format=custom --no-owner --no-privileges "$SOURCE_URL" >"$WORK/db.dump"
    ;;
  s3://*)
    step "Downloading $1"
    aws s3 cp --only-show-errors "$1" "$WORK/db.dump"
    ;;
  "" | -h | --help)
    sed -n '2,11p' "$0"
    exit 2
    ;;
  *)
    cp "$1" "$WORK/db.dump"
    ;;
esac
echo "Dump: $(du -h "$WORK/db.dump" | cut -f1)"

step "Starting a throwaway PostGIS ($IMAGE)"
docker run -d --name "$NAME" -e POSTGRES_USER=drill -e POSTGRES_PASSWORD=drill \
  -e POSTGRES_DB=sajha -p 127.0.0.1::5432 "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U drill -d sajha -q 2>/dev/null && break
  sleep 1
done
# The image's init scripts restart the server once; wait for it to settle.
sleep 3
until docker exec "$NAME" pg_isready -U drill -d sajha -q 2>/dev/null; do sleep 1; done
PORT="$(docker port "$NAME" 5432/tcp | head -1 | sed 's/.*://')"
URL="postgresql://drill:drill@127.0.0.1:$PORT/sajha"

step "Restoring"
restore_started=$SECONDS
docker cp "$WORK/db.dump" "$NAME:/tmp/db.dump"
# Extensions and PostGIS's own objects already exist in the image; those
# "already exists" notices are expected, anything else fails the drill.
if ! docker exec "$NAME" pg_restore --no-owner --no-privileges -U drill -d sajha /tmp/db.dump \
  2>"$WORK/restore.log"; then
  if grep -v -E 'already exists|errors ignored on restore|^pg_restore: (while|from TOC|error: could not execute query: ERROR:  (extension|schema|type|function) .* already exists)|Command was:|^$|^LINE|^ +\^|COMMENT ON EXTENSION' "$WORK/restore.log" | grep -q .; then
    cat "$WORK/restore.log" >&2
    echo "Restore failed" >&2
    exit 1
  fi
fi
restore_sec=$((SECONDS - restore_started))

step "Checking migrations"
(cd "$ROOT/apps/api" && DATABASE_URL="$URL" pnpm exec prisma migrate status)

step "Sanity counts"
docker exec "$NAME" psql -U drill -d sajha -v ON_ERROR_STOP=1 -P pager=off -c "
  SELECT
    (SELECT count(*) FROM users)      AS users,
    (SELECT count(*) FROM listings)   AS listings,
    (SELECT count(*) FROM bookings)   AS bookings,
    (SELECT count(*) FROM payments)   AS payments,
    (SELECT count(*) FROM ledger_entries) AS ledger_entries,
    (SELECT coalesce(sum(debit_paise) - sum(credit_paise), 0) FROM ledger_entries) AS ledger_imbalance_paise,
    (SELECT max(created_at) FROM bookings) AS newest_booking;"
imbalance=$(docker exec "$NAME" psql -U drill -d sajha -tAc \
  "SELECT coalesce(sum(debit_paise) - sum(credit_paise), 0) FROM ledger_entries")
if [ "$imbalance" != 0 ]; then
  echo "The restored ledger does not balance ($imbalance paise)" >&2
  exit 1
fi

total=$((SECONDS - started))
printf '\nRestore drill passed: restore %ss, total (RTO for this dump) %ss.\n' "$restore_sec" "$total"
