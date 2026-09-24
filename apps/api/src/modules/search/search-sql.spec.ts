import { decodeCursor, encodeCursor, roundDistanceKm } from './search-sql.js';

describe('search helpers', () => {
  it('rounds distances to 0.5 km and hides anything under 1 km', () => {
    expect(roundDistanceKm(0)).toBe(0.5);
    expect(roundDistanceKm(999)).toBe(0.5);
    expect(roundDistanceKm(1000)).toBe(1);
    expect(roundDistanceKm(1240)).toBe(1);
    expect(roundDistanceKm(1260)).toBe(1.5);
    expect(roundDistanceKm(4760)).toBe(5);
  });

  it('round-trips cursors and rejects tampered ones', () => {
    const c = { v: 1234.5, id: '01a0d331-8ec9-729e-8ca4-f6d14a4e0190' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(() => decodeCursor('not-a-cursor')).toThrow();
    expect(() =>
      decodeCursor(Buffer.from(JSON.stringify({ v: 1, id: "x' OR 1=1" })).toString('base64url')),
    ).toThrow();
  });
});
