import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { EngagementService } from './engagement.service.js';
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
