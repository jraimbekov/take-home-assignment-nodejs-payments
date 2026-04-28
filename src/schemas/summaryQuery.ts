import { z } from 'zod';

/**
 * `GET /api/v1/commissions/summary` query-string contract.
 *
 * Field-level error messages are written to be directly user-facing — the
 * Fastify error handler emits them verbatim in the JSON `message` field
 * (after the zod-issue-to-AppError mapping decides whether the code is
 * `missing_parameter` or `invalid_parameter`).
 */
const isoDate = (field: string) =>
  z
    .string({ required_error: `${field} is required` })
    .date(`${field} must be a valid ISO 8601 date (YYYY-MM-DD)`);

export const SummaryQuerySchema = z.object({
  start_date: isoDate('start_date'),
  end_date: isoDate('end_date'),
  team_id: z.string().uuid('team_id must be a valid UUID').optional(),
});

export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;
