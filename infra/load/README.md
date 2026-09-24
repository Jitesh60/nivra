# Load tests (k6)

Two scripts, run against a **throwaway** database seeded for the purpose:

| Script | What it does |
|---|---|
| `search.js` | Anonymous browsing: home, search (keywords, area, sometimes dates), a listing and its quote. Each virtual user browses from its own IP (the API limits public reads per IP). |
| `chat.js` | Signed-in borrowers: inbox, a conversation's messages, send a message (paced under the 30-a-minute limit), mark read, unread count. `setup()` signs up the users with the dev OTP bypass. |

```bash
# 1. A separate database (never your dev or a real one), migrated and seeded
psql -h localhost -U sajha -c 'CREATE DATABASE sajha_load'
psql -h localhost -U sajha -d sajha_load -c 'CREATE EXTENSION postgis; CREATE EXTENSION citext; CREATE EXTENSION btree_gist'
export DATABASE_URL=postgresql://sajha:sajha@localhost:5432/sajha_load
pnpm --filter @sajha/api prisma:deploy
pnpm --filter @sajha/api seed:load -- --listings 2000
psql "$DATABASE_URL" -c ANALYZE

# 2. A production build of the API on it
pnpm --filter @sajha/api build
(cd apps/api && OTP_DEV_BYPASS_CODE=000000 LOG_LEVEL=warn node dist/main.js)

# 3. The tests (k6 in Docker; VUS and DURATION are optional)
docker run --rm --network host -v "$PWD/infra/load:/load" -e VUS=50 grafana/k6 run /load/search.js
docker run --rm --network host -v "$PWD/infra/load:/load" -e VUS=40 grafana/k6 run /load/chat.js
```

Thresholds (p95 latency, under 1% errors) are in each script; k6 exits non-zero when one is crossed. Results are recorded in [docs/PERFORMANCE.md](../../docs/PERFORMANCE.md).
