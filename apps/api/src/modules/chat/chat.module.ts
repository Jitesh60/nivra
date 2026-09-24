import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { ChatPresenter } from './chat-presenter.js';
import { ChatController } from './chat.controller.js';
import { ChatGateway } from './chat.gateway.js';
import { ConversationsService } from './conversations.service.js';
import { MessagesService } from './messages.service.js';
import { OffersService } from './offers.service.js';

@Module({
  imports: [AuthModule, MediaModule, NotificationsModule, SafetyModule],
  controllers: [ChatController],
  providers: [ChatPresenter, ConversationsService, MessagesService, OffersService, ChatGateway],
  exports: [ConversationsService, MessagesService],
})
export class ChatModule {}
