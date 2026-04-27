---
name: engineering-standards
description: Coding, testing, refactoring, and data-consistency standards for the commission reporting service. Apply on any code change in this repository — implementation, tests, queries, or docs.
---

# Engineering Standards — Commission Reporting Service

These are the standards every change in this repo must follow. They exist to
keep the code small, the tests honest, and the data correct.

---

## Test-driven development (TDD)

The non-negotiable workflow:

1. **Red** — write a failing test that captures the behavior you intend to add.
   Run the suite. See it fail with the expected reason (not a typo or import
   error).
2. **Green** — write the minimum code that makes the test pass.
3. **Refactor** — only with green tests, only for a concrete improvement
   (clarity, removing duplication you can name). Do not refactor speculatively.

Commit at every green. Smaller commits are better than larger ones.

If you cannot frame a feature as a test, the feature is under-specified — stop
and clarify with the user before coding.

---

## Testing rules

- **Integration tests run against a real PostgreSQL database.** Do not mock the
  DB layer, the ORM, or the `pg` client. Connect over TCP every time.
- **Unit tests** cover pure functions: validators, mappers, pagination cursor
  codecs, error formatters. They do not touch I/O.
- **Assert exact values against known seed data**, not "something came back".
  The seed gives us evaluator reference totals
  (e.g. `5,220,000` cents for March 2025) — assert those.
- **Cover edge cases**, not just the happy path. For each endpoint test:
  empty result, invalid input, boundary values (date inclusivity, pagination
  edges), and at least one cross-table invariant where applicable.
- Use Fastify's `app.inject()` instead of binding a real port — tests stay
  fast and don't fight over ports.

---

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`. These are turned on in `tsconfig.json` and
  must stay on.
- **No `any`.** If a value's type is unknown at the boundary, type it as
  `unknown` and narrow with a guard or a zod schema.
- **Use string-literal unions or enums for finite sets** (statuses, party
  types, error codes). Bare `string` where a union applies is a code smell.
- Avoid `as` casts unless you've already proven the narrower type to the
  reader (e.g. immediately after a successful zod parse).
- Keep functions small. Extract helpers when complexity grows, but **do not**
  abstract preemptively. Three similar lines is better than a wrong shared
  helper.

---

## Money & numeric values

- Money is **always integer cents**. `BIGINT` in the schema, `number` (or
  `bigint` if it ever overflows) in TypeScript. **Never use floats for
  money.**
- The pg type-parser layer converts BIGINT (OID 20) to JS `number`. This is
  safe up to `Number.MAX_SAFE_INTEGER` (~9e15). One trillion USD is 1e14
  cents, so we have ~90× headroom. If we ever exceed it, switch to `bigint`
  end-to-end (and update JSON serialization accordingly).
- Compute aggregates in SQL (`SUM`, `COUNT`, `GROUP BY`). Do not pull rows
  into JS to sum them — that loses the database's atomic view and invites
  N+1.
- `NUMERIC(6,4)` percentages are converted to JS `number` — a float is more
  than precise enough for percentages with 4 decimal places.

---

## Database & queries

- **All SQL is parameterized.** No string interpolation of user input. Ever.
  Even "internal" code paths.
- **No N+1.** When fetching parents with children, either:
  - use a single query with `json_agg`/`json_build_object` aggregating
    children inline, or
  - paginate the parents, then batch-load children with `WHERE
    parent_id = ANY($1)`.
- **Add indexes for the access patterns you actually use.** Document them in
  the README and explain *why* they exist — the index choice is being
  evaluated.
- **Verify with `EXPLAIN`** when an index choice is non-obvious. Commit the
  expected plan in a comment if it matters.
- **Wrap multi-step writes in a transaction.** This service is read-only
  today, but the rule applies the moment that changes.
- **The database is the source of truth.** Don't recompute aggregates the SQL
  can give you. Don't re-validate constraints the schema already enforces.

---

## Data consistency

- **DB constraints are the first line of defense** — `CHECK`, `FOREIGN KEY`,
  `NOT NULL`. Trust them. Don't duplicate the same check in app code.
- **App-level validation lives at the HTTP boundary** (zod schemas on routes).
  Internal functions trust their inputs and are typed accordingly.
- **For every aggregation, write an invariant test.** Example: `SUM(allocations.amount_cents) = commissions.total_cents` for every commission.
  This catches both type-parser regressions (BIGINT precision) and seed
  corruption.
- **Treat enum drift as a bug.** The assignment doc lists a `'team'` party
  type, but the `CHECK` constraint only allows three. Code to the constraint;
  document the discrepancy in the README. **Never silently widen an enum
  because the docs disagree** — fix one or the other deliberately.
- **Money invariants must hold exactly** — no float drift tolerated. Use
  integer arithmetic, assert with `===` not "approximately equal".

---

## Refactoring discipline

- Refactor only with green tests. If you need to change behavior, do that in a
  separate red→green cycle.
- **Don't carry "fix this later" comments** in committed code. Either fix it
  now, or write the followup as a task / issue.
- **Don't add abstractions for hypothetical future requirements.** YAGNI.
- **Don't add backwards-compatibility shims** in this codebase. We're not
  shipping a library — we're delivering a take-home. Change the code outright;
  delete what's dead.
- **Don't add error handling, fallbacks, or validation for scenarios that
  cannot happen.** Trust internal types and DB constraints. Validate only at
  system boundaries.

---

## API design

- **One error shape**: `{ code, message, details? }`. `code` is a stable
  string constant (`VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`). Do not
  leak raw DB errors or stack traces.
- **HTTP semantics** matter:
  - 200 — success (including empty results)
  - 400 — validation failure
  - 404 — resource genuinely missing (use sparingly; an empty list isn't a 404)
  - 500 — unexpected server error
- **Empty results aren't errors.** A period summary with no matching commissions
  returns zeros for every bucket, not a 404. The assignment is explicit about
  this.
- **Validate inputs at the route boundary** with zod. Reject early, return a
  helpful `details` payload listing every invalid field.

---

## Documentation

- **TSDoc on every exported function, type, and route.** Explain *why*, not
  *what* — the code shows what. If a comment would just restate the
  identifier, don't write it.
- **Each non-trivial SQL query has a header comment** describing intent and
  which index it relies on.
- **The README owns the design rationale.** When a decision has alternatives,
  list the ones you considered and rejected, and why. The reasoning is being
  evaluated as much as the result.
- **`AI_USAGE.md` is required.** Record every AI tool used: what was accepted,
  what was modified, what was rejected and why, and what the AI got wrong
  that you had to correct. The assignment is explicit that this will be
  discussed in the technical interview.

---

## Commit hygiene

- One logical change per commit.
- Commit at every green TDD step.
- Imperative subject under 70 characters (`add /healthz route`, not `Added the
  health check`). Body explains *why* if non-obvious.
- Don't bypass hooks (`--no-verify`) without an explicit reason recorded in
  the commit body.

---

## Security

- **Validate every external input** with zod at the route boundary.
- **Parameterize every SQL statement.** No `${}` interpolation of values into
  query text. Identifiers (table/column names) chosen from a finite set are
  acceptable but should be checked against an allowlist.
- **Never log secrets.** Configure pino redactions if any are added.
- **Don't bypass safety checks** to make an obstacle go away. Investigate the
  root cause.
