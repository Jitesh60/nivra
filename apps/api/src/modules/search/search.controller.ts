import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { OptionalJwtGuard, OptionalUser } from '../auth/optional-jwt.guard.js';
import {
  AreaQueryDto,
  HomeDto,
  ListingCardDto,
  SearchPageDto,
  SearchQueryDto,
} from './dto/search.dto.js';
import {
  CreateSavedSearchDto,
  SavedSearchDto,
  SavedSearchResultsQueryDto,
  UpdateSavedSearchDto,
} from './dto/saved-search.dto.js';
import { EngagementService } from './engagement.service.js';
import { MAX_SAVED_SEARCHES, SavedSearchesService } from './saved-searches.service.js';
import { SearchService } from './search.service.js';
import { PublicReadLimitGuard } from '../../common/http/public-read-limit.guard.js';

@ApiTags('discovery')
@UseGuards(PublicReadLimitGuard, OptionalJwtGuard)
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('search')
  @ApiOperation({
    summary:
      'Search live listings by keywords, area, dates and filters (public; saved flags when signed in)',
  })
  @ApiOkResponse({ type: SearchPageDto })
  find(@Query() query: SearchQueryDto, @OptionalUser() auth?: UserAuth): Promise<SearchPageDto> {
    return this.search.search(query, auth?.userId);
  }

  @Get('home')
  @ApiOperation({ summary: 'Home feed: categories, near you, popular this week, newest (public)' })
  @ApiOkResponse({ type: HomeDto })
  home(@Query() query: AreaQueryDto, @OptionalUser() auth?: UserAuth): Promise<HomeDto> {
    return this.search.home(query, auth?.userId);
  }
}

@ApiTags('me · wishlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly engagement: EngagementService) {}

  @Get()
  @ApiOperation({ summary: 'Saved listings, newest first (taken-down ones marked unavailable)' })
  @ApiOkResponse({ type: [ListingCardDto] })
  list(@CurrentUser() auth: UserAuth): Promise<ListingCardDto[]> {
    return this.engagement.wishlist(auth.userId);
  }

  @Put(':listingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Save a listing (idempotent)' })
  @ApiNoContentResponse()
  async save(
    @CurrentUser() auth: UserAuth,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
  ): Promise<void> {
    await this.engagement.save(auth.userId, listingId);
  }

  @Delete(':listingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() auth: UserAuth,
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
  ): Promise<void> {
    await this.engagement.remove(auth.userId, listingId);
  }
}

@ApiTags('me · saved searches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/saved-searches')
export class SavedSearchesController {
  constructor(private readonly saved: SavedSearchesService) {}

  @Get()
  @ApiOperation({ summary: 'Saved searches, newest first' })
  @ApiOkResponse({ type: [SavedSearchDto] })
  list(@CurrentUser() auth: UserAuth): Promise<SavedSearchDto[]> {
    return this.saved.list(auth.userId);
  }

  @Post()
  @ApiOperation({
    summary: `Save a search (up to ${MAX_SAVED_SEARCHES}); new matching listings are alerted`,
  })
  @ApiCreatedResponse({ type: SavedSearchDto })
  create(
    @CurrentUser() auth: UserAuth,
    @Body() dto: CreateSavedSearchDto,
  ): Promise<SavedSearchDto> {
    return this.saved.create(auth.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, or turn alerts on or off' })
  @ApiOkResponse({ type: SavedSearchDto })
  update(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSavedSearchDto,
  ): Promise<SavedSearchDto> {
    return this.saved.update(auth.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.saved.remove(auth.userId, id);
  }

  @Get(':id/results')
  @ApiOperation({ summary: 'Run a saved search now' })
  @ApiOkResponse({ type: SearchPageDto })
  results(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: SavedSearchResultsQueryDto,
  ): Promise<SearchPageDto> {
    return this.saved.results(auth.userId, id, query);
  }
}
