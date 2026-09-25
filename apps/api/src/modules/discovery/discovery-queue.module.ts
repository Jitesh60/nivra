import { Module } from '@nestjs/common';
import { DiscoveryQueue } from './discovery-queue.js';

/** Only the producer, so listings and requests can enqueue without importing the worker. */
@Module({
  providers: [DiscoveryQueue],
  exports: [DiscoveryQueue],
})
export class DiscoveryQueueModule {}
