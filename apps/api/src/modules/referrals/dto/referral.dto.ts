import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { ParticipantDto } from '../../safety/dto/safety.dto.js';

export const CREDIT_KINDS = [
  'GRANT_REFEREE',
  'GRANT_REFERRER',
  'HOLD',
  'RELEASE',
  'REVOKE',
] as const;

export class RedeemReferralDto {
  @ApiProperty({ example: 'K7PX2QMA', description: 'Case and spaces don’t matter' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{4,12}$/, { message: 'is not an invite code' })
  code: string;
}

export class CreditEntryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: CREDIT_KINDS }) kind: string;
  @ApiProperty({ description: 'Positive adds to the balance, negative spends it' })
  amountPaise: number;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) bookingId: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reason: string | null;
  @ApiProperty() createdAt: Date;
}

export class ReferralRulesDto {
  @ApiProperty() refereeCreditPaise: number;
  @ApiProperty() referrerCreditPaise: number;
  @ApiProperty({ description: 'Credit covers at most this much of a booking’s rent' })
  maxShareOfRentPct: number;
  @ApiProperty() maxReferrerRewards: number;
  @ApiProperty() redeemWithinDays: number;
}

export class MyReferralDto {
  @ApiProperty({ example: 'K7PX2QMA' }) code: string;
  @ApiProperty({ example: 'https://sajha.app/r/K7PX2QMA' }) link: string;
  @ApiProperty({ description: 'People who joined with your code' }) invited: number;
  @ApiProperty({ description: '…of whom finished a first rental (you got credit)' })
  rewarded: number;
  @ApiProperty() creditBalancePaise: number;
  @ApiProperty({ description: 'Whether you can still enter someone’s code' }) canRedeem: boolean;
  @ApiPropertyOptional({ type: Date, nullable: true, description: 'Until when' })
  redeemBefore: Date | null;
  @ApiPropertyOptional({ type: ParticipantDto, nullable: true }) referredBy: ParticipantDto | null;
  @ApiProperty({ type: [CreditEntryDto], description: 'Newest first (last 30)' })
  entries: CreditEntryDto[];
  @ApiProperty({ type: ReferralRulesDto }) rules: ReferralRulesDto;
}

export class InvitedPersonDto {
  @ApiProperty({ type: ParticipantDto }) user: ParticipantDto;
  @ApiProperty() joinedAt: Date;
  @ApiPropertyOptional({ type: Date, nullable: true }) rewardedAt: Date | null;
}

export class AdminReferralDto {
  @ApiPropertyOptional({ type: String, nullable: true }) code: string | null;
  @ApiPropertyOptional({ type: ParticipantDto, nullable: true }) referredBy: ParticipantDto | null;
  @ApiProperty({ type: [InvitedPersonDto] }) invited: InvitedPersonDto[];
  @ApiProperty() creditBalancePaise: number;
  @ApiProperty({ type: [CreditEntryDto], description: 'Newest first (last 50)' })
  entries: CreditEntryDto[];
}

export class RevokeCreditDto {
  @ApiProperty({ description: 'At most the current balance' })
  @IsInt()
  @Min(1)
  amountPaise: number;

  @ApiProperty({ example: 'Invite code shared on a coupon site' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

/** What the website's /r/<code> page shows. Unknown codes are simply not valid. */
export class ReferralCodeLookupDto {
  @ApiProperty() valid: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'The inviter’s first name, when the code is valid',
  })
  inviterFirstName: string | null;
  @ApiProperty() refereeCreditPaise: number;
  @ApiProperty() redeemWithinDays: number;
}
