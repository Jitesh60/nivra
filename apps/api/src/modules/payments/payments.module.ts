import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PayoutsService } from '../payouts/payouts.service.js';
import { AdminPaymentsService } from './admin-payments.service.js';
import { LedgerService } from './ledger.service.js';
import {
  AdminPaymentsController,
  PaymentsController,
  PaymentWebhookController,
} from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaymentsWorker } from './payments-worker.js';
import { RefundsService } from './refunds.service.js';

@Module({
  imports: [AuthModule, AdminAuthModule, BookingsModule, NotificationsModule],
  controllers: [PaymentsController, PaymentWebhookController, AdminPaymentsController],
  providers: [
    LedgerService,
    RefundsService,
    PayoutsService,
    PaymentsService,
    AdminPaymentsService,
    PaymentsWorker,
  ],
  exports: [PaymentsService, RefundsService, PayoutsService, LedgerService],
})
export class PaymentsModule {}
