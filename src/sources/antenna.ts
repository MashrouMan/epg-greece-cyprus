import { parseAthensDate } from '../time.js';
import type { EpgChannel, EpgProgramme, EpgSource, SourceResult } from '../types.js';

export const ANTENNA_EPG_URL = 'https://www.antenna.gr/EPGHandler_.ashx';
const ANTENNA_PAGE_URL = 'https://www.antenna.gr/tvguide';
const LOGO_BASE = 'https://antenna-ott.brightcove.services/static/uploads/';
const PLACEHOLDER_ICON = 'https://www.antenna.gr/images/logo_ant1.jpg';
const UNTITLED = 'Χωρίς τίτλο';

interface AntennaChannelConfig {
  id: string;
  name: string;
  logo: string;
}

/**
 * The keys are the channel keys returned by antenna.gr's EPG handler. The ids
 * are stable slugs so clients can keep their channel mapping across payload
 * changes.
 */
export const ANTENNA_CHANNELS: Readonly<Record<string, AntennaChannelConfig>> = {
  ch1: { id: 'ant1', name: 'ANT1', logo: `${LOGO_BASE}3ed95d2f-de1e-45ff-bb51-ab96720d43f1` },
  ch2: { id: 'makedonia_tv', name: 'Makedonia TV', logo: `${LOGO_BASE}9819c497-4073-4254-be02-a5085f422411` },
  ch3: { id: 'ant1_comedy', name: 'Ant1 Comedy', logo: `${LOGO_BASE}b740e876-6d23-4c34-a190-33ae6ff23d2a` },
  ch4: { id: 'ant1_drama', name: 'Ant1 Drama', logo: `${LOGO_BASE}6cab14d5-abc9-4b61-be06-2c1f4977b726` },
  ch5: { id: 'ant1plus_sports1', name: 'ANT1+ Sports 1', logo: `${LOGO_BASE}903e35c1-76f1-49a3-8587-86c6986c3b55` },
  ch6: { id: 'ant1plus_sports2', name: 'ANT1+ Sports 2', logo: `${LOGO_BASE}ee9a5184-6807-4eaa-96be-b2b7ad85ea6f` },
  ch7: { id: 'ant1plus_sports3', name: 'ANT1+ Sports 3', logo: `${LOGO_BASE}415ce5b4-c9fd-47f9-9ed2-94926024f963` },
  ch8: { id: 'ant1plus_fight', name: 'Fight', logo: `${LOGO_BASE}65645bba-11c7-494e-a2b8-af810b582a21` },
  ch9: { id: 'ant1plus_padel', name: 'Padel Time', logo: `${LOGO_BASE}404d28b3-df59-4dbd-9bb6-c859b7c5de88` },
};

const CHANNEL_ORDER = new Map(
  Object.values(ANTENNA_CHANNELS).map((channel, index) => [channel.id, index]),
);

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Collapse the tabs and newlines that upstream synopses contain. */
function cleanText(value: unknown): string | undefined {
  const text = stringValue(value)?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function programmeIcon(value: unknown): string | undefined {
  const icon = stringValue(value);
  if (!icon || icon === PLACEHOLDER_ICON || !/^https?:\/\//i.test(icon)) {
    return undefined;
  }
  return icon;
}

const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * antenna.gr's EPG handler returns UTC timestamps without an offset. Its
 * tvguide page appends "Z" before parsing them (see `parseApiDate` in
 * antenna.gr's tvguide.js), so honour explicit offsets and treat naïve values
 * as UTC rather than Athens wall time.
 */
function parseAntennaDate(raw: string): Date {
  const trimmed = raw.trim();
  return parseAthensDate(HAS_OFFSET.test(trimmed) ? trimmed : `${trimmed}Z`);
}

/** Parse the JSON payload returned by https://www.antenna.gr/EPGHandler_.ashx */
export function parseAntennaPayload(payload: unknown): SourceResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Unexpected antenna.gr EPG payload: expected an object keyed by channel');
  }

  const data = payload as Record<string, unknown>;
  const channels: EpgChannel[] = [];
  const programmes = new Map<string, EpgProgramme>();
  const warnings: string[] = [];

  for (const [channelKey, config] of Object.entries(ANTENNA_CHANNELS)) {
    channels.push({ id: config.id, name: config.name, icon: config.logo });

    const events = data[channelKey];
    if (!Array.isArray(events)) {
      warnings.push(`${channelKey}: no programme data in payload`);
      continue;
    }

    for (const event of events) {
      if (!event || typeof event !== 'object') {
        warnings.push(`${channelKey}: skipped a non-object programme entry`);
        continue;
      }

      const entry = event as Record<string, unknown>;
      const eventId = stringValue(entry.eventID) ?? 'unknown';
      const startRaw = stringValue(entry.startDate);
      const stopRaw = stringValue(entry.endDate);

      if (!startRaw || !stopRaw) {
        warnings.push(`${channelKey}/${eventId}: missing start or end time`);
        continue;
      }

      let start: Date;
      let stop: Date;
      try {
        start = parseAntennaDate(startRaw);
        stop = parseAntennaDate(stopRaw);
      } catch (error) {
        warnings.push(`${channelKey}/${eventId}: ${(error as Error).message}`);
        continue;
      }

      if (stop.getTime() <= start.getTime()) {
        // antenna.gr sometimes emits the end date as the same calendar day
        // for programmes that run past midnight (e.g. 23:00 -> 00:30).
        const nextDay = new Date(stop.getTime() + 24 * 60 * 60 * 1000);
        if (nextDay.getTime() > start.getTime()) {
          warnings.push(`${channelKey}/${eventId}: end time precedes start time, assuming it crosses midnight`);
          stop = nextDay;
        } else {
          warnings.push(`${channelKey}/${eventId}: end time is not after start time`);
          continue;
        }
      }

      const title = cleanText(entry.title) ?? UNTITLED;
      const programme: EpgProgramme = {
        channelId: config.id,
        start,
        stop,
        title,
        description: cleanText(entry.synopsis),
        category: cleanText(entry.genre),
        icon: programmeIcon(entry.imageSeries),
      };

      const key = `${programme.channelId}\u0000${programme.start.getTime()}\u0000${programme.title}`;
      const existing = programmes.get(key);
      if (!existing || programme.stop.getTime() > existing.stop.getTime()) {
        programmes.set(key, programme);
      }
    }
  }

  for (const key of Object.keys(data)) {
    if (!(key in ANTENNA_CHANNELS) && Array.isArray(data[key]) && (data[key] as unknown[]).length > 0) {
      warnings.push(`${key}: unknown channel key in payload, ignored`);
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

export interface FetchAntennaOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  attempts?: number;
  retryDelayMs?: number;
}

/** Download and parse the antenna.gr EPG. */
export async function fetchAntenna(options: FetchAntennaOptions = {}): Promise<SourceResult> {
  const url = options.url ?? ANTENNA_EPG_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = Math.max(1, options.attempts ?? 3);
  const retryDelayMs = options.retryDelayMs ?? 1_000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/json',
          referer: ANTENNA_PAGE_URL,
          'user-agent':
            'Mozilla/5.0 (compatible; epg-greece-cyprus/1.0; +https://github.com/tvappshq/epg-greece-cyprus)',
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return parseAntennaPayload(await response.json());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  throw new Error(`Could not fetch antenna.gr EPG from ${url}: ${String(lastError)}`);
}

export const antennaSource: EpgSource = {
  id: 'antenna',
  name: 'antenna.gr',
  fetch: () => fetchAntenna(),
};
