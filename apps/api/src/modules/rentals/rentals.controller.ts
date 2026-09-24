import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import {
  type AdminAuth,
  AdminJwtGuard,
  CurrentAdmin,
  Roles,
} from '../admin-auth/admin-jwt.guard.js';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { BookingDetailDto, OptionalReasonDto } from '../bookings/dto/booking.dto.js';
import {
  AddPhotosDto,
  AdminDisputeDetailDto,
  AdminDisputePageDto,
  AdminDisputesQueryDto,
  BookingCodeDto,
  ConfirmStageDto,
  DisputeResponseDto,
  OpenDisputeDto,
  ResolveDisputeDto,
  ReviewPageDto,
  ReviewsQueryDto,
  WriteReviewDto,
} from '../bookings/dto/rental.dto.js';
import { DisputesService } from './disputes.service.js';
import { HandoverService } from './handover.service.js';
import { ReviewsService } from './reviews.service.js';
import { PublicReadLimitGuard } from '../../common/http/public-read-limit.guard.js';

const MOVED = 'BOOKING_INVALID_TRANSITION (it has moved on)';

@ApiTags('rentals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class RentalsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly handover: HandoverService,
    private readonly disputes: DisputesService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get(':id/code')
  @ApiOperation({
    summary:
      'The code you show: the borrower’s at handover (CONFIRMED), the lender’s at return (ACTIVE)',
  })
  @ApiOkResponse({ type: BookingCodeDto })
  @ApiConflictResponse({ type: ErrorResponse, description: MOVED })
  code(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BookingCodeDto> {
    return this.handover.myCode(id, auth.userId);
  }

  @Post(':id/handover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Lender: confirm the handover with the borrower’s code and 2–6 condition photos (from the day before the start)',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'BOOKING_CODE_INVALID (details.triesLeft), PHOTOS_REQUIRED, HANDOVER_TOO_EARLY',
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponse, description: 'BOOKING_CODE_LOCKED' })
  @ApiConflictResponse({ type: ErrorResponse, description: MOVED })
  async handOver(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ConfirmStageDto,
  ): Promise<BookingDetailDto> {
    await this.handover.handOver(id, auth.userId, body);
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Borrower: confirm the return with the lender’s code and 2–6 photos. Late days cost 1× the daily rate each, from the deposit.',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'BOOKING_CODE_INVALID (details.triesLeft), PHOTOS_REQUIRED',
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponse, description: 'BOOKING_CODE_LOCKED' })
  @ApiConflictResponse({ type: ErrorResponse, description: MOVED })
  async markReturned(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ConfirmStageDto,
  ): Promise<BookingDetailDto> {
    await this.handover.markReturned(id, auth.userId, body);
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/photos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Add your condition photos: handover photos while the item is out, return photos during the claim window (6 each at most)',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: MOVED })
  async addPhotos(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AddPhotosDto,
  ): Promise<BookingDetailDto> {
    await this.handover.addPhotos(id, auth.userId, body);
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Lender: the borrower didn’t come (from the first rental day). Cancelled as a late borrower cancellation: the deposit goes back, the rent share is paid to you.',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: MOVED })
  async noShow(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: OptionalReasonDto,
  ): Promise<BookingDetailDto> {
    await this.handover.noShow(id, auth.userId, body.reason);
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Lender: report a problem within 24 hours of the return (or “not returned” from 2 days overdue), claiming part of the deposit',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'KEEP_TOO_LARGE (details.maxPaise)' })
  @ApiConflictResponse({ type: ErrorResponse, description: `DISPUTE_WINDOW_CLOSED, ${MOVED}` })
  async openDispute(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: OpenDisputeDto,
  ): Promise<BookingDetailDto> {
    await this.disputes.open(id, auth.userId, body);
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/dispute/response')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borrower: give your side of the lender’s claim (once)' })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: MOVED })
  async respond(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DisputeResponseDto,
  ): Promise<BookingDetailDto> {
    await this.disputes.respond(id, auth.userId, body);
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rate the other person after completion (within 14 days). Hidden until they review too, or 7 days after completion.',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'REVIEW_NOT_ALLOWED' })
  async review(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: WriteReviewDto,
  ): Promise<BookingDetailDto> {
    await this.reviews.write(id, auth.userId, body);
    return this.bookings.get(id, auth.userId);
  }
}

@ApiTags('reviews')
@UseGuards(PublicReadLimitGuard)
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('users/:id/reviews')
  @ApiOperation({ summary: 'Published reviews of a person, newest first' })
  @ApiOkResponse({ type: ReviewPageDto })
  forUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ReviewsQueryDto,
  ): Promise<ReviewPageDto> {
    return this.reviews.forUser(id, query);
  }

  @Get('listings/:id/reviews')
  @ApiOperation({ summary: 'Borrowers’ published reviews of rentals of an item, newest first' })
  @ApiOkResponse({ type: ReviewPageDto })
  forListing(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ReviewsQueryDto,
  ): Promise<ReviewPageDto> {
    return this.reviews.forListing(id, query);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  @ApiOperation({ summary: 'Disputes, newest first' })
  @ApiOkResponse({ type: AdminDisputePageDto })
  list(@Query() query: AdminDisputesQueryDto): Promise<AdminDisputePageDto> {
    return this.disputes.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'A dispute with the claim, the borrower’s reply, condition photos from both sides and the most that can be kept',
  })
  @ApiOkResponse({ type: AdminDisputeDetailDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminDisputeDetailDto> {
    return this.disputes.get(id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles('SUPER_ADMIN', 'OPS')
  @ApiOperation({
    summary:
      'Decide how much of the deposit the lender keeps; the rest goes back to the borrower and the booking completes (audited)',
  })
  @ApiOkResponse({ type: AdminDisputeDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'KEEP_TOO_LARGE (details.maxPaise)' })
  resolve(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveDisputeDto,
    @Client() client: ClientInfo,
  ): Promise<AdminDisputeDetailDto> {
    return this.disputes.resolve(id, auth.adminId, body, client);
  }
}
