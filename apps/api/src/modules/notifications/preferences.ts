/** Per-channel choices a user can make. No stored row means these defaults. */
export interface Preferences {
  pushBookings: boolean;
  pushChat: boolean;
  pushReminders: boolean;
  emailBookings: boolean;
  smsReminders: boolean;
  marketing: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  pushBookings: true,
  pushChat: true,
  pushReminders: true,
  emailBookings: true,
  smsReminders: true,
  marketing: false,
};

/**
 * The push switch that governs a notification type, or null when it always
 * goes out (nothing today, but security notices would).
 */
export function pushSwitchFor(type: string): keyof Preferences | null {
  if (type.startsWith('booking.reminder.')) return 'pushReminders';
  if (type.startsWith('chat.')) return 'pushChat';
  if (type.startsWith('booking.') || type.startsWith('payment.')) return 'pushBookings';
  return null;
}

/** Whether [prefs] allow a push of [type]. */
export function allowsPush(prefs: Preferences, type: string): boolean {
  const key = pushSwitchFor(type);
  return key === null || prefs[key];
}
