# Commission Reporting Service

A read-only Node.js + TypeScript reporting API on top of a pre-seeded
PostgreSQL database of commissions and allocations. See
[ASSIGNMENT.md](./ASSIGNMENT.md) for the original brief.

> **Status:** both required endpoints shipped — `GET /api/v1/commissions`
> (paginated list with allocations) and `GET /api/v1/commissions/summary`
> (period summary aggregates). 72 tests, typecheck clean.

---

## Stack

- **Node.js 20** (Docker image; the host can be 18+)
- **TypeScript** with `strict: true` and `noUncheckedIndexedAccess`
- **Fastify 5** (HTTP framework)
- **TypeORM 0.3** (entities + DataSource; raw SQL for aggregations)
- **PostgreSQL 16** via Docker Compose
- **Zod** for request validation
- **Vitest** for unit + integration tests
- **@fastify/swagger** + **swagger-ui** for OpenAPI docs at `/docs`

---

## Run it

### Default flow (matches the assignment's "Getting Started")

```bash
# Start PostgreSQL with seed data
docker compose up -d

# Install dependencies
npm install

# Start the dev server
npm run dev

# Run tests (in another terminal)
npm test
```

`docker compose up -d` brings up the **database only**. The `api`
service in `docker-compose.yml` is opt-in via a profile (see below).
`npm run dev` runs the API on the host with `tsx watch` (hot reload).

```bash
curl -i http://localhost:3000/healthz
# HTTP/1.1 200 OK
# {"status":"ok"}
```

Swagger UI: <http://localhost:3000/docs>

Stop:

```bash
docker compose down       # keeps the data volume
docker compose down -v    # also wipes pgdata; init.sql re-runs next start
```

`.env` (copy from `.env.example`):

| Var            | Default                                                          |
| -------------- | ---------------------------------------------------------------- |
| `DATABASE_URL` | `postgres://commissions:commissions@localhost:5432/commissions`  |
| `PORT`         | `3000`                                                           |
| `LOG_LEVEL`    | `info`                                                           |
| `NODE_ENV`     | `development`                                                    |

### Optional: full stack in containers (zero local install)

For a no-Node-on-host workflow, the `api` service runs in its own
container. Start with the `full` profile:

```bash
docker compose --profile full up -d --build

# Run tests inside the container
docker compose exec -T api npm test
docker compose exec -T api npm run typecheck
```

`TEST_DATABASE_URL` resolution falls back through `TEST_DATABASE_URL →
DATABASE_URL → localhost`, so the same suite runs on host and in
container with no env plumbing.

---

## API reference

Both endpoints share the error contract:

```json
{ "code": "invalid_parameter", "message": "team_id must be a valid UUID" }
```

Stable error codes: `missing_parameter` (400), `invalid_parameter` (400),
`range_too_large` (422), `internal_server_error` (500). Empty results are
**not** errors — the assignment is explicit on this.

### `GET /api/v1/commissions`

Paginated list with allocations eager-loaded.

| Query param   | Type       | Required | Notes |
| ------------- | ---------- | -------- | ----- |
| `team_id`     | UUID       | no       | Restrict to one team |
| `status`      | enum       | no       | `draft`/`pending_approval`/`approved`/`finalized` |
| `start_date`  | YYYY-MM-DD | no\*     | Inclusive lower bound |
| `end_date`    | YYYY-MM-DD | no\*     | Inclusive upper bound |
| `limit`       | int 1–100  | no       | Default 25 |
| `cursor`      | string     | no       | Opaque keyset cursor (from previous `page.next_cursor`) |

\* Both dates must be supplied together if either is.

Response shape (`200 OK`):

```json
{
  "data": [
    {
      "id": "10000000-0000-4000-8000-000000000011",
      "team_id": "a1a1a1a1-0000-4000-8000-000000000001",
      "status": "finalized",
      "close_date": "2025-03-05",
      "total_cents": 850000,
      "currency": "USD",
      "created_at": "2025-03-02T10:00:00.000Z",
      "updated_at": "2025-03-05T14:00:00.000Z",
      "allocations": [
        {
          "id": "20000000-0011-4000-8000-000000000001",
          "party_id": "d4d4d4d4-0000-4000-8000-000000000001",
          "party_type": "team_member",
          "percentage": 0.5,
          "amount_cents": 425000
        }
      ]
    }
  ],
  "page": { "has_more": true, "next_cursor": "eyJjbG9zZURh..." }
}
```

Order is `(close_date DESC, id DESC)`. Pagination is keyset — see
[Query approach](#query-approach-and-indexes) below.

### `GET /api/v1/commissions/summary`

Aggregate counts and GCI totals over a period.

| Query param   | Type       | Required |
| ------------- | ---------- | -------- |
| `start_date`  | YYYY-MM-DD | **yes**  |
| `end_date`    | YYYY-MM-DD | **yes**  |
| `team_id`     | UUID       | no       |

Response (`200 OK`):

```json
{
  "commission_count": 9,
  "total_gci_cents": 5220000,
  "by_status": {
    "draft":            { "count": 2, "total_cents":  650000 },
    "pending_approval": { "count": 1, "total_cents":  400000 },
    "approved":         { "count": 2, "total_cents":  930000 },
    "finalized":        { "count": 4, "total_cents": 3240000 }
  },
  "by_party_type": {
    "team_member":    { "count": 9, "total_cents": 2815500 },
    "external_agent": { "count": 5, "total_cents": 1051000 },
    "brokerage":      { "count": 9, "total_cents": 1353500 }
  }
}
```

Empty period: every bucket is present with `{count: 0, total_cents: 0}`.

### `GET /healthz`

Liveness probe. Returns `{"status": "ok"}` with no dependencies. Not
versioned — it's an infra concern.

---

## Design decisions and the alternatives I considered

### URL shape: `/api/v1/commissions/summary` vs `/reports/period-summary`

Picked the resource-scoped shape because the summary aggregates *over*
commissions — it's the same domain object, different view. Putting it
under `/reports` would have introduced a new namespace with one endpoint,
which is premature taxonomy. Versioning lives at `/api/v1` because real
APIs evolve and adding it at the start is one line of routing.

### Pagination: keyset cursor vs offset/page-number

Keyset. Stable under concurrent inserts (offset shifts when new rows
land between requests), and the cost is `O(limit)` regardless of page
depth. Cursor is opaque base64url JSON of `(close_date, id)` —
clients treat it as a black box.

### Validator: zod (manual) vs Fastify JSON Schema

Zod inside the handler. Fastify's built-in Ajv validation rejects
ahead of our handler with its own error shape, which would bypass our
`AppError` mapping. I keep Fastify's `schema` block on each route for
`@fastify/swagger` documentation only (validator compiler is set to a
no-op — see [src/server.ts](./src/server.ts)). Cleaner separation of
"what's documented" from "what's enforced".

### Date range cap: 365 days, returned as 422

Defensive limit so an unbounded "all time" request can't OOM the
database. 422 (Unprocessable Entity) signals "syntactically valid,
semantically rejected by a business rule" — distinct from 400 (parse
failure).

### Empty `team_id` match: 200 zeros vs 404

200 with all-zero buckets. The assignment is explicit: *"a period with
no matching data should return zeros, not an error"*, and we don't have
a `teams` table to look up against. `team_id` is a filter, not a
resource.

### TypeScript: pure DTO mapper, no controller/service layer

Repository owns SQL, route handlers own HTTP shaping, [`src/routes/dto.ts`](./src/routes/dto.ts)
maps entities to snake_case wire format. A "controller" or "service"
would be a one-line passthrough — added complexity, no benefit. The
SKILL.md flag for this rule is "Don't add abstractions for hypothetical
future requirements."

### Schema vs ASSIGNMENT.md discrepancies (caught and resolved)

1. **`party_type` enum.** ASSIGNMENT.md lists `'team' | 'team_member' |
   'external_agent' | 'brokerage'`. The actual `CHECK` constraint at
   `db/init.sql:46` allows only the latter three. The TypeScript
   `AllocationType` union mirrors the constraint, not the doc.
2. **March 2025 GCI total.** A header comment claims `5,200,000`; the
   evaluator-reference table further down (and the actual sum of seeded
   rows) gives `5,220,000`. Tests assert against `5,220,000`.

---

## Query approach and indexes

### Aggregation: three round-trips

The summary endpoint runs three queries against the same `WHERE` shape:

1. headline totals over `commissions`
2. `GROUP BY status` over `commissions`
3. `GROUP BY party_type` over `allocations` joined to `commissions`

Could be folded into one CTE round-trip — left as a follow-up, kept
separate for readability while the response contract stabilizes. The
parameter `$3::uuid IS NULL OR team_id = $3` is the same query for
filtered and unfiltered cases (no dynamic SQL).

Empty buckets are zero-initialized in JS rather than expressed via
`CROSS JOIN unnest(...)` in SQL — keeps the SQL simple and locks the
bucket order in TypeScript.

### List: keyset pagination, eager-loaded relations

`createQueryBuilder` with `leftJoinAndSelect('c.allocations', 'a')`,
`take(limit + 1)` to detect the next page, and tuple comparison
`(close_date, id) < (cursor.closeDate, cursor.id)` for the cursor.
TypeORM applies `take()` correctly on one-to-many JOINs (it pages
parents, then loads children).

There's a subtle TypeORM gotcha: `orderBy('c.close_date', ...)` (column
name) crashes inside its DISTINCT injection pass. The fix is to use the
entity-property path: `orderBy('c.closeDate', ...)`. Comment in
[src/repositories/CommissionRepository.ts](./src/repositories/CommissionRepository.ts)
flags it.

### Indexes added (in `db/init.sql`)

| Index | Backs |
| ----- | ----- |
| `idx_commissions_close_date_id` (close_date DESC, id DESC) | Default list ordering and the keyset-cursor tuple comparison |
| `idx_commissions_team_close_date` (team_id, close_date DESC) | Team-scoped paginated list (most common filter) |
| `idx_commissions_status` | Status-only filter |
| `idx_allocations_commission_id` | Eager-loading allocations + summary's INNER JOIN |

Note that PostgreSQL **does not** auto-index the referencing column of
a foreign key — `idx_allocations_commission_id` is a real correctness
concern, not a hint.

The integration test [test/integration/indexes.test.ts](./test/integration/indexes.test.ts)
asserts (a) every named index exists in `pg_indexes` and (b) the
team-filtered list query plan picks `idx_commissions_team_close_date`
when sequential scan is disabled (necessary trick — at 25 seeded rows
the planner correctly prefers seqscan; the index would dominate at any
realistic data volume).

---

## Testing strategy

```
test/
  setup.ts                         # reflect-metadata + NODE_ENV=test
  integration/
    helpers.ts                     # TEST_DATABASE_URL fallback chain
    healthcheck.test.ts
    db.test.ts                     # DataSource + entity wiring + invariant
    commissionRepository.test.ts
    indexes.test.ts                # pg_indexes + EXPLAIN plan check
    api/
      commissions.test.ts          # 15 tests: filters, pagination, errors
      summary.test.ts              # 12 tests: happy + zero-fill + errors
  unit/
    env.test.ts
    cursor.test.ts                 # encode/decode + malformed inputs
    dto.test.ts                    # entity → wire format
    errors.test.ts                 # AppError + zod issue mapper
    dateRange.test.ts              # 365-day cap, inverted range
```

Counts at HEAD: **72 total** (44 integration, 28 unit), exact-value
assertions throughout against the evaluator reference totals seeded in
`db/init.sql`.

Integration tests connect to a real Postgres — no mocking of the DB layer
or the ORM. The fixture is the canonical seed; we don't shuffle data
per-test. Cross-table invariants (`SUM(allocations.amount_cents) =
commissions.total_cents`) are asserted in both the DB layer test and the
list endpoint test, catching drift either way.

---

## Project layout

```
src/
  config/env.ts                    # zod-validated env loader
  db/
    datasource.ts                  # TypeORM DataSource factory
    transformers.ts                # BIGINT / NUMERIC → JS number
  domain/
    cursor.ts                      # keyset cursor codec (encode/decode)
    dateRange.ts                   # 365-day cap + inverted-range guard
    errors.ts                      # AppError + zod mapper
  entities/
    Commission.ts
    Allocation.ts
  repositories/
    CommissionRepository.ts        # list(), summary(), find by id, count
  routes/
    commissions.ts                 # GET /api/v1/commissions
    summary.ts                     # GET /api/v1/commissions/summary
    dto.ts                         # entity → snake_case wire format
  schemas/
    CommissionsQuery.ts            # zod for list params
    SummaryQuery.ts                # zod for summary params
  server.ts                        # buildApp() Fastify factory
  index.ts                         # process entrypoint
test/                              # see "Testing strategy"
db/init.sql                        # schema + indexes + seed
Dockerfile
.dockerignore
docker-compose.yml
.claude/skills/engineering-standards/SKILL.md
AI_USAGE.md
```

---

## Troubleshooting

**`docker compose up` fails to bind 5432 or 3000.** Stop the conflicting
service or change the host port mapping in `docker-compose.yml`.

**Indexes missing or `commissions` table empty.** The pg volume was
created with stale data. Run `docker compose down -v && docker compose
up -d` to recreate from `init.sql`.

**Container can't find `@fastify/swagger`.** Anonymous `node_modules`
volume is stale after a dependency change. Run `docker compose up -d
--build --renew-anon-volumes`.

---

## What I'd do with more time

- **Single-CTE summary query.** Three round-trips are clear but suboptimal
  on a slow DB; one CTE returning JSON would halve latency.
- **OpenAPI spec from zod.** `fastify-type-provider-zod` would derive
  the swagger spec from a single source instead of maintaining two
  schema definitions per endpoint. Higher upfront cost, lower drift
  risk long-term.
- **Auth + per-team authorization.** Today any client can read every
  team's data. A real deployment would gate by JWT + per-team membership.
- **Logging redaction + request IDs.** Pino is configured but I haven't
  wired `redact:` for known sensitive headers, nor a stable `genReqId`
  for cross-service tracing.
- **Property tests** for the cursor codec — fast-check would catch
  edge cases the example-based tests don't.
- **Migrations.** Today the schema is owned by `db/init.sql`. For
  anything beyond a take-home, switch to a migration runner.
