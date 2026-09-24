import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { MediaModule } from '../media/media.module.js';
import { ListingPresenter } from './listing-presenter.js';
import {
  AdminListingsController,
  ConfigController,
  MyListingsController,
  PublicListingsController,
} from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [AuthModule, AdminAuthModule, MediaModule, CategoriesModule],
  controllers: [
    ConfigController,
    PublicListingsController,
    MyListingsController,
    AdminListingsController,
  ],
  providers: [ListingsService, ListingPresenter],
  exports: [ListingsService],
})
export class ListingsModule {}
