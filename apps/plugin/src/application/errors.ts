/**
 * Failures the protocol can explain to a caller.
 *
 * The protocol layer throws these; the command line turns them into one JSON
 * object on stderr plus an exit code. Nothing below the command line knows about
 * stdout, colours, or `process.exit`.
 */

export type ErrorCode = 'USAGE' | 'VALIDATION_FAILED' | 'NOT_FOUND' | 'INTERNAL';

export const EXIT_CODES: Record<ErrorCode, number> = {
  USAGE: 2,
  VALIDATION_FAILED: 2,
  NOT_FOUND: 4,
  INTERNAL: 1,
};

export class ProtocolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export function isProtocolError(error: unknown): error is ProtocolError {
  return error instanceof ProtocolError;
}

/** Attach the operation index to whatever failed inside one operation. */
export function withOperation(error: unknown, index: number): ProtocolError {
  if (error instanceof ProtocolError) return new ProtocolError(error.code, error.message, { index, ...error.extra });
  return new ProtocolError('INTERNAL', error instanceof Error ? error.message : String(error));
}
