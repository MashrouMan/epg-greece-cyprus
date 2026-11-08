import { antennaSource } from './sources/antenna.js';
import type { EpgSource } from './types.js';

/** All configured EPG sources. Add new adapters here. */
export const SOURCES: readonly EpgSource[] = [antennaSource];

export function selectSources(ids?: string[]): EpgSource[] {
  if (!ids || ids.length === 0) {
    return [...SOURCES];
  }

  const selected: EpgSource[] = [];
  for (const id of ids) {
    const source = SOURCES.find((candidate) => candidate.id === id);
    if (!source) {
      const available = SOURCES.map((candidate) => candidate.id).join(', ');
      throw new Error(`Unknown source "${id}". Available sources: ${available}`);
    }
    if (!selected.includes(source)) {
      selected.push(source);
    }
  }
  return selected;
}
