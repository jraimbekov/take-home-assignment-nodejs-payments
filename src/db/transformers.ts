import type { ValueTransformer } from 'typeorm';

/**
 * Convert PostgreSQL `BIGINT` columns to a JS `number` on the way out.
 *
 * `node-postgres` returns BIGINT as a `string` by default to avoid silent
 * precision loss. For this reporting service we eagerly coerce to `number`
 * because:
 *
 *   - All BIGINT columns here are integer-cents money values.
 *   - One trillion USD is 1e14 cents — well below `Number.MAX_SAFE_INTEGER`
 *     (~9e15). We have ~90× headroom.
 *
 * If we ever need to handle larger values we'd switch to `bigint`
 * end-to-end (and adjust JSON serialization accordingly).
 */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | number | null | undefined): number | null | undefined =>
    value == null ? value : typeof value === 'number' ? value : Number(value),
};

/**
 * Convert PostgreSQL `NUMERIC` columns to a JS `number`.
 *
 * Defaults to string for the same precision-preservation reason as BIGINT.
 * The `allocations.percentage` column is `NUMERIC(6,4)` — at most 4 decimal
 * places, fits trivially in a JS float.
 */
export const numericToNumber: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | number | null | undefined): number | null | undefined =>
    value == null
      ? value
      : typeof value === 'number'
        ? value
        : parseFloat(value),
};
