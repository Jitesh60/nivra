/** Sends SMS: one-time codes, and overdue-return reminders. Swap implementations with SMS_PROVIDER. */
export abstract class SmsProvider {
  /** @param phone E.164 number, e.g. +919876543210 */
  abstract sendOtp(phone: string, code: string): Promise<void>;

  /** The rented item is overdue (PRD: the one reminder that also goes by SMS). */
  abstract sendOverdue(phone: string, item: string, daysLate: number): Promise<void>;
}
