import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, appErrorFromZod } from '../../src/domain/errors.js';

describe('AppError', () => {
  it('exposes code, message, statusCode, and optional details', () => {
    const err = new AppError(
      'invalid_parameter',
      'team_id must be a valid UUID',
      400,
      { field: 'team_id' },
    );
    expect(err.code).toBe('invalid_parameter');
    expect(err.message).toBe('team_id must be a valid UUID');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: 'team_id' });
    expect(err).toBeInstanceOf(Error);
  });

  it('toBody() produces { code, message } when no details are set', () => {
    const err = new AppError('not_found', 'team not found', 404);
    expect(err.toBody()).toEqual({
      code: 'not_found',
      message: 'team not found',
    });
  });

  it('toBody() includes details only when present', () => {
    const err = new AppError('invalid_parameter', 'invalid', 400, {
      field: 'x',
    });
    expect(err.toBody()).toEqual({
      code: 'invalid_parameter',
      message: 'invalid',
      details: { field: 'x' },
    });
  });
});

describe('appErrorFromZod', () => {
  const schema = z.object({
    start_date: z.string({ required_error: 'start_date is required' }),
    team_id: z.string().uuid('team_id must be a valid UUID').optional(),
  });

  it('maps a missing required field to missing_parameter (400)', () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;

    const err = appErrorFromZod(result.error);
    expect(err.code).toBe('missing_parameter');
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/start_date is required/);
  });

  it('maps a present-but-invalid field to invalid_parameter (400)', () => {
    const result = schema.safeParse({
      start_date: '2025-03-01',
      team_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const err = appErrorFromZod(result.error);
    expect(err.code).toBe('invalid_parameter');
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/team_id must be a valid UUID/);
  });

  it('falls back to invalid_parameter on a ZodError with no issues', () => {
    const result = schema.safeParse({ start_date: '2025-03-01' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Construct an empty-issue ZodError to exercise the defensive branch.
    const fakeError = new z.ZodError([]);
    const err = appErrorFromZod(fakeError);
    expect(err.code).toBe('invalid_parameter');
    expect(err.statusCode).toBe(400);
  });
});
