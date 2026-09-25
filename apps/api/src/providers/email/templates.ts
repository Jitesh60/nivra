import type { EmailMessage } from './email.provider.js';
import { renderEmail } from './layout.js';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const rupees = (paise: number) => inr.format(paise / 100);
const day = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
/** "12 Oct 2026 – 14 Oct 2026" from booking dates (whole days, stored at UTC midnight). */
export const emailDates = (start: Date, end: Date) => {
  const s = day.format(start);
  const e = day.format(end);
  return s === e ? s : `${s} – ${e}`;
};

const bookingReason = 'You’re getting this because you have a booking on Nivra.';

/** Email-verification code. Keep it short: most people read it in a notification. */
export function emailOtpMessage(to: string, code: string, ttlMinutes: number): EmailMessage {
  return {
    to,
    subject: `${code} is your Nivra verification code`,
    ...renderEmail({
      preheader: `It expires in ${ttlMinutes} minutes.`,
      heading: `Your code is ${code}`,
      paragraphs: [
        `Enter it in the Nivra app to verify this email. It expires in ${ttlMinutes} minutes.`,
        'If you didn’t ask for it, you can ignore this email: nothing changes without the code.',
      ],
      reason: 'You’re getting this because someone entered this address in the Nivra app.',
    }),
  };
}

export interface ReceiptInput {
  to: string;
  name: string | null;
  ref: string;
  listingTitle: string;
  area: string | null;
  start: Date;
  end: Date;
  days: number;
  pricePerDayPaise: number;
  rentPaise: number;
  feePaise: number;
  depositPaise: number;
  /** Referral credit taken off the rent (Phase 10). */
  creditPaise?: number;
  totalPaise: number;
  lenderName: string | null;
}

/** To the borrower once payment is confirmed: the receipt. */
export function bookingReceiptMessage(r: ReceiptInput): EmailMessage {
  return {
    to: r.to,
    subject: `Booked: ${r.listingTitle}, ${emailDates(r.start, r.end)}`,
    ...renderEmail({
      preheader: `Receipt ${r.ref} · ${rupees(r.totalPaise)} paid`,
      heading: `You’ve booked ${r.listingTitle}`,
      paragraphs: [
        `Hi ${r.name ?? 'there'}, your payment went through and ${r.lenderName ?? 'the lender'} has been told. The pickup address and their number are in the app.`,
        `${emailDates(r.start, r.end)}${r.area ? ` · pickup around ${r.area}` : ''}. At pickup, show your handover code in the app.`,
      ],
      rows: [
        {
          label: `${rupees(r.pricePerDayPaise)} × ${r.days} ${r.days === 1 ? 'day' : 'days'}`,
          value: rupees(r.rentPaise),
        },
        ...(r.feePaise > 0 ? [{ label: 'Service fee', value: rupees(r.feePaise) }] : []),
        { label: 'Refundable deposit', value: rupees(r.depositPaise) },
        ...(r.creditPaise ? [{ label: 'Invite credit', value: `−${rupees(r.creditPaise)}` }] : []),
        { label: `Total paid (receipt ${r.ref})`, value: rupees(r.totalPaise), strong: true },
      ],
      reason: bookingReason,
      optOut: true,
    }),
  };
}

/** To the lender once the borrower has paid. */
export function lenderBookedMessage(r: {
  to: string;
  name: string | null;
  listingTitle: string;
  start: Date;
  end: Date;
  earningsPaise: number;
  borrowerName: string | null;
}): EmailMessage {
  return {
    to: r.to,
    subject: `Confirmed: ${r.listingTitle}, ${emailDates(r.start, r.end)}`,
    ...renderEmail({
      preheader: `${r.borrowerName ?? 'The borrower'} has paid. You’ll earn ${rupees(r.earningsPaise)}.`,
      heading: `${r.listingTitle} is booked`,
      paragraphs: [
        `Hi ${r.name ?? 'there'}, ${r.borrowerName ?? 'the borrower'} has paid for ${emailDates(r.start, r.end)}. Their number is now in the app.`,
        `At pickup, scan their handover code and take a couple of photos of the item. You’ll earn ${rupees(r.earningsPaise)}, paid out after the item is back.`,
      ],
      reason: bookingReason,
      optOut: true,
    }),
  };
}

/** To the borrower when a refund is sent to Razorpay. */
export function refundMessage(r: {
  to: string;
  name: string | null;
  listingTitle: string;
  amountPaise: number;
  kind: string;
}): EmailMessage {
  const what =
    r.kind === 'DEPOSIT_RETURN'
      ? 'your deposit'
      : r.kind === 'LATE_PAYMENT'
        ? 'a payment that arrived after the booking closed'
        : 'your booking';
  return {
    to: r.to,
    subject: `Refund of ${rupees(r.amountPaise)} on the way`,
    ...renderEmail({
      preheader: `For ${r.listingTitle}. Usually 5–7 working days.`,
      heading: `${rupees(r.amountPaise)} is on its way back`,
      paragraphs: [
        `Hi ${r.name ?? 'there'}, we’ve refunded ${rupees(r.amountPaise)} for ${what} (${r.listingTitle}) to the way you paid.`,
        'It usually shows up in 5–7 working days, depending on your bank.',
      ],
      reason: bookingReason,
      optOut: true,
    }),
  };
}

/** To each side when an admin settles a dispute. */
export function disputeSettledMessage(r: {
  to: string;
  name: string | null;
  listingTitle: string;
  borrower: boolean;
  depositPaise: number;
  lenderGetsPaise: number;
  note: string | null;
}): EmailMessage {
  const back = Math.max(0, r.depositPaise - r.lenderGetsPaise);
  return {
    to: r.to,
    subject: `Decision on ${r.listingTitle}`,
    ...renderEmail({
      preheader: r.borrower
        ? `${rupees(back)} of your deposit comes back to you.`
        : `You receive ${rupees(r.lenderGetsPaise)} from the deposit.`,
      heading: 'Nivra has decided the claim',
      paragraphs: [
        `Hi ${r.name ?? 'there'}, we looked at the photos from both of you, the chat and what you each said.`,
        ...(r.note ? [`Our note: “${r.note}”`] : []),
        'The money moves now. Refunds usually show up in 5–7 working days.',
      ],
      rows: [
        { label: 'Deposit', value: rupees(r.depositPaise) },
        { label: 'To the lender', value: rupees(r.lenderGetsPaise) },
        { label: 'Back to the borrower', value: rupees(back), strong: true },
      ],
      reason: bookingReason,
      optOut: true,
    }),
  };
}

/** Confirms a deleted account (always sent to a verified email). */
export function accountDeletedMessage(to: string, name: string | null): EmailMessage {
  return {
    to,
    subject: 'Your Nivra account has been deleted',
    ...renderEmail({
      preheader: 'Your profile, listings and documents are gone.',
      heading: 'Your account is deleted',
      paragraphs: [
        `Hi ${name ?? 'there'}, as you asked, we’ve deleted your Nivra account. Your profile, listings, ID documents and devices are gone, and you’ve been signed out everywhere.`,
        'We keep payment and booking records for as long as Indian tax and payment rules require, without your name or contact details.',
        'If you didn’t do this, reply to this email straight away.',
      ],
      reason: 'You’re getting this because this address was verified on a Nivra account.',
    }),
  };
}
