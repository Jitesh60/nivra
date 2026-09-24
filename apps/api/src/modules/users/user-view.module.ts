import { Global, Module } from '@nestjs/common';
import { UserPresenter } from './user-presenter.js';

/** Global so auth, users and admin modules can all present users the same way. */
@Global()
@Module({
  providers: [UserPresenter],
  exports: [UserPresenter],
})
export class UserViewModule {}
