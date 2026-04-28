/**
 * Resolution of the database URL for integration tests.
 *
 * Resolution order:
 *   1. `TEST_DATABASE_URL` — the explicit knob (point tests at a dedicated
 *      test DB once one is added in a later step).
 *   2. `DATABASE_URL` — set inside the `api` container by `docker compose`
 *      so `docker compose run --rm api npm test` works without further env
 *      plumbing.
 *   3. Hardcoded localhost — the default for host-side `npm test` against
 *      the `db` service exposed on port 5432.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://commissions:commissions@localhost:5432/commissions';
