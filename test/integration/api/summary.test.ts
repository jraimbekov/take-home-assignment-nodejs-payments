import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../../../src/db/datasource.js';
import { buildApp } from '../../../src/server.js';
import { TEST_DATABASE_URL } from '../helpers.js';

/**
 * GET /api/v1/commissions/summary
 *
 * Built outside-in: each `it` is the next contract the endpoint must
 * satisfy. The minimum code to pass each test is what lands.
 */
describe('GET /api/v1/commissions/summary', () => {
  let app: FastifyInstance;
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createDataSource({ url: TEST_DATABASE_URL });
    await dataSource.initialize();
    app = buildApp({ dataSource });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('empty periods', () => {
    /*
     * The assignment is explicit: "A period with no matching data should
     * return zeros, not an error." Every status bucket and every party-type
     * bucket must be present even when nothing matched, so the dashboard
     * can render a stable shape.
     */
    it('returns zero-filled buckets for a period with no commissions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2024-01-01&end_date=2024-01-31',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.commission_count).toBe(0);
      expect(body.total_gci_cents).toBe(0);
      expect(body.by_status).toEqual({
        draft: { count: 0, total_cents: 0 },
        pending_approval: { count: 0, total_cents: 0 },
        approved: { count: 0, total_cents: 0 },
        finalized: { count: 0, total_cents: 0 },
      });
      expect(body.by_party_type).toEqual({
        team_member: { count: 0, total_cents: 0 },
        external_agent: { count: 0, total_cents: 0 },
        brokerage: { count: 0, total_cents: 0 },
      });
    });
  });

  const TEAM_ALPHA = 'a1a1a1a1-0000-4000-8000-000000000001';
  const TEAM_NONEXISTENT = '99999999-0000-4000-8000-999999999999';

  describe('March 2025 — all teams', () => {
    /*
     * Reference totals from `db/init.sql` (evaluator block at line 311+).
     * Hard-coding them so we assert exact values, not "something came
     * back". If these ever drift, the seed has changed.
     */
    it('returns 9 commissions totaling 5,220,000 cents with full breakdowns', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2025-03-01&end_date=2025-03-31',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.commission_count).toBe(9);
      expect(body.total_gci_cents).toBe(5_220_000);

      expect(body.by_status).toEqual({
        draft: { count: 2, total_cents: 650_000 },
        pending_approval: { count: 1, total_cents: 400_000 },
        approved: { count: 2, total_cents: 930_000 },
        finalized: { count: 4, total_cents: 3_240_000 },
      });

      expect(body.by_party_type).toEqual({
        team_member: { count: 9, total_cents: 2_815_500 },
        external_agent: { count: 5, total_cents: 1_051_000 },
        brokerage: { count: 9, total_cents: 1_353_500 },
      });
    });
  });

  describe('March 2025 — team_alpha only', () => {
    /*
     * Same period as the all-teams test, but scoped to team_alpha. Proves
     * the `team_id` filter narrows BOTH the commissions aggregate and the
     * allocations join (party_type breakdown).
     */
    it('returns 5 commissions / 2,850,000 cents with team-scoped breakdowns', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/commissions/summary?start_date=2025-03-01&end_date=2025-03-31&team_id=${TEAM_ALPHA}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.commission_count).toBe(5);
      expect(body.total_gci_cents).toBe(2_850_000);

      expect(body.by_status).toEqual({
        draft: { count: 1, total_cents: 430_000 },
        pending_approval: { count: 1, total_cents: 400_000 },
        approved: { count: 1, total_cents: 550_000 },
        finalized: { count: 2, total_cents: 1_470_000 },
      });

      expect(body.by_party_type).toEqual({
        team_member: { count: 5, total_cents: 1_548_500 },
        external_agent: { count: 3, total_cents: 520_000 },
        brokerage: { count: 5, total_cents: 781_500 },
      });
    });
  });

  describe('team_id filter that matches no commissions', () => {
    /*
     * Decision: an unknown / zero-match `team_id` returns 200 with all
     * buckets zeroed, not a 404. The assignment is explicit that empty
     * results are not errors, and we don't have a `teams` table to look up
     * against — `team_id` is a filter, not a resource.
     */
    it('returns zero-filled buckets for a team_id that has no commissions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/commissions/summary?start_date=2025-03-01&end_date=2025-03-31&team_id=${TEAM_NONEXISTENT}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.commission_count).toBe(0);
      expect(body.total_gci_cents).toBe(0);
      expect(body.by_status.draft).toEqual({ count: 0, total_cents: 0 });
      expect(body.by_status.finalized).toEqual({ count: 0, total_cents: 0 });
      expect(body.by_party_type.team_member).toEqual({
        count: 0,
        total_cents: 0,
      });
    });
  });

  describe('single-day range', () => {
    /*
     * `start_date == end_date` is a valid one-day window. SQL's `BETWEEN`
     * is inclusive on both sides, which is the behavior we want — proven
     * here against C11 (close_date 2025-03-05, 850,000 cents).
     */
    it('returns the single commission that closed on the boundary day', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2025-03-05&end_date=2025-03-05',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.commission_count).toBe(1);
      expect(body.total_gci_cents).toBe(850_000);
    });
  });

  /*
   * Error catalog for /api/v1/commissions/summary:
   *   400 missing_parameter   — start_date or end_date absent
   *   400 invalid_parameter   — bad date format, team_id not a UUID,
   *                             start_date > end_date
   *   422 range_too_large     — date range exceeds 365 days
   *
   * Error response shape: { code, message }, per the assignment.
   */
  describe('error: missing required parameters', () => {
    it('400 missing_parameter when start_date is absent', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?end_date=2025-03-31',
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe('missing_parameter');
      expect(body.message).toMatch(/start_date/i);
    });

    it('400 missing_parameter when end_date is absent', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2025-03-01',
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe('missing_parameter');
      expect(body.message).toMatch(/end_date/i);
    });
  });

  describe('error: invalid parameters', () => {
    it('400 invalid_parameter when start_date is after end_date', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2025-03-31&end_date=2025-03-01',
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe('invalid_parameter');
      expect(body.message).toMatch(/start_date.*before or equal.*end_date/i);
    });

    it('400 invalid_parameter when start_date is not ISO format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2025/03/01&end_date=2025-03-31',
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe('invalid_parameter');
      expect(body.message).toMatch(/start_date/i);
    });

    it('400 invalid_parameter when team_id is not a UUID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2025-03-01&end_date=2025-03-31&team_id=not-a-uuid',
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe('invalid_parameter');
      expect(body.message).toMatch(/team_id/i);
    });
  });

  describe('error: range too large', () => {
    it('422 range_too_large when date range exceeds 365 days', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2024-01-01&end_date=2025-03-31',
      });
      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.code).toBe('range_too_large');
      expect(body.message).toMatch(/365 days/i);
    });
  });

  describe('February 2025 — zero-bucket case', () => {
    /*
     * The seed deliberately has no `draft` commissions in February. The
     * status bucket for `draft` must therefore be present in the response
     * with `{count: 0, total_cents: 0}` — proves zero-fill works mid-period
     * (not just for fully empty periods).
     */
    it('zero-fills the draft bucket while other statuses are populated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions/summary?start_date=2025-02-01&end_date=2025-02-28',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.commission_count).toBe(5);
      expect(body.total_gci_cents).toBe(2_930_000);

      expect(body.by_status).toEqual({
        draft: { count: 0, total_cents: 0 },
        pending_approval: { count: 1, total_cents: 330_000 },
        approved: { count: 2, total_cents: 1_000_000 },
        finalized: { count: 2, total_cents: 1_600_000 },
      });
    });
  });
});
