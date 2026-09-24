import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up. Does not touch dependencies. */
  @Get('live')
  @ApiOkResponse({ description: 'Process is running' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: database and Redis are reachable. */
  @Get()
  @ApiOkResponse({ description: 'All dependencies are up' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is down' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
