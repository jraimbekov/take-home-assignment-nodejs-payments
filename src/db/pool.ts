import pg from 'pg';

const { Pool, types } = pg;

/*
 * Type parsers.
 *
 * `node-postgres` returns BIGINT (OID 20) and NUMERIC (OID 1700) as strings
 * by default to avoid silent precision loss. For this reporting service we
 * convert eagerly:
 *
 *   - BIGINT cents totals stay well under Number.MAX_SAFE_INTEGER (~9e15) at
 *     any realistic financial scale (1 trillion USD = 1e14 cents). Number is
 *     therefore safe and gives ergonomic, correctly-typed call sites.
 *   - NUMERIC percentages are constrained to NUMERIC(6,4) per the schema; a
 *     JS number is more than precise enough for percentages.
 *
 * If we ever need to handle truly arbitrary-precision NUMERIC, we can revisit
 * — but it would require BigInt/decimal-string handling end-to-end.
 */
types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT  → number
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC → number

export interface CreatePoolOptions {
  /** PostgreSQL connection URL, e.g. `postgres://user:pw@host:5432/db`. */
  connectionString: string;
  /** Maximum number of clients in the pool. Default: 10. */
  max?: number;
}

/**
 * Construct a `pg.Pool`.
 *
 * Lifecycle ownership belongs to the caller — invoke `await pool.end()` on
 * shutdown (or wire it as a Fastify `onClose` hook in the application).
 */
export function createPool(opts: CreatePoolOptions): pg.Pool {
  return new Pool({
    connectionString: opts.connectionString,
    max: opts.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
