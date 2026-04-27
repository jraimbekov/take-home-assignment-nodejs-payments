/**
 * Resolution of the database URL for integration tests.
 *
 * Defaults to the dev database on :5432 (the same one `docker compose up`
 * brings up). Override via the `TEST_DATABASE_URL` env var to point tests
 * at a dedicated test DB once one is added in a later step.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://commissions:commissions@localhost:5432/commissions';
