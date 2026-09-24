import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import type {
  BookingEventType,
  BookingParty,
  BookingStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { dateRange, rupees } from '../chat/chat-presenter.js';
import { ConversationsService } from '../chat/conversations.service.js';
import { MessagesService } from '../chat/messages.service.js';
import {
  bookingReceiptMessage,
  disputeSettledMessage,
  lenderBookedMessage,
} from '../../providers/email/templates.js';
import { LISTING_RULES } from '../listings/listing-rules.js';
import { Mailer } from '../mail/mailer.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { commissionOn } from '../payments/ledger.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import {
  BookingPresenter,
  bookingInclude,
  bookingRef,
  type BookingRow,
  stateOf,
} from './booking-presenter.js';
import { BookingQueue } from './booking-queue.js';
import {
  type Actor,
  type BookingAction,
  CLAIM_WINDOW_HOURS,
  deadlineFor,
  isOpen,
  nextStatus,
  type Windows,
} from './booking-rules.js';

/** Socket event: a booking changed (payload: BookingDto from the receiver's side). */
export const BOOKING_UPDATED = 'booking:updated';

const EVENT_FOR: Record<BookingAction, BookingEventType> = {
  accept: 'ACCEPTED',
  decline: 'DECLINED',
  cancel: 'CANCELLED',
  submitDocs: 'DOCS_SUBMITTED',
  approveDocs: 'DOCS_APPROVED',
  rejectDocs: 'DOCS_REJECTED',
  confirmPayment: 'PAID',
  expire: 'EXPIRED',
  handOver: 'HANDED_OVER',
  markReturned: 'RETURNED',
  noShow: 'NO_SHOW',
  openDispute: 'DISPUTED',
  complete: 'COMPLETED',
  resolveDispute: 'DISPUTE_RESOLVED',
};

export interface ActorRef {
  party: Actor;
  /** User or admin id; null for the system. */
  id: string | null;
}

export interface TransitionOptions {
  note?: string | null;
  /** Extra booking fields to set with the status (reasons, who cancelled). */
  patch?: Prisma.BookingUncheckedUpdateInput;
  /** Runs inside the transaction before the booking is updated (e.g. creating shares). */
  inTx?: (tx: Prisma.TransactionClient, booking: BookingRow) => Promise<void>;
  /** Only for expiry: skip (return null) unless this holds for the locked row. */
  onlyIf?: (booking: BookingRow) => boolean;
}

/** Called after every committed change (e.g. payments refunds a cancelled paid booking). */
export type TransitionListener = (t: Transition) => Promise<void>;

export interface Transition {
  booking: BookingRow;
  event: BookingEventType;
  from: BookingStatus;
  actor: ActorRef;
  note: string | null;
}

/**
 * The only place a booking changes status (docs/ARCHITECTURE.md §5). Each
 * transition locks the row (`SELECT … FOR UPDATE`), checks the rules, updates
 * it and writes a `booking_events` row in one transaction; after the commit it
 * schedules the next timer, posts a note in the chat, updates both apps and
 * sends notifications.
 */
@Injectable()
export class BookingStateMachine {
  private readonly logger = new Logger(BookingStateMachine.name);
  private readonly listeners: TransitionListener[] = [];
  readonly windows: Windows;

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: BookingPresenter,
    private readonly queue: BookingQueue,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly mailer: Mailer,
    config: ConfigService<Env, true>,
  ) {
    this.windows = {
      requestMin: config.get('BOOKING_REQUEST_TTL_MIN', { infer: true }),
      docsMin: config.get('BOOKING_DOCS_TTL_MIN', { infer: true }),
      paymentMin: config.get('BOOKING_PAYMENT_TTL_MIN', { infer: true }),
    };
  }

  /** Registers work to run after each committed change (errors are logged, not thrown). */
  onTransition(listener: TransitionListener): void {
    this.listeners.push(listener);
  }

  async transition(
    bookingId: string,
    action: BookingAction,
    actor: ActorRef,
    opts: TransitionOptions = {},
  ): Promise<Transition | null> {
    const now = new Date();
    let result: Transition | null;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: bookingInclude(),
        });
        if (!booking) throw bookingNotFound();
        if (opts.onlyIf && !opts.onlyIf(booking)) return null;

        const state = stateOf(booking);
        const to = nextStatus(action, actor.party, state, now);
        if (!to) {
          throw new AppException(
            ErrorCode.BOOKING_INVALID_TRANSITION,
            'This booking has moved on. Refresh to see where it is now.',
            HttpStatus.CONFLICT,
            { status: booking.status },
          );
        }
        await opts.inTx?.(tx, booking);

        const closing = !isOpen(to);
        const docsSubmitted = action === 'submitDocs' ? true : state.docsSubmitted;
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            ...opts.patch,
            status: to,
            expiresAt: closing
              ? null
              : deadlineFor(
                  { ...state, status: to, docsSubmitted, startsOn: booking.startsOn },
                  now,
                  this.windows,
                ),
            ...(closing ? { closedAt: now } : {}),
          },
        });
        if (closing) {
          // The lender loses access to shared documents once the booking closes.
          await tx.bookingDocumentShare.updateMany({
            where: { bookingId, accessExpiresAt: null },
            data: { accessExpiresAt: now },
          });
        }
        const note = opts.note?.trim() || null;
        await tx.bookingEvent.create({
          data: {
            bookingId,
            type: EVENT_FOR[action],
            fromStatus: booking.status,
            toStatus: to,
            actorType:
              actor.party === 'SYSTEM' ? 'SYSTEM' : actor.party === 'ADMIN' ? 'ADMIN' : 'USER',
            actorId: actor.id,
            note,
          },
        });
        const updated = await tx.booking.findUniqueOrThrow({
          where: { id: bookingId },
          include: bookingInclude(),
        });
        return { booking: updated, event: EVENT_FOR[action], from: booking.status, actor, note };
      });
    } catch (err) {
      throw mapBookingError(err);
    }
    if (result) await this.afterChange(result);
    return result;
  }

  /**
   * Everything that follows a change, outside the transaction. Failures are
   * logged, not thrown: the change itself has been saved.
   */
  async afterChange(
    t: Transition,
    opts: { chatNote: boolean } = { chatNote: true },
  ): Promise<void> {
    const b = t.booking;
    try {
      if (b.expiresAt) await this.queue.scheduleExpiry(b.id, b.expiresAt);
      for (const userId of [b.borrowerId, b.lenderId]) {
        this.realtime.toUser(userId, BOOKING_UPDATED, this.presenter.summary(b, userId));
      }
      if (opts.chatNote) await this.chatNote(t);
      await this.notify(t);
      await this.email(t);
    } catch (err) {
      this.logger.warn(
        `After-change work for booking ${b.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Money work (refunds, transfers) must run even if a notification failed.
    for (const listener of this.listeners) {
      try {
        await listener(t);
      } catch (err) {
        this.logger.error(
          `Listener after booking ${b.id} ${t.event} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /** A line in the chat, so the conversation stays the record of the deal. */
  private async chatNote(t: Transition): Promise<void> {
    const b = t.booking;
    const body = chatText(t);
    const c = {
      id: b.conversationId,
      listingId: b.listingId,
      borrowerId: b.borrowerId,
      lenderId: b.lenderId,
    };
    // SYSTEM messages need a sender; use whoever acted, or the borrower for Sajha's own.
    const senderId =
      t.actor.party === 'BORROWER' || t.actor.party === 'LENDER' ? t.actor.id! : b.borrowerId;
    const message = await this.messages.post(c, senderId, { type: 'SYSTEM', body });
    await this.conversations.touch(c.id, body, message.createdAt);
    await this.messages.broadcast(c, message, { push: false });
  }

  /** Receipts and outcomes by email, to people with a verified email who want them. */
  private async email(t: Transition): Promise<void> {
    const b = t.booking;
    if (t.event === 'PAID') {
      const [borrower, lender] = await Promise.all([
        this.mailer.forBookings(b.borrowerId),
        this.mailer.forBookings(b.lenderId),
      ]);
      if (borrower) {
        await this.mailer.send(
          `receipt-${b.id}`,
          bookingReceiptMessage({
            to: borrower.email,
            name: borrower.name,
            ref: bookingRef(b.id),
            listingTitle: b.listing.title,
            area: b.listing.areaLabel,
            start: b.startsOn,
            end: b.endsOn,
            days: b.days,
            pricePerDayPaise: b.pricePerDayPaise,
            rentPaise: b.rentPaise,
            feePaise: b.feePaise,
            depositPaise: b.depositPaise,
            totalPaise: b.totalPaise,
            lenderName: firstName(b.lender.name, 'the lender'),
          }),
        );
      }
      if (lender) {
        await this.mailer.send(
          `booked-${b.id}`,
          lenderBookedMessage({
            to: lender.email,
            name: lender.name,
            listingTitle: b.listing.title,
            start: b.startsOn,
            end: b.endsOn,
            earningsPaise: b.rentPaise - commissionOn(b.rentPaise, LISTING_RULES.commissionBps),
            borrowerName: firstName(b.borrower.name, 'the borrower'),
          }),
        );
      }
    }
    if (t.event === 'DISPUTE_RESOLVED') {
      for (const [userId, borrower] of [
        [b.borrowerId, true],
        [b.lenderId, false],
      ] as const) {
        const to = await this.mailer.forBookings(userId);
        if (!to) continue;
        await this.mailer.send(
          `dispute-${b.id}-${borrower ? 'borrower' : 'lender'}`,
          disputeSettledMessage({
            to: to.email,
            name: to.name,
            listingTitle: b.listing.title,
            borrower,
            depositPaise: b.depositPaise,
            lenderGetsPaise: b.keptPaise,
            note: t.note ?? null,
          }),
        );
      }
    }
  }

  private async notify(t: Transition): Promise<void> {
    const b = t.booking;
    const title = b.listing.title;
    const dates = dateRange(b.startsOn, b.endsOn);
    const borrower = firstName(b.borrower.name, 'The borrower');
    const lender = firstName(b.lender.name, 'The lender');
    const send = (userId: string, type: string, heading: string, body: string, push: boolean) =>
      this.notifications.notify(userId, { type, title: heading, body, bookingId: b.id }, { push });

    switch (t.event) {
      case 'REQUESTED':
        return send(
          b.lenderId,
          'booking.requested',
          'New booking request',
          `${borrower} wants ${title} for ${dates}. Reply within ${hours(this.windows.requestMin)}.`,
          true,
        );
      case 'ACCEPTED':
        if (b.status === 'AWAITING_DOCS') {
          await send(
            b.borrowerId,
            'booking.accepted',
            'Booking accepted',
            `${lender} accepted your request for ${title}. Share the documents they need within ${hours(this.windows.docsMin)}.`,
            true,
          );
          return send(
            b.borrowerId,
            'booking.docs_requested',
            'Documents needed',
            `Share the documents ${lender} asked for to keep your booking of ${title}.`,
            false,
          );
        }
        return send(
          b.borrowerId,
          'booking.accepted',
          'Booking accepted',
          `${lender} accepted your request for ${title}. Your dates are held while you pay.`,
          true,
        );
      case 'DECLINED':
        return send(
          b.borrowerId,
          'booking.declined',
          'Booking declined',
          `${lender} can’t lend ${title} for ${dates}.${t.note ? ` “${t.note}”` : ''}`,
          true,
        );
      case 'DOCS_SUBMITTED':
        return send(
          b.lenderId,
          'booking.docs_submitted',
          'Documents shared',
          `${borrower} shared their documents for ${title}. Review them within ${hours(this.windows.docsMin)}.`,
          false,
        );
      case 'DOCS_APPROVED':
        return send(
          b.borrowerId,
          'booking.docs_approved',
          'Documents approved',
          `${lender} approved your documents for ${title}. Your dates are held while you pay.`,
          false,
        );
      case 'DOCS_REJECTED':
        return send(
          b.borrowerId,
          'booking.declined',
          'Documents not accepted',
          `${lender} didn’t accept your documents for ${title}, so the booking is closed.${t.note ? ` “${t.note}”` : ''}`,
          true,
        );
      case 'PAID':
        await send(
          b.borrowerId,
          'booking.confirmed',
          'Booking confirmed',
          `You’ve paid for ${title}, ${dates}. The pickup address is in the booking.`,
          true,
        );
        return send(
          b.lenderId,
          'booking.confirmed',
          'Booking confirmed',
          `${borrower} paid for ${title}, ${dates}.`,
          true,
        );
      case 'EXPIRED': {
        const why = expiryReason(t);
        for (const userId of [b.borrowerId, b.lenderId]) {
          await send(
            userId,
            'booking.expired',
            'Booking expired',
            `${title}, ${dates}: ${why}.`,
            true,
          );
        }
        return;
      }
      case 'CANCELLED': {
        const by =
          b.cancelledBy === 'BORROWER' ? borrower : b.cancelledBy === 'LENDER' ? lender : 'Sajha';
        const recipients =
          b.cancelledBy === 'BORROWER'
            ? [b.lenderId]
            : b.cancelledBy === 'LENDER'
              ? [b.borrowerId]
              : [b.borrowerId, b.lenderId];
        for (const userId of recipients) {
          await send(
            userId,
            'booking.cancelled',
            'Booking cancelled',
            `${by} cancelled the booking of ${title} for ${dates}.${t.note ? ` “${t.note}”` : ''}`,
            true,
          );
        }
        return;
      }
      case 'HANDED_OVER':
        await send(
          b.borrowerId,
          'booking.handed_over',
          'Enjoy your rental',
          `You’ve got ${title}. Return it by the end of ${day(b.endsOn)}.`,
          true,
        );
        return send(
          b.lenderId,
          'booking.handed_over',
          'Handed over',
          `${borrower} has ${title} until ${day(b.endsOn)}.`,
          false,
        );
      case 'RETURNED': {
        const late =
          b.lateFeePaise > 0
            ? ` It was ${b.lateDays} ${b.lateDays === 1 ? 'day' : 'days'} late: ${rupees(b.lateFeePaise)} comes out of the deposit.`
            : '';
        await send(
          b.lenderId,
          'booking.returned',
          'Item returned',
          `${borrower} returned ${title}.${late} Check it and report any problem within ${CLAIM_WINDOW_HOURS} hours.`,
          true,
        );
        return send(
          b.borrowerId,
          'booking.returned',
          'Return confirmed',
          `Thanks for returning ${title}.${late} Your deposit comes back once ${lender} has checked it (${CLAIM_WINDOW_HOURS} hours at most).`,
          false,
        );
      }
      case 'NO_SHOW':
        return send(
          b.borrowerId,
          'booking.cancelled',
          'Booking cancelled: missed pickup',
          `${lender} says you didn’t come for ${title}, so the booking is cancelled. Your deposit comes back; the rent doesn’t.`,
          true,
        );
      case 'DISPUTED':
        await send(
          b.borrowerId,
          'booking.dispute_opened',
          'The lender reported a problem',
          `${lender} reported a problem with ${title}. Reply with your side; Sajha will decide what happens to the deposit.`,
          true,
        );
        return send(
          b.lenderId,
          'booking.dispute_opened',
          'Problem reported',
          `Sajha will look at your claim for ${title} and decide what happens to the deposit.`,
          false,
        );
      case 'COMPLETED':
      case 'DISPUTE_RESOLVED': {
        const back = b.depositPaise - b.keptPaise;
        const decided = t.event === 'DISPUTE_RESOLVED' ? 'Sajha has decided the claim. ' : '';
        await send(
          b.borrowerId,
          'booking.completed',
          'Rental complete',
          `${decided}${back > 0 ? `${rupees(back)} of your deposit is on its way back.` : 'The deposit went to the lender.'} Rate ${lender} while it’s fresh.`,
          true,
        );
        return send(
          b.lenderId,
          'booking.completed',
          'Rental complete',
          `${decided}Your earnings for ${title} are on their way${b.keptPaise > 0 ? `, plus ${rupees(b.keptPaise)} from the deposit` : ''}. Rate ${borrower} while it’s fresh.`,
          true,
        );
      }
    }
  }
}

function chatText(t: Transition): string {
  const b = t.booking;
  const reason = t.note ? `: ${t.note}` : '';
  switch (t.event) {
    case 'REQUESTED':
      return `Booking requested: ${dateRange(b.startsOn, b.endsOn)}, ${rupees(b.totalPaise)} in total (incl. refundable deposit)`;
    case 'ACCEPTED':
      return b.status === 'AWAITING_DOCS'
        ? 'Booking accepted. Waiting for the borrower to share documents.'
        : 'Booking accepted. The dates are held for payment.';
    case 'DECLINED':
      return `Booking declined${reason}`;
    case 'DOCS_SUBMITTED':
      return 'Documents shared with the lender for this booking.';
    case 'DOCS_APPROVED':
      return 'Documents approved. The dates are held for payment.';
    case 'DOCS_REJECTED':
      return `Documents not accepted${reason}. The booking is closed.`;
    case 'PAID':
      return 'Payment received. The booking is confirmed, and contact details are now visible.';
    case 'EXPIRED':
      return `Booking expired: ${expiryReason(t)}.`;
    case 'CANCELLED': {
      const by: Record<BookingParty, string> = {
        BORROWER: 'the borrower',
        LENDER: 'the lender',
        ADMIN: 'Sajha',
      };
      return `Booking cancelled by ${by[b.cancelledBy ?? 'ADMIN']}${reason}`;
    }
    case 'HANDED_OVER':
      return `Handed over. Due back by the end of ${day(b.endsOn)}.`;
    case 'RETURNED':
      return b.lateFeePaise > 0
        ? `Returned, ${b.lateDays} ${b.lateDays === 1 ? 'day' : 'days'} late (late fee ${rupees(b.lateFeePaise)} from the deposit).`
        : 'Returned. The lender has 24 hours to report any problem.';
    case 'NO_SHOW':
      return `Cancelled: the borrower didn’t come for the pickup${reason}`;
    case 'DISPUTED':
      return 'The lender reported a problem. Sajha will decide what happens to the deposit.';
    case 'COMPLETED':
      return 'Rental complete. The deposit is being settled.';
    case 'DISPUTE_RESOLVED':
      return `Sajha decided the claim${reason}`;
  }
}

function expiryReason(t: Transition): string {
  switch (t.from) {
    case 'REQUESTED':
      return 'the lender didn’t reply in time';
    case 'AWAITING_DOCS':
      return t.booking.shares.length > 0
        ? 'the documents weren’t reviewed in time'
        : 'the documents weren’t shared in time';
    default:
      return 'payment wasn’t completed in time';
  }
}

/** "14 Oct" (booking dates are whole days). */
function day(d: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(d);
}

function firstName(name: string | null, fallback: string): string {
  return name?.split(' ')[0] || fallback;
}

function hours(minutes: number): string {
  if (minutes % 60 !== 0) return `${minutes} minutes`;
  const h = minutes / 60;
  return h === 1 ? '1 hour' : `${h} hours`;
}

export function bookingNotFound(): AppException {
  return new AppException(ErrorCode.NOT_FOUND, 'Booking not found', HttpStatus.NOT_FOUND);
}

/** Postgres refused the dates (exclusion constraint) or a second open booking (unique index). */
export function mapBookingError(err: unknown): unknown {
  const text = describe(err);
  if (text.includes('bookings_no_overlap') || text.includes('23P01')) {
    return new AppException(
      ErrorCode.BOOKING_DATES_TAKEN,
      'Someone else has just taken these dates.',
      HttpStatus.CONFLICT,
    );
  }
  if (text.includes('bookings_one_open')) {
    return new AppException(
      ErrorCode.BOOKING_OPEN_EXISTS,
      'You already have a booking in progress for this item.',
      HttpStatus.CONFLICT,
    );
  }
  return err;
}

function describe(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const meta = (err as { meta?: unknown }).meta;
  const code = (err as { code?: unknown }).code;
  return `${err.message} ${String(code ?? '')} ${meta ? JSON.stringify(meta) : ''}`;
}
