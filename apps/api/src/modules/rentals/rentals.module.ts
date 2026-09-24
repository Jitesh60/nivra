import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DisputesService } from './disputes.service.js';
import { HandoverService } from './handover.service.js';
import { RemindersService } from './reminders.service.js';
import { RentalPhotos } from './rental-photos.js';
import {
  AdminDisputesController,
  RentalsController,
  ReviewsController,
} from './rentals.controller.js';
import { RentalsWorker } from './rentals-worker.js';
import { ReviewsService } from './reviews.service.js';

/** Handover and return, disputes, reviews and rental reminders (Phase 8). */
@Module({
  imports: [AuthModule, AdminAuthModule, BookingsModule, MediaModule, NotificationsModule],
  controllers: [RentalsController, ReviewsController, AdminDisputesController],
  providers: [
    RentalPhotos,
    HandoverService,
    DisputesService,
    ReviewsService,
    RemindersService,
    RentalsWorker,
  ],
})
export class RentalsModule {}
