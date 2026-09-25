import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { CardPresenter } from './card-presenter.js';
import { EngagementService } from './engagement.service.js';
import { SavedSearchesService } from './saved-searches.service.js';
import {
  FavoritesController,
  SavedSearchesController,
  SearchController,
} from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [AuthModule, CategoriesModule],
  controllers: [SearchController, FavoritesController, SavedSearchesController],
  providers: [SearchService, CardPresenter, EngagementService, SavedSearchesService],
  exports: [SearchService, EngagementService],
})
export class SearchModule {}
