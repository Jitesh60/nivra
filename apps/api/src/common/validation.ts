import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from './errors/app.exception.js';

function flatten(errors: ValidationError[], parent = ''): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((acc, e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) acc[path] = Object.values(e.constraints);
    if (e.children?.length) Object.assign(acc, flatten(e.children, path));
    return acc;
  }, {});
}

/** Global DTO validation: strips unknown fields, rejects extras, converts types. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        'VALIDATION_FAILED',
        'Request validation failed',
        HttpStatus.BAD_REQUEST,
        flatten(errors),
      ),
  });
}
