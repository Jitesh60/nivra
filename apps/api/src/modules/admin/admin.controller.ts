import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import {
  AdminJwtGuard,
  CurrentAdmin,
  Roles,
  type AdminAuth,
} from '../admin-auth/admin-jwt.guard.js';
import { AdminDto } from '../admin-auth/dto/admin-auth.dto.js';
import { DocumentDto } from '../documents/dto/document.dto.js';
import { UserPresenter } from '../users/user-presenter.js';
import { AdminUsersService, type UserAction } from './admin-users.service.js';
import { AdminsService } from './admins.service.js';
import {
  AdminUserDetailDto,
  CreateAdminDto,
  CreateAdminResponseDto,
  UserActionDto,
  ListUsersQueryDto,
  UpdateAdminDto,
  UserPageDto,
} from './dto/admin.dto.js';

@ApiTags('admin · admins')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @ApiOkResponse({ type: [AdminDto] })
  async list(): Promise<AdminDto[]> {
    return (await this.admins.list()).map(AdminDto.from);
  }

  @Post()
  @ApiOperation({ summary: 'Invite an admin (returns a one-time temporary password)' })
  @ApiCreatedResponse({ type: CreateAdminResponseDto })
  async create(
    @CurrentAdmin() auth: AdminAuth,
    @Body() body: CreateAdminDto,
    @Client() client: ClientInfo,
  ): Promise<CreateAdminResponseDto> {
    const { admin, temporaryPassword } = await this.admins.create(auth.adminId, body, client);
    return { admin: AdminDto.from(admin), temporaryPassword };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, change role, or disable/enable an admin' })
  @ApiOkResponse({ type: AdminDto })
  async update(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAdminDto,
    @Client() client: ClientInfo,
  ): Promise<AdminDto> {
    return AdminDto.from(await this.admins.update(auth.adminId, id, body, client));
  }
}

@ApiTags('admin · users')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly presenter: UserPresenter,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List and search app users (read-only)' })
  @ApiOkResponse({ type: UserPageDto })
  async list(@Query() query: ListUsersQueryDto): Promise<UserPageDto> {
    const page = await this.users.list(query);
    return { items: page.items.map((u) => this.presenter.present(u)), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @ApiOperation({ summary: 'User detail: profile, badges, documents, sessions, activity' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  async detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminUserDetailDto> {
    const d = await this.users.detail(id);
    return {
      user: this.presenter.present(d.user),
      documents: d.documents.map(DocumentDto.from),
      activeSessions: d.activeSessions,
      activity: d.activity.map((a) => ({
        action: a.action,
        actorType: a.actorType,
        actorId: a.actorId,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  @Post(':id/suspend')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend (signs the user out everywhere)' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  suspend(
    @CurrentAdmin() a: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: UserActionDto,
    @Client() c: ClientInfo,
  ) {
    return this.act(a, id, 'suspend', b.reason, c);
  }

  @Post(':id/ban')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban (signs the user out everywhere)' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  ban(
    @CurrentAdmin() a: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: UserActionDto,
    @Client() c: ClientInfo,
  ) {
    return this.act(a, id, 'ban', b.reason, c);
  }

  @Post(':id/reactivate')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminUserDetailDto })
  reactivate(
    @CurrentAdmin() a: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: UserActionDto,
    @Client() c: ClientInfo,
  ) {
    return this.act(a, id, 'reactivate', b.reason, c);
  }

  private async act(
    auth: AdminAuth,
    id: string,
    action: UserAction,
    reason: string,
    client: ClientInfo,
  ) {
    await this.users.setStatus(auth.adminId, id, action, reason, client);
    return this.detail(id);
  }
}
