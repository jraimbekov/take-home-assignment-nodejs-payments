import { AppError } from './errors.js';

/**
 * Maximum span the API will compute over in a single request.
 *
 * Acts as a safety net against unbounded reporting queries that could OOM
 * the database; clients that need longer windows can paginate over time.
 * Documented in the README.
 */
export const MAX_RANGE_DAYS = 365;

/** One day in milliseconds — extracted for readability at the call site. */
const MS_PER_DAY = 86_400_000;

/**
 * Validate the `start_date` / `end_date` pair shared by both reporting
 * endpoints.
 *
 * Throws:
 *   - `400 invalid_parameter` when `start > end`
 *   - `422 range_too_large` when the inclusive span exceeds
 *     `MAX_RANGE_DAYS`
 *
 * Both inputs must already be ISO `YYYY-MM-DD` strings — assume the zod
 * schema has already enforced format.
 */
export function validateDateRange(start: string, end: string): void {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  if (startMs > endMs) {
    throw new AppError(
      'invalid_parameter',
      'start_date must be before or equal to end_date',
      400,
    );
  }

  // Inclusive span: e.g. 2025-03-01 → 2025-03-31 is 31 days.
  const days = (endMs - startMs) / MS_PER_DAY + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new AppError(
      'range_too_large',
      `date range cannot exceed ${MAX_RANGE_DAYS} days`,
      422,
    );
  }
}
