import type { EpgChannel, EpgProgramme } from './types.js';
import { formatXmltvDate } from './time.js';

export const GENERATOR_NAME = 'epg-greece-cyprus';
export const GENERATOR_URL = 'https://github.com/tvappshq/epg-greece-cyprus';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textElement(tag: string, value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return `    <${tag} lang="el">${escapeXml(trimmed)}</${tag}>`;
}

function channelElement(channel: EpgChannel): string[] {
  const lines = [`  <channel id="${escapeXml(channel.id)}">`];
  lines.push(`    <display-name>${escapeXml(channel.name)}</display-name>`);
  if (channel.icon) {
    lines.push(`    <icon src="${escapeXml(channel.icon)}"/>`);
  }
  lines.push('  </channel>');
  return lines;
}

function programmeElement(programme: EpgProgramme): string[] {
  const start = formatXmltvDate(programme.start);
  const stop = formatXmltvDate(programme.stop);
  const lines = [
    `  <programme start="${start}" stop="${stop}" channel="${escapeXml(programme.channelId)}">`,
  ];

  const title = textElement('title', programme.title);
  if (title) {
    lines.push(title);
  }
  const subTitle = textElement('sub-title', programme.subTitle);
  if (subTitle) {
    lines.push(subTitle);
  }
  const description = textElement('desc', programme.description);
  if (description) {
    lines.push(description);
  }
  const category = textElement('category', programme.category);
  if (category) {
    lines.push(category);
  }
  if (programme.icon) {
    lines.push(`    <icon src="${escapeXml(programme.icon)}"/>`);
  }
  lines.push('  </programme>');
  return lines;
}

export interface XmltvOptions {
  generatorName?: string;
  generatorUrl?: string;
}

/** Build a complete XMLTV document. */
export function buildXmltv(
  channels: EpgChannel[],
  programmes: EpgProgramme[],
  options: XmltvOptions = {},
): string {
  const generatorName = options.generatorName ?? GENERATOR_NAME;
  const generatorUrl = options.generatorUrl ?? GENERATOR_URL;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
    `<tv generator-info-name="${escapeXml(generatorName)}" generator-info-url="${escapeXml(generatorUrl)}">`,
  ];

  const channelIds = new Set(channels.map((channel) => channel.id));
  for (const channel of channels) {
    lines.push(...channelElement(channel));
  }
  for (const programme of programmes) {
    if (!channelIds.has(programme.channelId)) {
      continue;
    }
    lines.push(...programmeElement(programme));
  }
  lines.push('</tv>', '');

  return lines.join('\n');
}
