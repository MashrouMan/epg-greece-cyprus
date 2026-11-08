import { describe, expect, it } from 'vitest';
import { mergeSourceResults } from '../src/merge.js';
import type { EpgProgramme, SourceResult } from '../src/types.js';

function programme(channelId: string, isoStart: string, title: string): EpgProgramme {
  return {
    channelId,
    start: new Date(isoStart),
    stop: new Date(new Date(isoStart).getTime() + 60 * 60 * 1000),
    title,
  };
}

describe('mergeSourceResults', () => {
  it('keeps the first channel definition and removes duplicate programmes', () => {
    const first: SourceResult = {
      channels: [{ id: 'ant1', name: 'ANT1', icon: 'https://example.com/one.png' }],
      programmes: [programme('ant1', '2026-11-08T01:00:00Z', 'Show')],
      warnings: ['first warning'],
    };
    const second: SourceResult = {
      channels: [{ id: 'ant1', name: 'Duplicate ANT1' }],
      programmes: [
        programme('ant1', '2026-11-08T01:00:00Z', 'Show'),
        programme('ant1', '2026-11-08T02:00:00Z', 'Later show'),
      ],
      warnings: ['second warning'],
    };

    const merged = mergeSourceResults([first, second]);

    expect(merged.channels).toEqual([
      { id: 'ant1', name: 'ANT1', icon: 'https://example.com/one.png' },
    ]);
    expect(merged.programmes.map((entry) => entry.title)).toEqual(['Show', 'Later show']);
    expect(merged.warnings).toEqual(['first warning', 'second warning']);
  });

  it('sorts programmes by channel order and then start time', () => {
    const result = mergeSourceResults([
      {
        channels: [
          { id: 'second', name: 'Second' },
          { id: 'first', name: 'First' },
        ],
        programmes: [
          programme('first', '2026-11-08T03:00:00Z', 'First late'),
          programme('second', '2026-11-08T01:00:00Z', 'Second early'),
          programme('first', '2026-11-08T02:00:00Z', 'First early'),
        ],
        warnings: [],
      },
    ]);

    expect(result.programmes.map((entry) => entry.title)).toEqual([
      'Second early',
      'First early',
      'First late',
    ]);
  });
});
