import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  const VALID_DB_URL = 'postgres://u:p@localhost:5432/db';

  it('parses a complete environment', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      LOG_LEVEL: 'debug',
      DATABASE_URL: VALID_DB_URL,
    });
    expect(env).toEqual({
      NODE_ENV: 'test',
      PORT: 4000,
      LOG_LEVEL: 'debug',
      DATABASE_URL: VALID_DB_URL,
    });
  });

  it('applies defaults for optional fields', () => {
    const env = loadEnv({ DATABASE_URL: VALID_DB_URL } as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('falls back to the local docker DATABASE_URL when unset', () => {
    const env = loadEnv({} as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(
      'postgres://commissions:commissions@localhost:5432/commissions',
    );
  });

  it('coerces PORT from string to number', () => {
    const env = loadEnv({
      DATABASE_URL: VALID_DB_URL,
      PORT: '8080',
    } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
  });

  it('throws on invalid LOG_LEVEL', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: VALID_DB_URL,
        LOG_LEVEL: 'verbose',
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('throws on negative PORT', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: VALID_DB_URL,
        PORT: '-1',
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('throws on non-numeric PORT', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: VALID_DB_URL,
        PORT: 'abc',
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('throws on invalid NODE_ENV', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: VALID_DB_URL,
        NODE_ENV: 'staging',
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });
});
