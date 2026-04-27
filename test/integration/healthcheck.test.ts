import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server.js';

/**
 * Liveness probe contract.
 *
 * `/healthz` is the canonical endpoint for process-level liveness checks
 * (Docker, k8s, load balancers). It must:
 *   - respond 200 OK without any external dependencies (no DB, no auth)
 *   - return a stable JSON body so monitors can string-match if needed
 */
describe('GET /healthz', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
