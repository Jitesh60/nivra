import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { PublicReadLimitGuard } from '../../common/http/public-read-limit.guard.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import {
  type AdminAuth,
  AdminJwtGuard,
  CurrentAdmin,
  Roles,
} from '../admin-auth/admin-jwt.guard.js';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import {
  AdminReferralDto,
  MyReferralDto,
  ReferralCodeLookupDto,
  RedeemReferralDto,
  RevokeCreditDto,
} from './dto/referral.dto.js';
import { ReferralsService } from './referrals.service.js';

@ApiTags('me · invites & credit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/referral')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @ApiOperation({ summary: 'Your invite code and link, who joined, and your credit' })
  @ApiOkResponse({ type: MyReferralDto })
  mine(@CurrentUser() auth: UserAuth): Promise<MyReferralDto> {
    return this.referrals.mine(auth.userId);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enter an invite code (within 7 days of joining, before your first booking)',
  })
  @ApiOkResponse({ type: MyReferralDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'REFERRAL_CODE_INVALID' })
  @ApiConflictResponse({ type: ErrorResponse, description: 'REFERRAL_NOT_ALLOWED' })
  redeem(@CurrentUser() auth: UserAuth, @Body() dto: RedeemReferralDto): Promise<MyReferralDto> {
    return this.referrals.redeem(auth.userId, dto.code);
  }
}

@ApiTags('admin · users')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/users')
export class AdminReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get(':id/referral')
  @ApiOperation({ summary: 'Invite code, who invited them, who they invited, and their credit' })
  @ApiOkResponse({ type: AdminReferralDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminReferralDto> {
    return this.referrals.adminGet(id);
  }

  @Post(':id/credits/revoke')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take away unused credit, with a reason (audited)' })
  @ApiOkResponse({ type: AdminReferralDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'CREDIT_TOO_LARGE' })
  revoke(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevokeCreditDto,
    @Client() client: ClientInfo,
  ): Promise<AdminReferralDto> {
    return this.referrals.revoke(auth.adminId, id, dto.amountPaise, dto.reason, client);
  }
}

@ApiTags('invites')
@UseGuards(PublicReadLimitGuard)
@Controller('referral-codes')
export class PublicReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get(':code')
  @ApiOperation({
    summary: 'Look up an invite code for the website (no sign-in)',
    description: 'Unknown codes return `valid: false`, never 404.',
  })
  @ApiOkResponse({ type: ReferralCodeLookupDto })
  lookup(@Param('code') code: string): Promise<ReferralCodeLookupDto> {
    return this.referrals.lookup(code.slice(0, 32));
  }
}
