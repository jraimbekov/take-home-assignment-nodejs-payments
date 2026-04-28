# Commission Reporting Service

A read-only reporting API built on top of a pre-seeded PostgreSQL database of
commissions and allocations. See [ASSIGNMENT.md](./ASSIGNMENT.md) for the
business context and requirements.

> **Status:** TypeORM entities, `CommissionRepository`, and Dockerized API
> service wired. Reporting endpoints to follow.

---

## Prerequisites

The container path needs **only Docker** — Node, TypeORM, Fastify and the
rest of the stack are baked into the `api` image.

- **Docker** with the `docker compose` plugin (Docker Desktop or Colima)

Optional (for host-side development):

- **Node.js** 18+ and **npm** 9+

Verify:
```bash
docker compose version
node --version    # only if running on host
```

---

## Getting started — Docker (recommended, zero local install)

`docker compose up` builds the API image and starts both services.

```bash
docker compose up --build       # foreground; Ctrl-C to stop
# or
docker compose up -d --build    # detached
```

Services:

| Service | Port | Notes |
| ------- | ---- | ----- |
| `db`    | 5432 | postgres:16-alpine, seeded from `db/init.sql` on first start |
| `api`   | 3000 | Fastify + TypeORM, runs `tsx watch src/index.ts` (hot-reloads on host edits) |

The `api` waits for `db` to be healthy before starting (`depends_on:
condition: service_healthy`).

Smoke-test the liveness probe:

```bash
curl -i http://localhost:3000/healthz
# HTTP/1.1 200 OK
# {"status":"ok"}
```

Stop:
```bash
docker compose down       # keeps the data volume
docker compose down -v    # also wipes the DB volume; init.sql re-runs next start
```

### Running tests in the container

```bash
docker compose exec -T api npm test          # all tests
docker compose exec -T api npm run typecheck # tsc --noEmit
```

The integration tests connect to `db:5432` automatically because compose
sets `DATABASE_URL` inside the `api` container; the test helper falls back
through `TEST_DATABASE_URL → DATABASE_URL → localhost`.

---

## Getting started — host-side (optional)

Useful if you want native debugger attach, faster cold start, or are
already living in the project shell.

```bash
docker compose up -d db   # only the database
npm install
cp .env.example .env
npm run dev               # tsx watch
npm test                  # vitest run
```

`.env` reads:

| Var            | Default                                                          | Notes |
| -------------- | ---------------------------------------------------------------- | ----- |
| `DATABASE_URL` | `postgres://commissions:commissions@localhost:5432/commissions`  | Used by the running service. |
| `PORT`         | `3000`                                                           | HTTP listen port. |
| `LOG_LEVEL`    | `info`                                                           | Pino level: `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent`. |
| `NODE_ENV`     | `development`                                                    | `test` silences the logger. |

---

## Test layout

| Path                                         | Scope        | Talks to a real DB? |
| -------------------------------------------- | ------------ | ------------------- |
| `test/unit/**.test.ts`                       | Pure logic   | No                  |
| `test/integration/**.test.ts`                | HTTP + SQL   | **Yes**             |

Integration tests are not mocked at the DB layer (per the assignment). They
use the TypeORM `DataSource` factory in [src/db/datasource.ts](./src/db/datasource.ts)
and assert exact values against known seed rows from `db/init.sql`.

---

## Project layout (current)

```
src/
  config/
    env.ts                      # zod-validated env loader
  db/
    datasource.ts               # TypeORM DataSource factory
    transformers.ts             # BIGINT / NUMERIC → JS number transformers
  entities/
    Commission.ts               # commissions table
    Allocation.ts               # allocations table (FK -> commission_id)
  repositories/
    CommissionRepository.ts     # commission queries (count, findByIdWithAllocations)
  server.ts                     # buildApp() Fastify factory
  index.ts                      # process entrypoint
test/
  setup.ts                      # reflect-metadata + NODE_ENV=test
  integration/
    helpers.ts                  # TEST_DATABASE_URL resolution
    healthcheck.test.ts
    db.test.ts                  # DataSource + entity + invariant
    commissionRepository.test.ts
  unit/
    env.test.ts
db/
  init.sql                      # schema + seed (mounted into the db container)
Dockerfile
.dockerignore
docker-compose.yml
.claude/skills/engineering-standards/SKILL.md
```

---

## Schema vs ASSIGNMENT.md discrepancies (caught and resolved)

While reading `db/init.sql` I noticed two places where the prose diverges from
the live schema. The schema is treated as the source of truth in this code.

1. **`party_type` enum.** ASSIGNMENT.md lists `'team' | 'team_member' |
   'external_agent' | 'brokerage'`, but the actual `CHECK` constraint at
   `db/init.sql:46` only allows three (`'team_member' | 'external_agent' |
   'brokerage'`). The `AllocationType` union in [Allocation.ts](./src/entities/Allocation.ts)
   matches the constraint.

2. **March 2025 GCI total.** A header comment claims `5,200,000`, while the
   evaluator-reference table further down (and the actual sum of seeded
   rows) gives `5,220,000`. Tests will assert against the latter.

---

## Troubleshooting

**`docker compose up` fails to bind to port 5432 or 3000.** Stop the
conflicting service or change the host port mapping in
`docker-compose.yml`.

**`commissions` table is missing rows.** The volume was created with no data
(e.g. the container started before `init.sql` was mounted). Run
`docker compose down -v && docker compose up -d` to recreate from seed.

**`tsx watch` doesn't pick up host edits inside the container.** Make sure
the bind mounts in `docker-compose.yml` resolve — on macOS with Colima,
ensure the project path is inside the VM's mount root.

---

## What's next

Coming sections (added as endpoints land):

- API reference (paths, query parameters, error codes, examples)
- Design decisions and alternatives considered
- Query approach and indexes added
- Testing strategy in detail
- What I'd improve with more time
