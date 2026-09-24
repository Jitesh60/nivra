import { analyticsRange, istDate } from './analytics-range.js';

describe('analytics range', () => {
  it('counts days in India, not UTC', () => {
    expect(istDate(new Date('2026-09-24T18:29:00Z'))).toBe('2026-09-24');
    expect(istDate(new Date('2026-09-24T18:30:00Z'))).toBe('2026-09-25');
  });

  it('ends today and has the period before it', () => {
    const r = analyticsRange(7, new Date('2026-09-24T20:00:00Z'));
    expect(r.to).toBe('2026-09-25');
    expect(r.from).toBe('2026-09-19');
    expect(r.dates).toEqual([
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    expect(r.previousFrom).toBe('2026-09-12');
    expect(r.previousTo).toBe('2026-09-18');
  });

  it('crosses month ends', () => {
    const r = analyticsRange(30, new Date('2026-03-01T06:00:00Z'));
    expect(r.from).toBe('2026-01-31');
    expect(r.dates).toHaveLength(30);
    expect(r.previousTo).toBe('2026-01-30');
  });
});
