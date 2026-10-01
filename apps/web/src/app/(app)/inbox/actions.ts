'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { attempt, unwrap, userApi } from '@/lib/api';
import { getMessages } from '@/lib/chat';
import { hasSession } from '@/lib/session';
import { formFiles, uploadImage } from '@/lib/upload';

export interface Result {
  error?: string;
  success?: string;
}

const MESSAGES: Record<string, string> = {
  CONVERSATION_NOT_ALLOWED: 'You can’t message about your own listing.',
  OFFER_DATES_UNAVAILABLE: 'The item isn’t free on those dates.',
  OFFER_EXPIRED: 'That offer has expired. Send a new one.',
  OFFER_NOT_PENDING: 'That offer was already answered.',
  OFFER_OWN: 'You can’t answer your own offer.',
  FORBIDDEN: 'You can’t message here (one of you has blocked the other).',
};

const friendly = (r: { apiError: { code: string }; error: string }) =>
  MESSAGES[r.apiError.code] ?? r.error;

/** "Message lender" on an item: opens (or reuses) the conversation. */
export async function startChatAction(listingId: string): Promise<Result & { signIn?: true }> {
  if (!(await hasSession())) return { signIn: true };
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(api.POST('/v1/conversations', { body: { listingId } })),
  );
  if (!result.ok && result.apiError.code === 'VERIFICATION_REQUIRED') {
    redirect(`/welcome/email?next=${encodeURIComponent(`/item/${listingId}`)}`);
  }
  if (!result.ok) return { error: friendly(result) };
  redirect(`/inbox/${result.data.id}`);
}

/** Latest messages for the open chat (polled while the page is visible). */
export async function latestMessagesAction(conversationId: string) {
  const result = await attempt(() => getMessages(conversationId));
  return result.ok ? result.data.items : null;
}

export async function sendTextAction(
  conversationId: string,
  body: string,
  clientId: string,
): Promise<Result> {
  const text = body.trim();
  if (!text) return {};
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.POST('/v1/conversations/{id}/messages', {
        params: { path: { id: conversationId } },
        body: { type: 'TEXT', body: text.slice(0, 2000), clientId },
      }),
    ),
  );
  if (!result.ok) return { error: friendly(result) };
  revalidatePath('/inbox');
  return {};
}

export async function sendImageAction(conversationId: string, form: FormData): Promise<Result> {
  const [file] = formFiles(form, 'image');
  if (!file) return {};
  const clientId = String(form.get('clientId') ?? crypto.randomUUID());
  const result = await attempt(async () => {
    const key = await uploadImage(file, 'CHAT_IMAGE');
    return unwrap(
      (await userApi()).POST('/v1/conversations/{id}/messages', {
        params: { path: { id: conversationId } },
        body: { type: 'IMAGE', key, clientId },
      }),
    );
  });
  if (!result.ok) return { error: friendly(result) };
  return {};
}

export async function markReadAction(conversationId: string, upTo: string): Promise<void> {
  try {
    await (
      await userApi()
    ).POST('/v1/conversations/{id}/read', {
      params: { path: { id: conversationId } },
      body: { upTo },
    });
  } catch {
    // Best effort.
  }
}

export async function makeOfferAction(
  conversationId: string,
  offer: { startDate: string; endDate: string; rupeesPerDay: number },
  counterTo?: string,
): Promise<Result> {
  const body = {
    startDate: offer.startDate,
    endDate: offer.endDate,
    pricePerDayPaise: Math.round(offer.rupeesPerDay * 100),
  };
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      counterTo
        ? api.POST('/v1/offers/{id}/counter', { params: { path: { id: counterTo } }, body })
        : api.POST('/v1/conversations/{id}/offers', {
            params: { path: { id: conversationId } },
            body,
          }),
    ),
  );
  if (!result.ok) return { error: friendly(result) };
  revalidatePath(`/inbox/${conversationId}`);
  return { success: counterTo ? 'Counter-offer sent.' : 'Offer sent.' };
}

export async function answerOfferAction(
  conversationId: string,
  offerId: string,
  accept: boolean,
): Promise<Result> {
  const api = await userApi();
  const params = { params: { path: { id: offerId } } };
  const result = await attempt(() =>
    unwrap(
      accept
        ? api.POST('/v1/offers/{id}/accept', params)
        : api.POST('/v1/offers/{id}/decline', params),
    ),
  );
  if (!result.ok) return { error: friendly(result) };
  revalidatePath(`/inbox/${conversationId}`);
  revalidatePath('/bookings');
  return { success: accept ? 'Offer accepted: a booking has been created.' : 'Offer declined.' };
}

export async function setBlockedAction(
  conversationId: string,
  userId: string,
  block: boolean,
): Promise<Result> {
  const api = await userApi();
  const params = { params: { path: { userId } } };
  const result = await attempt(() =>
    unwrap(
      block
        ? api.PUT('/v1/me/blocks/{userId}', params)
        : api.DELETE('/v1/me/blocks/{userId}', params),
    ),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(`/inbox/${conversationId}`);
  return { success: block ? 'Blocked. They can’t message you.' : 'Unblocked.' };
}

export async function reportUserAction(
  conversationId: string,
  userId: string,
  reason: 'SPAM' | 'SCAM' | 'OFF_PLATFORM_PAYMENT' | 'INAPPROPRIATE' | 'OTHER',
  note: string,
): Promise<Result> {
  const api = await userApi();
  const result = await attempt(() =>
    unwrap(
      api.POST('/v1/reports', {
        body: {
          targetType: 'USER',
          targetId: userId,
          reason,
          note: note.trim() || undefined,
          conversationId,
        },
      }),
    ),
  );
  if (!result.ok) return { error: result.error };
  return { success: 'Thanks. Our team will review this conversation.' };
}
