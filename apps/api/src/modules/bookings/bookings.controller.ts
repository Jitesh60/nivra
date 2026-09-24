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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
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
import { BookingDocumentsService } from './booking-documents.service.js';
import { BookingsService } from './bookings.service.js';
import {
  AdminBookingDetailDto,
  AdminBookingPageDto,
  AdminListBookingsQueryDto,
  BookingDetailDto,
  BookingPageDto,
  CreateBookingDto,
  DocumentViewUrlDto,
  ListBookingsQueryDto,
  OptionalReasonDto,
  ReasonDto,
  ShareDocumentsDto,
} from './dto/booking.dto.js';

const TRANSITION_CONFLICT = 'BOOKING_INVALID_TRANSITION (it has moved on)';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly documents: BookingDocumentsService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Request to book at the listed price. Needs a verified phone and email; the lender has 24 hours to reply.',
  })
  @ApiCreatedResponse({ type: BookingDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'BOOKING_OWN_LISTING' })
  @ApiForbiddenResponse({ type: ErrorResponse, description: 'VERIFICATION_REQUIRED, USER_BLOCKED' })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'BOOKING_DATES_UNAVAILABLE (details.reason), BOOKING_OPEN_EXISTS',
  })
  create(@CurrentUser() auth: UserAuth, @Body() body: CreateBookingDto): Promise<BookingDetailDto> {
    return this.bookings.request(auth.userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'My bookings as a borrower or a lender, newest first' })
  @ApiOkResponse({ type: BookingPageDto })
  list(
    @CurrentUser() auth: UserAuth,
    @Query() query: ListBookingsQueryDto,
  ): Promise<BookingPageDto> {
    return this.bookings.list(auth.userId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'A booking with its timeline, documents and what the viewer can do (`can`)',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  get(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lender: accept a request (then documents, if the listing asks for them, or payment)',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: `BOOKING_DATES_TAKEN (another booking holds the dates), ${TRANSITION_CONFLICT}`,
  })
  accept(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.accept(id, auth.userId);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lender: decline a request, optionally saying why' })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: TRANSITION_CONFLICT })
  decline(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: OptionalReasonDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.decline(id, auth.userId, body.reason);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel with a reason. Borrower: any time before payment. Lender: after accepting (it counts against them).',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: TRANSITION_CONFLICT })
  cancel(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReasonDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.cancel(id, auth.userId, body.reason);
  }

  @Post(':id/documents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Borrower: share one vault document per required document with this lender, for this booking only',
  })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'BOOKING_DOCS_MISMATCH' })
  @ApiConflictResponse({ type: ErrorResponse, description: TRANSITION_CONFLICT })
  async share(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ShareDocumentsDto,
    @Client() client: ClientInfo,
  ): Promise<BookingDetailDto> {
    await this.documents.submit(id, auth.userId, body.shares, client);
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/documents/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lender: approve the shared documents (the dates are then held)' })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: `BOOKING_DATES_TAKEN, ${TRANSITION_CONFLICT}`,
  })
  async approve(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BookingDetailDto> {
    await this.documents.approve(id, auth.userId);
    return this.bookings.get(id, auth.userId);
  }

  @Post(':id/documents/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lender: don’t accept the documents (declines the booking)' })
  @ApiOkResponse({ type: BookingDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: TRANSITION_CONFLICT })
  async reject(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReasonDto,
  ): Promise<BookingDetailDto> {
    await this.documents.reject(id, auth.userId, body.reason);
    return this.bookings.get(id, auth.userId);
  }

  @Get(':id/documents/:shareId/view')
  @ApiOperation({
    summary:
      'Lender: a 5-minute link to a shared document, while the booking is in progress. Every view is logged.',
  })
  @ApiQuery({ name: 'side', enum: ['front', 'back'], required: false })
  @ApiOkResponse({ type: DocumentViewUrlDto })
  @ApiGoneResponse({ type: ErrorResponse, description: 'DOCUMENT_ACCESS_ENDED' })
  view(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('shareId', new ParseUUIDPipe()) shareId: string,
    @Client() client: ClientInfo,
    @Query('side') side?: string,
  ): Promise<DocumentViewUrlDto> {
    return this.documents.viewUrl(
      id,
      shareId,
      side === 'back' ? 'back' : 'front',
      auth.userId,
      client,
    );
  }
}

@ApiTags('admin · bookings')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Bookings by tab, newest first; search by listing or person' })
  @ApiOkResponse({ type: AdminBookingPageDto })
  list(@Query() query: AdminListBookingsQueryDto): Promise<AdminBookingPageDto> {
    return this.bookings.adminList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A booking with its timeline and document access log' })
  @ApiOkResponse({ type: AdminBookingDetailDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminBookingDetailDto> {
    return this.bookings.adminGet(id);
  }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an open booking with a reason (shown to both people)' })
  @ApiOkResponse({ type: AdminBookingDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: TRANSITION_CONFLICT })
  cancel(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminBookingDetailDto> {
    return this.bookings.adminCancel(id, auth.adminId, body.reason, client);
  }
}
