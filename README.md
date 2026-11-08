<img src="assets/icon.svg" width="64" height="64" alt="">

# epg-greece-cyprus

XMLTV EPG for Greek and Cypriot channels, generated from official broadcaster websites.

## Feeds

The generated files live in [`epg/`](epg/):

```
https://raw.githubusercontent.com/tvappshq/epg-greece-cyprus/main/epg/epg.xml.gz
https://raw.githubusercontent.com/tvappshq/epg-greece-cyprus/main/epg/epg.xml
https://raw.githubusercontent.com/tvappshq/epg-greece-cyprus/main/epg/channel-list.txt
```

A GitHub Action regenerates them every day and commits the result.

## Channels

### antenna.gr

| XMLTV id | Channel | Notes |
| --- | --- | --- |
| `ant1` | ANT1 | Free-to-air |
| `makedonia_tv` | Makedonia TV | Free-to-air |
| `ant1_comedy` | Ant1 Comedy | Free-to-air |
| `ant1_drama` | Ant1 Drama | Free-to-air |
| `ant1plus_sports1` | ANT1+ Sports 1 | Pay TV, informational only |
| `ant1plus_sports2` | ANT1+ Sports 2 | Pay TV, informational only |
| `ant1plus_sports3` | ANT1+ Sports 3 | Pay TV, informational only |
| `ant1plus_fight` | Fight | Pay TV, informational only |
| `ant1plus_padel` | Padel Time | Pay TV, informational only |

Channel ids are stable slugs, so they do not change when antenna.gr changes its
internal channel keys.

## Usage

```bash
npm ci
npm run epg
```

This writes:

```
epg/epg.xml
epg/epg.xml.gz
epg/channel-list.txt
```

Options:

```bash
npm run epg -- --out build/epg          # custom output directory
npm run epg -- --source antenna         # only run selected sources
npm run epg -- --help
```

## Sources

Programmes are parsed from official broadcaster EPG endpoints:

- [antenna.gr](https://www.antenna.gr/tvguide) — ANT1, Makedonia TV, Ant1 Comedy,
  Ant1 Drama, ANT1+ Sports, Fight, Padel Time

More Greek and Cypriot sources will be added over time. Each source is an
adapter in `src/sources/` implementing the `EpgSource` interface and registered
in `src/config.ts`.

## Development

```bash
npm run typecheck
npm test
```

The test suite covers the antenna.gr payload mapping, Athens time-zone
conversion, XML escaping/XMLTV structure, gzip round-tripping, and cross-source
merging.

### Adding a source

1. Create `src/sources/<name>.ts` exporting an `EpgSource`.
2. Map upstream channel keys to stable XMLTV ids.
3. Return `{ channels, programmes, warnings }` from `fetch()`.
4. Register the source in `src/config.ts`.
5. Add a fixture-based test under `tests/`.

## Disclaimer

This project only publishes publicly available programme information. Pay TV
channels and their schedules are included for informational purposes only and
are not intended for viewing without a valid subscription. All programme data
belongs to the respective broadcasters.
