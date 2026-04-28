# AI Usage
_Last updated: 2026-04-28 — reflects final submission state_

I used **Claude Code (Sonnet/Opus)** as a pair programmer to accelerate implementation. All business decisions, API contracts, test strategies, security considerations, and acceptance criteria were mine. The AI handled boilerplate, code generation, and refactoring under my direction with continuous review.

## What I owned (business & technical decisions)

- **Design Judgment**: Navigated the summary endpoint ambiguity — chose three separate queries over a CTE (simplicity over premature optimization), rejected a service layer (YAGNI), made the schema the source of truth when assignment doc conflicted with `db/init.sql`
- **API Design**: Defined response shapes, error codes (`validation_failed`, `not_found`, `internal_server_error`), appropriate HTTP statuses (400/404/500), and the cursor encoding scheme
- **Query Design**: Keyset pagination with tuple comparison (no `OFFSET`), three intentional round-trips for summary (not an N+1 — each is a single aggregate query), verified index usage matches query patterns
- **TypeScript**: Enforced `strict` + `noUncheckedIndexedAccess`, used branded types for `CommissionId`, discriminated unions for error handling, no `any`
- **Testing**: Real PostgreSQL in integration tests, invariant-based assertions (`SUM(amount_cents) = total_cents` for every allocation), edge cases (date range validation, empty results, malformed cursor), plus a smoke test that exercises the actual entrypoint
- **Code Clarity**: Routes handle HTTP concerns (validation, serialization), repository owns data access, no leaky abstractions

## Security considerations (my decisions)

| Concern | Implementation |
|---------|----------------|
| **SQL injection** | Raw SQL in keyset cursor uses parameterized placeholders (`$1, $2`), never string interpolation. TypeORM queries use its parameterized API. Verified in repository tests. |
| **Input validation** | Zod schemas with strict parsing (`start_date`/`end_date` as ISO dates, cursor as base64url). Fastify's Ajv disabled to prevent validation bypass. |
| **Error leakage** | Global error handler maps unknown errors to opaque `internal_server_error` (no stack traces, no query details). Only `AppError` types reach the client with safe messages. |
| **Graceful shutdown** | `SIGINT`/`SIGTERM` handlers close TypeORM connection and Fastify server. Prevents connection leaks on container restart. |
| **Rate limiting** | Not implemented — per assignment scope (internal admin API, trusted caller). Would add `@fastify/rate-limit` if exposing externally. |
| **Authentication** | Omitted per assignment requirements. Documented in README: "Assumes internal network; add API key middleware for production." |

## What the AI accelerated

### Scaffolding and automation
- Bootstrapped TypeScript/Fastify/Vitest configuration
- Set up TypeORM `DataSource` with custom `ValueTransformer`s for BIGINT/NUMERIC
- Generated initial entity classes and repository method skeletons
- Wrote first-pass zod schemas, DTO mappers, and cursor codec
- Generated test skeletons following my red-green-refactor instructions

### TDD workflow
For each feature, I directed the cycle:
1. I specified the failing test case and expected behavior
2. AI implemented minimal code to pass
3. I reviewed, ran tests, and approved or requested changes
4. AI refactored with my guidance

This applied to summary endpoint (three-query approach), list endpoint (keyset cursor with parameterized SQL), date range validation, and error handling.

## What I corrected or rejected

| Decision | AI's suggestion | My ruling |
|----------|----------------|-----------|
| Abstraction level | Service layer between routes and repo | Rejected (YAGNI) |
| `AllocationType` | Included `'team'` from assignment doc | Corrected to match actual DB `CHECK` constraint |
| Test quality | `COUNT(*) === 25` | Replaced with invariant `SUM(amount_cents) = total_cents` |
| Validation | Fastify Ajv with `required` fields | Disabled Ajv, zod as sole validator |
| Filename casing | PascalCase `.ts` files | Renamed to camelCase (Node convention) |
| Docker Compose | `api` service started by default | Moved behind `profiles: ["full"]` to match assignment flow |
| Commit messages | `Co-Authored-By` trailers, verbose bodies | Terse imperative, no attribution |
| Schema location | Inline OpenAPI blobs in route files | Extracted to `src/routes/schemas.ts` for readability |

## Bugs caught and fixed

| Bug | Root cause | Fix | How tested |
|-----|-----------|-----|-------------|
| TypeORM `orderBy` crash | Used DB column `'c.close_date'` instead of entity property `'c.closeDate'` | Use property path | Integration test with joined query |
| Stale `node_modules` in container | Anonymous volume cached old deps | `--renew-anon-volumes` | Manual verification |
| BIGINT as string | No transformer on `@Column` | Added `bigintToNumber` | Type assertion test |
| Missing DataSource in production | Entrypoint called `buildApp()` with no datasource | Entrypoint initializes DataSource + smoke test | Smoke test (added after gap identified) |

## Testing strategy (aligned to assessment)

| Test type | Coverage | Example |
|-----------|----------|---------|
| **Integration (real DB)** | Repository methods, aggregations, pagination | `CommissionRepository.list` with cursor, `summary` with date filters |
| **Invariant assertions** | Cross-table consistency | `SUM(amount_cents) = total_cents` for every commission row |
| **Edge cases** | Empty results, malformed cursor, invalid dates, future dates | `start_date` after `end_date` → 400, expired cursor → empty list |
| **Smoke** | Entrypoint, container startup, actual HTTP listener | Verifies production `index.ts` paths work |
| **Unit** | Cursor encoding/decoding, DTO mapping, error codes | No DB, pure function tests |

## What I'd do differently with unlimited time

- **Observability**: Add request ID logging, OpenTelemetry metrics for endpoint latency
- **Migration strategy**: Add TypeORM migrations (currently schema is `db/init.sql` only)
- **Composite indexes**: Add `(close_date, id)` for keyset cursor performance at scale
- **Rate limiting**: `@fastify/rate-limit` if exposing externally

## Tools used

- **Claude Code (Anthropic)** — paired programming accelerator (boilerplate, test skeletons, refactoring)
- **No other AI tools** (no Cursor, Copilot, or ChatGPT)

I wrote, reviewed, or explicitly approved every line before commit. The AI never executed code, made architectural decisions, or committed security-sensitive code without my review.

---

## Summary across assessment dimensions

| Dimension | How I owned it |
|-----------|----------------|
| **Design Judgment** | Chose simplicity (3 queries over CTE, YAGNI on service layer). Documented trade-offs. |
| **API Design** | Consistent error codes, HTTP semantics, cursor encoding. Security decisions explicit. |
| **Query Design** | Keyset pagination (no OFFSET), parameterized SQL, no N+1. |
| **TypeScript** | `strict`, branded types, discriminated unions, no `any`. |
| **Testing** | Real DB, invariant assertions, smoke test for entrypoint. |
| **Code Clarity** | Clean HTTP/data separation, schemas extracted, no leaky abstractions. |