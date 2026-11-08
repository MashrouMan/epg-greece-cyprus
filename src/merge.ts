import type { EpgChannel, EpgProgramme, SourceResult } from './types.js';

/** Merge several source results, keeping the first channel definition per id. */
export function mergeSourceResults(results: SourceResult[]): SourceResult {
  const channels: EpgChannel[] = [];
  const channelIds = new Set<string>();
  const programmes: EpgProgramme[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  for (const result of results) {
    warnings.push(...result.warnings);

    for (const channel of result.channels) {
      if (!channelIds.has(channel.id)) {
        channelIds.add(channel.id);
        channels.push(channel);
      }
    }

    for (const programme of result.programmes) {
      const key = `${programme.channelId}\u0000${programme.start.getTime()}\u0000${programme.title}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      programmes.push(programme);
    }
  }

  const channelOrder = new Map(channels.map((channel, index) => [channel.id, index]));
  programmes.sort((left, right) => {
    const leftOrder = channelOrder.get(left.channelId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = channelOrder.get(right.channelId) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.start.getTime() - right.start.getTime();
  });

  return { channels, programmes, warnings };
}
