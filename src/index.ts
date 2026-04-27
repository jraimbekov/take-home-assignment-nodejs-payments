import { buildApp } from './server.js';

/**
 * Process entrypoint — boots the HTTP server and binds it to the
 * configured port. Tests do NOT use this file; they import
 * `buildApp` directly and use Fastify's `.inject()` API.
 */
async function main(): Promise<void> {
  const app = buildApp();
  const port = Number(process.env.PORT ?? 3000);

  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
