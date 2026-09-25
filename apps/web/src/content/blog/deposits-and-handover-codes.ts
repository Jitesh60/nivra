import type { Post } from './types';

export const post: Post = {
  slug: 'how-deposits-and-handover-codes-keep-you-safe',
  title: 'How deposits and handover codes keep both sides safe',
  description:
    'Renting from a stranger works when both people are protected. Here’s what happens to your money and the item at every step of a Sajha rental.',
  date: '2026-09-23',
  author: 'Team Sajha',
  minutes: 5,
  body: [
    {
      p: 'The two worries we hear most are simple. Borrowers ask: “what if I pay and nothing happens?” Lenders ask: “what if my camera comes back broken, or doesn’t come back at all?” Every part of a Sajha rental is built around those two questions.',
    },
    { h2: 'Your money waits until the item is back' },
    {
      p: 'You pay through Razorpay (UPI, cards or net banking) when the lender accepts. The rent goes to the lender only after the item has been returned and the 24-hour window to report a problem has passed. The deposit is held separately and refunded to you after the rental.',
    },
    { h2: 'Handover codes: proof the item changed hands' },
    {
      p: 'At pickup, the borrower opens their handover code in the app: a QR code and six digits. The lender scans it or types it in, then takes at least two photos of the item. The rental starts only then. At return it’s the other way round: the lender shows a code, the borrower scans it and photographs the item.',
    },
    {
      tip: 'Only share a code in person, when the item is actually in front of you. Sajha will never ask you for it by phone or chat.',
    },
    { h2: 'Photos settle most arguments before they start' },
    {
      p: 'Both people can add condition photos at handover and return. If a lens was already scratched, it’s in the handover photos. If it wasn’t, it’s in the return photos. Most disagreements end there.',
    },
    { h2: 'Late returns' },
    {
      p: 'Items are due back by midnight on the last day. If something comes back late, one day’s rent for each late day comes out of the deposit, never more than the deposit itself. Both of you see the late fee in the app as it happens.',
    },
    { h2: 'If something goes wrong' },
    {
      ul: [
        'The lender reports a problem within 24 hours of the return, with photos and the amount they’re asking for.',
        'The borrower gives their side once, with their own photos.',
        'Someone at Sajha looks at both sides, the condition photos and the chat, and decides how much of the deposit goes to the lender. The rest goes back to the borrower.',
      ],
    },
    {
      p: 'Chats stay on Sajha, and phone numbers are hidden until a booking is paid, so the whole record is in one place if anyone needs it.',
    },
  ],
};
