import type { FastifyPluginAsync } from 'fastify';
import { validateDateRange } from '../domain/dateRange.js';
import { appErrorFromZod } from '../domain/errors.js';
import { decodeCursor, encodeCursor } from '../domain/cursor.js';
import { CommissionsQuerySchema } from '../schemas/commissionsQuery.js';
import { commissionToDto } from './dto.js';
import { commissionsListSchema, summarySchema } from './schemas.js';

/**
 * `GET /api/v1/commissions` — paginated list with allocations.
 *
 * Validation order (each step throws on failure → Fastify error handler):
 *   1. `CommissionsQuerySchema.safeParse` — types, format, cross-field
 *      "both dates or neither" → 400 missing/invalid_parameter.
 *   2. `validateDateRange` (only when both dates supplied) — 400
 *      invalid_parameter (start > end), 422 range_too_large (>365 d).
 *   3. `decodeCursor` (only when cursor supplied) — 400 invalid_parameter.
 *
 * Empty filters or filters yielding no rows return `200` with `data: []`
 * — never an error, per the assignment.
 *
 * Pagination is keyset: the next-page cursor encodes the last in-page
 * row's `(close_date, id)` tuple. Stable under concurrent inserts.
 */
export const commissionsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/commissions',
    { schema: commissionsListSchema },
    async (req) => {
      const parsed = CommissionsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw appErrorFromZod(parsed.error);
      }

      const { team_id, status, start_date, end_date, limit, cursor } =
        parsed.data;

      if (start_date && end_date) {
        validateDateRange(start_date, end_date);
      }

      const decodedCursor = cursor ? decodeCursor(cursor) : undefined;

      const result = await fastify.commissions.list({
        teamId: team_id,
        status,
        startDate: start_date,
        endDate: end_date,
        limit,
        cursor: decodedCursor,
      });

      const data = result.commissions.map(commissionToDto);
      const last = result.commissions[result.commissions.length - 1];
      const next_cursor =
        result.hasMore && last
          ? encodeCursor({ closeDate: last.closeDate, id: last.id })
          : null;

      return {
        data,
        page: { has_more: result.hasMore, next_cursor },
      };
    },
  );
};
