import { AppError } from './errors.js';

/**
 * Keyset-pagination cursor for the commissions list.
 *
 * Stores the `(close_date, id)` tuple of the last row on the previous
 * page. Tuple comparison `(close_date, id) < (cursor.closeDate, cursor.id)`
 * gives a stable, insert-resilient page boundary.
 *
 * Stable under concurrent inserts (offset pagination is not), and avoids
 * the need for a server-side scroll cursor.
 */
export interface ListCursor {
  closeDate: string;
  id: string;
}

/**
 * Encode a `ListCursor` as an opaque base64url string for the wire.
 *
 * `base64url` (RFC 4648 §5) is URL-safe — no `+`, `/`, or `=` — so the
 * client can echo the value back unescaped.
 */
export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Decode a wire cursor back into a `ListCursor`.
 *
 * Throws `AppError(invalid_parameter, 400)` for any malformed input —
 * unparseable base64, non-JSON payload, or missing fields. Treat the
 * cursor as opaque on the client side.
 */
export function decodeCursor(encoded: string): ListCursor {
  let json: string;
  try {
    json = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    throw new AppError('invalid_parameter', 'cursor is malformed', 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AppError('invalid_parameter', 'cursor is malformed', 400);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { closeDate?: unknown }).closeDate !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new AppError('invalid_parameter', 'cursor is malformed', 400);
  }

  const c = parsed as ListCursor;
  return { closeDate: c.closeDate, id: c.id };
}
