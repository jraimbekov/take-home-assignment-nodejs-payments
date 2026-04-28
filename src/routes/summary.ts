import type { FastifyPluginAsync } from 'fastify';
import { CommissionRepository } from '../repositories/CommissionRepository.js';
import { validateDateRange } from '../domain/dateRange.js';
import { appErrorFromZod } from '../domain/errors.js';
import { SummaryQuerySchema } from '../schemas/summaryQuery.js';

/**
 * `GET /api/v1/commissions/summary` — period summary aggregates.
 *
 * Validation order:
 *   1. Zod parses query string → format/required-field errors map to
 *      400 `missing_parameter` or 400 `invalid_parameter`.
 *   2. `validateDateRange` enforces the cross-field rules:
 *      400 `invalid_parameter` (start > end) and 422 `range_too_large`.
 *
 * Empty results (period or team_id matching no rows) return 200 with
 * zero-filled buckets — never an error, per the assignment.
 */
export const summaryRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/v1/commissions/summary', async (req) => {
    const parsed = SummaryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw appErrorFromZod(parsed.error);
    }

    const { start_date, end_date, team_id } = parsed.data;
    validateDateRange(start_date, end_date);

    const repo = new CommissionRepository(fastify.dataSource);
    return repo.summary({
      startDate: start_date,
      endDate: end_date,
      teamId: team_id,
    });
  });
};
