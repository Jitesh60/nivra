import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { CreateUploadDto, UploadTicketDto } from './dto/upload.dto.js';
import { UploadsService } from './uploads.service.js';

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiOperation({
    summary: 'Get a URL to upload an image to',
    description:
      'PUT the file to `url` with `headers`, then pass `key` to the endpoint that uses it (avatar or document). Unused uploads expire after 15 minutes.',
  })
  @ApiCreatedResponse({ type: UploadTicketDto })
  create(@CurrentUser() auth: UserAuth, @Body() body: CreateUploadDto): Promise<UploadTicketDto> {
    return this.uploads.create(auth.userId, body.purpose, body.contentType, body.sizeBytes);
  }
}
