import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { UserPresenter } from '../users/user-presenter.js';
import { AuthService } from './auth.service.js';
import {
  LoginResponseDto,
  OtpChallengeDto,
  RefreshDto,
  RequestEmailOtpDto,
  RequestPhoneOtpDto,
  TokensDto,
  UserResponseDto,
  VerifyEmailOtpDto,
  VerifyPhoneOtpDto,
} from './dto/auth.dto.js';
import { CurrentUser, JwtAuthGuard, type UserAuth } from './jwt-auth.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly presenter: UserPresenter,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a 6-digit login code by SMS' })
  @ApiOkResponse({ type: OtpChallengeDto })
  @ApiTooManyRequestsResponse({
    type: ErrorResponse,
    description: 'OTP_COOLDOWN or OTP_RATE_LIMITED',
  })
  requestOtp(@Body() body: RequestPhoneOtpDto, @Client() client: ClientInfo) {
    return this.auth.requestPhoneOtp(body.phone, client);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in or sign up with the SMS code' })
  @ApiOkResponse({ type: LoginResponseDto })
  async verifyOtp(
    @Body() body: VerifyPhoneOtpDto,
    @Client() client: ClientInfo,
  ): Promise<LoginResponseDto> {
    const result = await this.auth.verifyPhoneOtp(body, client);
    return { ...result, user: await this.presenter.load(result.user.id) };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for new tokens (rotates the refresh token)' })
  @ApiOkResponse({ type: TokensDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponse,
    description: 'TOKEN_INVALID, TOKEN_EXPIRED or REFRESH_REUSED',
  })
  refresh(@Body() body: RefreshDto, @Client() client: ClientInfo): Promise<TokensDto> {
    return this.auth.refresh(body.refreshToken, client);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'This device is signed out' })
  async logout(@CurrentUser() auth: UserAuth): Promise<void> {
    await this.auth.logout(auth.sessionId);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Every device is signed out' })
  async logoutAll(@CurrentUser() auth: UserAuth): Promise<void> {
    await this.auth.logoutAll(auth.userId);
  }

  @Post('email/otp/request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a 6-digit verification code to an email address' })
  @ApiOkResponse({ type: OtpChallengeDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'EMAIL_IN_USE' })
  requestEmailOtp(
    @CurrentUser() auth: UserAuth,
    @Body() body: RequestEmailOtpDto,
    @Client() client: ClientInfo,
  ) {
    return this.auth.requestEmailOtp(auth.userId, body.email, client);
  }

  @Post('email/otp/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the email code and save the email on the account' })
  @ApiOkResponse({ type: UserResponseDto })
  async verifyEmailOtp(
    @CurrentUser() auth: UserAuth,
    @Body() body: VerifyEmailOtpDto,
  ): Promise<UserResponseDto> {
    const user = await this.auth.verifyEmailOtp(auth.userId, body.challengeId, body.code);
    return { user: await this.presenter.load(user.id) };
  }
}
