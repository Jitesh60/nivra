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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
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
import {
  AdminItemRequestDto,
  AdminItemRequestPageDto,
  AdminListRequestsQueryDto,
  CreateRequestDto,
  ItemRequestDetailDto,
  ItemRequestPageDto,
  ListRequestsQueryDto,
  RemoveRequestDto,
  RespondToRequestDto,
} from './dto/request.dto.js';
import { REQUEST_RULES as R } from './request-rules.js';
import { RequestsService } from './requests.service.js';

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post('requests')
  @ApiOperation({
    summary: `Ask the community for an item (verified people; ${R.maxOpen} open, ${R.perDay} a day)`,
  })
  @ApiCreatedResponse({ type: ItemRequestDetailDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'REQUEST_LIMIT' })
  create(
    @CurrentUser() auth: UserAuth,
    @Body() dto: CreateRequestDto,
  ): Promise<ItemRequestDetailDto> {
    return this.requests.create(auth.userId, dto);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Open requests near a point, nearest first' })
  @ApiOkResponse({ type: ItemRequestPageDto })
  list(
    @CurrentUser() auth: UserAuth,
    @Query() query: ListRequestsQueryDto,
  ): Promise<ItemRequestPageDto> {
    return this.requests.list(auth.userId, query);
  }

  @Get('me/requests')
  @ApiOperation({ summary: 'Your requests, newest first, with every answer' })
  @ApiOkResponse({ type: [ItemRequestDetailDto] })
  mine(@CurrentUser() auth: UserAuth): Promise<ItemRequestDetailDto[]> {
    return this.requests.mine(auth.userId);
  }

  @Get('requests/:id')
  @ApiOkResponse({ type: ItemRequestDetailDto })
  get(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ItemRequestDetailDto> {
    return this.requests.get(auth.userId, id);
  }

  @Post('requests/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close your request (found one, or no longer needed)' })
  @ApiOkResponse({ type: ItemRequestDetailDto })
  close(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ItemRequestDetailDto> {
    return this.requests.close(auth.userId, id);
  }

  @Post('requests/:id/responses')
  @ApiOperation({
    summary: `Offer one of your live listings: opens the chat about it with your message (${R.responsesPerDay} a day)`,
  })
  @ApiCreatedResponse({ type: ItemRequestDetailDto })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'REQUEST_NOT_OPEN, REQUEST_ALREADY_ANSWERED',
  })
  respond(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RespondToRequestDto,
  ): Promise<ItemRequestDetailDto> {
    return this.requests.respond(auth.userId, id, dto);
  }
}

@ApiTags('admin · requests')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/requests')
export class AdminRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Requests board posts, newest first' })
  @ApiOkResponse({ type: AdminItemRequestPageDto })
  list(@Query() query: AdminListRequestsQueryDto): Promise<AdminItemRequestPageDto> {
    return this.requests.adminList(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminItemRequestDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminItemRequestDto> {
    return this.requests.adminGet(id);
  }

  @Post(':id/remove')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a request off the board, with a reason the borrower sees' })
  @ApiOkResponse({ type: AdminItemRequestDto })
  remove(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RemoveRequestDto,
    @Client() client: ClientInfo,
  ): Promise<AdminItemRequestDto> {
    return this.requests.adminRemove(auth.adminId, id, dto.reason, client);
  }
}
