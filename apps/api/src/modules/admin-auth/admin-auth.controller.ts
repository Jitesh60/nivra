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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { SessionsService } from '../sessions/sessions.service.js';
import {
  AdminJwtGuard,
  AllowPendingPasswordChange,
  CurrentAdmin,
  type AdminAuth,
} from './admin-jwt.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import {
  AdminDto,
  AdminLoginDto,
  AdminLoginResponseDto,
  AdminMeDto,
  AdminRefreshDto,
  AdminSessionDto,
  AdminSessionResponseDto,
  AdminTokensDto,
  ChangePasswordDto,
  MfaTokenDto,
  TwoFactorSetupDto,
  TwoFactorVerifyDto,
} from './dto/admin-auth.dto.js';

@ApiTags('admin · auth')
@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 1: email + password → 2FA token' })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponse, description: 'INVALID_CREDENTIALS' })
  @ApiTooManyRequestsResponse({ type: ErrorResponse, description: 'ACCOUNT_LOCKED' })
  login(@Body() body: AdminLoginDto, @Client() client: ClientInfo): Promise<AdminLoginResponseDto> {
    return this.auth.login(body.email, body.password, client);
  }

  @Post('auth/2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2a (first login): get the authenticator QR code' })
  @ApiOkResponse({ type: TwoFactorSetupDto })
  setup(@Body() body: MfaTokenDto): Promise<TwoFactorSetupDto> {
    return this.auth.setupTwoFactor(body.mfaToken);
  }

  @Post('auth/2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2b: authenticator or recovery code → session tokens' })
  @ApiOkResponse({ type: AdminSessionResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponse, description: 'MFA_INVALID' })
  async verify(
    @Body() body: TwoFactorVerifyDto,
    @Client() client: ClientInfo,
  ): Promise<AdminSessionResponseDto> {
    if (!body.code && !body.recoveryCode) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Provide code or recoveryCode',
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.auth.verifyTwoFactor(body.mfaToken, body, client);
    return { ...result, admin: AdminDto.from(result.admin) };
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminTokensDto })
  refresh(@Body() body: AdminRefreshDto, @Client() client: ClientInfo): Promise<AdminTokensDto> {
    return this.auth.refresh(body.refreshToken, client);
  }

  @Post('auth/logout')
  @UseGuards(AdminJwtGuard)
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  logout(@CurrentAdmin() auth: AdminAuth, @Client() client: ClientInfo): Promise<void> {
    return this.auth.logout(auth.adminId, auth.sessionId, client);
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOkResponse({ type: AdminMeDto })
  async me(@CurrentAdmin() auth: AdminAuth): Promise<AdminMeDto> {
    return { admin: AdminDto.from(await this.auth.me(auth.adminId)) };
  }

  @Post('me/password')
  @UseGuards(AdminJwtGuard)
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password (signs out other sessions)' })
  @ApiOkResponse({ type: AdminMeDto })
  async changePassword(
    @CurrentAdmin() auth: AdminAuth,
    @Body() body: ChangePasswordDto,
    @Client() client: ClientInfo,
  ): Promise<AdminMeDto> {
    const admin = await this.auth.changePassword(
      auth.adminId,
      auth.sessionId,
      body.currentPassword,
      body.newPassword,
      client,
    );
    return { admin: AdminDto.from(admin) };
  }

  @Get('me/sessions')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: [AdminSessionDto] })
  async sessionsList(@CurrentAdmin() auth: AdminAuth): Promise<AdminSessionDto[]> {
    const list = await this.sessions.listActive('ADMIN', auth.adminId);
    return list.map((s) => AdminSessionDto.from(s, auth.sessionId));
  }

  @Delete('me/sessions/:id')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async revokeSession(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const mine = (await this.sessions.listActive('ADMIN', auth.adminId)).some((s) => s.id === id);
    if (!mine)
      throw new AppException(ErrorCode.NOT_FOUND, 'Session not found', HttpStatus.NOT_FOUND);
    await this.sessions.revoke(id, 'revoked_by_admin');
  }
}
