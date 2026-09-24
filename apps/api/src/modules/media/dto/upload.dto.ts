import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export const UPLOAD_PURPOSES = ['AVATAR', 'DOCUMENT', 'LISTING_PHOTO', 'CHAT_IMAGE'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const UPLOAD_MAX_BYTES: Record<UploadPurpose, number> = {
  AVATAR: 5 * 1024 * 1024,
  DOCUMENT: 10 * 1024 * 1024,
  LISTING_PHOTO: 10 * 1024 * 1024,
  CHAT_IMAGE: 10 * 1024 * 1024,
};

export class CreateUploadDto {
  @ApiProperty({ enum: UPLOAD_PURPOSES })
  @IsIn(UPLOAD_PURPOSES)
  purpose: UploadPurpose;

  @ApiProperty({ enum: UPLOAD_CONTENT_TYPES })
  @IsIn(UPLOAD_CONTENT_TYPES)
  contentType: (typeof UPLOAD_CONTENT_TYPES)[number];

  @ApiProperty({ example: 482133, description: 'Exact size of the file in bytes (it is signed)' })
  @IsInt()
  @Min(1)
  @Max(UPLOAD_MAX_BYTES.DOCUMENT)
  sizeBytes: number;
}

export class UploadTicketDto {
  @ApiProperty({ description: 'Pass this key to the endpoint that uses the file' })
  key: string;

  @ApiProperty({ description: 'PUT the file bytes here' })
  url: string;

  @ApiProperty({
    description: 'Headers to send with the PUT (they are part of the signature)',
    example: { 'Content-Type': 'image/jpeg' },
  })
  headers: Record<string, string>;

  @ApiProperty({ example: 300 })
  expiresInSec: number;
}
