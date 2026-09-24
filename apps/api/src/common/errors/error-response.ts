import { ApiProperty } from '@nestjs/swagger';

export class ErrorBody {
  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code: string;

  @ApiProperty({ example: 'Request validation failed' })
  message: string;

  @ApiProperty({ required: false })
  details?: unknown;
}

export class ErrorResponse {
  @ApiProperty({ type: ErrorBody })
  error: ErrorBody;
}
