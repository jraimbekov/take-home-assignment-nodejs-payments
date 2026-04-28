import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../../src/db/datasource.js';
import { Commission } from '../../src/entities/Commission.js';
import { Allocation } from '../../src/entities/Allocation.js';
import { TEST_DATABASE_URL } from './helpers.js';

/**
 * Verifies the TypeORM DataSource can connect to the Docker-Compose-provided
 * database and that the seeded schema with Commission and Allocation entities
 * is reachable.
 *
 * Per the assignment, integration tests run against a real database — no
 * mocking of the DB layer.
 */
describe('database with typeorm', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createDataSource({ url: TEST_DATABASE_URL });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('initializes and connects to the database', async () => {
    expect(dataSource.isInitialized).toBe(true);
  });

  it('reaches the seeded schema (commissions and allocations contain rows)', async () => {
    const commissionRepo = dataSource.getRepository(Commission);
    const allocationRepo = dataSource.getRepository(Allocation);

    const commissionCount = await commissionRepo.count();
    const allocationCount = await allocationRepo.count();

    expect(typeof commissionCount).toBe('number');
    expect(typeof allocationCount).toBe('number');
    expect(commissionCount).toBeGreaterThan(0);
    expect(allocationCount).toBeGreaterThan(0);
  });

  it('loads Commission entity with total_cents as a positive integer JS number (BIGINT transformer)', async () => {
    const commissionRepo = dataSource.getRepository(Commission);
    const [commission] = await commissionRepo.find({ take: 1 });

    expect(commission).toBeDefined();
    expect(typeof commission?.totalCents).toBe('number');
    expect(Number.isInteger(commission?.totalCents)).toBe(true);
    expect(commission?.totalCents).toBeGreaterThan(0);
  });

  it('loads Allocation entity with amount_cents as a positive integer JS number (BIGINT transformer)', async () => {
    const allocationRepo = dataSource.getRepository(Allocation);
    const [allocation] = await allocationRepo.find({ take: 1 });

    expect(allocation).toBeDefined();
    expect(typeof allocation?.amountCents).toBe('number');
    expect(Number.isInteger(allocation?.amountCents)).toBe(true);
    expect(allocation?.amountCents).toBeGreaterThan(0);
  });

  it('loads Allocation entity with percentage as a JS number in (0, 1]', async () => {
    const allocationRepo = dataSource.getRepository(Allocation);
    const [allocation] = await allocationRepo.find({ take: 1 });

    expect(allocation).toBeDefined();
    expect(typeof allocation?.percentage).toBe('number');
    expect(allocation?.percentage).toBeGreaterThan(0);
    expect(allocation?.percentage).toBeLessThanOrEqual(1);
  });

  it('loads Commission with related Allocation entities via OneToMany relationship', async () => {
    const commissionRepo = dataSource.getRepository(Commission);
    const [commission] = await commissionRepo.find({
      relations: ['allocations'],
      take: 1,
    });

    expect(commission).toBeDefined();
    expect(Array.isArray(commission?.allocations)).toBe(true);
    expect(commission?.allocations?.length).toBeGreaterThan(0);

    // Verify relationship works: each allocation references the commission
    for (const alloc of commission?.allocations || []) {
      expect(alloc.commissionId).toBe(commission?.id);
    }
  });

  /*
   * Cross-table invariant from the assignment seed: allocations always
   * sum to 100% of the commission total, so SUM(amount_cents) per
   * commission must equal commissions.total_cents — exactly, with no
   * float drift. This proves three things in one test:
   *   1. the JOIN works
   *   2. BIGINT arithmetic survives our type transformer without precision loss
   *   3. the seed data we are about to assert against is internally consistent
   */
  it('allocations sum exactly to total_cents for every commission', async () => {
    const commissionRepo = dataSource.getRepository(Commission);
    const commissions = await commissionRepo.find({
      relations: ['allocations'],
    });

    expect(commissions.length).toBeGreaterThan(0);

    for (const commission of commissions) {
      const allocationsSum = (commission.allocations || []).reduce(
        (sum, alloc) => sum + alloc.amountCents,
        0,
      );
      expect(allocationsSum).toBe(commission.totalCents);
    }
  });
});
