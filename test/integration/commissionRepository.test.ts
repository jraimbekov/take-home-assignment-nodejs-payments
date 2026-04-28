import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../../src/db/datasource.js';
import { CommissionRepository } from '../../src/repositories/CommissionRepository.js';
import { TEST_DATABASE_URL } from './helpers.js';

/**
 * Known seed values from `db/init.sql`. Hard-coded here on purpose — the
 * assignment is explicit that integration tests should "seed known data so
 * you can assert exact values".
 *
 *   C01 = team_alpha, finalized, $5,000.00 (500_000 cents)
 *         3 allocations: 250_000 + 150_000 + 100_000 = 500_000
 */
const KNOWN_COMMISSION_ID = '10000000-0000-4000-8000-000000000001';
const KNOWN_COMMISSION_TOTAL_CENTS = 500_000;
const KNOWN_COMMISSION_ALLOCATION_COUNT = 3;
const UNKNOWN_COMMISSION_ID = '00000000-0000-4000-8000-ffffffffffff';

describe('CommissionRepository', () => {
  let dataSource: DataSource;
  let repository: CommissionRepository;

  beforeAll(async () => {
    dataSource = createDataSource({ url: TEST_DATABASE_URL });
    await dataSource.initialize();
    repository = new CommissionRepository(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('count', () => {
    it('returns the total number of commissions as a JS number', async () => {
      const total = await repository.count();
      expect(typeof total).toBe('number');
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('findByIdWithAllocations', () => {
    it('returns the commission and its full allocation list for a known id', async () => {
      const found = await repository.findByIdWithAllocations(
        KNOWN_COMMISSION_ID,
      );

      expect(found).not.toBeNull();
      expect(found?.id).toBe(KNOWN_COMMISSION_ID);
      expect(found?.totalCents).toBe(KNOWN_COMMISSION_TOTAL_CENTS);
      expect(found?.allocations).toHaveLength(KNOWN_COMMISSION_ALLOCATION_COUNT);

      // Every allocation must reference back to this commission.
      for (const allocation of found?.allocations ?? []) {
        expect(allocation.commissionId).toBe(KNOWN_COMMISSION_ID);
      }

      // Invariant: allocations sum exactly to the commission total.
      const sum = (found?.allocations ?? []).reduce(
        (acc, a) => acc + a.amountCents,
        0,
      );
      expect(sum).toBe(KNOWN_COMMISSION_TOTAL_CENTS);
    });

    it('returns null when the id is not in the database', async () => {
      const found = await repository.findByIdWithAllocations(
        UNKNOWN_COMMISSION_ID,
      );
      expect(found).toBeNull();
    });
  });
});
