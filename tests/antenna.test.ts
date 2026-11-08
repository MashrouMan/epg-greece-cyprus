import { describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/antenna.json' with { type: 'json' };
import { fetchAntenna, parseAntennaPayload } from '../src/sources/antenna.js';

describe('parseAntennaPayload', () => {
  const result = parseAntennaPayload(fixture);

  it('maps the source channel keys to stable XMLTV ids', () => {
    expect(result.channels).toHaveLength(9);
    expect(result.channels.slice(0, 2)).toEqual([
      {
        id: 'ant1',
        name: 'ANT1',
        icon: 'https://antenna-ott.brightcove.services/static/uploads/3ed95d2f-de1e-45ff-bb51-ab96720d43f1',
      },
      {
        id: 'makedonia_tv',
        name: 'Makedonia TV',
        icon: 'https://antenna-ott.brightcove.services/static/uploads/9819c497-4073-4254-be02-a5085f422411',
      },
    ]);
    expect(result.channels.at(-1)).toEqual({
      id: 'ant1plus_padel',
      name: 'Padel Time',
      icon: 'https://antenna-ott.brightcove.services/static/uploads/404d28b3-df59-4dbd-9bb6-c859b7c5de88',
    });
  });

  it('keeps valid programmes and drops malformed ones', () => {
    expect(result.programmes).toHaveLength(4);
    expect(result.programmes.map((programme) => programme.channelId)).toEqual([
      'ant1',
      'ant1',
      'ant1plus_padel',
      'ant1plus_padel',
    ]);
  });

  it('deduplicates repeated events, keeping the longest version', () => {
    const first = result.programmes[0]!;
    expect(first.title).toBe('Πρωινό & Νέα');
    expect(first.stop.toISOString()).toBe('2026-11-08T04:30:00.000Z');
  });

  it('treats naïve timestamps as UTC and honours explicit offsets', () => {
    expect(result.programmes[0]!.start.toISOString()).toBe('2026-11-08T03:00:00.000Z');
    expect(result.programmes[2]!.start.toISOString()).toBe('2026-11-07T22:00:00.000Z');
  });

  it('repairs programmes whose end date was left on the previous day', () => {
    const lateNight = result.programmes[3]!;
    expect(lateNight.title).toBe('Late night');
    expect(lateNight.start.toISOString()).toBe('2026-11-08T21:00:00.000Z');
    expect(lateNight.stop.toISOString()).toBe('2026-11-08T22:30:00.000Z');
  });

  it('preserves genre and synopsis and ignores placeholder images', () => {
    expect(result.programmes[0]!.category).toBe('ΕΙΔΗΣΕΙΣ');
    expect(result.programmes[0]!.description).toBe('Περιγραφή <δοκιμή> "quote"');
    expect(result.programmes[0]!.icon).toBe('https://example.com/programme.jpg');
    expect(result.programmes[1]!.icon).toBeUndefined();
  });

  it('reports missing channels, bad dates and unknown keys as warnings', () => {
    expect(result.warnings).toHaveLength(10);
    expect(result.warnings.some((warning) => warning.startsWith('ch2: no programme data'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('Unsupported date'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('extra: unknown channel key'))).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes('assuming it crosses midnight')),
    ).toBe(true);
  });

  it('rejects payloads that are not objects', () => {
    expect(() => parseAntennaPayload([])).toThrow(/expected an object/);
    expect(() => parseAntennaPayload(null)).toThrow(/expected an object/);
  });
});

describe('fetchAntenna', () => {
  it('downloads and parses the EPG payload', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const result = await fetchAntenna({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      attempts: 1,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.channels).toHaveLength(9);
    expect(result.channels.map((channel) => channel.id)).toContain('ant1');
    expect(result.channels.map((channel) => channel.id)).toContain('ant1plus_padel');
    expect(result.programmes).toHaveLength(4);
  });

  it('throws a useful error when the endpoint fails', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('unavailable', { status: 503, statusText: 'Service Unavailable' }),
    );

    await expect(
      fetchAntenna({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        attempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});
