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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { ConversationsService } from './conversations.service.js';
import {
  ConversationDto,
  ConversationPageDto,
  CreateOfferDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  MarkReadDto,
  MessageDto,
  MessagePageDto,
  OfferDto,
  SendMessageDto,
  StartConversationDto,
  UnreadDto,
} from './dto/chat.dto.js';
import { MessagesService } from './messages.service.js';
import { OffersService } from './offers.service.js';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ChatController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly offers: OffersService,
  ) {}

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Open the chat about a listing (or return the existing one). Needs a verified phone and email.',
  })
  @ApiOkResponse({ type: ConversationDto })
  @ApiForbiddenResponse({ type: ErrorResponse, description: 'VERIFICATION_REQUIRED, USER_BLOCKED' })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'CONVERSATION_NOT_ALLOWED (own listing)',
  })
  start(
    @CurrentUser() auth: UserAuth,
    @Body() body: StartConversationDto,
  ): Promise<ConversationDto> {
    return this.conversations.start(auth.userId, body.listingId);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Inbox, most recent first' })
  @ApiOkResponse({ type: ConversationPageDto })
  list(
    @CurrentUser() auth: UserAuth,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ConversationPageDto> {
    return this.conversations.list(auth.userId, query);
  }

  @Get('me/unread')
  @ApiOperation({ summary: 'Unread counts for the inbox badge' })
  @ApiOkResponse({ type: UnreadDto })
  unread(@CurrentUser() auth: UserAuth): Promise<UnreadDto> {
    return this.conversations.unread(auth.userId);
  }

  @Get('conversations/:id')
  @ApiOkResponse({ type: ConversationDto })
  get(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConversationDto> {
    return this.conversations.get(id, auth.userId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Messages, newest first; page back with `before`' })
  @ApiOkResponse({ type: MessagePageDto })
  messagesPage(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<MessagePageDto> {
    return this.messages.list(id, auth.userId, query);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({
    summary:
      'Send text or a photo (CHAT_IMAGE upload). Contact details are hidden from the other person. 30 a minute.',
  })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiForbiddenResponse({ type: ErrorResponse, description: 'USER_BLOCKED' })
  send(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendMessageDto,
  ): Promise<MessageDto> {
    return this.messages.send(id, auth.userId, body);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark the other person’s messages as read, up to a message' })
  @ApiNoContentResponse()
  async read(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MarkReadDto,
  ): Promise<void> {
    await this.messages.markRead(id, auth.userId, body.upTo);
  }

  @Post('conversations/:id/offers')
  @ApiOperation({ summary: 'Make an offer: dates and a price per day. Replaces any open offer.' })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'OFFER_DATES_UNAVAILABLE' })
  offer(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateOfferDto,
  ): Promise<MessageDto> {
    return this.offers.create(id, auth.userId, body);
  }

  @Post('offers/:id/counter')
  @ApiOperation({ summary: 'Answer the other person’s offer with your own dates or price' })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'OFFER_NOT_PENDING, OFFER_EXPIRED' })
  @ApiForbiddenResponse({ type: ErrorResponse, description: 'OFFER_OWN' })
  counter(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateOfferDto,
  ): Promise<MessageDto> {
    return this.offers.counter(id, auth.userId, body);
  }

  @Post('offers/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept the other person’s offer: the deal is locked for booking' })
  @ApiOkResponse({ type: OfferDto })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'OFFER_NOT_PENDING, OFFER_EXPIRED, OFFER_DATES_UNAVAILABLE',
  })
  @ApiForbiddenResponse({ type: ErrorResponse, description: 'OFFER_OWN' })
  accept(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OfferDto> {
    return this.offers.accept(id, auth.userId);
  }

  @Post('offers/:id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OfferDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'OFFER_NOT_PENDING, OFFER_EXPIRED' })
  @ApiForbiddenResponse({ type: ErrorResponse, description: 'OFFER_OWN' })
  decline(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OfferDto> {
    return this.offers.decline(id, auth.userId);
  }
}
