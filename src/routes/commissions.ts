import type { FastifyPluginAsync } from 'fastify';
import { validateDateRange } from '../domain/dateRange.js';
import { appErrorFromZod } from '../domain/errors.js';
import { decodeCursor, encodeCursor } from '../domain/cursor.js';
import { CommissionsQuerySchema } from '../schemas/CommissionsQuery.js';
import { commissionToDto } from './dto.js';

const errorResponseSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', example: 'invalid_parameter' },
    message: { type: 'string', example: 'team_id must be a valid UUID' },
  },
  additionalProperties: true,
};

const allocationDtoSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    party_id: { type: 'string', format: 'uuid' },
    party_type: {
      type: 'string',
      enum: ['team_member', 'external_agent', 'brokerage'],
    },
    percentage: { type: 'number', example: 0.6 },
    amount_cents: { type: 'integer', example: 192_000 },
  },
  additionalProperties: false,
};

const commissionDtoSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    team_id: { type: 'string', format: 'uuid' },
    status: {
      type: 'string',
      enum: ['draft', 'pending_approval', 'approved', 'finalized'],
    },
    close_date: { type: 'string', format: 'date', example: '2025-03-05' },
    total_cents: { type: 'integer', example: 850_000 },
    currency: { type: 'string', example: 'USD' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    allocations: { type: 'array', items: allocationDtoSchema },
  },
  additionalProperties: false,
};

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
    {
      schema: {
        summary: 'List commissions (paginated, with allocations)',
        description:
          'Returns commissions with their allocations, ordered by close_date ' +
          'descending then id descending. All filters are optional. ' +
          '`start_date` and `end_date` must be supplied together if either is. ' +
          'Pagination is keyset-cursor; `page.next_cursor` is opaque base64url.',
        tags: ['commissions'],
        querystring: {
          type: 'object',
          properties: {
            team_id: {
              type: 'string',
              format: 'uuid',
              description: 'Filter by team UUID.',
            },
            status: {
              type: 'string',
              enum: ['draft', 'pending_approval', 'approved', 'finalized'],
              description: 'Filter by commission status.',
            },
            start_date: {
              type: 'string',
              format: 'date',
              description:
                'Inclusive lower bound (ISO 8601). Required if end_date is set.',
            },
            end_date: {
              type: 'string',
              format: 'date',
              description:
                'Inclusive upper bound (ISO 8601). Required if start_date is set.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 25,
              description: 'Page size (1–100). Default 25.',
            },
            cursor: {
              type: 'string',
              description:
                'Opaque keyset cursor returned in `page.next_cursor` of the previous response.',
            },
          },
        },
        response: {
          200: {
            description:
              'A page of commissions plus pagination metadata. `next_cursor` is null on the final page.',
            type: 'object',
            properties: {
              data: { type: 'array', items: commissionDtoSchema },
              page: {
                type: 'object',
                properties: {
                  has_more: { type: 'boolean' },
                  next_cursor: { type: ['string', 'null'] },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
          400: errorResponseSchema,
          422: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
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
