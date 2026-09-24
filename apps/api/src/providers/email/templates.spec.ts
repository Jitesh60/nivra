import {
  accountDeletedMessage,
  bookingReceiptMessage,
  disputeSettledMessage,
  emailOtpMessage,
  lenderBookedMessage,
  refundMessage,
} from './templates.js';

const start = new Date('2026-10-12T00:00:00Z');
const end = new Date('2026-10-14T00:00:00Z');

describe('email templates', () => {
  it('puts the code in the subject and both parts', () => {
    const m = emailOtpMessage('a@b.in', '482913', 10);
    expect(m.subject).toBe('482913 is your Sajha verification code');
    expect(m.text).toContain('482913');
    expect(m.html).toContain('482913');
    expect(m.text).toContain('10 minutes');
    // Codes always send: no opt-out line.
    expect(m.text).not.toContain('Settings → Notifications');
  });

  it('the receipt itemises the charge in rupees and says how to opt out', () => {
    const m = bookingReceiptMessage({
      to: 'rahul@example.com',
      name: 'Rahul',
      ref: '#4F2A9C',
      listingTitle: 'Quechua 2-person tent',
      area: 'Kothrud, Pune',
      start,
      end,
      days: 3,
      pricePerDayPaise: 15_000,
      rentPaise: 45_000,
      feePaise: 4_500,
      depositPaise: 100_000,
      totalPaise: 149_500,
      lenderName: 'Asha',
    });
    expect(m.subject).toBe('Booked: Quechua 2-person tent, 12 Oct 2026 – 14 Oct 2026');
    expect(m.text).toContain('₹150 × 3 days: ₹450');
    expect(m.text).toContain('Refundable deposit: ₹1,000');
    expect(m.text).toContain('Total paid (receipt #4F2A9C): ₹1,495');
    expect(m.text).toContain('pickup around Kothrud, Pune');
    expect(m.text).toContain('Settings → Notifications');
    expect(m.html).toContain('<!doctype html>');
  });

  it('escapes what people typed', () => {
    const m = lenderBookedMessage({
      to: 'a@b.in',
      name: '<b>Asha</b>',
      listingTitle: 'Tent & "poles"',
      start,
      end: start,
      earningsPaise: 27_000,
      borrowerName: 'Rahul',
    });
    expect(m.html).not.toContain('<b>Asha</b>');
    expect(m.html).toContain('&#60;b&#62;Asha');
    expect(m.html).toContain('Tent &#38; &#34;poles&#34;');
    expect(m.text).toContain('You’ll earn ₹270');
    expect(m.subject).toBe('Confirmed: Tent & "poles", 12 Oct 2026');
  });

  it('refunds say what they were for', () => {
    const m = refundMessage({
      to: 'a@b.in',
      name: null,
      listingTitle: 'Tent',
      amountPaise: 40_000,
      kind: 'DEPOSIT_RETURN',
    });
    expect(m.subject).toBe('Refund of ₹400 on the way');
    expect(m.text).toContain('for your deposit (Tent)');
    expect(m.text).toContain('Hi there');
  });

  it('the dispute outcome shows the split for each side', () => {
    const base = {
      to: 'a@b.in',
      name: 'Rahul',
      listingTitle: 'Tent',
      depositPaise: 100_000,
      lenderGetsPaise: 60_000,
      note: 'The tear shows in the return photos.',
    };
    const borrower = disputeSettledMessage({ ...base, borrower: true });
    expect(borrower.text).toContain('To the lender: ₹600');
    expect(borrower.text).toContain('Back to the borrower: ₹400');
    expect(borrower.text).toContain('“The tear shows in the return photos.”');
    expect(borrower.html).toContain('₹400 of your deposit comes back to you.');
    const lender = disputeSettledMessage({ ...base, borrower: false });
    expect(lender.html).toContain('You receive ₹600 from the deposit.');
  });

  it('account deletion always sends and says what is kept', () => {
    const m = accountDeletedMessage('a@b.in', 'Rahul');
    expect(m.text).toContain('tax and payment rules');
    expect(m.text).not.toContain('Settings → Notifications');
  });
});
