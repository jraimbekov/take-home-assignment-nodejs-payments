import { describe, expect, it } from 'vitest';
import {
  MAX_RANGE_DAYS,
  validateDateRange,
} from '../../src/domain/dateRange.js';
import { AppError } from '../../src/domain/errors.js';

describe('validateDateRange', () => {
  describe('valid spans', () => {
    it('accepts equal start and end (single day)', () => {
      expect(() =>
        validateDateRange('2025-03-15', '2025-03-15'),
      ).not.toThrow();
    });

    it('accepts a typical month range', () => {
      expect(() =>
        validateDateRange('2025-03-01', '2025-03-31'),
      ).not.toThrow();
    });

    it('accepts exactly MAX_RANGE_DAYS', () => {
      // 2025-01-01 → 2025-12-31 inclusive = 365 days exactly.
      expect(() =>
        validateDateRange('2025-01-01', '2025-12-31'),
      ).not.toThrow();
    });
  });

  describe('invalid_parameter (400) — inverted range', () => {
    it('throws when start_date is after end_date', () => {
      const action = () => validateDateRange('2025-03-31', '2025-03-01');
      expect(action).toThrow(AppError);
      try {
        action();
      } catch (err) {
        const appErr = err as AppError;
        expect(appErr.code).toBe('invalid_parameter');
        expect(appErr.statusCode).toBe(400);
        expect(appErr.message).toMatch(/before or equal/);
      }
    });
  });

  describe('range_too_large (422) — span exceeds MAX_RANGE_DAYS', () => {
    it('throws when range is one day more than MAX_RANGE_DAYS', () => {
      // 2024-01-01 → 2025-01-01 inclusive = 367 days (leap year + 1).
      const action = () => validateDateRange('2024-01-01', '2025-01-01');
      expect(action).toThrow(AppError);
      try {
        action();
      } catch (err) {
        const appErr = err as AppError;
        expect(appErr.code).toBe('range_too_large');
        expect(appErr.statusCode).toBe(422);
        expect(appErr.message).toMatch(new RegExp(`${MAX_RANGE_DAYS}`));
      }
    });

    it('throws on multi-year ranges', () => {
      const action = () => validateDateRange('2020-01-01', '2025-01-01');
      expect(action).toThrowError(/365 days/);
    });
  });
});
