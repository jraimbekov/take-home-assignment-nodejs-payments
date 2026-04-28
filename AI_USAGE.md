# AI Usage

I built this take-home in a paired-programming flow with **Claude Code
(Sonnet/Opus)**, the official CLI agent for Anthropic's Claude. The
agent could read and edit files, run shell commands (`docker compose`,
`npm`, `git`), and inspect logs; I drove the direction and
authorized risky actions explicitly.

This file documents that workflow honestly: what I asked for, what I
accepted, what I changed, and what the AI got wrong.

---

## What the AI did

### Scaffolding and orchestration
- Bootstrapped the TypeScript / Fastify / Vitest project (package.json,
  tsconfig with `strict + noUncheckedIndexedAccess`, Dockerfile,
  `docker-compose.yml` with the `api` service depending on `db:
  service_healthy`).
- Set up the TypeORM `DataSource` factory and the BIGINT/NUMERIC
  `ValueTransformer`s (`bigintToNumber`, `numericToNumber`) in
  `src/db/transformers.ts`.
- Wrote the Fastify `buildApp` factory and the global error handler
  (`AppError` → typed `{code, message}` body, fall-through to opaque
  `internal_server_error`).
- Defined the entity classes (`Commission`, `Allocation`) with
  decorators and the `OneToMany` / `ManyToOne` relation.
- Wrote the `CommissionRepository` (`count`, `findByIdWithAllocations`,
  `summary`, `list`) — the SQL aggregations for the summary endpoint
  and the keyset-cursor pagination for the list endpoint were
  AI-drafted, then I reviewed and (in one case) corrected.
- Wrote the zod schemas, the cursor codec
  (`src/domain/cursor.ts`), the date-range validator
  (`src/domain/dateRange.ts`), and the DTO mappers
  (`src/routes/dto.ts`).
- Wrote almost all tests outside-in (red → green): the model proposed
  the failing test, I confirmed the contract, the model implemented
  the minimum to pass.

### Documentation
- Drafted this `README.md`, the `.claude/skills/engineering-standards/
  SKILL.md`, and per-file TSDoc comments. I edited several sections
  for tone and trimmed over-explanation.

### Operations
- Ran `docker compose` lifecycle, executed `npm test` per cycle,
  diagnosed test failures (including a TypeORM internal bug —
  see "Bugs the AI surfaced and fixed" below).

---

## What I accepted as-is
- The TDD workflow itself — red → green → commit per increment.
- The `AppError` shape, the error code catalog, and the zod-issue →
  AppError mapper.
- The cursor encoding (`base64url` of `{closeDate, id}` JSON) and the
  tuple-comparison cursor SQL.
- The decision to run the summary as three round-trips instead of one
  CTE — explicitly noted as a deliberate trade-off in the README.
- Docker Compose layout (`api` + `db`, anonymous `node_modules`
  volume, hot-reload bind mounts).

---

## What I changed or pushed back on
- **Commit messages.** Default Claude Code commits include a
  `Co-Authored-By: Claude` trailer and write multi-paragraph bodies. I
  rejected both — preferred terse imperative subjects, no AI trailer.
  This now lives in the agent's per-project memory so subsequent
  commits skip the trailer automatically.
- **Service / controller layer.** The model offered to add a
  controller-and-service split between routes and the repository. We
  decided against it — the would-be service would be a one-line
  passthrough, and the SKILL.md rule "don't add abstractions for
  hypothetical future requirements" applies. Documented in
  `README.md > Design decisions`.
- **`AllocationType` enum.** The model initially included the `'team'`
  party type listed in `ASSIGNMENT.md`, but the actual `CHECK`
  constraint at `db/init.sql:46` allows only three. I had it remove
  `'team'` and document the discrepancy in the README. Treating the
  schema as the source of truth is now a SKILL.md rule.
- **Tests asserting `COUNT(*) === 25`.** The first DB integration test
  hard-coded the seed size. I asked for value/type assertions instead
  — the test was rewritten to check `BIGINT → number` coercion and the
  cross-table invariant `SUM(amount_cents) = total_cents` for every
  row, which is far more robust to seed evolution.
- **Fastify schema validation.** Initial route schemas had `required:
  ['start_date', 'end_date']` enforced by Fastify's Ajv. That short-
  circuited zod and produced a `500` instead of a `400` because
  Fastify's validation error didn't match `AppError`. The model and I
  iterated to: keep Fastify schemas for swagger docs only, and
  set `setValidatorCompiler(() => () => true)` so zod is the sole
  validator.
- **README scope.** The agent's first README was a runbook. I asked it
  to document design decisions, alternatives considered, and a "what
  I'd do with more time" section — those are explicitly evaluated.

---

## Bugs the AI surfaced and fixed
- **TypeORM `orderBy` crash.** `orderBy('c.close_date', 'DESC')` (DB
  column name) threw `Cannot read properties of undefined (reading
  'databaseName')` inside TypeORM's DISTINCT-injection pass for joined
  one-to-many relations with `take()`. The fix is the entity property
  path: `orderBy('c.closeDate', 'DESC')`. Comment in the repository
  flags it for the next reader.
- **Stale `node_modules` in container.** After adding `@fastify/swagger`
  the container couldn't resolve it. The anonymous volume cached the
  old `node_modules` from the original `npm ci`. Fix: `docker compose
  up -d --build --renew-anon-volumes`. Documented in README
  troubleshooting.
- **TypeORM bigint as string.** Without an explicit transformer, BIGINT
  columns came back as strings, breaking exact-value assertions. The
  `bigintToNumber` transformer fixes it; rationale (safe within
  `Number.MAX_SAFE_INTEGER`, ~90× headroom over a trillion-USD figure
  in cents) is in `src/db/transformers.ts`.

---

## What the AI got wrong (and I had to correct)
- **Filename typo.** Created `src/schemas/CommisionsQuery.ts` (missing
  the second `s`). I renamed it to `CommissionsQuery.ts` and updated
  imports.
- **Missing `commissions` decorator before refactor.** When I asked it
  to retrofit `app.decorate('commissions', ...)` into the summary
  endpoint, it forgot to do the matching update in
  `src/routes/summary.ts` until I re-ran the tests and pointed at the
  failure.
- **Initial commit messages overran.** First attempt was a 12-line
  body before I shut it down. Second attempt was a one-liner with the
  `Co-Authored-By: Claude` trailer. Third attempt was just `Initial
  setup`. (See "What I changed or pushed back on" above.)
- **Periods of over-eagerness.** A few times the agent wanted to spawn
  background research subagents for tasks I could answer inline. I
  declined; subagents start cold and burn context for shallow work.

---

## What I would have done differently with no AI

I would still have shipped both endpoints, the test suite, and the
Docker setup, but slower and probably with:

- **More boilerplate.** The repetitive bits (zod schemas, DTO mappers,
  per-route swagger schemas) take longer to type than to review.
- **Worse documentation.** I'd have written the README and TSDoc
  comments as a final pass instead of inline; some context is always
  lost that way.
- **Fewer tests.** Specifically, the unit tests (`cursor`, `dto`,
  `errors`, `dateRange`) were cheap to add because the AI proposed
  them on its own initiative and I just reviewed.

---

## Tools and prompts used

- **Claude Code (Anthropic CLI agent)** — primary driver. The agent
  files I committed live at `.claude/skills/engineering-standards/
  SKILL.md`. They encode the standards we agreed on (TDD, money
  handling, data-consistency invariants, refactoring discipline) so
  future sessions stay consistent.
- I did not use Cursor / Copilot / ChatGPT for this assignment.
- I did not paste code from any other AI tool.

I'm prepared to walk through any line of this codebase in the
technical interview — including the lines the AI wrote first that I
edited or replaced.
