import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Commission } from './commission.js';
import { bigintToNumber, numericToNumber } from '../db/transformers.js';

/**
 * Party that participated in a commission split.
 *
 * Mirrors the `allocations.party_type` CHECK constraint defined in
 * `db/init.sql`. ASSIGNMENT.md additionally lists a `'team'` value, but the
 * actual schema constraint only allows the three below — the schema is the
 * source of truth, and this discrepancy is documented in the README.
 */
export type AllocationType = 'team_member' | 'external_agent' | 'brokerage';

/**
 * An allocation record representing a portion of a commission distributed to a party.
 *
 * Schema is owned by `db/init.sql`; this entity mirrors it. We never run
 * with `synchronize: true`.
 */
@Entity({ name: 'allocations' })
export class Allocation {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'commission_id', type: 'uuid' })
  commissionId!: string;

  @ManyToOne(() => Commission, (commission) => commission.allocations)
  @JoinColumn({ name: 'commission_id' })
  commission!: Commission;

  @Column({ name: 'party_id', type: 'uuid' })
  partyId!: string;

  @Column({ name: 'party_type', type: 'varchar', length: 30 })
  partyType!: AllocationType;

  /**
   * Allocation percentage as a decimal fraction (e.g., 0.6000 = 60%).
   * Stored as NUMERIC(6,4) in the database for precision.
   */
  @Column({ name: 'percentage', type: 'numeric', precision: 6, scale: 4, transformer: numericToNumber })
  percentage!: number;

  /**
   * Pre-calculated allocation amount in integer cents.
   * Computed as: total_cents * percentage.
   * BIGINT in the DB; transformed to JS `number`.
   */
  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintToNumber })
  amountCents!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
