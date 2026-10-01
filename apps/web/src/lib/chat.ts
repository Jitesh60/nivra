import 'server-only';
import type { Schemas } from '@sajha/api-client';
import { unwrap, userApi } from './api';

export type Conversation = Schemas['ConversationDto'];
export type Message = Schemas['MessageDto'];
export type Offer = Schemas['OfferDto'];
export type Notification = Schemas['NotificationDto'];
export type Unread = Schemas['UnreadDto'];

export async function getConversations(cursor?: string) {
  return unwrap(
    (await userApi()).GET('/v1/conversations', { params: { query: { cursor, limit: 30 } } }),
  );
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const result = await (
    await userApi()
  ).GET('/v1/conversations/{id}', {
    params: { path: { id } },
  });
  if ([400, 403, 404].includes(result.response.status)) return null;
  return unwrap(Promise.resolve(result));
}

/** The latest messages, oldest first (the API pages newest first). */
export async function getMessages(id: string, before?: string) {
  const page = await unwrap(
    (await userApi()).GET('/v1/conversations/{id}/messages', {
      params: { path: { id }, query: { before, limit: 50 } },
    }),
  );
  return { items: [...page.items].reverse(), nextCursor: page.nextCursor ?? null };
}

export async function getUnread(): Promise<Unread | null> {
  try {
    const { data } = await (await userApi()).GET('/v1/me/unread');
    return data ?? null;
  } catch {
    return null;
  }
}

export async function getNotifications(cursor?: string) {
  return unwrap(
    (await userApi()).GET('/v1/me/notifications', { params: { query: { cursor, limit: 30 } } }),
  );
}

/** Where a notification leads (the app's Routes.forNotification). */
export function notificationHref(n: Notification): string | null {
  if (n.bookingId) return `/bookings/${n.bookingId}`;
  if (n.requestId) return `/requests/${n.requestId}`;
  if (n.listingId) return `/item/${n.listingId}`;
  if (n.type.startsWith('message.') || n.type.startsWith('offer.')) return '/inbox';
  if (n.type.startsWith('referral.')) return '/invite';
  return null;
}
