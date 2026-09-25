import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { DiscoveryQueueModule } from './discovery-queue.module.js';
import { DiscoveryWorker } from './discovery-worker.js';
import { SearchAlertsService } from './search-alerts.service.js';

/** Saved-search alerts and requests-board jobs (Phase 10). */
@Module({
  imports: [DiscoveryQueueModule, NotificationsModule, RequestsModule],
  providers: [SearchAlertsService, DiscoveryWorker],
  exports: [SearchAlertsService, DiscoveryWorker],
})
export class DiscoveryModule {}
