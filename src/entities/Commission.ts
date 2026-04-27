import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { Allocation } from './Allocation.js';
import { bigintToNumber } from '../db/transformers.js';

/**
 * Commission lifecycle status.
 *
 * Mirrors the `commissions.status` CHECK constraint defined in `db/init.sql`.
 * Note that the assignment doc lists a `'team'` party type that does NOT
 * exist in the schema's CHECK constraint — the schema is the source of
 * truth here, not the prose. The constraint set below is exhaustive.
 */
export type CommissionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'finalized';

/**
 * A single commission record (gross commission income, "GCI") representing
 * a closed transaction owned by one team.
 *
 * Schema is owned by `db/init.sql`; this entity mirrors it. We never run
 * with `synchronize: true`.
 */
@Entity({ name: 'commissions' })
export class Commission {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'team_id', type: 'uuid' })
  teamId!: string;

  @Column({ type: 'varchar', length: 30 })
  status!: CommissionStatus;

  /**
   * Date the deal closed (DATE column, no timezone).
   * Returned by `pg` as a `'YYYY-MM-DD'` string.
   */
  @Column({ name: 'close_date', type: 'date' })
  closeDate!: string;

  /**
   * Total commission for the deal, in integer cents.
   * BIGINT in the DB; transformed to JS `number`.
   */
  @Column({ name: 'total_cents', type: 'bigint', transformer: bigintToNumber })
  totalCents!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Allocation breakdown for this commission. By assignment invariant the
   * allocation amounts always sum to `totalCents` exactly.
   */
  @OneToMany(() => Allocation, (allocation) => allocation.commission)
  allocations!: Allocation[];
}
