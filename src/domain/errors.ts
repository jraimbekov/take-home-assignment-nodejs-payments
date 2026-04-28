import type { ZodError } from 'zod';

/**
 * Stable, machine-readable error code catalog.
 *
 * Every HTTP error response carries one of these in its `code` field. They
 * are the API's contract — adding a code is a non-breaking change, removing
 * or renaming one is breaking. Snake_case matches the rest of the JSON
 * payload conventions.
 */
export type ErrorCode =
  | 'invalid_parameter'
  | 'missing_parameter'
  | 'range_too_large'
  | 'not_found'
  | 'internal_server_error';

/**
 * The response body shape for every error. `details` is optional and used
 * only when the client genuinely needs structured debug info — never to
 * leak stack traces or SQL.
 */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Application error.
 *
 * Throw one of these from any route or service to produce a structured
 * HTTP error. The Fastify error handler (in `server.ts`) translates it to
 * the `ErrorBody` shape with the matching `statusCode`.
 *
 * Anything else thrown is treated as an unexpected server error and
 * returns 500 `internal_server_error` with no leaked detail.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  /** Wire-format body matching the public error contract. */
  toBody(): ErrorBody {
    const body: ErrorBody = { code: this.code, message: this.message };
    if (this.details) body.details = this.details;
    return body;
  }
}

/**
 * Translate a `ZodError` into the matching `AppError`.
 *
 * Distinguishes "field absent" (→ `missing_parameter`) from "field present
 * but invalid" (→ `invalid_parameter`) by inspecting the issue type. zod
 * represents a missing required key as `code: 'invalid_type'` with
 * `received: 'undefined'`.
 */
export function appErrorFromZod(error: ZodError): AppError {
  const issue = error.issues[0];
  if (!issue) {
    return new AppError('invalid_parameter', 'invalid request', 400);
  }

  const isMissing =
    issue.code === 'invalid_type' &&
    'received' in issue &&
    issue.received === 'undefined';

  return new AppError(
    isMissing ? 'missing_parameter' : 'invalid_parameter',
    issue.message,
    400,
  );
}
