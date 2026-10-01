import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChatRoom } from '@/components/chat/chat-room';
import { getConversation, getMessages } from '@/lib/chat';
import {
  answerOfferAction,
  latestMessagesAction,
  makeOfferAction,
  markReadAction,
  reportUserAction,
  sendImageAction,
  sendTextAction,
  setBlockedAction,
} from '../actions';

export const metadata: Metadata = { title: 'Chat' };

export default async function ChatPage({ params }: PageProps<'/inbox/[id]'>) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) notFound();
  const { items } = await getMessages(id);
  return (
    <ChatRoom
      conversation={conversation}
      initial={items}
      actions={{
        latest: latestMessagesAction.bind(null, id),
        sendText: sendTextAction.bind(null, id),
        sendImage: sendImageAction.bind(null, id),
        markRead: markReadAction.bind(null, id),
        makeOffer: makeOfferAction.bind(null, id),
        answerOffer: answerOfferAction.bind(null, id),
        setBlocked: setBlockedAction.bind(null, id, conversation.other.id),
        report: reportUserAction.bind(null, id, conversation.other.id),
      }}
    />
  );
}
