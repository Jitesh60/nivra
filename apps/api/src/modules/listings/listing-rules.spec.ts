import { addDays, approximate, todayUtc } from './listing-rules.js';

describe('listing rules', () => {
  it('rounds public coordinates to about 1 km', () => {
    expect(approximate(18.507412)).toBe(18.51);
    expect(approximate(73.807739)).toBe(73.81);
    expect(approximate(-12.3449)).toBe(-12.34);
  });

  it('works in whole UTC days', () => {
    const today = todayUtc(new Date('2026-09-24T22:15:00+05:30'));
    expect(today.toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(addDays(today, 365).toISOString().slice(0, 10)).toBe('2027-09-24');
  });
});
