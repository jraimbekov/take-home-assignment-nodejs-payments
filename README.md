# Commission Reporting Service

A read-only reporting API built on top of a pre-seeded PostgreSQL database of
commissions and allocations. See [ASSIGNMENT.md](./ASSIGNMENT.md) for the
business context and requirements.

> **Status:** TypeORM entities + integration tests wired. Reporting endpoints to follow.

---

## Prerequisites

- **Node.js** 18+ (developed on 25 — any modern LTS works)
- **Docker** with the `docker compose` plugin (Docker Desktop or Colima)
- **npm** 9+ (ships with Node 18+)

Verify:
```bash
node --version
npm --version
docker compose version
```

---

## Getting started

### 1. Start the database

The database container ships seed data via `db/init.sql` — schema + 25
commissions and 65 allocations across three teams over Jan–Apr 2025.

```bash
docker compose up -d
```

This binds Postgres to `localhost:5432`. Credentials and database name are all
`commissions` (see [docker-compose.yml](./docker-compose.yml)).

To stop:
```bash
docker compose down       # keeps the data volume
docker compose down -v    # wipes the volume; init.sql re-runs on next start
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Configure environment

Copy the example file and adjust if you changed the compose defaults:

```bash
cp .env.example .env
```

Required variables:

| Var            | Default                                                          | Notes |
| -------------- | ---------------------------------------------------------------- | ----- |
| `DATABASE_URL` | `postgres://commissions:commissions@localhost:5432/commissions`  | Used by the running service. |
| `PORT`         | `3000`                                                           | HTTP listen port. |
| `LOG_LEVEL`    | `info`                                                           | Pino level: `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent`. |
| `NODE_ENV`     | `development`                                                    | `test` silences the logger automatically. |

### 4. Run the service

```bash
npm run dev      # tsx watch — auto-restarts on changes
# or
npm start        # tsx — single run, no watch
```

Smoke-test the liveness probe:

```bash
curl -i http://localhost:3000/healthz
# HTTP/1.1 200 OK
# {"status":"ok"}
```

---

## Running tests

```bash
npm test           # one-shot run, exits cleanly
npm run test:watch # watch mode
npm run typecheck  # tsc --noEmit
```

### Test layout

| Path                                         | Scope        | Talks to a real DB? |
| -------------------------------------------- | ------------ | ------------------- |
| `test/unit/**.test.ts`                       | Pure logic   | No                  |
| `test/integration/**.test.ts`                | HTTP + SQL   | **Yes**             |

Integration tests are not mocked at the DB layer (per the assignment). They
default to the dev DB on `:5432`. Set `TEST_DATABASE_URL` to point at a
dedicated test database once one is added.

The DB container must be running (`docker compose ps` to verify) before
running integration tests.

---

## Project layout (current)

```
src/
  config/
    env.ts          # zod-validated env loader
  db/
    transformers.ts # TypeORM transformers for BIGINT/NUMERIC columns
  entities/
    Commission.ts   # TypeORM entity for commissions table
    Allocation.ts   # TypeORM entity for allocations table
  server.ts         # buildApp() Fastify factory (used by tests too)
  index.ts          # process entrypoint — boots HTTP server
test/
  integration/
    helpers.ts      # TEST_DATABASE_URL
    db.test.ts      # TypeORM DataSource + entity loading + invariant tests
    healthcheck.test.ts
  unit/
    env.test.ts     # env loader edge cases
db/
  init.sql          # schema + seed (mounted into the DB container)
docker-compose.yml
```

---

## Troubleshooting

**`npm test` fails with a connection error.** The DB container isn't running.
Check `docker compose ps`; if missing, `docker compose up -d`.

**Port 5432 is already in use.** Either stop the conflicting service or change
the port mapping in `docker-compose.yml` and update `DATABASE_URL`.

**`commissions` table is missing rows.** The volume was created with no data
(e.g. the container started before `init.sql` was mounted). Run
`docker compose down -v && docker compose up -d` to recreate from seed.

---

## What's next

This README will grow alongside the implementation. Upcoming sections:

- API reference (endpoints, query parameters, error codes, examples)
- Design decisions and alternatives considered
- Query approach and indexes added
- Testing strategy in detail
- What I'd improve with more time
