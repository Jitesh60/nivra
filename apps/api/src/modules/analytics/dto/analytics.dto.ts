import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt } from 'class-validator';

export const ANALYTICS_PERIODS = [7, 30, 90] as const;

export class AnalyticsQueryDto {
  @ApiProperty({ enum: ANALYTICS_PERIODS, default: 30 })
  @Type(() => Number)
  @IsInt()
  @IsIn(ANALYTICS_PERIODS)
  days: (typeof ANALYTICS_PERIODS)[number] = 30;
}

/** Counts and money for a day or a period. Money is in paise. */
export class AnalyticsMetricsDto {
  @ApiProperty({ description: 'New app accounts' }) signups: number;
  @ApiProperty({ description: 'Listings published for the first time' }) listings: number;
  @ApiProperty({ description: 'Booking requests (and accepted chat offers)' }) requested: number;
  @ApiProperty({ description: 'Bookings paid for' }) confirmed: number;
  @ApiProperty({ description: 'Rentals completed (including settled disputes)' })
  completed: number;
  @ApiProperty({ description: 'Bookings cancelled, including no-shows' }) cancelled: number;
  @ApiProperty({ description: 'Captured payments (rent, fee and deposit)' }) gmvPaise: number;
  @ApiProperty({ description: 'Sajha’s commission and fees, net of refunds' })
  revenuePaise: number;
  @ApiProperty({ description: 'Refunds sent (not failed)' }) refundsPaise: number;
  @ApiProperty() disputesOpened: number;
  @ApiProperty() disputesSettled: number;
}

export class AnalyticsDayDto extends AnalyticsMetricsDto {
  @ApiProperty({ format: 'date', description: 'Day in India (IST)' }) date: string;
}

export class AnalyticsSnapshotDto {
  @ApiProperty({ description: 'Active app accounts' }) users: number;
  @ApiProperty() liveListings: number;
  @ApiProperty({ description: 'Items out with a borrower right now' }) activeRentals: number;
  @ApiProperty() openDisputes: number;
}

export class AnalyticsFunnelDto {
  @ApiProperty({ description: 'Bookings requested in the period' }) requested: number;
  @ApiProperty({ description: '…of which were paid for' }) confirmed: number;
  @ApiProperty({ description: '…of which are completed' }) completed: number;
}

export class AnalyticsDto {
  @ApiProperty() days: number;
  @ApiProperty({ format: 'date' }) from: string;
  @ApiProperty({ format: 'date' }) to: string;
  @ApiProperty({ type: AnalyticsMetricsDto }) totals: AnalyticsMetricsDto;
  @ApiProperty({ type: AnalyticsMetricsDto, description: 'The same number of days before' })
  previous: AnalyticsMetricsDto;
  @ApiProperty({ type: [AnalyticsDayDto], description: 'Oldest first' })
  series: AnalyticsDayDto[];
  @ApiProperty({ type: AnalyticsSnapshotDto, description: 'Right now' })
  now: AnalyticsSnapshotDto;
  @ApiProperty({ type: AnalyticsFunnelDto }) funnel: AnalyticsFunnelDto;
  @ApiProperty() generatedAt: Date;
}
