import { allowsPush, DEFAULT_PREFERENCES, pushSwitchFor } from './preferences.js';

describe('notification preferences', () => {
  it('maps each notification type to the switch that governs its push', () => {
    expect(pushSwitchFor('booking.requested')).toBe('pushBookings');
    expect(pushSwitchFor('booking.completed')).toBe('pushBookings');
    expect(pushSwitchFor('payment.refund')).toBe('pushBookings');
    expect(pushSwitchFor('booking.reminder.overdue')).toBe('pushReminders');
    expect(pushSwitchFor('chat.message')).toBe('pushChat');
    expect(pushSwitchFor('account.security')).toBeNull();
  });

  it('allows everything but marketing by default', () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({
      pushBookings: true,
      pushChat: true,
      pushReminders: true,
      emailBookings: true,
      smsReminders: true,
      marketing: false,
    });
    expect(allowsPush(DEFAULT_PREFERENCES, 'chat.message')).toBe(true);
  });

  it('turning one kind off leaves the others', () => {
    const prefs = { ...DEFAULT_PREFERENCES, pushChat: false };
    expect(allowsPush(prefs, 'chat.message')).toBe(false);
    expect(allowsPush(prefs, 'booking.accepted')).toBe(true);
    expect(allowsPush(prefs, 'booking.reminder.return')).toBe(true);
    // Types without a switch always go.
    expect(allowsPush({ ...prefs, pushBookings: false }, 'account.security')).toBe(true);
  });
});
