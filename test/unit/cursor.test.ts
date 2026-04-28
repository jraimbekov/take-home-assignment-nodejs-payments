import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  type ListCursor,
} from '../../src/domain/cursor.js';
import { AppError } from '../../src/domain/errors.js';

describe('cursor codec', () => {
  const cursor: ListCursor = {
    closeDate: '2025-03-15',
    id: '10000000-0000-4000-8000-000000000011',
  };

  describe('round-trip', () => {
    it('decode(encode(x)) === x', () => {
      const encoded = encodeCursor(cursor);
      expect(decodeCursor(encoded)).toEqual(cursor);
    });

    it('encoded form is base64url (URL-safe)', () => {
      const encoded = encodeCursor(cursor);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encoded).not.toMatch(/[+/=]/);
    });
  });

  describe('decode rejects malformed input', () => {
    function expectAppErrorMatching(action: () => unknown, code: string): void {
      try {
        action();
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.code).toBe(code);
        expect(appErr.statusCode).toBe(400);
      }
    }

    it('throws on non-base64 garbage', () => {
      expectAppErrorMatching(
        () => decodeCursor('!!! not::base64 !!!'),
        'invalid_parameter',
      );
    });

    it('throws on base64 of non-JSON', () => {
      const garbage = Buffer.from('not json', 'utf8').toString('base64url');
      expectAppErrorMatching(() => decodeCursor(garbage), 'invalid_parameter');
    });

    it('throws on JSON missing fields', () => {
      const partial = Buffer.from(JSON.stringify({ id: 'abc' })).toString(
        'base64url',
      );
      expectAppErrorMatching(() => decodeCursor(partial), 'invalid_parameter');
    });

    it('throws on JSON with wrong field types', () => {
      const wrongTypes = Buffer.from(
        JSON.stringify({ closeDate: 123, id: null }),
      ).toString('base64url');
      expectAppErrorMatching(
        () => decodeCursor(wrongTypes),
        'invalid_parameter',
      );
    });

    it('throws on JSON null payload', () => {
      const nullPayload = Buffer.from('null', 'utf8').toString('base64url');
      expectAppErrorMatching(
        () => decodeCursor(nullPayload),
        'invalid_parameter',
      );
    });
  });
});
