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
import { SessionDto, UpdateMeDto } from './dto/me.dto.js';
import { UserDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: UserResponseDto })
  async me(@CurrentUser() auth: UserAuth): Promise<UserResponseDto> {
    return { user: UserDto.from(await this.users.get(auth.userId)) };
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile fields (name)' })
  @ApiOkResponse({ type: UserResponseDto })
  async update(@CurrentUser() auth: UserAuth, @Body() body: UpdateMeDto): Promise<UserResponseDto> {
    return { user: UserDto.from(await this.users.updateName(auth.userId, body.name)) };
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
