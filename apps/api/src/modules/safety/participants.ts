import { Injectable } from '@nestjs/common';
import { UserPresenter } from '../users/user-presenter.js';
import type { UserView } from '../users/user-view.js';
import type { ParticipantDto } from './dto/safety.dto.js';

/** A user as other people see them: name, photo and ID badge only. */
@Injectable()
export class ParticipantPresenter {
  constructor(private readonly users: UserPresenter) {}

  present(user: UserView): ParticipantDto {
    const dto = this.users.present(user);
    return { id: dto.id, name: dto.name, avatarUrl: dto.avatarUrl, idVerified: dto.idVerified };
  }
}
