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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import {
  AdminJwtGuard,
  CurrentAdmin,
  Roles,
  type AdminAuth,
} from '../admin-auth/admin-jwt.guard.js';
import { CurrentUser, JwtAuthGuard, type UserAuth } from '../auth/jwt-auth.guard.js';
import { OptionalJwtGuard, OptionalUser } from '../auth/optional-jwt.guard.js';
import { RequireVerified } from '../auth/verified.guard.js';
import {
  CardsQueryDto,
  ListingCardDto,
  QuoteDto,
  QuoteQueryDto,
} from '../search/dto/search.dto.js';
import { EngagementService } from '../search/engagement.service.js';
import { checkDates, SearchService } from '../search/search.service.js';
import {
  AddPhotoDto,
  AdminListingDto,
  AdminListingPageDto,
  AppConfigDto,
  BlocksDto,
  ChangeCategoryDto,
  CreateListingDto,
  ListingReasonDto,
  ListListingsQueryDto,
  MyListingDto,
  PhotoOrderDto,
  PublicListingDto,
  PublishResultDto,
  RequiredDocsDto,
  UpdateListingDto,
} from './dto/listing.dto.js';
import { ListingPresenter } from './listing-presenter.js';
import { LISTING_RULES as R, todayUtc } from './listing-rules.js';
import { quote } from './pricing.js';
import { ListingsService } from './listings.service.js';
import { PublicReadLimitGuard } from '../../common/http/public-read-limit.guard.js';

@ApiTags('config')
@Controller('config')
export class ConfigController {
  @Get()
  @ApiOperation({ summary: 'Marketplace rules the apps use for forms and previews (public)' })
  @ApiOkResponse({ type: AppConfigDto })
  get(): AppConfigDto {
    return {
      commissionBps: R.commissionBps,
      pricePerDayPaise: R.pricePerDayPaise,
      depositPaise: R.depositPaise,
      weeklyDiscountPct: R.weeklyDiscountPct,
      rentalDays: { min: R.rentalDays.min, max: R.rentalDays.max },
      advanceNoticeDays: R.advanceNoticeDays,
      photos: R.photos,
      maxBlockedRanges: R.blocks.maxRanges,
    };
  }
}

@ApiTags('listings')
@UseGuards(PublicReadLimitGuard, OptionalJwtGuard)
@Controller('listings')
export class PublicListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly presenter: ListingPresenter,
    private readonly search: SearchService,
    private readonly engagement: EngagementService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Cards for up to 20 live listings, in the order given (recently viewed)',
  })
  @ApiOkResponse({ type: [ListingCardDto] })
  cards(@Query() query: CardsQueryDto, @OptionalUser() auth?: UserAuth): Promise<ListingCardDto[]> {
    return this.search.cardsFor(query.ids, auth?.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'A live listing (public; approximate location only). Counts a view for “Popular”.',
  })
  @ApiOkResponse({ type: PublicListingDto })
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Client() client: ClientInfo,
    @OptionalUser() auth?: UserAuth,
  ): Promise<PublicListingDto> {
    const listing = await this.listings.publicGet(id);
    const [saved, favoriteCount, held] = await Promise.all([
      this.engagement.isSaved(auth?.userId, id),
      this.engagement.favoriteCount(id),
      this.listings.heldRanges(id),
      this.engagement.recordView(listing, auth?.userId, client),
    ]);
    return this.presenter.public(listing, { saved, favoriteCount }, held);
  }

  @Get(':id/quote')
  @ApiOperation({ summary: 'Price breakdown for dates, and whether the item is free then' })
  @ApiOkResponse({ type: QuoteDto })
  async quote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: QuoteQueryDto,
  ): Promise<QuoteDto> {
    const dates = checkDates(query)!;
    const [listing, held] = await Promise.all([
      this.listings.publicGet(id),
      this.listings.heldRanges(id),
    ]);
    return quote(
      { ...listing, blocks: [...listing.blocks, ...held] },
      dates.startDate,
      dates.endDate,
      todayUtc(),
    );
  }
}

@ApiTags('me · listings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/listings')
export class MyListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly presenter: ListingPresenter,
  ) {}

  @Get()
  @ApiOkResponse({ type: [MyListingDto] })
  async list(@CurrentUser() auth: UserAuth): Promise<MyListingDto[]> {
    return (await this.listings.listMine(auth.userId)).map((l) => this.presenter.mine(l));
  }

  @Post()
  @RequireVerified()
  @ApiOperation({ summary: 'Create a draft listing (needs a verified phone and email)' })
  @ApiCreatedResponse({ type: MyListingDto })
  @ApiForbiddenResponse({ type: ErrorResponse, description: 'VERIFICATION_REQUIRED' })
  async create(
    @CurrentUser() auth: UserAuth,
    @Body() body: CreateListingDto,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.create(auth.userId, body));
  }

  @Get(':id')
  @ApiOkResponse({ type: MyListingDto })
  async get(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.getMine(auth.userId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit; a rejected listing goes back to draft' })
  @ApiOkResponse({ type: MyListingDto })
  async update(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateListingDto,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.update(auth.userId, id, body));
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Add a photo from an upload (purpose LISTING_PHOTO); max 8' })
  @ApiCreatedResponse({ type: MyListingDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'LISTING_PHOTO_LIMIT' })
  async addPhoto(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AddPhotoDto,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.addPhoto(auth.userId, id, body.key));
  }

  @Put(':id/photos/order')
  @ApiOperation({ summary: 'Reorder photos (cover first)' })
  @ApiOkResponse({ type: MyListingDto })
  async reorderPhotos(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PhotoOrderDto,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.reorderPhotos(auth.userId, id, body.ids));
  }

  @Delete(':id/photos/:photoId')
  @ApiOkResponse({ type: MyListingDto })
  async deletePhoto(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.deletePhoto(auth.userId, id, photoId));
  }

  @Put(':id/blocks')
  @ApiOperation({ summary: 'Replace the blocked dates (inclusive ranges, next 365 days)' })
  @ApiOkResponse({ type: MyListingDto })
  async setBlocks(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: BlocksDto,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.setBlocks(auth.userId, id, body.ranges));
  }

  @Put(':id/required-docs')
  @ApiOperation({ summary: 'Replace the documents a borrower must share' })
  @ApiOkResponse({ type: MyListingDto })
  async setRequiredDocs(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RequiredDocsDto,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.setRequiredDocs(auth.userId, id, body.items));
  }

  @Post(':id/publish')
  @RequireVerified()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a draft: your first listing is reviewed; later ones go live at once',
  })
  @ApiOkResponse({ type: PublishResultDto })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'LISTING_INCOMPLETE' })
  async publish(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Client() client: ClientInfo,
  ): Promise<PublishResultDto> {
    const result = await this.listings.publish(auth.userId, id, client);
    return { listing: this.presenter.mine(result.listing), inReview: result.inReview };
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MyListingDto })
  async pause(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.pause(auth.userId, id));
  }

  @Post(':id/unpause')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MyListingDto })
  async unpause(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MyListingDto> {
    return this.presenter.mine(await this.listings.unpause(auth.userId, id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a listing and its photos' })
  @ApiNoContentResponse()
  async delete(
    @CurrentUser() auth: UserAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.listings.delete(auth.userId, id, client);
  }
}

@ApiTags('admin · listings')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/listings')
export class AdminListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly presenter: ListingPresenter,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listings by status (pending: oldest first), with search' })
  @ApiOkResponse({ type: AdminListingPageDto })
  async list(@Query() query: ListListingsQueryDto): Promise<AdminListingPageDto> {
    const page = await this.listings.queue(query);
    return { items: page.items.map((l) => this.presenter.admin(l)), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminListingDto })
  async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminListingDto> {
    return this.presenter.admin(await this.listings.adminGet(id));
  }

  @Post(':id/approve')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminListingDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'LISTING_STATUS_CONFLICT' })
  async approve(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Client() client: ClientInfo,
  ): Promise<AdminListingDto> {
    return this.presenter.admin(await this.listings.approve(auth.adminId, id, client));
  }

  @Post(':id/reject')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AdminListingDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'LISTING_STATUS_CONFLICT' })
  async reject(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ListingReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminListingDto> {
    return this.presenter.admin(await this.listings.reject(auth.adminId, id, body.reason, client));
  }

  @Post(':id/unpublish')
  @Roles('SUPER_ADMIN', 'OPS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a listing down (REMOVED), with a reason the lender sees' })
  @ApiOkResponse({ type: AdminListingDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'LISTING_STATUS_CONFLICT' })
  async unpublish(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ListingReasonDto,
    @Client() client: ClientInfo,
  ): Promise<AdminListingDto> {
    return this.presenter.admin(
      await this.listings.unpublish(auth.adminId, id, body.reason, client),
    );
  }

  @Patch(':id/category')
  @Roles('SUPER_ADMIN', 'OPS')
  @ApiOkResponse({ type: AdminListingDto })
  async changeCategory(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ChangeCategoryDto,
    @Client() client: ClientInfo,
  ): Promise<AdminListingDto> {
    return this.presenter.admin(
      await this.listings.changeCategory(auth.adminId, id, body.categoryId, client),
    );
  }
}
