import { HttpStatus, NotFoundException } from '@nestjs/common';
import { AppException } from '../errors/app.exception.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('renders AppException with its code and details', () => {
    const { status, body } = filter.toResponse(
      new AppException('OTP_INVALID', 'Wrong code', HttpStatus.BAD_REQUEST, { attemptsLeft: 2 }),
    );
    expect(status).toBe(400);
    expect(body).toEqual({
      error: { code: 'OTP_INVALID', message: 'Wrong code', details: { attemptsLeft: 2 } },
    });
  });

  it('maps built-in HttpExceptions to a status-based code', () => {
    const { status, body } = filter.toResponse(new NotFoundException('Cannot GET /nope'));
    expect(status).toBe(404);
    expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'Cannot GET /nope' });
  });

  it('hides internal details of unknown errors', () => {
    const { status, body } = filter.toResponse(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
  });
});
