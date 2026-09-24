import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { UserResponseDto } from '../auth/dto/auth.dto.js';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { SessionDto, SetAvatarDto, UpdateMeDto } from './dto/me.dto.js';
import { UserPresenter } from './user-presenter.js';
import { UsersService } from './users.service.js';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly presenter: UserPresenter,
  ) {}

  @Get()
  @ApiOkResponse({ type: UserResponseDto })
  async me(@CurrentUser() auth: UserAuth): Promise<UserResponseDto> {
    return { user: await this.presenter.load(auth.userId) };
  }

  @Patch()
  @ApiOperation({ summary: 'Update name, city and bio' })
  @ApiOkResponse({ type: UserResponseDto })
  async update(@CurrentUser() auth: UserAuth, @Body() body: UpdateMeDto): Promise<UserResponseDto> {
    await this.users.updateProfile(auth.userId, body);
    return { user: await this.presenter.load(auth.userId) };
  }

  @Put('avatar')
  @ApiOperation({
    summary: 'Set the avatar from an upload (purpose AVATAR); it becomes a 512×512 WebP',
  })
  @ApiOkResponse({ type: UserResponseDto })
  async setAvatar(
    @CurrentUser() auth: UserAuth,
    @Body() body: SetAvatarDto,
  ): Promise<UserResponseDto> {
    await this.users.setAvatar(auth.userId, body.key);
    return { user: await this.presenter.load(auth.userId) };
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Remove the avatar' })
  @ApiOkResponse({ type: UserResponseDto })
  async removeAvatar(@CurrentUser() auth: UserAuth): Promise<UserResponseDto> {
    await this.users.removeAvatar(auth.userId);
    return { user: await this.presenter.load(auth.userId) };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Devices currently signed in' })
  @ApiOkResponse({ type: [SessionDto] })
  async listSessions(@CurrentUser() auth: UserAuth): Promise<SessionDto[]> {
    const sessions = await this.sessions.listActive('USER', auth.userId);
    return sessions.map((s) => SessionDto.from(s, auth.sessionId));
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out one device' })
  @ApiNoContentResponse()
  async revokeSession(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.users.revokeSession(auth.userId, id);
  }

  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Delete my account and personal data' })
  @ApiAcceptedResponse({ description: 'Account deleted; every session is signed out' })
  async deleteAccount(@CurrentUser() auth: UserAuth, @Client() client: ClientInfo): Promise<void> {
    await this.users.deleteAccount(auth.userId, client);
  }
}
