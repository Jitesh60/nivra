import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { ParticipantDto } from '../../safety/dto/safety.dto.js';
import {
  AdminConditionReportDto,
  BookingReviewsDto,
  ConditionReportDto,
  DisputeDto,
  RentalDto,
} from './rental.dto.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const BOOKING_STATUSES = [
  'REQUESTED',
  'AWAITING_DOCS',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'ACTIVE',
  'RETURNED',
  'COMPLETED',
  'DISPUTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
] as const;

export const BOOKING_EVENT_TYPES = [
  'REQUESTED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'DOCS_SUBMITTED',
  'DOCS_APPROVED',
  'DOCS_REJECTED',
  'PAID',
  'HANDED_OVER',
  'RETURNED',
  'NO_SHOW',
  'DISPUTED',
  'COMPLETED',
  'DISPUTE_RESOLVED',
] as const;

const DOC_TYPES = [
  'AADHAAR_MASKED',
  'PAN',
  'DRIVING_LICENCE',
  'PASSPORT',
  'VOTER_ID',
  'COLLEGE_ID',
  'EMPLOYEE_ID',
  'ADDRESS_PROOF',
  'OTHER',
] as const;
const REQUIRED_DOC_TYPES = ['GOVERNMENT_ID', 'COLLEGE_OR_EMPLOYEE_ID', 'ADDRESS_PROOF', 'OTHER'];

// ── Requests ──

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId: string;

  @ApiProperty({ format: 'date', example: '2026-10-12' })
  @Matches(ISO_DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ format: 'date', example: '2026-10-16' })
  @Matches(ISO_DATE, { message: 'endDate must be YYYY-MM-DD' })
  endDate: string;
}

export class ListBookingsQueryDto {
  @ApiProperty({ enum: ['BORROWER', 'LENDER'], description: 'Bookings you made, or of your items' })
  @IsIn(['BORROWER', 'LENDER'])
  role: 'BORROWER' | 'LENDER';

  @ApiPropertyOptional({ enum: ['OPEN', 'PAST'], default: 'OPEN' })
  @IsOptional()
  @IsIn(['OPEN', 'PAST'])
  scope: 'OPEN' | 'PAST' = 'OPEN';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class ReasonDto {
  @ApiProperty({ minLength: 3, maxLength: 300 })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export class OptionalReasonDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ShareChoiceDto {
  @ApiProperty({ format: 'uuid', description: 'One of the booking’s `requiredDocs`' })
  @IsUUID()
  requiredDocId: string;

  @ApiProperty({ format: 'uuid', description: 'A document from your vault' })
  @IsUUID()
  userDocumentId: string;
}

export class ShareDocumentsDto {
  @ApiProperty({ type: [ShareChoiceDto], description: 'One vault document per required document' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ShareChoiceDto)
  shares: ShareChoiceDto[];
}

// ── Responses ──

export class BookingListingDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ type: String, nullable: true }) thumbUrl: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) areaLabel: string | null;
}

export class BookingRequiredDocDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: REQUIRED_DOC_TYPES }) docType: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ enum: DOC_TYPES, isArray: true, description: 'Vault documents that count' })
  accepts: string[];
}

export class BookingActionsDto {
  @ApiProperty() accept: boolean;
  @ApiProperty() decline: boolean;
  @ApiProperty() cancel: boolean;
  @ApiProperty({ description: 'Borrower: share documents now' }) shareDocs: boolean;
  @ApiProperty({ description: 'Lender: approve or reject shared documents now' })
  reviewDocs: boolean;
  @ApiProperty({ description: 'Borrower: pay now (POST /bookings/:id/pay)' }) pay: boolean;
  @ApiProperty({ description: 'Lender: confirm the handover with the borrower’s code' })
  handover: boolean;
  @ApiProperty({ description: 'Borrower: confirm the return with the lender’s code' })
  return: boolean;
  @ApiProperty({ description: 'Lender: the borrower didn’t come for the pickup' })
  noShow: boolean;
  @ApiProperty({ description: 'Lender: report a problem (claim from the deposit)' })
  dispute: boolean;
  @ApiProperty({ description: 'Show your code to the other person (GET /bookings/:id/code)' })
  showCode: boolean;
  @ApiProperty({ description: 'Add condition photos now' }) addPhotos: boolean;
  @ApiProperty({ description: 'Borrower: reply to the lender’s claim' }) respond: boolean;
  @ApiProperty({ description: 'Rate the other person' }) review: boolean;
}

export class BookingRefundDto {
  @ApiProperty() amountPaise: number;
  @ApiProperty({ enum: ['CANCELLATION', 'LATE_PAYMENT', 'MANUAL', 'DEPOSIT_RETURN'] }) kind: string;
  @ApiProperty({ enum: ['PENDING', 'PROCESSED', 'FAILED'] }) status: string;
  @ApiProperty() createdAt: Date;
}

export class BookingPaymentDto {
  @ApiProperty({ enum: ['CREATED', 'CAPTURED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'] })
  status: string;
  @ApiProperty() amountPaise: number;
  @ApiPropertyOptional({ type: String, nullable: true }) method: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) paidAt: Date | null;
  @ApiProperty({ description: 'Refunded so far (processed or on the way)' }) refundedPaise: number;
  @ApiProperty({ type: [BookingRefundDto] }) refunds: BookingRefundDto[];
}

export class BookingDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: BOOKING_STATUSES }) status: string;
  @ApiProperty({ enum: ['REQUEST', 'OFFER'] }) source: string;
  @ApiProperty({ enum: ['BORROWER', 'LENDER'], description: 'The viewer’s side' }) role: string;
  @ApiProperty({ type: BookingListingDto }) listing: BookingListingDto;
  @ApiProperty({ type: ParticipantDto }) other: ParticipantDto;
  @ApiProperty({ format: 'uuid' }) conversationId: string;
  @ApiProperty({ format: 'date' }) startDate: string;
  @ApiProperty({ format: 'date' }) endDate: string;
  @ApiProperty() days: number;
  @ApiProperty() pricePerDayPaise: number;
  @ApiProperty() rentPaise: number;
  @ApiProperty() feePaise: number;
  @ApiProperty({ description: 'Refundable' }) depositPaise: number;
  @ApiProperty({ description: 'Referral credit taken off the rent' }) creditPaise: number;
  @ApiProperty({ description: 'What the borrower pays: rent + fee + deposit − credit' })
  totalPaise: number;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'The current step times out then (the booking expires)',
  })
  expiresAt: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) declineReason: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: ['BORROWER', 'LENDER', 'ADMIN'] })
  cancelledBy: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelReason: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class BookingPageDto {
  @ApiProperty({ type: [BookingDto] }) items: BookingDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

export class BookingEventDto {
  @ApiProperty({ enum: BOOKING_EVENT_TYPES }) type: string;
  @ApiProperty({ enum: BOOKING_STATUSES }) status: string;
  @ApiProperty({ enum: ['BORROWER', 'LENDER', 'ADMIN', 'SYSTEM'] }) by: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note: string | null;
  @ApiProperty() at: Date;
}

export class DocumentViewDto {
  @ApiPropertyOptional({ type: String, nullable: true }) viewerName: string | null;
  @ApiProperty() at: Date;
}

export class SharedDocumentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  requiredDocId: string | null;
  @ApiProperty({ enum: DOC_TYPES }) docType: string;
  @ApiPropertyOptional({ type: String, nullable: true }) label: string | null;
  @ApiProperty({ description: 'Sajha had verified it when it was shared' }) verified: boolean;
  @ApiProperty({ enum: ['SUBMITTED', 'APPROVED', 'REJECTED'] }) status: string;
  @ApiProperty() hasBack: boolean;
  @ApiProperty({ description: 'The lender can open it now' }) viewable: boolean;
  @ApiProperty({
    type: [DocumentViewDto],
    description: 'Who opened it and when (shown to the borrower only; empty for the lender)',
  })
  views: DocumentViewDto[];
}

export class BookingDetailDto extends BookingDto {
  @ApiPropertyOptional({
    type: BookingPaymentDto,
    nullable: true,
    description: 'The payment, once one was made (or the latest attempt)',
  })
  payment: BookingPaymentDto | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Exact pickup address: the borrower sees it once the booking is confirmed',
  })
  pickupAddress: string | null;
  @ApiProperty({ type: [BookingRequiredDocDto] }) requiredDocs: BookingRequiredDocDto[];
  @ApiProperty({ type: [SharedDocumentDto] }) sharedDocuments: SharedDocumentDto[];
  @ApiProperty({ type: [BookingEventDto], description: 'Oldest first' }) events: BookingEventDto[];
  @ApiProperty({ type: BookingActionsDto }) can: BookingActionsDto;
  @ApiPropertyOptional({
    type: RentalDto,
    nullable: true,
    description: 'Handover, return and late fee (paid bookings)',
  })
  rental: RentalDto | null;
  @ApiProperty({ type: [ConditionReportDto], description: 'Photos at handover and return' })
  conditionReports: ConditionReportDto[];
  @ApiPropertyOptional({ type: DisputeDto, nullable: true }) dispute: DisputeDto | null;
  @ApiProperty({ type: BookingReviewsDto }) reviews: BookingReviewsDto;
}

export class CancelPreviewDto {
  @ApiProperty({ description: 'Refunded to the borrower if cancelled now' }) refundPaise: number;
  @ApiProperty() rentPaise: number;
  @ApiProperty() feePaise: number;
  @ApiProperty() depositPaise: number;
  @ApiProperty({ description: 'Rent paid with referral credit that comes back as credit' })
  creditBackPaise: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['FULL', 'HALF_RENT', 'DEPOSIT_ONLY'],
    description: 'Null when nothing was paid',
  })
  tier: string | null;
  @ApiProperty({ description: 'One line for the app to show' }) summary: string;
}

export class DocumentViewUrlDto {
  @ApiProperty({ description: 'Short-lived link (5 minutes)' }) url: string;
  @ApiProperty() expiresAt: Date;
  @ApiProperty({ description: 'Draw this over the image' }) watermark: string;
}

// ── Admin ──

export class AdminBookingPartyDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ type: String, nullable: true }) name: string | null;
  @ApiProperty() phone: string;
}

export class AdminBookingDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: BOOKING_STATUSES }) status: string;
  @ApiProperty({ enum: ['REQUEST', 'OFFER'] }) source: string;
  @ApiProperty({ type: BookingListingDto }) listing: BookingListingDto;
  @ApiProperty({ type: AdminBookingPartyDto }) borrower: AdminBookingPartyDto;
  @ApiProperty({ type: AdminBookingPartyDto }) lender: AdminBookingPartyDto;
  @ApiProperty({ format: 'date' }) startDate: string;
  @ApiProperty({ format: 'date' }) endDate: string;
  @ApiProperty() days: number;
  @ApiProperty() totalPaise: number;
  @ApiPropertyOptional({ type: Date, nullable: true }) expiresAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class AdminBookingPageDto {
  @ApiProperty({ type: [AdminBookingDto] }) items: AdminBookingDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor: string | null;
}

export class AdminBookingEventDto extends BookingEventDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Who did it' })
  actorName: string | null;
}

export class AdminShareViewDto {
  @ApiPropertyOptional({ type: String, nullable: true }) viewerName: string | null;
  @ApiProperty({ enum: ['USER', 'ADMIN'] }) viewerType: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ip: string | null;
  @ApiProperty() at: Date;
}

export class AdminSharedDocumentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: DOC_TYPES }) docType: string;
  @ApiPropertyOptional({ type: String, nullable: true }) label: string | null;
  @ApiProperty() verified: boolean;
  @ApiProperty({ enum: ['SUBMITTED', 'APPROVED', 'REJECTED'] }) status: string;
  @ApiPropertyOptional({ type: Date, nullable: true }) accessExpiresAt: Date | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) purgedAt: Date | null;
  @ApiProperty({ type: [AdminShareViewDto] }) views: AdminShareViewDto[];
}

export class AdminBookingDetailDto extends AdminBookingDto {
  @ApiProperty({ format: 'uuid' }) conversationId: string;
  @ApiProperty() pricePerDayPaise: number;
  @ApiProperty() rentPaise: number;
  @ApiProperty() feePaise: number;
  @ApiProperty() depositPaise: number;
  @ApiProperty({ description: 'Referral credit taken off the rent (Sajha pays it)' })
  creditPaise: number;
  @ApiPropertyOptional({ type: String, nullable: true }) declineReason: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, enum: ['BORROWER', 'LENDER', 'ADMIN'] })
  cancelledBy: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelReason: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) closedAt: Date | null;
  @ApiProperty({ description: 'Bookings this lender cancelled after accepting' })
  lenderCancellations: number;
  @ApiProperty({ type: [BookingRequiredDocDto] }) requiredDocs: BookingRequiredDocDto[];
  @ApiProperty({ type: [AdminSharedDocumentDto] }) sharedDocuments: AdminSharedDocumentDto[];
  @ApiProperty({ type: [AdminBookingEventDto], description: 'Oldest first' })
  events: AdminBookingEventDto[];
  @ApiProperty({ description: 'An admin may cancel it (open, and not handed over yet)' })
  cancellable: boolean;
  @ApiPropertyOptional({ type: RentalDto, nullable: true }) rental: RentalDto | null;
  @ApiProperty({ type: [AdminConditionReportDto] }) conditionReports: AdminConditionReportDto[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) disputeId: string | null;
}

export class AdminListBookingsQueryDto {
  @ApiPropertyOptional({
    enum: ['OPEN', 'AWAITING_PAYMENT', 'CONFIRMED', 'CLOSED'],
    default: 'OPEN',
    description:
      'OPEN: requested or waiting for documents; CONFIRMED: paid (until returned); CLOSED: declined, expired, cancelled, completed',
  })
  @IsOptional()
  @IsIn(['OPEN', 'AWAITING_PAYMENT', 'CONFIRMED', 'CLOSED'])
  tab: 'OPEN' | 'AWAITING_PAYMENT' | 'CONFIRMED' | 'CLOSED' = 'OPEN';

  @ApiPropertyOptional({ description: 'Listing title, or a borrower’s or lender’s name or phone' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}
