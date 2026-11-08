import type { EpgChannel, EpgProgramme, EpgSource, SourceResult } from '../types.js';

export const SPORTFM_GUIDE_URL = 'https://www.sportfmtv.gr/el/guide';
export const SPORTFM_CONFIG_URL = 'https://www.sportfmtv.gr/_ott/amplify-config.json';
const LOGO_BASE = 'https://static.yinzcam.com/api/venues/pao/prod/assets/channel-logos/';
const UNTITLED = 'Χωρίς τίτλο';
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ROW_LIMIT = 200;
const USER_AGENT =
  'Mozilla/5.0 (compatible; epg-greece-cyprus/1.0; +https://github.com/tvappshq/epg-greece-cyprus)';

interface SportfmChannelConfig {
  id: string;
  name: string;
  /** Channel id used by sportfmtv.gr / YinzCam. */
  upstreamId: string;
  logo: string;
}

/**
 * The channels shown on https://www.sportfmtv.gr/el/guide. The XMLTV ids are
 * stable slugs so clients do not need to know the upstream UUIDs.
 */
export const SPORTFM_CHANNELS: readonly SportfmChannelConfig[] = [
  {
    id: 'sportfm_tv1',
    name: 'SPORT FM TV 1',
    upstreamId: '6649e847-98ff-425e-b3c7-22e998b41d79',
    logo: `${LOGO_BASE}channel-1.svg`,
  },
  {
    id: 'sportfm_tv2',
    name: 'SPORT FM TV 2',
    upstreamId: '2a05abde-b35b-4334-8eb8-f55e14880306',
    logo: `${LOGO_BASE}channel-2.svg`,
  },
  {
    id: 'sportfm_tv3',
    name: 'SPORT FM TV 3',
    upstreamId: '99b3d68e-16af-4431-af27-061954ba7341',
    logo: `${LOGO_BASE}channel-3.svg`,
  },
  {
    id: 'sportfm_tv4',
    name: 'SPORT FM TV 4',
    upstreamId: '8e02fcb6-e0e0-4712-824e-62988b5703fe',
    logo: `${LOGO_BASE}channel-4.svg`,
  },
  {
    id: 'sportfm_tv5',
    name: 'SPORT FM TV 5',
    upstreamId: '86eb1122-01b4-428b-83e6-423901f9e3ea',
    logo: `${LOGO_BASE}channel-5.svg`,
  },
  {
    id: 'sportfm_tv6',
    name: 'SPORT FM TV 6',
    upstreamId: '5fbcfd58-1d78-4985-97a3-212e1dd6423b',
    logo: `${LOGO_BASE}channel-6.svg`,
  },
];

const CHANNEL_BY_UPSTREAM = new Map(
  SPORTFM_CHANNELS.map((channel) => [channel.upstreamId, channel]),
);
const CHANNEL_ORDER = new Map(
  SPORTFM_CHANNELS.map((channel, index) => [channel.id, index]),
);

const GUIDE_QUERY = `query ListPublicProgramGuide($tenant_id: String!, $window_from: String!, $window_to: String!, $channel_id: String!, $limit: Int!) {
  listPublicProgramGuide(tenant_id: $tenant_id, window_from: $window_from, window_to: $window_to, channel_id: $channel_id, limit: $limit) {
    tenant_id
    channel_id
    channel_title
    channel_image_url
    event_id
    title
    description
    image_url
    broadcast_start
    kickoff_time
    end_time
    end_time_is_inferred
    air_state
    total_count
    server_time
  }
}`;

interface AmplifyConfig {
  endpoint: string;
  apiKey: string;
  tenantId: string;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function cleanText(value: unknown): string | undefined {
  const text = stringValue(value)?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function httpUrl(value: unknown): string | undefined {
  const url = stringValue(value);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

function parseDate(value: unknown): Date | undefined {
  const raw = stringValue(value);
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readAmplifyConfig(payload: unknown): AmplifyConfig {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected sportfmtv.gr config payload');
  }
  const config = payload as Record<string, unknown>;
  const outputs = config.amplifyOutputs;
  if (!outputs || typeof outputs !== 'object') {
    throw new Error('sportfmtv.gr config is missing amplifyOutputs');
  }
  const data = (outputs as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') {
    throw new Error('sportfmtv.gr config is missing amplifyOutputs.data');
  }
  const endpoint = stringValue((data as Record<string, unknown>).url);
  const apiKey = stringValue((data as Record<string, unknown>).api_key);
  const tenantId = stringValue(config.tenantId);
  if (!endpoint || !apiKey || !tenantId) {
    throw new Error('sportfmtv.gr config is missing the GraphQL endpoint, API key or tenant id');
  }
  return { endpoint, apiKey, tenantId };
}

/** Parse the rows returned by the `listPublicProgramGuide` GraphQL query. */
export function parseSportfmGuide(rows: unknown): SourceResult {
  if (!Array.isArray(rows)) {
    throw new Error('Unexpected sportfmtv.gr guide payload: expected an array of entries');
  }

  const channels: EpgChannel[] = SPORTFM_CHANNELS.map((channel) => ({
    id: channel.id,
    name: channel.name,
    icon: channel.logo,
  }));
  const channelIndex = new Map(SPORTFM_CHANNELS.map((channel, index) => [channel.id, index]));
  const programmes = new Map<string, EpgProgramme>();
  const warnings: string[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      warnings.push('skipped a non-object guide entry');
      continue;
    }

    const entry = row as Record<string, unknown>;
    const upstreamId = stringValue(entry.channel_id);
    const config = upstreamId ? CHANNEL_BY_UPSTREAM.get(upstreamId) : undefined;
    if (!config) {
      warnings.push(`${upstreamId ?? 'unknown channel'}: unknown channel id, ignored`);
      continue;
    }

    const eventId = stringValue(entry.event_id) ?? 'unknown';
    const start = parseDate(entry.broadcast_start) ?? parseDate(entry.kickoff_time);
    if (!start) {
      warnings.push(`${config.id}/${eventId}: missing or invalid broadcast start`);
      continue;
    }

    let stop = parseDate(entry.end_time);
    if (!stop || stop.getTime() <= start.getTime()) {
      stop = new Date(start.getTime() + DEFAULT_DURATION_MS);
      warnings.push(`${config.id}/${eventId}: missing or invalid end time, assuming 2 hours`);
    }

    const title = cleanText(entry.title) ?? UNTITLED;
    const logo = httpUrl(entry.channel_image_url);
    if (logo) {
      const channel = channels[channelIndex.get(config.id) ?? -1];
      if (channel) {
        channel.icon = logo;
      }
    }

    const programme: EpgProgramme = {
      channelId: config.id,
      start,
      stop,
      title,
      description: cleanText(entry.description),
      icon: httpUrl(entry.image_url),
    };

    const key = `${programme.channelId}\u0000${programme.start.getTime()}\u0000${programme.title}`;
    const existing = programmes.get(key);
    if (!existing) {
      programmes.set(key, programme);
    } else if (programme.stop.getTime() > existing.stop.getTime()) {
      existing.stop = programme.stop;
      existing.description ??= programme.description;
      existing.icon ??= programme.icon;
    }
  }

  const sorted = [...programmes.values()].sort(
    (left, right) =>
      (CHANNEL_ORDER.get(left.channelId) ?? Number.MAX_SAFE_INTEGER) -
        (CHANNEL_ORDER.get(right.channelId) ?? Number.MAX_SAFE_INTEGER) ||
      left.start.getTime() - right.start.getTime(),
  );

  return { channels, programmes: sorted, warnings };
}

export interface FetchSportfmOptions {
  configUrl?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  attempts?: number;
  retryDelayMs?: number;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  attempts: number,
  retryDelayMs: number,
): Promise<unknown> {
  const { signal: _signal, ...request } = init;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...request,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function floorToHour(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setUTCMinutes(0, 0, 0);
  return copy;
}

/** Download the sportfmtv.gr program guide for the next seven days. */
export async function fetchSportfm(options: FetchSportfmOptions = {}): Promise<SourceResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = Math.max(1, options.attempts ?? 3);
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const configUrl = options.configUrl ?? SPORTFM_CONFIG_URL;
  const now = options.now ?? new Date();
  const windowFrom = floorToHour(now).toISOString();
  const windowTo = new Date(floorToHour(now).getTime() + WINDOW_MS).toISOString();
  const headers = {
    accept: 'application/json',
    'accept-language': 'el-GR,el;q=0.9,en;q=0.8',
    referer: SPORTFM_GUIDE_URL,
    'user-agent': USER_AGENT,
  };

  const configPayload = await fetchJson(
    fetchImpl,
    configUrl,
    { headers, signal: AbortSignal.timeout(30_000) },
    attempts,
    retryDelayMs,
  );
  const config = readAmplifyConfig(configPayload);

  const warnings: string[] = [];
  const rows: unknown[] = [];

  for (const channel of SPORTFM_CHANNELS) {
    try {
      const payload = await fetchJson(
        fetchImpl,
        config.endpoint,
        {
          method: 'POST',
          headers: {
            ...headers,
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
          },
          body: JSON.stringify({
            query: GUIDE_QUERY,
            variables: {
              tenant_id: config.tenantId,
              window_from: windowFrom,
              window_to: windowTo,
              channel_id: channel.upstreamId,
              limit: ROW_LIMIT,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        },
        attempts,
        retryDelayMs,
      );

      if (!payload || typeof payload !== 'object') {
        throw new Error('unexpected GraphQL response');
      }
      const result = payload as Record<string, unknown>;
      const errors = result.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        const messages = errors
          .map((error) =>
            error && typeof error === 'object' ? stringValue((error as Record<string, unknown>).message) : undefined,
          )
          .filter((message): message is string => Boolean(message));
        throw new Error(`GraphQL error: ${messages.join('; ') || 'unknown error'}`);
      }
      const data = result.data;
      const entries =
        data && typeof data === 'object'
          ? (data as Record<string, unknown>).listPublicProgramGuide
          : undefined;
      if (!Array.isArray(entries)) {
        throw new Error('GraphQL response is missing listPublicProgramGuide');
      }
      if (entries.length >= ROW_LIMIT) {
        warnings.push(`${channel.id}: ${ROW_LIMIT} entries returned, results may be truncated`);
      }
      rows.push(...entries);
    } catch (error) {
      warnings.push(`${channel.id}: ${(error as Error).message}`);
    }
  }

  const parsed = parseSportfmGuide(rows);
  return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
}

export const sportfmSource: EpgSource = {
  id: 'sportfm',
  name: 'sportfmtv.gr',
  fetch: () => fetchSportfm(),
};
