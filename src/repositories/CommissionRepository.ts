import type { DataSource, Repository } from 'typeorm';
import { Commission } from '../entities/Commission.js';

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
}
