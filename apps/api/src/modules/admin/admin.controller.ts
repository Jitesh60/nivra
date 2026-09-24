import {
  Body,
  Controller,
  Get,
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
import { UserDto } from '../users/dto/user.dto.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminsService } from './admins.service.js';
import {
  CreateAdminDto,
  CreateAdminResponseDto,
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
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List and search app users (read-only)' })
  @ApiOkResponse({ type: UserPageDto })
  async list(@Query() query: ListUsersQueryDto): Promise<UserPageDto> {
    const page = await this.users.list(query);
    return { items: page.items.map(UserDto.from), nextCursor: page.nextCursor };
  }
}
