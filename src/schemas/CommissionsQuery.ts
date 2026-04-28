import { z } from 'zod';

/**
 * `GET /api/v1/commissions` query-string contract.
 *
 * All filters are optional — calling the endpoint with no parameters
 * returns the most recent page of commissions. Field-level error messages
 * land directly in the JSON `message` field after the zod-issue-to-
 * AppError mapping decides between `missing_parameter` and
 * `invalid_parameter`.
 *
 * Date range rule: `start_date` and `end_date` must both be present or
 * both absent. Enforced via `superRefine` since zod's default object
 * shape can't express cross-field optionality.
 */
const STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'finalized',
] as const;

const isoDate = (field: string) =>
  z.string().date(`${field} must be a valid ISO 8601 date (YYYY-MM-DD)`);

export const CommissionsQuerySchema = z
  .object({
    team_id: z.string().uuid('team_id must be a valid UUID').optional(),
    status: z
      .enum(STATUSES, {
        errorMap: () => ({
          message: `status must be one of: ${STATUSES.join(', ')}`,
        }),
      })
      .optional(),
    start_date: isoDate('start_date').optional(),
    end_date: isoDate('end_date').optional(),
    limit: z.coerce
      .number({ invalid_type_error: 'limit must be a number' })
      .int('limit must be an integer')
      .min(1, 'limit must be at least 1')
      .max(100, 'limit must be at most 100')
      .default(25),
    cursor: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasStart = data.start_date !== undefined;
    const hasEnd = data.end_date !== undefined;
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: 'custom',
        path: [hasStart ? 'end_date' : 'start_date'],
        message: 'start_date and end_date must be provided together',
      });
    }
  });

export type CommissionsQuery = z.infer<typeof CommissionsQuerySchema>;
