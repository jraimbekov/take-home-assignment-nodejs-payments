import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../../src/db/datasource.js';
import { TEST_DATABASE_URL } from './helpers.js';

/*
 * Index regression tests.
 *
 * The indexes in `db/init.sql` exist to back specific access patterns of
 * the reporting API. Two safety nets here:
 *
 *   1. Existence check — every named index is present after init.sql runs.
 *      If someone drops or renames one without thinking, this fails fast.
 *   2. Plan check — the team-filtered list query, which is the most common
 *      filtered shape, uses the composite (team_id, close_date) index.
 *
 * For the plan check we disable seqscan inside a single transaction.
 * Postgres is free to choose seqscan over an index when the seeded table
 * is tiny (25 rows) — that's correct behavior at this size, but it would
 * mask a missing index in production. The seqscan-off trick forces the
 * planner to surface the chosen index by name.
 */
describe('database indexes', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = createDataSource({ url: TEST_DATABASE_URL });
    await ds.initialize();
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('every expected index exists in pg_indexes', async () => {
    const rows = await ds.query<{ indexname: string }[]>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('commissions', 'allocations')
    `);
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('idx_commissions_close_date_id');
    expect(names).toContain('idx_commissions_team_close_date');
    expect(names).toContain('idx_commissions_status');
    expect(names).toContain('idx_allocations_commission_id');
  });

  it('list-by-team query plan picks idx_commissions_team_close_date', async () => {
    const planText = await ds.transaction(async (manager) => {
      await manager.query('SET LOCAL enable_seqscan = OFF');
      const rows = await manager.query<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN
         SELECT id, close_date, total_cents
         FROM commissions
         WHERE team_id = $1
         ORDER BY close_date DESC, id DESC
         LIMIT 10`,
        ['a1a1a1a1-0000-4000-8000-000000000001'],
      );
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    });

    expect(planText).toContain('idx_commissions_team_close_date');
  });

  it('allocations-by-commission_id JOIN uses idx_allocations_commission_id', async () => {
    const planText = await ds.transaction(async (manager) => {
      await manager.query('SET LOCAL enable_seqscan = OFF');
      const rows = await manager.query<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN
         SELECT a.id
         FROM allocations a
         WHERE a.commission_id = $1`,
        ['10000000-0000-4000-8000-000000000001'],
      );
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    });

    expect(planText).toContain('idx_allocations_commission_id');
  });
});
