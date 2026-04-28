import { z } from 'zod';

/**
 * Environment schema. All process inputs flow through this — invalid
 * configuration fails loudly at boot rather than at first request.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  /*
   * Default points at the database brought up by `docker compose up -d`.
   * Production is expected to set this explicitly; the default is here
   * so the assignment's "Getting Started" flow (docker up → npm run dev)
   * works without an extra `.env` step.
   */
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .default('postgres://commissions:commissions@localhost:5432/commissions'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validate and load environment configuration.
 *
 * @param source - Defaults to `process.env`. Tests pass an explicit object
 *   to exercise validation paths in isolation.
 * @throws Error with a multi-line summary of every invalid field.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
