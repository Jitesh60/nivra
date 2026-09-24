import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Throw this for any expected error. It is rendered as
 * `{ "error": { "code", "message", "details" } }` by AllExceptionsFilter.
 * `code` is a stable, machine-readable string clients can switch on (e.g. OTP_INVALID).
 */
export class AppException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
