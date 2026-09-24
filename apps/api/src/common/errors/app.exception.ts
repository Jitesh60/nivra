import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes.js';

/**
 * Throw this for any expected error. It is rendered as
 * `{ "error": { "code", "message", "details" } }` by AllExceptionsFilter.
 * `code` is a stable, machine-readable string clients can switch on (e.g. OTP_INVALID).
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode | string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
