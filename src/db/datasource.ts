import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Commission } from '../entities/commission.js';
import { Allocation } from '../entities/allocation.js';

export interface CreateDataSourceOptions {
  /** PostgreSQL connection URL, e.g. `postgres://user:pw@host:5432/db`. */
  url: string;
  /** Connection-pool size. Default: 10. */
  poolSize?: number;
  /** Enable SQL logging (handy for debugging tests). Default: false. */
  logging?: boolean;
}

/**
 * Construct a TypeORM `DataSource` bound to the commissions schema.
 *
 * Caller owns the lifecycle:
 *   const ds = createDataSource({ url });
 *   await ds.initialize();
 *   // ... use it ...
 *   await ds.destroy();
 *
 * `synchronize: false` ensures TypeORM never attempts DDL — the schema is
 * owned by `db/init.sql` (mounted into the container on first start). The
 * entity classes mirror the schema; they do not generate it.
 */
export function createDataSource(opts: CreateDataSourceOptions): DataSource {
  return new DataSource({
    type: 'postgres',
    url: opts.url,
    entities: [Commission, Allocation],
    synchronize: false,
    logging: opts.logging ?? false,
    poolSize: opts.poolSize ?? 10,
    extra: {
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    },
  });
}
