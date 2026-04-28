import Fastify, { type FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { DataSource } from 'typeorm';
import { summaryRoute } from './routes/summary.js';
import { AppError } from './domain/errors.js';
import { CommissionRepository } from './repositories/CommissionRepository.js';
import { commissionsRoute } from './routes/commissions.js';

/**
 * Augments the `FastifyInstance` type so route handlers can access shared
 * dependencies (`DataSource`, repositories) via `fastify.<x>` with no
 * `any` casts.
 *
 * Repositories are decorated once at app construction so route handlers
 * never `new` them per request — see the `app.decorate('commissions', ...)`
 * call below.
 */
declare module 'fastify' {
  interface FastifyInstance {
    dataSource: DataSource;
    commissions: CommissionRepository;
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
    app.decorate('commissions', new CommissionRepository(opts.dataSource));
  }

  /*
   * Fastify uses Ajv to compile route `schema` blocks into runtime
   * validators. We do all real validation with zod (so error mapping
   * lands consistently in `AppError`), and we keep the Fastify schemas
   * around purely for `@fastify/swagger` to consume. A no-op validator
   * compiler makes that explicit — no double validation, no shape drift
   * between Fastify's defaults and our zod schemas.
   */
  app.setValidatorCompiler(() => () => true);

  // OpenAPI / Swagger UI (mounted at /docs).
  // Reads each route's `schema` for paths, params, and response shapes.
  void app.register(fastifySwagger, {
    swagger: {
      info: {
        title: 'Commission Reporting Service',
        description:
          'Read-only API for commission and allocation reports. ' +
          'See README.md for design rationale and the full error catalog.',
        version: '0.1.0',
      },
      host: 'localhost:3000',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'commissions', description: 'Browse and report on commissions' },
        { name: 'health', description: 'Liveness checks' },
      ],
    },
  });

  void app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

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
  app.register(commissionsRoute);
  app.register(summaryRoute);

  return app;
}
