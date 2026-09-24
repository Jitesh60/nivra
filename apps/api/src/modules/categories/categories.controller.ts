import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { CategoriesService } from './categories.service.js';
import {
  AdminCategoryDto,
  CategoryDto,
  CategoryOrderDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Active categories, in display order (public)' })
  @ApiOkResponse({ type: [CategoryDto] })
  async list(): Promise<CategoryDto[]> {
    return (await this.categories.listActive()).map(CategoryDto.from);
  }
}

@ApiTags('admin · categories')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Roles('SUPER_ADMIN', 'OPS')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOkResponse({ type: [AdminCategoryDto] })
  async list(): Promise<AdminCategoryDto[]> {
    return (await this.categories.listAll()).map(AdminCategoryDto.fromRow);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminCategoryDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'CATEGORY_SLUG_TAKEN' })
  async create(
    @CurrentAdmin() auth: AdminAuth,
    @Body() body: CreateCategoryDto,
    @Client() client: ClientInfo,
  ): Promise<AdminCategoryDto> {
    return AdminCategoryDto.fromRow(await this.categories.create(auth.adminId, body, client));
  }

  @Put('order')
  @ApiOperation({ summary: 'Set the display order (send every id)' })
  @ApiOkResponse({ type: [AdminCategoryDto] })
  async reorder(
    @CurrentAdmin() auth: AdminAuth,
    @Body() body: CategoryOrderDto,
    @Client() client: ClientInfo,
  ): Promise<AdminCategoryDto[]> {
    return (await this.categories.reorder(auth.adminId, body.ids, client)).map(
      AdminCategoryDto.fromRow,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, change slug or icon, or hide/show a category' })
  @ApiOkResponse({ type: AdminCategoryDto })
  @ApiConflictResponse({ type: ErrorResponse, description: 'CATEGORY_SLUG_TAKEN' })
  async update(
    @CurrentAdmin() auth: AdminAuth,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateCategoryDto,
    @Client() client: ClientInfo,
  ): Promise<AdminCategoryDto> {
    return AdminCategoryDto.fromRow(await this.categories.update(auth.adminId, id, body, client));
  }
}
