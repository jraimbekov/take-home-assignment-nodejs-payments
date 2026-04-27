import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Build a Fastify application instance.
 *
 * Exposed as a factory so integration tests can boot a fresh app per
 * suite via `app.inject(...)` without binding a real TCP port.
 *
 * Logging is silenced under `NODE_ENV=test` (Vitest sets this by default)
 * to keep test output readable.
 */
export function buildApp(): FastifyInstance {
  const isTest = process.env.NODE_ENV === 'test';

  const app = Fastify({
    logger: isTest
      ? false
      : {
          level: process.env.LOG_LEVEL ?? 'info',
        },
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
