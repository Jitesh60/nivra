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
  AdminJwtGuard,
  CurrentAdmin,
  Roles,
  type AdminAuth,
} from '../admin-auth/admin-jwt.guard.js';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { DocumentsService, type adminInclude } from './documents.service.js';
import {
  AdminDocumentDto,
  AdminDocumentPageDto,
  CreateDocumentDto,
  DocumentDto,
  DocumentSideQueryDto,
  DocumentViewDto,
  ListDocumentsQueryDto,
  RejectDocumentDto,
} from './dto/document.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';

type AdminDocumentRow = Prisma.UserDocumentGetPayload<{ include: typeof adminInclude }>;

function toAdminDto(d: AdminDocumentRow): AdminDocumentDto {
  return { ...DocumentDto.from(d), user: d.user, reviewedBy: d.reviewedBy?.name ?? null };
}

@ApiTags('me · documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/documents')
export class MyDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOkResponse({ type: [DocumentDto] })
  async list(@CurrentUser() auth: UserAuth): Promise<DocumentDto[]> {
    return (await this.documents.list(auth.userId)).map(DocumentDto.from);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a document from uploads (purpose DOCUMENT); it waits for admin review',
  })
  @ApiCreatedResponse({ type: DocumentDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'DOCUMENT_ALREADY_EXISTS' })
  async create(
    @CurrentUser() auth: UserAuth,
    @Body() body: CreateDocumentDto,
    @Client() client: ClientInfo,
  ): Promise<DocumentDto> {
    return DocumentDto.from(await this.documents.create(auth.userId, body, client));
  }

  @Get(':id/view')
  @ApiOperation({ summary: 'Short-lived URL to view one side of your document (logged)' })
  @ApiOkResponse({ type: DocumentViewDto })
  async view(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: DocumentSideQueryDto,
    @Client() client: ClientInfo,
  ): Promise<DocumentViewDto> {
    const document = await this.documents.ownDocument(auth.userId, id);
    return this.documents.viewUrl(
      document,
      query.side,
      { actorType: 'USER', actorId: auth.userId },
      client,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document and its files' })
  @ApiNoContentResponse()
  async delete(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.documents.delete(auth.userId, id, client);
  }
}

@ApiTags('admin · documents')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Roles('SUPER_ADMIN', 'OPS')
@Controller('admin/documents')
export class AdminDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Review queue (pending: oldest first)' })
  @ApiOkResponse({ type: AdminDocumentPageDto })
  async list(@Query() query: ListDocumentsQueryDto): Promise<AdminDocumentPageDto> {
    const page = await this.documents.queue(query);
    return { items: page.items.map(toAdminDto), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminDocumentDto })
  async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminDocumentDto> {
    return toAdminDto(await this.documents.adminGet(id));
  }

  @Get(':id/view')
  @ApiOperation({ summary: 'Short-lived URL to one side of the document (logged)' })
  @ApiOkResponse({ type: DocumentViewDto })
  async view(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: DocumentSideQueryDto,
    @Client() client: ClientInfo,
  ): Promise<DocumentViewDto> {
    const document = await this.documents.adminGet(id);
    return this.documents.viewUrl(
      document,
      query.side,
      { actorType: 'ADMIN', actorId: auth.adminId },
      client,
    );
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminDocumentDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'DOCUMENT_NOT_PENDING' })
  async approve(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Client() client: ClientInfo,
  ): Promise<AdminDocumentDto> {
    return toAdminDto(await this.documents.approve(auth.adminId, id, client));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminDocumentDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'DOCUMENT_NOT_PENDING' })
  async reject(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectDocumentDto,
    @Client() client: ClientInfo,
  ): Promise<AdminDocumentDto> {
    return toAdminDto(await this.documents.reject(auth.adminId, id, body.reason, client));
  }
}
