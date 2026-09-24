import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsDto, AnalyticsQueryDto } from './dto/analytics.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Dashboard numbers: daily series and totals (IST days) against the period before, a snapshot and the booking funnel',
  })
  @ApiOkResponse({ type: AnalyticsDto })
  get(@Query() query: AnalyticsQueryDto): Promise<AnalyticsDto> {
    return this.analytics.get(query.days);
  }
}
