import { describe, expect, it } from 'vitest';
import {
  allocationToDto,
  commissionToDto,
} from '../../src/routes/dto.js';
import type { Commission } from '../../src/entities/commission.js';
import type { Allocation } from '../../src/entities/allocation.js';

/*
 * Pure unit tests — no DB. We construct entity-shaped objects with the
 * camelCase property names TypeORM produces and assert the snake_case
 * wire format the API contract requires.
 */
describe('allocationToDto', () => {
  const allocation: Allocation = {
    id: 'alloc-id',
    commissionId: 'commission-id',
    partyId: 'party-id',
    partyType: 'team_member',
    percentage: 0.6,
    amountCents: 192_000,
    createdAt: new Date('2025-01-20T09:00:00Z'),
    commission: undefined as unknown as Commission, // not used by mapper
  };

  it('maps the wire-format fields and drops the parent reference', () => {
    expect(allocationToDto(allocation)).toEqual({
      id: 'alloc-id',
      party_id: 'party-id',
      party_type: 'team_member',
      percentage: 0.6,
      amount_cents: 192_000,
    });
  });
});

describe('commissionToDto', () => {
  const baseCommission: Commission = {
    id: 'commission-id',
    teamId: 'team-id',
    status: 'finalized',
    closeDate: '2025-01-22',
    totalCents: 320_000,
    currency: 'USD',
    createdAt: new Date('2025-01-20T09:00:00Z'),
    updatedAt: new Date('2025-01-22T16:00:00Z'),
    allocations: [],
  };

  it('maps the commission fields with snake_case keys and ISO dates', () => {
    const dto = commissionToDto(baseCommission);
    expect(dto).toEqual({
      id: 'commission-id',
      team_id: 'team-id',
      status: 'finalized',
      close_date: '2025-01-22',
      total_cents: 320_000,
      currency: 'USD',
      created_at: '2025-01-20T09:00:00.000Z',
      updated_at: '2025-01-22T16:00:00.000Z',
      allocations: [],
    });
  });

  it('maps nested allocations through allocationToDto', () => {
    const allocation: Allocation = {
      id: 'a1',
      commissionId: 'commission-id',
      partyId: 'p1',
      partyType: 'brokerage',
      percentage: 0.4,
      amountCents: 128_000,
      createdAt: new Date('2025-01-20T09:00:00Z'),
      commission: undefined as unknown as Commission,
    };
    const dto = commissionToDto({ ...baseCommission, allocations: [allocation] });
    expect(dto.allocations).toHaveLength(1);
    expect(dto.allocations[0]).toEqual({
      id: 'a1',
      party_id: 'p1',
      party_type: 'brokerage',
      percentage: 0.4,
      amount_cents: 128_000,
    });
  });

  it('treats undefined allocations as an empty array (no crash on partial entities)', () => {
    const partial = { ...baseCommission, allocations: undefined as unknown as Allocation[] };
    expect(commissionToDto(partial).allocations).toEqual([]);
  });
});
