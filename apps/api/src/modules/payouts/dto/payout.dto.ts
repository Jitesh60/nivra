import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class PayoutAccountInputDto {
  @ApiProperty({ description: 'As on the bank account' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  beneficiaryName: string;

  @ApiProperty({ description: '9–18 digits', example: '50100123456789' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s/g, '') : value,
  )
  @Matches(/^\d{9,18}$/, { message: 'accountNumber must be 9–18 digits' })
  accountNumber: string;

  @ApiProperty({ example: 'HDFC0001234' })
  @Transform(upper)
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'ifsc must look like HDFC0001234' })
  ifsc: string;

  @ApiProperty({ example: 'ABCDE1234F' })
  @Transform(upper)
  @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: 'pan must look like ABCDE1234F' })
  pan: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Address line' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  street: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state: string;

  @ApiProperty({ example: '411038' })
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'postalCode must be 6 digits' })
  postalCode: string;
}

export class PayoutAccountDto {
  @ApiProperty({ enum: ['PENDING', 'NEEDS_CLARIFICATION', 'ACTIVATED', 'REJECTED'] })
  status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) statusReason: string | null;
  @ApiProperty() beneficiaryName: string;
  @ApiProperty({ description: 'Last 4 digits only' }) bankLast4: string;
  @ApiProperty() ifsc: string;
  @ApiProperty() panLast4: string;
}

export class EarningDto {
  @ApiProperty({ format: 'uuid' }) bookingId: string;
  @ApiProperty() listingTitle: string;
  @ApiProperty({ format: 'date' }) startDate: string;
  @ApiProperty({ format: 'date' }) endDate: string;
  @ApiProperty() amountPaise: number;
  @ApiProperty({ enum: ['AWAITING_ACCOUNT', 'ON_HOLD', 'RELEASED', 'REVERSED', 'FAILED'] })
  status: string;
  @ApiProperty({ description: 'Held until the item comes back' }) onHold: boolean;
  @ApiProperty() createdAt: Date;
}

export class EarningsTotalsDto {
  @ApiProperty({ description: 'At Razorpay, released after the return' }) onHoldPaise: number;
  @ApiProperty({ description: 'Sent to your bank' }) paidPaise: number;
  @ApiProperty({ description: 'Waiting for your payout account' }) awaitingAccountPaise: number;
}

export class EarningsDto {
  @ApiPropertyOptional({ type: PayoutAccountDto, nullable: true }) account: PayoutAccountDto | null;
  @ApiProperty({ type: EarningsTotalsDto }) totals: EarningsTotalsDto;
  @ApiProperty({ type: [EarningDto], description: 'Newest first' }) items: EarningDto[];
}
