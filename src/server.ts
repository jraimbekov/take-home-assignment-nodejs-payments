import Fastify, { type FastifyInstance } from 'fastify';
import type { DataSource } from 'typeorm';
import { summaryRoute } from './routes/summary.js';
import { AppError } from './domain/errors.js';

/**
 * Augments the `FastifyInstance` type so route handlers can access the
 * shared `DataSource` via `fastify.dataSource` with no `any` casts.
 */
declare module 'fastify' {
  interface FastifyInstance {
    dataSource: DataSource;
  }
}

export interface BuildAppOptions {
  /**
   * TypeORM `DataSource` to use for DB-backed routes. Optional so
   * dependency-free routes (e.g. `/healthz`) can be tested without a DB.
   */
  dataSource?: DataSource;
}

/**
 * Build a Fastify application instance.
 *
 * Exposed as a factory so integration tests can boot a fresh app per
 * suite via `app.inject(...)` without binding a real TCP port.
 *
 * Logging is silenced under `NODE_ENV=test` (Vitest sets this by default)
 * to keep test output readable.
 */
export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const isTest = process.env.NODE_ENV === 'test';

  const app = Fastify({
    logger: isTest
      ? false
      : {
          level: process.env.LOG_LEVEL ?? 'info',
        },
  });

  if (opts.dataSource) {
    app.decorate('dataSource', opts.dataSource);
  }

  /*
   * Single error handler for the whole app.
   *
   * `AppError` is the well-known shape produced by route validation and
   * domain code — its `code`, `message`, and `details` go straight to the
   * client. Any other thrown value is treated as an unexpected failure:
   * we log it server-side and return an opaque 500 so internals (stack
   * traces, SQL fragments) never leak to the wire.
   */
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toBody());
    }
    app.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({
      code: 'internal_server_error',
      message: 'please try again later',
    });
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.register(summaryRoute);

  return app;
}
