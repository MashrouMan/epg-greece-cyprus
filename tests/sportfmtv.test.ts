import { describe, expect, it, vi } from 'vitest';
import {
  fetchSportfm,
  parseSportfmGuide,
  SPORTFM_CONFIG_URL,
} from '../src/sources/sportfmtv.js';

const rows = [
  {
    channel_id: '6649e847-98ff-425e-b3c7-22e998b41d79',
    channel_title: 'SPORT FM TV 1',
    channel_image_url: 'https://example.com/tv1.png',
    event_id: 'e1',
    title: 'Αγώνας',
    description: 'Περιγραφή',
    image_url: 'https://example.com/programme.jpg',
    broadcast_start: '2026-11-08T10:00:00.000Z',
    end_time: '2026-11-08T12:00:00.000Z',
  },
  {
    channel_id: '6649e847-98ff-425e-b3c7-22e998b41d79',
    channel_title: 'SPORT FM TV 1',
    event_id: 'e1',
    title: 'Αγώνας',
    broadcast_start: '2026-11-08T10:00:00.000Z',
    end_time: '2026-11-08T13:00:00.000Z',
  },
  {
    channel_id: '2a05abde-b35b-4334-8eb8-f55e14880306',
    channel_title: 'SPORT FM TV 2',
    event_id: 'e2',
    title: 'Μαρούσι – Ολυμπιακός',
    broadcast_start: '2026-11-08T15:30:00.000Z',
    end_time: null,
  },
  {
    channel_id: '8e02fcb6-e0e0-4712-824e-62988b5703fe',
    channel_title: 'SPORT FM TV 4',
    event_id: 'e3',
    title: 'Προμηθέας – Τρέπτσα',
    broadcast_start: '2026-11-11T17:00:00.000Z',
    end_time: '2026-11-11T19:30:00.000Z',
  },
  {
    channel_id: 'unknown-channel',
    title: 'Άγνωστο',
    broadcast_start: '2026-11-08T10:00:00.000Z',
    end_time: '2026-11-08T11:00:00.000Z',
  },
  {
    channel_id: '6649e847-98ff-425e-b3c7-22e998b41d79',
    event_id: 'e4',
    title: 'Λάθος ημερομηνία',
    broadcast_start: 'not-a-date',
    end_time: '2026-11-08T11:00:00.000Z',
  },
  null,
];

const amplifyConfig = {
  tenantId: 'VENUE_PAO',
  amplifyOutputs: {
    data: {
      url: 'https://example.com/graphql',
      api_key: 'test-api-key',
    },
  },
};

describe('parseSportfmGuide', () => {
  const result = parseSportfmGuide(rows);

  it('maps the upstream channels to stable XMLTV ids', () => {
    expect(result.channels.map((channel) => channel.id)).toEqual([
      'sportfm_tv1',
      'sportfm_tv2',
      'sportfm_tv3',
      'sportfm_tv4',
      'sportfm_tv5',
      'sportfm_tv6',
    ]);
    expect(result.channels[0]).toEqual({
      id: 'sportfm_tv1',
      name: 'SPORT FM TV 1',
      icon: 'https://example.com/tv1.png',
    });
    expect(result.channels[5]!.icon).toBe(
      'https://static.yinzcam.com/api/venues/pao/prod/assets/channel-logos/channel-6.svg',
    );
  });

  it('keeps valid programmes and drops malformed rows', () => {
    expect(result.programmes).toHaveLength(3);
    expect(result.programmes.map((programme) => programme.channelId)).toEqual([
      'sportfm_tv1',
      'sportfm_tv2',
      'sportfm_tv4',
    ]);
  });

  it('deduplicates repeated entries, keeping the longest version', () => {
    expect(result.programmes[0]!.title).toBe('Αγώνας');
    expect(result.programmes[0]!.stop.toISOString()).toBe('2026-11-08T13:00:00.000Z');
    expect(result.programmes[0]!.description).toBe('Περιγραφή');
    expect(result.programmes[0]!.icon).toBe('https://example.com/programme.jpg');
  });

  it('treats timestamps as absolute UTC instants', () => {
    expect(result.programmes[0]!.start.toISOString()).toBe('2026-11-08T10:00:00.000Z');
    expect(result.programmes[2]!.start.toISOString()).toBe('2026-11-11T17:00:00.000Z');
  });

  it('infers a two-hour end time when it is missing', () => {
    const inferred = result.programmes[1]!;
    expect(inferred.stop.toISOString()).toBe('2026-11-08T17:30:00.000Z');
    expect(
      result.warnings.some((warning) => warning.includes('assuming 2 hours')),
    ).toBe(true);
  });

  it('reports unknown channels and bad rows as warnings', () => {
    expect(result.warnings).toHaveLength(4);
    expect(
      result.warnings.some((warning) => warning.includes('unknown channel id')),
    ).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('invalid broadcast start'))).toBe(
      true,
    );
    expect(result.warnings.some((warning) => warning.includes('non-object'))).toBe(true);
  });

  it('rejects payloads that are not arrays', () => {
    expect(() => parseSportfmGuide(null)).toThrow(/expected an array/);
    expect(() => parseSportfmGuide({})).toThrow(/expected an array/);
  });
});

describe('fetchSportfm', () => {
  it('reads the public config and queries every channel', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === SPORTFM_CONFIG_URL) {
        return new Response(JSON.stringify(amplifyConfig), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      const body = JSON.parse(String(init?.body)) as {
        variables: { channel_id: string; window_from: string; window_to: string; limit: number };
      };
      const channelRows = rows.filter(
        (row) => row?.channel_id === body.variables.channel_id,
      );
      return new Response(
        JSON.stringify({ data: { listPublicProgramGuide: channelRows } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const result = await fetchSportfm({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date('2026-11-08T10:37:00Z'),
      attempts: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(result.channels).toHaveLength(6);
    expect(result.programmes).toHaveLength(3);

    const firstGuideCall = fetchImpl.mock.calls[1]!;
    const body = JSON.parse(String(firstGuideCall[1]?.body)) as {
      variables: Record<string, unknown>;
    };
    expect(body.variables).toMatchObject({
      tenant_id: 'VENUE_PAO',
      window_from: '2026-11-08T10:00:00.000Z',
      window_to: '2026-11-15T10:00:00.000Z',
      limit: 200,
    });
  });

  it('keeps other channels when one channel request fails', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === SPORTFM_CONFIG_URL) {
        return new Response(JSON.stringify(amplifyConfig), { status: 200 });
      }

      const body = JSON.parse(String(init?.body)) as { variables: { channel_id: string } };
      if (body.variables.channel_id === '2a05abde-b35b-4334-8eb8-f55e14880306') {
        return new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), { status: 200 });
      }
      const channelRows = rows.filter(
        (row) => row?.channel_id === body.variables.channel_id,
      );
      return new Response(JSON.stringify({ data: { listPublicProgramGuide: channelRows } }), {
        status: 200,
      });
    });

    const result = await fetchSportfm({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date('2026-11-08T10:37:00Z'),
      attempts: 1,
    });

    expect(result.programmes).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes('GraphQL error: boom'))).toBe(
      true,
    );
  });

  it('throws when the config endpoint fails', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('unavailable', { status: 503, statusText: 'Service Unavailable' }),
    );

    await expect(
      fetchSportfm({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: new Date('2026-11-08T10:37:00Z'),
        attempts: 1,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});
