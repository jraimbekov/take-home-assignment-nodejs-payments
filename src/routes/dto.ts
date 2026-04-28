import type {
  Commission,
  CommissionStatus,
} from '../entities/Commission.js';
import type { Allocation, AllocationType } from '../entities/Allocation.js';

/**
 * Wire-format DTOs for the commission resources.
 *
 * Snake_case keys mirror the rest of the JSON conventions. The mappers
 * are pure functions — no I/O, no side effects — so the route handlers
 * stay narrow and the mapping layer is unit-testable in isolation.
 *
 * Fields excluded from `Commission` on the wire: none today. If we add
 * server-internal columns (e.g. `version`), drop them here rather than
 * hide them with `select: false` on the entity.
 */
export interface AllocationDto {
  id: string;
  party_id: string;
  party_type: AllocationType;
  percentage: number;
  amount_cents: number;
}

export interface CommissionDto {
  id: string;
  team_id: string;
  status: CommissionStatus;
  close_date: string;
  total_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
  allocations: AllocationDto[];
}

export function allocationToDto(allocation: Allocation): AllocationDto {
  return {
    id: allocation.id,
    party_id: allocation.partyId,
    party_type: allocation.partyType,
    percentage: allocation.percentage,
    amount_cents: allocation.amountCents,
  };
}

export function commissionToDto(commission: Commission): CommissionDto {
  return {
    id: commission.id,
    team_id: commission.teamId,
    status: commission.status,
    close_date: commission.closeDate,
    total_cents: commission.totalCents,
    currency: commission.currency,
    created_at: commission.createdAt.toISOString(),
    updated_at: commission.updatedAt.toISOString(),
    allocations: (commission.allocations ?? []).map(allocationToDto),
  };
}
