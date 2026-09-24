import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { CardPresenter } from './card-presenter.js';
import { EngagementService } from './engagement.service.js';
import { FavoritesController, SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [AuthModule, CategoriesModule],
  controllers: [SearchController, FavoritesController],
  providers: [SearchService, CardPresenter, EngagementService],
  exports: [SearchService, EngagementService],
})
export class SearchModule {}
