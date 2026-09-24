import { describe, expect, it } from 'vitest';
import { MASK, maskContacts } from './masking.js';

const masked = (s: string) => maskContacts(s).text;

describe('maskContacts', () => {
  it.each([
    ['call me on 9876543210', `call me on ${MASK}`],
    ['call 98765 43210 today', `call ${MASK} today`],
    ['+91 98765 43210', MASK],
    ['+91-98765-43210', MASK],
    ['(+91) 98765.43210', `(${MASK}`],
    ['919876543210', MASK],
    ['09876543210', MASK],
    ['9 8 7 6 5 4 3 2 1 0', MASK],
    ['98-765-432-10 ok', `${MASK} ok`],
    ['landline 020 2567 8901', `landline ${MASK}`],
    ['nine eight seven six five four three two one zero', MASK],
  ])('hides phone numbers: %s', (input, expected) => {
    const result = maskContacts(input);
    expect(result.text).toBe(expected);
    expect(result.masked).toBe(true);
  });

  it.each([
    ['mail rahul.sharma+rent@gmail.com', `mail ${MASK}`],
    ['RAHUL@Example.CO.IN please', `${MASK} please`],
    ['rahul at gmail dot com', MASK],
    ['rahul [at] gmail (dot) co dot in', MASK],
  ])('hides emails: %s', (input, expected) => {
    expect(masked(input)).toBe(expected);
  });

  it.each([
    ['pay to rahul@okaxis', `pay to ${MASK}`],
    ['9876543210@ybl', MASK],
    ['upi shop.name@paytm thanks', `upi ${MASK} thanks`],
  ])('hides UPI IDs: %s', (input, expected) => {
    expect(masked(input)).toBe(expected);
  });

  it.each([
    ['whatsapp wa.me/919876543210', `whatsapp ${MASK}`],
    ['https://t.me/rahul_rents', MASK],
    ['join https://chat.whatsapp.com/AbCdEf123', `join ${MASK}`],
  ])('hides messaging links: %s', (input, expected) => {
    expect(masked(input)).toBe(expected);
  });

  it.each([
    'Is it free from 12-10-2026 to 15-10-2026?',
    'Can you do ₹1,500 for 3 days?',
    'I can pay 1500/day, deposit 10000',
    'Pickup near 411038, around 5:30',
    'Order 123456789 was fine',
    'See you on 12/10 at 10.30',
    'The tent is 2 years old, used 3 times',
    'I got it at the store, dot matrix printer',
    'Meet me @home',
  ])('leaves ordinary text alone: %s', (input) => {
    expect(maskContacts(input)).toEqual({ text: input, masked: false });
  });

  it('masks several things in one message', () => {
    expect(masked('call 9876543210 or mail a@b.com, then pay a@okaxis')).toBe(
      `call ${MASK} or mail ${MASK}, then pay ${MASK}`,
    );
  });
});
