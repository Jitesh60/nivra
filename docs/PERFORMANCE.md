# Performance

## Load test, Phase 9a (24 Sep 2026)

**Setup.** One API process (production build, Node 22) with Postgres 16 + PostGIS, Redis 7 and k6 **all on the same 4-vCPU machine**, so these are lower bounds for one API instance. Data: 2,000 live listings from 50 lenders across Pune, analysed. Scripts and steps: [infra/load](../infra/load/README.md).

### Browsing (`search.js`)

| Virtual users | Requests/s | home p95 | search p95 | listing p95 | Errors |
|---|---|---|---|---|---|
| 50 | 40 | 129 ms | 25 ms | 23 ms | 0% |
| 100 | 77 | 323 ms | 56 ms | 53 ms | 0% |
| 200 | 91–97 | 2.5–4.0 s | 1.0–1.6 s | 1.0–1.2 s | 0% |

- Targets (p95): home and search under 300 ms, a listing under 200 ms. **Met up to about 75 requests a second**; home is the first to slip.
- At 200 users the machine is saturated (Postgres, Node, Redis's Docker proxy and k6 share 4 vCPUs, 7% idle): everything slows together, nothing fails.
- **Home** is the heaviest request: categories, near you (a search), popular this week (views and favourites) and newest, then cards, in sequence. Running those in parallel was tried and made throughput worse (more connections contending for one small machine), so it stays sequential.
- Search, listing and quote queries use their indexes (GiST on location, GIN on the search vector); the only plan issue seen was stale statistics right after seeding, which autovacuum handles in production.

### Chat (`chat.js`)

| Virtual users | Requests/s | inbox p95 | messages p95 | send p95 | Errors |
|---|---|---|---|---|---|
| 40 | 66 (≈16 messages/s) | 189 ms | 169 ms | 256 ms | 0% |

- Targets: inbox and messages under 250 ms, send under 300 ms: **met**.
- Sending is the slowest step (masking, the message, the conversation's last message, the Socket.IO broadcast and the push check).

### What this means for launch

- Expected launch traffic in Pune is well under 10 requests a second, so one API instance has large headroom.
- Scale out before tuning: run 2 API instances behind Railway's load balancer (Socket.IO already uses the Redis adapter) and keep the worker separate. Move Postgres to its own managed instance (Railway), which also removes the shared-CPU ceiling seen here.
- Unread counts got a partial index (`notifications_unread_idx`) in this phase; the chat inbox, messages and search are indexed already.
- Re-run these after any change to search, home or chat SQL.
