/**
 * OpenAPI/Swagger schema definitions for the commissions routes.
 * Separated from route logic for clarity and maintainability.
 */

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

export const commissionsListSchema = {
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
};

export const summarySchema = {
  summary: 'Period summary (commissions and allocations)',
  description:
    'Returns aggregated counts and totals over a date range, ' +
    'optionally scoped to one team, with breakdowns by status and by party type.',
  tags: ['commissions'],
  querystring: {
    type: 'object',
    required: ['start_date', 'end_date'],
    properties: {
      start_date: {
        type: 'string',
        format: 'date',
        description: 'Inclusive lower bound (ISO 8601).',
      },
      end_date: {
        type: 'string',
        format: 'date',
        description: 'Inclusive upper bound (ISO 8601).',
      },
      team_id: {
        type: 'string',
        format: 'uuid',
        description: 'Optional team UUID filter.',
      },
    },
  },
  response: {
    200: {
      description: 'Summary with breakdowns by status and party type.',
      type: 'object',
      properties: {
        commission_count: { type: 'integer', example: 9 },
        total_gci_cents: { type: 'integer', example: 5_220_000 },
        by_status: {
          type: 'object',
          properties: {
            draft: {
              type: 'object',
              properties: {
                count: { type: 'integer', example: 2 },
                total_cents: { type: 'integer', example: 650_000 },
              },
              additionalProperties: false,
            },
            pending_approval: {
              type: 'object',
              properties: {
                count: { type: 'integer', example: 1 },
                total_cents: { type: 'integer', example: 400_000 },
              },
              additionalProperties: false,
            },
            approved: {
              type: 'object',
              properties: {
                count: { type: 'integer', example: 2 },
                total_cents: { type: 'integer', example: 930_000 },
              },
              additionalProperties: false,
            },
            finalized: {
              type: 'object',
              properties: {
                count: { type: 'integer', example: 4 },
                total_cents: { type: 'integer', example: 3_240_000 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        by_party_type: {
          type: 'object',
          properties: {
            team_member: {
              type: 'object',
              properties: {
                count: { type: 'integer', example: 9 },
                total_cents: { type: 'integer', example: 2_815_500 },
              },
              additionalProperties: false,
            },
            external_agent: {
              type: 'object',
              properties: {
                count: { type: 'integer', example: 5 },
                total_cents: { type: 'integer', example: 1_051_000 },
              },
              additionalProperties: false,
            },
            brokerage: {
              type: 'object',
              properties: {
                count: { type: 'integer', example: 9 },
                total_cents: { type: 'integer', example: 1_353_500 },
              },
              additionalProperties: false,
            },
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
};
