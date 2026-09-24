import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { BlocksService } from './blocks.service.js';
import {
  AdminReportDto,
  AdminReportPageDto,
  AdminTranscriptDto,
  BlockedUserDto,
  CreateReportDto,
  ListReportsQueryDto,
  ReportCreatedDto,
  ResolveReportDto,
  TranscriptQueryDto,
} from './dto/safety.dto.js';
import { ReportsService } from './reports.service.js';
import { TranscriptsService } from './transcripts.service.js';

@ApiTags('me · safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SafetyController {
  constructor(
    private readonly blocks: BlocksService,
    private readonly reports: ReportsService,
  ) {}

  @Get('me/blocks')
  @ApiOkResponse({ type: [BlockedUserDto] })
  list(@CurrentUser() auth: UserAuth): Promise<BlockedUserDto[]> {
    return this.blocks.list(auth.userId);
  }

  @Put('me/blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Block someone: no messages or offers either way (idempotent)' })
  @ApiNoContentResponse()
  async block(
    @CurrentUser() auth: UserAuth,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<void> {
    await this.blocks.block(auth.userId, userId);
  }

  @Delete('me/blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async unblock(
    @CurrentUser() auth: UserAuth,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<void> {
    await this.blocks.unblock(auth.userId, userId);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Report a user, a listing or a chat message (10 a day)' })
  @ApiCreatedResponse({ type: ReportCreatedDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'REPORT_DUPLICATE' })
  report(@CurrentUser() auth: UserAuth, @Body() body: CreateReportDto): Promise<ReportCreatedDto> {
    return this.reports.create(auth.userId, body);
  }
}

@ApiTags('admin · reports')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin')
export class AdminSafetyController {
  constructor(
    private readonly reports: ReportsService,
    private readonly transcripts: TranscriptsService,
  ) {}

  @Get('reports')
  @ApiOperation({ summary: 'Reports by status (open: oldest first)' })
  @ApiOkResponse({ type: AdminReportPageDto })
  list(@Query() query: ListReportsQueryDto): Promise<AdminReportPageDto> {
    return this.reports.list(query);
  }

  @Get('reports/:id')
  @ApiOkResponse({ type: AdminReportDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminReportDto> {
    return this.reports.get(id);
  }

  @Post('reports/:id/resolve')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a report as actioned or dismissed, with a note' })
  @ApiOkResponse({ type: AdminReportDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'REPORT_STATUS_CONFLICT' })
  resolve(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveReportDto,
    @Client() client: ClientInfo,
  ): Promise<AdminReportDto> {
    return this.reports.resolve(auth.adminId, id, body.outcome, body.note, client);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Read-only transcript with original text (every view is audited)' })
  @ApiOkResponse({ type: AdminTranscriptDto })
  transcript(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: TranscriptQueryDto,
    @Client() client: ClientInfo,
  ): Promise<AdminTranscriptDto> {
    return this.transcripts.get(auth.adminId, id, query, client);
  }
}
