/*
 * Vitest global setup.
 *
 * `reflect-metadata` must be imported once before any TypeORM entity is
 * loaded — TypeORM's decorators register metadata at module-evaluation time
 * via `Reflect.defineMetadata`. Importing it here (registered through
 * `vitest.config.ts > test.setupFiles`) means individual test files don't
 * have to remember to import it themselves.
 */
import 'reflect-metadata';

/*
 * Force `NODE_ENV=test` so the Fastify factory silences its logger.
 * Vitest does not override NODE_ENV when the container/host has already
 * set it (e.g. compose defaults `api` to `NODE_ENV=development`), so we do
 * it explicitly here.
 */
process.env.NODE_ENV = 'test';
