import 'reflect-metadata';
import { loadEnv } from './config/env.js';
import { createDataSource } from './db/datasource.js';
import { buildApp } from './server.js';

/**
 * Process entrypoint — boots the HTTP server with a live TypeORM
 * `DataSource` and binds it to the configured port.
 *
 * Tests do NOT use this file; they import `buildApp` directly with a
 * test-owned `DataSource` and call Fastify's `.inject()` API.
 *
 * Lifecycle:
 *   1. Validate env up front so misconfiguration fails at boot, not at
 *      first request.
 *   2. Initialise the DataSource (opens a pool to Postgres, validates
 *      entity metadata).
 *   3. Build the app with the DataSource — this is what populates the
 *      `fastify.commissions` decorator the routes rely on.
 *   4. Listen.
 *   5. On SIGINT / SIGTERM, close Fastify (drains connections) and
 *      destroy the DataSource (closes the pool) — clean shutdown so
 *      Docker / k8s don't have to send SIGKILL.
 */
async function main(): Promise<void> {
  const env = loadEnv();

  const dataSource = createDataSource({ url: env.DATABASE_URL });
  await dataSource.initialize();

  const app = buildApp({ dataSource });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      if (dataSource.isInitialized) await dataSource.destroy();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    if (dataSource.isInitialized) await dataSource.destroy();
    process.exit(1);
  }
}

void main();
