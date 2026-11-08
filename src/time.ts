const ATHENS = 'Europe/Athens';

const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function partsToNumbers(parts: Intl.DateTimeFormatPart[]): Record<string, number> {
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }
  return values;
}

/**
 * Offset of `timeZone` from UTC at `instant`, in minutes east of UTC.
 * For Europe/Athens this is +120 in winter and +180 in summer.
 */
export function timeZoneOffsetMinutes(instant: Date, timeZone = ATHENS): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const values = partsToNumbers(formatter.formatToParts(instant));
  const hour = values.hour === 24 ? 0 : (values.hour ?? 0);
  const asUtc = Date.UTC(
    values.year ?? 1970,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    hour,
    values.minute ?? 0,
    values.second ?? 0,
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Parse a timestamp from an upstream EPG.
 *
 * Timestamps without an explicit offset are treated as wall-clock times in
 * Europe/Athens. Timestamps with an offset or `Z` are parsed as absolute
 * instants. Callers whose upstream returns naïve UTC timestamps must append
 * `Z` before calling this function.
 */
export function parseAthensDate(raw: string): Date {
  const match = DATE_PATTERN.exec(raw.trim());
  if (!match) {
    throw new Error(`Unsupported date: ${raw}`);
  }

  const [, year, month, day, hour, minute, second, zone] = match;
  if (zone) {
    const normalizedZone = zone === 'Z' ? 'Z' : zone.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second ?? '00'}${normalizedZone}`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Unsupported date: ${raw}`);
    }
    return parsed;
  }

  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
  );

  // Resolve the offset twice so dates near a DST transition settle on the
  // offset that actually applies at the resulting instant.
  const firstOffset = timeZoneOffsetMinutes(new Date(utcGuess));
  const secondOffset = timeZoneOffsetMinutes(new Date(utcGuess - firstOffset * 60_000));
  return new Date(utcGuess - secondOffset * 60_000);
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Format an instant as an XMLTV timestamp in Europe/Athens. */
export function formatXmltvDate(instant: Date): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ATHENS,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const values = partsToNumbers(formatter.formatToParts(instant));
  const hour = values.hour === 24 ? 0 : (values.hour ?? 0);
  const offset = timeZoneOffsetMinutes(instant);
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);

  const date = `${values.year ?? 1970}${pad(values.month ?? 1)}${pad(values.day ?? 1)}`;
  const time = `${pad(hour)}${pad(values.minute ?? 0)}${pad(values.second ?? 0)}`;

  return `${date}${time} ${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`;
}
