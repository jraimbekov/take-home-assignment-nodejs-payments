import type { DataSource, Repository } from 'typeorm';
import { Commission, type CommissionStatus } from '../entities/Commission.js';
import type { AllocationType } from '../entities/Allocation.js';

/**
 * Filters accepted by the period-summary aggregation.
 *
 * `startDate` and `endDate` are ISO `YYYY-MM-DD` strings, inclusive on both
 * sides — the SQL uses `BETWEEN`. `teamId`, when provided, narrows the
 * aggregate to a single team; otherwise all teams are summed.
 */
export interface SummaryFilters {
  startDate: string;
  endDate: string;
  teamId?: string;
}

/**
 * One bucket of the summary breakdown — a count and a total, in integer
 * cents. Snake_case keys mirror the HTTP response shape so the route
 * handler is a pass-through with no mapping layer.
 */
export interface SummaryBucket {
  count: number;
  total_cents: number;
}

/**
 * Period summary aggregate result — what `/api/v1/commissions/summary`
 * returns. Every status and every party type is always present, with zero
 * counts when no rows matched.
 */
export interface SummaryResult {
  commission_count: number;
  total_gci_cents: number;
  by_status: Record<CommissionStatus, SummaryBucket>;
  by_party_type: Record<AllocationType, SummaryBucket>;
}

const STATUSES: readonly CommissionStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'finalized',
];

const PARTY_TYPES: readonly AllocationType[] = [
  'team_member',
  'external_agent',
  'brokerage',
];

/** Build a fresh `Record<K, SummaryBucket>` with every key zeroed out. */
function zeroBuckets<K extends string>(
  keys: readonly K[],
): Record<K, SummaryBucket> {
  return Object.fromEntries(
    keys.map((k) => [k, { count: 0, total_cents: 0 } as SummaryBucket]),
  ) as Record<K, SummaryBucket>;
}

/**
 * Domain repository for commission queries.
 *
 * Owns every commission-shaped read in the application: filtering,
 * aggregation, and eager-loading of allocations. Route handlers receive an
 * instance and stay free of TypeORM specifics, which keeps the HTTP layer
 * thin and the query layer in one obvious place.
 *
 * Construction is dependency-injected — the caller (Fastify boot, tests)
 * provides an initialized `DataSource`. This avoids a hidden module-level
 * singleton and makes per-test instances trivial.
 */
export class CommissionRepository {
  private readonly repo: Repository<Commission>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Commission);
  }

  /**
   * Total number of commissions in the database.
   *
   * Useful for `/healthz`-style smoke checks and as a baseline for
   * higher-level filtered counts (which will be added when the period
   * summary endpoint lands).
   */
  count(): Promise<number> {
    return this.repo.count();
  }

  /**
   * Load a single commission by primary key, with its allocations
   * eager-loaded in the same round-trip.
   *
   * Returns `null` for unknown ids — `null` is the right shape because the
   * "not found" condition is a routine result of a successful query, not an
   * error. Route handlers translate `null` → 404 at the HTTP boundary.
   */
  findByIdWithAllocations(id: string): Promise<Commission | null> {
    return this.repo.findOne({
      where: { id },
      relations: { allocations: true },
    });
  }

  /**
   * Period summary — counts and GCI totals over a date range, optionally
   * scoped to one team, with breakdowns by status and by party type.
   *
   * Three round-trips on purpose:
   *   1. headline totals over `commissions`
   *   2. group-by-status over `commissions`
   *   3. group-by-party_type over `allocations` joined to `commissions`
   *
   * They share the same `WHERE` shape; the third needs the join because
   * `party_type` lives on `allocations`. Could be folded into a single CTE
   * query — left as a follow-up refactor once the response contract is
   * locked.
   *
   * The SQL parameter `$3::uuid IS NULL OR team_id = $3` lets us pass the
   * same query for both filtered and unfiltered cases without dynamic SQL
   * concatenation.
   *
   * Empty buckets are zero-initialized in JS rather than expressed in SQL
   * (`CROSS JOIN unnest(enum)`), because the JS approach keeps the SQL
   * simple and locks the bucket order in TypeScript.
   */
  async summary(filters: SummaryFilters): Promise<SummaryResult> {
    const params: [string, string, string | null] = [
      filters.startDate,
      filters.endDate,
      filters.teamId ?? null,
    ];

    const [totalsRow] = await this.repo.manager.query<
      { count: number; total_cents: string }[]
    >(
      `SELECT COUNT(*)::int                              AS count,
              COALESCE(SUM(total_cents), 0)::bigint      AS total_cents
       FROM commissions
       WHERE close_date BETWEEN $1::date AND $2::date
         AND ($3::uuid IS NULL OR team_id = $3::uuid)`,
      params,
    );

    const byStatusRows = await this.repo.manager.query<
      { status: CommissionStatus; count: number; total_cents: string }[]
    >(
      `SELECT status,
              COUNT(*)::int                              AS count,
              COALESCE(SUM(total_cents), 0)::bigint      AS total_cents
       FROM commissions
       WHERE close_date BETWEEN $1::date AND $2::date
         AND ($3::uuid IS NULL OR team_id = $3::uuid)
       GROUP BY status`,
      params,
    );

    const byPartyTypeRows = await this.repo.manager.query<
      { party_type: AllocationType; count: number; total_cents: string }[]
    >(
      `SELECT a.party_type,
              COUNT(*)::int                              AS count,
              COALESCE(SUM(a.amount_cents), 0)::bigint   AS total_cents
       FROM allocations a
       INNER JOIN commissions c ON c.id = a.commission_id
       WHERE c.close_date BETWEEN $1::date AND $2::date
         AND ($3::uuid IS NULL OR c.team_id = $3::uuid)
       GROUP BY a.party_type`,
      params,
    );

    const by_status = zeroBuckets(STATUSES);
    for (const row of byStatusRows) {
      by_status[row.status] = {
        count: Number(row.count),
        total_cents: Number(row.total_cents),
      };
    }

    const by_party_type = zeroBuckets(PARTY_TYPES);
    for (const row of byPartyTypeRows) {
      by_party_type[row.party_type] = {
        count: Number(row.count),
        total_cents: Number(row.total_cents),
      };
    }

    return {
      commission_count: Number(totalsRow?.count ?? 0),
      total_gci_cents: Number(totalsRow?.total_cents ?? 0),
      by_status,
      by_party_type,
    };
  }
}
