import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SmsProvider } from '../../providers/sms/sms.provider.js';
import { lateDaysFor, lateFeeFor } from '../bookings/booking-rules.js';
import { rupees } from '../chat/chat-presenter.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** Today's date in India, as the midnight-UTC Date bookings store (`starts_on`). */
export function istToday(now: Date): Date {
  return new Date(
    `${new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)}T00:00:00Z`,
  );
}

/**
 * Rental reminders (hourly): pickup tomorrow, return tomorrow, return today,
 * and overdue (daily, also by SMS per the PRD). Each goes once a day at most:
 * the notifications table is the record of what was sent.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsProvider,
  ) {}

  async run(now = new Date()): Promise<number> {
    const today = istToday(now);
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const since = new Date(today.getTime() - IST_OFFSET_MS); // midnight IST today
    let sent = 0;

    const pickups = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', startsOn: tomorrow },
      include: { listing: { select: { title: true } } },
    });
    for (const b of pickups) {
      sent += await this.once(b.borrowerId, b.id, 'booking.reminder.pickup', since, {
        title: 'Pickup tomorrow',
        body: `You’re picking up ${b.listing.title} tomorrow. Show your handover code to the lender.`,
      });
      sent += await this.once(b.lenderId, b.id, 'booking.reminder.pickup', since, {
        title: 'Handover tomorrow',
        body: `The borrower picks up ${b.listing.title} tomorrow. Scan their code and take photos.`,
      });
    }

    const out = await this.prisma.booking.findMany({
      where: { status: 'ACTIVE', endsOn: { lte: tomorrow } },
      include: { listing: { select: { title: true } }, borrower: { select: { phone: true } } },
    });
    for (const b of out) {
      const title = b.listing.title;
      if (b.endsOn.getTime() === tomorrow.getTime()) {
        sent += await this.once(b.borrowerId, b.id, 'booking.reminder.return', since, {
          title: 'Return tomorrow',
          body: `${title} is due back tomorrow. Arrange the return with the lender.`,
        });
      } else if (b.endsOn.getTime() === today.getTime()) {
        sent += await this.once(b.borrowerId, b.id, 'booking.reminder.due_today', since, {
          title: 'Due back today',
          body: `${title} is due back today. After today, a late fee of ${rupees(b.pricePerDayPaise)} a day comes out of your deposit.`,
        });
      } else {
        const days = lateDaysFor(b.endsOn, now);
        const fee = lateFeeFor(days, b.pricePerDayPaise, b.depositPaise);
        const first = await this.once(b.borrowerId, b.id, 'booking.reminder.overdue', since, {
          title: 'Overdue',
          body: `${title} is ${days} ${days === 1 ? 'day' : 'days'} late. The late fee so far is ${rupees(fee)}. Please return it today.`,
        });
        if (first) {
          sent++;
          try {
            // The in-app and push reminder above still go; SMS is the borrower's choice.
            const prefs = await this.notifications.preferences(b.borrowerId);
            if (prefs.smsReminders) await this.sms.sendOverdue(b.borrower.phone, title, days);
          } catch (err) {
            this.logger.warn(
              `Overdue SMS for ${b.id} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          await this.once(b.lenderId, b.id, 'booking.reminder.overdue', since, {
            title: 'Not returned yet',
            body: `${title} is ${days} ${days === 1 ? 'day' : 'days'} late. We’ve reminded the borrower. From 2 days late you can report it as not returned.`,
          });
        }
      }
    }
    return sent;
  }

  /** Sends [type] for the booking unless it already went today; 1 if sent. */
  private async once(
    userId: string,
    bookingId: string,
    type: string,
    since: Date,
    text: { title: string; body: string },
  ): Promise<number> {
    const already = await this.prisma.notification.findFirst({
      where: {
        userId,
        type,
        createdAt: { gte: since },
        data: { path: ['bookingId'], equals: bookingId },
      },
      select: { id: true },
    });
    if (already) return 0;
    await this.notifications.notify(userId, { type, ...text, bookingId }, { push: true });
    return 1;
  }
}
