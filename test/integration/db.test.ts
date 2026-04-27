import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { TEST_DATABASE_URL } from './helpers.js';

/**
 * Verifies the `pg.Pool` factory can be constructed against the
 * Docker-Compose-provided database and that the seeded schema is reachable.
 *
 * Per the assignment, integration tests run against a real database — no
 * mocking of the DB layer.
 */
describe('database pool', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool({ connectionString: TEST_DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('runs a trivial query', async () => {
    const res = await pool.query<{ ok: number }>('SELECT 1::int AS ok');
    expect(res.rows[0]).toEqual({ ok: 1 });
  });

  it('reaches the seeded schema (commissions and allocations contain rows)', async () => {
    const res = await pool.query<{ commissions: number; allocations: number }>(`
      SELECT
        (SELECT COUNT(*) FROM commissions)  AS commissions,
        (SELECT COUNT(*) FROM allocations)  AS allocations
    `);
    const row = res.rows[0];
    expect(typeof row?.commissions).toBe('number');
    expect(typeof row?.allocations).toBe('number');
    expect(row?.commissions).toBeGreaterThan(0);
    expect(row?.allocations).toBeGreaterThan(0);
  });

  it('returns commission.total_cents as a positive integer JS number (BIGINT parser)', async () => {
    const res = await pool.query<{ total_cents: number }>(
      'SELECT total_cents FROM commissions LIMIT 1',
    );
    const v = res.rows[0]?.total_cents;
    expect(typeof v).toBe('number');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });

  it('returns allocation.amount_cents as a positive integer JS number (BIGINT parser)', async () => {
    const res = await pool.query<{ amount_cents: number }>(
      'SELECT amount_cents FROM allocations LIMIT 1',
    );
    const v = res.rows[0]?.amount_cents;
    expect(typeof v).toBe('number');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });

  it('returns allocation.percentage as a JS number in (0, 1] (NUMERIC parser)', async () => {
    const res = await pool.query<{ p: number }>(
      'SELECT percentage AS p FROM allocations LIMIT 1',
    );
    const p = res.rows[0]?.p;
    expect(typeof p).toBe('number');
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  /*
   * Cross-table invariant from the assignment seed: allocations always
   * sum to 100% of the commission total, so SUM(amount_cents) per
   * commission must equal commissions.total_cents — exactly, with no
   * float drift. This proves three things in one test:
   *   1. the JOIN works
   *   2. BIGINT arithmetic survives our type parser without precision loss
   *   3. the seed data we are about to assert against is internally consistent
   */
  it('allocations sum exactly to total_cents for every commission', async () => {
    const res = await pool.query<{
      id: string;
      total_cents: number;
      allocations_sum: number;
    }>(`
      SELECT
        c.id,
        c.total_cents,
        COALESCE(SUM(a.amount_cents), 0)::bigint AS allocations_sum
      FROM commissions c
      LEFT JOIN allocations a ON a.commission_id = c.id
      GROUP BY c.id
    `);
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.allocations_sum).toBe(row.total_cents);
    }
  });
});
