import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../../../src/db/datasource.js';
import { buildApp } from '../../../src/server.js';
import { TEST_DATABASE_URL } from '../helpers.js';

/**
 * GET /api/v1/commissions
 *
 * List commissions with filtering and pagination.
 * Built outside-in: each `it` is the next contract the endpoint must satisfy.
 */
describe('GET /api/v1/commissions', () => {
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

  const TEAM_ALPHA = 'a1a1a1a1-0000-4000-8000-000000000001';
  const TEAM_BRAVO = 'b2b2b2b2-0000-4000-8000-000000000002';
  const TEAM_CHARLIE = 'c3c3c3c3-0000-4000-8000-000000000003';

  describe('Get commissions', () => {
    // L1: No filters, default page
    it('returns commissions with allocations, pagination metadata on default page', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as any;

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      // First commission should have expected shape
      const commission = body.data[0];
      expect(commission).toHaveProperty('id');
      expect(commission).toHaveProperty('team_id');
      expect(commission).toHaveProperty('status');
      expect(commission).toHaveProperty('close_date');
      expect(commission).toHaveProperty('total_cents');
      expect(commission).toHaveProperty('currency');
      expect(commission).toHaveProperty('created_at');
      expect(commission).toHaveProperty('updated_at');
      expect(Array.isArray(commission.allocations)).toBe(true);

      // Pagination metadata
      expect(body).toHaveProperty('page');
      expect(body.page).toHaveProperty('has_more');
      expect(typeof body.page.has_more).toBe('boolean');
      expect(body.page).toHaveProperty('next_cursor');
      if (body.page.has_more) {
        expect(typeof body.page.next_cursor).toBe('string');
      }
    });

    // L2: Filter team_id
    it('filters by team_id, returns only that team\'s commissions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/commissions?team_id=${TEAM_ALPHA}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as any;

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      // All returned commissions should belong to team_alpha
      for (const commission of body.data) {
        expect(commission.team_id).toBe(TEAM_ALPHA);
      }
    });

    // L3: Filter status
    it('filters by status=finalized, returns only finalized commissions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?status=finalized',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as any;

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      for (const commission of body.data) {
        expect(commission.status).toBe('finalized');
      }
    });

    // L4: Filter by date range (Mar 2025)
    it('filters by date range, Mar 2025 returns 9 commissions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?start_date=2025-03-01&end_date=2025-03-31&limit=50',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as any;

      // Reference: March 2025 has 9 commissions in seed
      const commissionCount = body.data.length;
      expect(commissionCount).toBe(9);

      // All dates should fall within the range
      for (const commission of body.data) {
        const date = new Date(commission.close_date);
        expect(date.getTime()).toBeGreaterThanOrEqual(new Date('2025-03-01').getTime());
        expect(date.getTime()).toBeLessThanOrEqual(new Date('2025-03-31').getTime());
      }
    });

    // L5: Combined filters
    it('combines team_id + status + date filters; team_alpha + finalized + Mar 2025 = 2 commissions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/commissions?team_id=${TEAM_ALPHA}&status=finalized&start_date=2025-03-01&end_date=2025-03-31`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as any;

      // Reference: 2 commissions match all three filters
      expect(body.data.length).toBe(2);

      // All should be team_alpha, finalized, and in Mar 2025
      for (const commission of body.data) {
        expect(commission.team_id).toBe(TEAM_ALPHA);
        expect(commission.status).toBe('finalized');
        const date = new Date(commission.close_date);
        expect(date.getTime()).toBeGreaterThanOrEqual(new Date('2025-03-01').getTime());
        expect(date.getTime()).toBeLessThanOrEqual(new Date('2025-03-31').getTime());
      }

      // Verify total_cents sum matches reference (1,470,000 cents)
      const totalCents = body.data.reduce((sum: number, c: any) => sum + c.total_cents, 0);
      expect(totalCents).toBe(1_470_000);
    });

    // L6: Empty result
    it('returns empty array with has_more=false and next_cursor=null when no rows match', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?start_date=2024-01-01&end_date=2024-01-31',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as any;

      expect(body.data).toEqual([]);
      expect(body.page.has_more).toBe(false);
      expect(body.page.next_cursor).toBeNull();
    });

    // L7: Pagination stability
    it('pagination — first page returns next_cursor, second page returns disjoint rows, final page has_more=false', async () => {
      const limit = 5;

      // First page
      const res1 = await app.inject({
        method: 'GET',
        url: `/api/v1/commissions?limit=${limit}`,
      });

      expect(res1.statusCode).toBe(200);
      const body1 = res1.json() as any;

      const firstPageIds = body1.data.map((c: any) => c.id);
      expect(firstPageIds.length).toBeLessThanOrEqual(limit);

      if (body1.page.has_more) {
        expect(body1.page.next_cursor).toBeTruthy();

        // Second page using cursor
        const res2 = await app.inject({
          method: 'GET',
          url: `/api/v1/commissions?limit=${limit}&cursor=${encodeURIComponent(body1.page.next_cursor)}`,
        });

        expect(res2.statusCode).toBe(200);
        const body2 = res2.json() as any;

        const secondPageIds = body2.data.map((c: any) => c.id);

        // Rows should be disjoint (no overlap between pages)
        const overlap = firstPageIds.filter((id: string) => secondPageIds.includes(id));
        expect(overlap.length).toBe(0);

        // Iterate until final page
        let currentCursor = body2.page.next_cursor;
        let iterationCount = 0;
        while (body2.page.has_more && iterationCount < 100) {
          const resNext = await app.inject({
            method: 'GET',
            url: `/api/v1/commissions?limit=${limit}&cursor=${encodeURIComponent(currentCursor)}`,
          });
          expect(resNext.statusCode).toBe(200);
          const bodyNext = resNext.json() as any;

          if (!bodyNext.page.has_more) {
            // Final page should have has_more: false
            expect(bodyNext.page.has_more).toBe(false);
            break;
          }
          currentCursor = bodyNext.page.next_cursor;
          iterationCount++;
        }
        expect(iterationCount).toBeLessThan(100); // Prevent infinite loops in tests
      }
    });

    // L8: Cross-table invariant
    it('each commission\'s SUM(allocations.amount_cents) === total_cents', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?limit=50',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as any;

      for (const commission of body.data) {
        const allocationsSum = (commission.allocations || []).reduce(
          (sum: number, alloc: any) => sum + alloc.amount_cents,
          0,
        );
        expect(allocationsSum).toBe(commission.total_cents);
      }
    });
  });

  describe('Error cases', () => {
    // LE1: start_date > end_date
    it('returns 400 invalid_parameter when start_date > end_date', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?start_date=2025-03-31&end_date=2025-03-01',
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as any;
      expect(body.code).toBe('invalid_parameter');
    });

    // LE2: invalid status
    it('returns 400 invalid_parameter when status not in enum', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?status=invalid_status',
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as any;
      expect(body.code).toBe('invalid_parameter');
    });

    // LE3: team_id not a UUID
    it('returns 400 invalid_parameter when team_id is not a valid UUID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?team_id=not-a-uuid',
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as any;
      expect(body.code).toBe('invalid_parameter');
    });

    // LE4: start_date not ISO date
    it('returns 400 invalid_parameter when start_date is not ISO date format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?start_date=2025/03/01',
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as any;
      expect(body.code).toBe('invalid_parameter');
    });

    // LE5: limit out of bounds
    it('returns 400 invalid_parameter when limit < 1 or limit > 100', async () => {
      const res1 = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?limit=0',
      });

      expect(res1.statusCode).toBe(400);
      expect(res1.json().code).toBe('invalid_parameter');

      const res2 = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?limit=101',
      });

      expect(res2.statusCode).toBe(400);
      expect(res2.json().code).toBe('invalid_parameter');
    });

    // LE6: malformed cursor
    it('returns 400 invalid_parameter when cursor is malformed', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?cursor=not::a::valid::cursor',
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as any;
      expect(body.code).toBe('invalid_parameter');
    });

    // LE7: date range > 365 days
    it('returns 422 range_too_large when date range exceeds 365 days', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/commissions?start_date=2024-01-01&end_date=2025-02-01',
      });

      expect(res.statusCode).toBe(422);
      const body = res.json() as any;
      expect(body.code).toBe('range_too_large');
    });
  });
});
