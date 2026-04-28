import type { DataSource, Repository } from 'typeorm';
import { Commission, type CommissionStatus } from '../entities/commission.js';
import type { AllocationType } from '../entities/allocation.js';
import type { ListCursor } from '../domain/cursor.js';

/**
 * Filters and pagination accepted by `list()`.
 *
 * Date range, team, and status are independent — any subset can be
 * provided. `limit` is required (the route schema fills in the default).
 * `cursor`, when present, narrows results to "rows ordered after this
 * tuple" (see `ListCursor` for the keyset semantics).
 */
export interface ListFilters {
  startDate?: string;
  endDate?: string;
  teamId?: string;
  status?: CommissionStatus;
  cursor?: ListCursor;
  limit: number;
}

export interface ListResult {
  commissions: Commission[];
  hasMore: boolean;
}

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
   * Page of commissions matching the supplied filters, with allocations
   * eager-loaded.
   *
   * Sort order is `(close_date DESC, id DESC)` — most recent first, with
   * `id` as the deterministic tiebreaker for keyset pagination.
   *
   * Pagination strategy: keyset cursor. We fetch `limit + 1` rows; if the
   * extra row exists, `hasMore` is `true` and the route handler exposes
   * the last in-page row as `next_cursor`. This is stable under concurrent
   * inserts and avoids the ever-growing `OFFSET` cost.
   *
   * Index path: `idx_commissions_close_date_id` (composite) — see the
   * EXPLAIN integration test that asserts the plan uses the index.
   */
  async list(filters: ListFilters): Promise<ListResult> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.allocations', 'a');

    if (filters.startDate) {
      qb.andWhere('c.close_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      qb.andWhere('c.close_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters.teamId) {
      qb.andWhere('c.team_id = :teamId', { teamId: filters.teamId });
    }
    if (filters.status) {
      qb.andWhere('c.status = :status', { status: filters.status });
    }
    if (filters.cursor) {
      // Tuple comparison gives the right keyset semantics with one
      // expression: `(a, b) < (x, y)` is `a < x OR (a = x AND b < y)`.
      qb.andWhere(
        '(c.close_date, c.id) < (:cursorCloseDate::date, :cursorId::uuid)',
        {
          cursorCloseDate: filters.cursor.closeDate,
          cursorId: filters.cursor.id,
        },
      );
    }

    // Note: orderBy must use the *entity property* path (`closeDate`),
    // not the DB column name. Using the column name here triggers a
    // TypeORM bug ("Cannot read properties of undefined (reading
    // 'databaseName')") inside its DISTINCT-injection pass when joining
    // a one-to-many relation and applying `take()`.
    qb.orderBy('c.closeDate', 'DESC').addOrderBy('c.id', 'DESC');
    // Fetch one extra so the caller can detect "is there another page".
    qb.take(filters.limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > filters.limit;
    return {
      commissions: hasMore ? rows.slice(0, filters.limit) : rows,
      hasMore,
    };
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
