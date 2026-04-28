import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDataSource } from '../../src/db/datasource.js';
import { buildApp } from '../../src/server.js';
import { TEST_DATABASE_URL } from './helpers.js';

/**
 * Smoke test: verify the actual entrypoint works end-to-end.
 *
 * This test simulates what `src/index.ts` does — create a DataSource,
 * initialize it, build the app with it, and verify that DB-backed routes
 * are accessible.
 *
 * Catches issues like:
 *   - Missing `@decorate('commissions', ...)` in buildApp
 *   - DataSource initialization failures
 *   - Missing environment variables
 *   - Routes registering without a DataSource
 */
describe('Smoke test: entrypoint integration', () => {
  let app: FastifyInstance;
  let dataSource = createDataSource({ url: TEST_DATABASE_URL });

  beforeAll(async () => {
    await dataSource.initialize();
    app = buildApp({ dataSource });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('initializes with a live DataSource', async () => {
    expect(dataSource.isInitialized).toBe(true);
    expect(app.commissions).toBeDefined();
  });

  it('healthz returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('commissions list endpoint is accessible', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/commissions',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty('page');
  });

  it('commissions summary endpoint is accessible', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/commissions/summary?start_date=2025-03-01&end_date=2025-03-31',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body).toHaveProperty('by_status');
    expect(body).toHaveProperty('by_party_type');
  });

  it('swagger docs ui is available', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/docs',
    });

    // /docs redirects or returns 200
    expect([200, 302, 301]).toContain(res.statusCode);
  });
});
