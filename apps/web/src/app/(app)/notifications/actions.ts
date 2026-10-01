'use server';

import { revalidatePath } from 'next/cache';
import { userApi } from '@/lib/api';

export async function markNotificationsReadAction(upTo: string): Promise<void> {
  try {
    await (await userApi()).POST('/v1/me/notifications/read', { body: { upTo } });
  } catch {
    // Best effort.
  }
  revalidatePath('/notifications');
}
