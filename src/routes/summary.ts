import type { FastifyPluginAsync } from 'fastify';
import { validateDateRange } from '../domain/dateRange.js';
import { appErrorFromZod } from '../domain/errors.js';
import { SummaryQuerySchema } from '../schemas/SummaryQuery.js';

/*
 * Shared OpenAPI fragment for the standard error response shape.
 * Inlined per-route on each error status so swagger UI shows it without
 * forcing readers to follow a $ref chain.
 */
const errorResponseSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', example: 'invalid_parameter' },
    message: {
      type: 'string',
      example: 'start_date must be a valid ISO 8601 date (YYYY-MM-DD)',
    },
  },
  additionalProperties: true,
};

const bucketSchema = {
  type: 'object',
  properties: {
    count: { type: 'integer', example: 9 },
    total_cents: { type: 'integer', example: 5_220_000 },
  },
  additionalProperties: false,
};

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
    {
      schema: {
        summary: 'Period summary aggregates',
        description:
          'Counts and GCI totals over the supplied date range, ' +
          'optionally scoped to one team. Empty periods return ' +
          'zero-filled status and party-type buckets — never an error.',
        tags: ['commissions'],
        querystring: {
          type: 'object',
          required: ['start_date', 'end_date'],
          properties: {
            start_date: {
              type: 'string',
              format: 'date',
              description: 'ISO 8601 date (YYYY-MM-DD), inclusive lower bound',
              example: '2025-03-01',
            },
            end_date: {
              type: 'string',
              format: 'date',
              description: 'ISO 8601 date (YYYY-MM-DD), inclusive upper bound',
              example: '2025-03-31',
            },
            team_id: {
              type: 'string',
              format: 'uuid',
              description: 'Restrict the summary to one team (UUID).',
            },
          },
        },
        response: {
          200: {
            description:
              'Period summary; status and party-type buckets are zero-filled when empty.',
            type: 'object',
            properties: {
              commission_count: { type: 'integer', example: 9 },
              total_gci_cents: { type: 'integer', example: 5_220_000 },
              by_status: {
                type: 'object',
                properties: {
                  draft: bucketSchema,
                  pending_approval: bucketSchema,
                  approved: bucketSchema,
                  finalized: bucketSchema,
                },
                additionalProperties: false,
              },
              by_party_type: {
                type: 'object',
                properties: {
                  team_member: bucketSchema,
                  external_agent: bucketSchema,
                  brokerage: bucketSchema,
                },
                additionalProperties: false,
              },
            },
            additionalProperties: true,
          },
          400: errorResponseSchema,
          422: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
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
