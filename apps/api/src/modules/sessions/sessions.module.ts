import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SessionsService } from './sessions.service.js';
import { TokenService } from './token.service.js';

/** Sessions, refresh-token rotation and access tokens, shared by the user and admin realms. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [SessionsService, TokenService],
  exports: [SessionsService, TokenService],
})
export class SessionsModule {}
