import { describe, expect, it } from 'vitest';
import { formatXmltvDate, parseAthensDate, timeZoneOffsetMinutes } from '../src/time.js';

describe('parseAthensDate', () => {
  it('treats naïve timestamps as Europe/Athens in winter', () => {
    expect(parseAthensDate('2026-11-08T03:00:00').toISOString()).toBe('2026-11-08T01:00:00.000Z');
  });

  it('treats naïve timestamps as Europe/Athens in summer', () => {
    expect(parseAthensDate('2026-07-15T12:00:00').toISOString()).toBe('2026-07-15T09:00:00.000Z');
  });

  it('accepts explicit offsets', () => {
    expect(parseAthensDate('2026-11-08T00:00:00+02:00').toISOString()).toBe('2026-11-07T22:00:00.000Z');
  });

  it('accepts UTC timestamps', () => {
    expect(parseAthensDate('2026-11-08T01:00:00Z').toISOString()).toBe('2026-11-08T01:00:00.000Z');
  });

  it('rejects unsupported formats', () => {
    expect(() => parseAthensDate('08/11/2026 03:00')).toThrow(/Unsupported date/);
  });
});

describe('formatXmltvDate', () => {
  it('formats winter time with a +0200 offset', () => {
    expect(formatXmltvDate(new Date('2026-11-08T01:00:00Z'))).toBe('20261108030000 +0200');
  });

  it('formats summer time with a +0300 offset', () => {
    expect(formatXmltvDate(new Date('2026-07-15T09:00:00Z'))).toBe('20260715120000 +0300');
  });

  it('formats midnight as 000000 rather than 240000', () => {
    expect(formatXmltvDate(new Date('2026-11-08T22:00:00Z'))).toBe('20261109000000 +0200');
  });

  it('round-trips a parsed timestamp', () => {
    const raw = '2026-11-08T03:30:00';
    expect(formatXmltvDate(parseAthensDate(raw))).toBe('20261108033000 +0200');
  });
});

describe('timeZoneOffsetMinutes', () => {
  it('returns the Athens offset at the given instant', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(120);
    expect(timeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(180);
  });
});
