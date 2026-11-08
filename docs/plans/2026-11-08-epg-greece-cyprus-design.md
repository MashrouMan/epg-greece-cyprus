# EPG Greece & Cyprus — design

**Date:** 2026-11-08
**Status:** implemented

## Goal

Generate a daily XMLTV feed (`epg.xml.gz`) for Greek and Cypriot channels,
starting with antenna.gr and designed to grow to additional broadcasters.

## Architecture

- **Source adapters** (`src/sources/`) fetch a broadcaster's EPG and return a
  provider-neutral `SourceResult`: channels, programmes, and warnings.
- **Merge layer** (`src/merge.ts`) combines adapters, keeps the first channel
  definition per id, removes duplicate programmes, and orders programmes by
  channel and start time.
- **XMLTV builder** (`src/xmltv.ts`) escapes text and renders XMLTV timestamps.
- **Time layer** (`src/time.ts`) converts upstream wall-clock times in
  `Europe/Athens` and formats `YYYYMMDDHHmmss ±HHMM` values, handling EET/EEST
  transitions via `Intl`.
- **CLI** (`src/cli.ts`) writes `epg.xml`, `epg.xml.gz`, and
  `channel-list.txt` atomically.

## Source: antenna.gr

`https://www.antenna.gr/tvguide` loads JSON from
`https://www.antenna.gr/EPGHandler_.ashx`. The payload is keyed by internal
channel keys (`ch1`…`ch9`) and contains about seven days of programmes with
title, genre, synopsis, start/end time, and image.

Mapping to stable XMLTV ids:

| Source key | XMLTV id |
| --- | --- |
| `ch1` | `ant1` |
| `ch2` | `makedonia_tv` |
| `ch3` | `ant1_comedy` |
| `ch4` | `ant1_drama` |
| `ch5` | `ant1plus_sports1` |
| `ch6` | `ant1plus_sports2` |
| `ch7` | `ant1plus_sports3` |
| `ch8` | `ant1plus_fight` |
| `ch9` | `ant1plus_padel` |

Normalisation rules:

- Timestamps are UTC. Values without an offset are treated as UTC (matching
  antenna.gr's own tvguide page, which appends `Z`), and explicit offsets are
  honoured.
- Duplicate events (same channel, start, title) keep the longest version.
- Events whose end precedes their start are assumed to cross midnight and get
  a 24-hour correction.
- Empty synopses/genres are omitted; XML is escaped.
- The shared ANT1 placeholder logo is not emitted as a programme icon.

## Source: sportfmtv.gr

`https://www.sportfmtv.gr/el/guide` is a SvelteKit/YinzCam app. The guide is
loaded from an AWS AppSync GraphQL API:

- Public client config: `https://www.sportfmtv.gr/_ott/amplify-config.json`
  provides the endpoint, API key, and `tenantId` (`VENUE_PAO`).
- Query: `listPublicProgramGuide(tenant_id, window_from, window_to,
  channel_id, limit)`.
- The adapter queries each channel separately for a seven-day window, so the
  200-row response limit cannot silently drop channels.

Mapping to stable XMLTV ids:

| Upstream channel | XMLTV id |
| --- | --- |
| SPORT FM TV 1 | `sportfm_tv1` |
| SPORT FM TV 2 | `sportfm_tv2` |
| SPORT FM TV 3 | `sportfm_tv3` |
| SPORT FM TV 4 | `sportfm_tv4` |
| SPORT FM TV 5 | `sportfm_tv5` |
| SPORT FM TV 6 | `sportfm_tv6` |

Timestamps from the API are absolute UTC instants (`broadcast_start`,
`end_time`). Entries without a usable end time get a two-hour fallback. Event
channels only carry rows while something is scheduled, so empty channels are
expected.

## Output and automation

- `epg/epg.xml` — readable XMLTV.
- `epg/epg.xml.gz` — gzip level 9, byte-identical content.
- `epg/channel-list.txt` — one channel id per line.

`.github/workflows/epg.yml` runs daily at 02:17 UTC: install, typecheck, test,
generate, and commit `epg/` when it changed.

## Testing

- Fixture-based antenna.gr parsing, including malformed dates, duplicates,
  midnight crossing, and placeholder icons.
- Fixture-based sportfmtv.gr GraphQL parsing, including unknown channels,
  missing end times, and per-channel request failures.
- EET/EEST conversion and XMLTV timestamp formatting.
- XML escaping, document structure, and gzip round-trip.
- Cross-source merging and ordering.

## Error handling

- HTTP failures retry up to three times with linear backoff.
- Individual malformed programmes are skipped and reported as warnings.
- The CLI fails if no channels or no programmes are produced.
- Files are written to a temporary path and renamed into place.

## Future work

- Add ERT/Ertflix, Cyta, Digea, and other broadcaster adapters.
- Optionally publish a rolling GitHub release asset in addition to commits.
- Normalise channel display names against a shared channel registry.
