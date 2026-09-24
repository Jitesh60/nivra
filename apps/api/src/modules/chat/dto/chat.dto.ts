import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ParticipantDto } from '../../safety/dto/safety.dto.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MESSAGE_MAX_CHARS = 2000;
export const OFFER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'COUNTERED',
  'DECLINED',
  'EXPIRED',
  'SUPERSEDED',
] as const;

export class StartConversationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId: string;
}

export class ChatListingDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ type: String, nullable: true }) thumbUrl: string | null;
  @ApiProperty({ description: 'Listing status; chats continue if it is paused' }) status: string;
  @ApiProperty() pricePerDayPaise: number;
  @ApiProperty() depositPaise: number;
  @ApiProperty() minDays: number;
  @ApiProperty() maxDays: number;
}

export class OfferDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) conversationId: string;
  @ApiProperty({ format: 'uuid' }) proposedById: string;
  @ApiProperty({ description: 'Proposed by the viewer' }) mine: boolean;
  @ApiProperty({ format: 'date' }) startDate: string;
  @ApiProperty({ format: 'date' }) endDate: string;
  @ApiProperty() days: number;
  @ApiProperty() pricePerDayPaise: number;
  @ApiProperty({ description: 'pricePerDay × days (no weekly discount on a negotiated price)' })
  rentPaise: number;
  @ApiProperty({ description: 'Refundable, from the listing' }) depositPaise: number;
  @ApiProperty() totalPaise: number;
  @ApiProperty({ enum: OFFER_STATUSES }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) parentOfferId:
    string | null;
  @ApiProperty({ description: 'A pending offer lapses at this time' }) expiresAt: Date;
  @ApiProperty() createdAt: Date;
}

export class MessageDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) conversationId: string;
  @ApiProperty({ format: 'uuid' }) senderId: string;
  @ApiProperty({ description: 'Sent by the viewer' }) mine: boolean;
  @ApiProperty({ enum: ['TEXT', 'IMAGE', 'OFFER', 'SYSTEM'] }) type: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Text as the viewer may see it: the sender gets what they typed, the other person gets contact details replaced with •••',
  })
  body: string | null;
  @ApiProperty({
    description:
      'Contact details in this message are hidden from the other person (until a booking is confirmed)',
  })
  masked: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Short-lived link' })
  imageUrl: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Short-lived link' })
  thumbUrl: string | null;
  @ApiPropertyOptional({ type: OfferDto, nullable: true }) offer: OfferDto | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Echoed to the sender only' })
  clientId: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) readAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class ConversationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: ChatListingDto }) listing: ChatListingDto;
  @ApiProperty({ enum: ['BORROWER', 'LENDER'], description: 'The viewer’s side' }) role: string;
  @ApiProperty({ type: ParticipantDto }) other: ParticipantDto;
  @ApiProperty() lastMessageAt: Date;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Masked' })
  lastMessagePreview: string | null;
  @ApiProperty() unreadCount: number;
  @ApiProperty({ description: 'The viewer blocked the other person' }) blockedByMe: boolean;
  @ApiProperty({ description: 'Messages and offers are allowed (no block either way)' })
  canMessage: boolean;
  @ApiPropertyOptional({ type: OfferDto, nullable: true, description: 'The open offer, if any' })
  pendingOffer: OfferDto | null;
  @ApiPropertyOptional({ type: OfferDto, nullable: true, description: 'The agreed deal, if any' })
  acceptedOffer: OfferDto | null;
}

export class ConversationPageDto {
  @ApiProperty({ type: [ConversationDto] }) items: ConversationDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

export class MessagePageDto {
  @ApiProperty({ type: [MessageDto], description: 'Newest first' }) items: MessageDto[];
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Pass as `before`',
  })
  nextCursor: string | null;
}

export class UnreadDto {
  @ApiProperty({ description: 'Conversations with unread messages' }) conversations: number;
  @ApiProperty() messages: number;
}

export class ListConversationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Messages older than this one' })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}

export class SendMessageDto {
  @ApiProperty({ enum: ['TEXT', 'IMAGE'] })
  @IsIn(['TEXT', 'IMAGE'])
  type: 'TEXT' | 'IMAGE';

  @ApiPropertyOptional({ maxLength: MESSAGE_MAX_CHARS, description: 'Required for TEXT' })
  @ValidateIf((o: SendMessageDto) => o.type === 'TEXT')
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_MAX_CHARS)
  body?: string;

  @ApiPropertyOptional({
    description: 'Required for IMAGE: `key` from POST /v1/uploads (CHAT_IMAGE)',
  })
  @ValidateIf((o: SendMessageDto) => o.type === 'IMAGE')
  @IsString()
  @MaxLength(300)
  key?: string;

  @ApiProperty({ description: 'Chosen by the app; resending the same id returns the same message' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  clientId: string;
}

export class MarkReadDto {
  @ApiProperty({ format: 'uuid', description: 'Everything up to and including this message' })
  @IsUUID()
  upTo: string;
}

export class CreateOfferDto {
  @ApiProperty({ format: 'date', example: '2026-10-12' })
  @Matches(ISO_DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ format: 'date', example: '2026-10-16' })
  @Matches(ISO_DATE, { message: 'endDate must be YYYY-MM-DD' })
  endDate: string;

  @ApiProperty({ example: 12000 })
  @IsInt()
  pricePerDayPaise: number;
}
