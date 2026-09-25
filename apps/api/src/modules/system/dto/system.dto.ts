import { ApiProperty } from '@nestjs/swagger';

export class QueueStatusDto {
  @ApiProperty({ example: 'bookings' }) name: string;
  @ApiProperty({ description: 'Jobs waiting to run now' }) waiting: number;
  @ApiProperty({ description: 'Jobs running now' }) active: number;
  @ApiProperty({ description: 'Jobs scheduled for later (timers, retries)' }) delayed: number;
  @ApiProperty({ description: 'Failed jobs kept for inspection (last 1,000)' }) failed: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Workers listening on the queue; null when Redis does not allow CLIENT LIST',
  })
  workers: number | null;
}

export class DependencyLatencyDto {
  @ApiProperty({ enum: ['up', 'down'] }) status: 'up' | 'down';
  @ApiProperty({ type: Number, nullable: true, description: 'Round trip in milliseconds' })
  latencyMs: number | null;
}

export class SystemStatusDto {
  @ApiProperty({ description: 'The deployed commit (GIT_SHA), or "dev"' }) version: string;
  @ApiProperty({ description: 'Seconds since this API process started' }) uptimeSec: number;
  @ApiProperty({ type: DependencyLatencyDto }) database: DependencyLatencyDto;
  @ApiProperty({ type: DependencyLatencyDto }) redis: DependencyLatencyDto;
  @ApiProperty({ type: [QueueStatusDto] }) queues: QueueStatusDto[];
  @ApiProperty() generatedAt: Date;
}
