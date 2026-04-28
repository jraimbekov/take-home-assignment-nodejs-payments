import type { FastifyPluginAsync } from 'fastify';
import { validateDateRange } from '../domain/dateRange.js';
import { appErrorFromZod } from '../domain/errors.js';
import { SummaryQuerySchema } from '../schemas/summaryQuery.js';
import { summarySchema } from './schemas.js';

/**
 * `GET /api/v1/commissions/summary` — period summary aggregates.
 *
 * Validation is performed by zod inside the handler (see
 * `src/server.ts` for why Fastify's validator is a no-op). The Fastify
 * `schema` block on the route exists for `@fastify/swagger` only.
 */
export const summaryRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/commissions/summary',
    { schema: summarySchema },
    async (req) => {
      const parsed = SummaryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw appErrorFromZod(parsed.error);
      }

      const { start_date, end_date, team_id } = parsed.data;
      validateDateRange(start_date, end_date);

      return fastify.commissions.summary({
        startDate: start_date,
        endDate: end_date,
        teamId: team_id,
      });
    },
  );
};
