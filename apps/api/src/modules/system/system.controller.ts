import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard.js';
import { SystemStatusDto } from './dto/system.dto.js';
import { SystemService } from './system.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/system')
export class AdminSystemController {
  constructor(private readonly system: SystemService) {}

  @Get()
  @ApiOperation({
    summary: 'Operations: queue depth per job queue, workers listening, database and Redis latency',
  })
  @ApiOkResponse({ type: SystemStatusDto })
  get(): Promise<SystemStatusDto> {
    return this.system.status();
  }
}
