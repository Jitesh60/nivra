import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../providers/storage/storage.service.js';
import { UserDto } from './dto/user.dto.js';
import { userViewInclude, type UserView } from './user-view.js';

/** Builds the UserDto every endpoint returns (profile, avatar URL, badges). */
@Injectable()
export class UserPresenter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async load(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: userViewInclude(),
    });
    return this.present(user);
  }

  present(user: UserView): UserDto {
    return UserDto.from(user, (key) => this.storage.publicUrl(key));
  }
}
