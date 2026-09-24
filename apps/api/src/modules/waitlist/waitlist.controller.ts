import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { AdminJwtGuard, Roles } from '../admin-auth/admin-jwt.guard.js';
import {
  JoinWaitlistDto,
  JoinWaitlistResponseDto,
  ListWaitlistQueryDto,
  WaitlistEntryDto,
  WaitlistPageDto,
} from './dto/waitlist.dto.js';
import { WaitlistService } from './waitlist.service.js';

@ApiTags('waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join the launch waitlist (marketing website)' })
  @ApiOkResponse({ type: JoinWaitlistResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponse, description: 'RATE_LIMITED' })
  join(
    @Body() body: JoinWaitlistDto,
    @Client() client: ClientInfo,
  ): Promise<JoinWaitlistResponseDto> {
    return this.waitlist.join(body, client.ip);
  }
}

@ApiTags('admin · waitlist')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Roles('SUPER_ADMIN', 'OPS')
@Controller('admin/waitlist')
export class AdminWaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Get()
  @ApiOkResponse({ type: WaitlistPageDto })
  async list(@Query() query: ListWaitlistQueryDto): Promise<WaitlistPageDto> {
    const page = await this.waitlist.list(query);
    return {
      total: page.total,
      items: page.items.map(WaitlistEntryDto.from),
      nextCursor: page.nextCursor,
    };
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sajha-waitlist.csv"')
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Every waitlist entry as CSV', schema: { type: 'string' } })
  exportCsv(): Promise<string> {
    return this.waitlist.csv();
  }
}
