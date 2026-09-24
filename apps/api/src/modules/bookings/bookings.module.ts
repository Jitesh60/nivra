import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { BookingDocumentsService } from './booking-documents.service.js';
import { BookingPresenter } from './booking-presenter.js';
import { BookingQueue } from './booking-queue.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { BookingWorker } from './booking-worker.js';
import { AdminBookingsController, BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [AuthModule, AdminAuthModule, ChatModule, NotificationsModule, SafetyModule],
  controllers: [BookingsController, AdminBookingsController],
  providers: [
    BookingPresenter,
    BookingQueue,
    BookingStateMachine,
    BookingsService,
    BookingDocumentsService,
    BookingWorker,
  ],
  exports: [BookingsService, BookingStateMachine, BookingPresenter],
})
export class BookingsModule {}
