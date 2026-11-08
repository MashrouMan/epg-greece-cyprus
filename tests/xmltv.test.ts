import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { gzipXml } from '../src/output.js';
import type { EpgChannel, EpgProgramme } from '../src/types.js';
import { buildXmltv, escapeXml } from '../src/xmltv.js';

const channels: EpgChannel[] = [
  { id: 'ant1', name: 'ANT1', icon: 'https://example.com/ant1.png' },
  { id: 'ant1plus_padel', name: 'Padel Time' },
];

const programmes: EpgProgramme[] = [
  {
    channelId: 'ant1',
    start: new Date('2026-11-08T01:00:00Z'),
    stop: new Date('2026-11-08T02:00:00Z'),
    title: 'Πρωινό & Νέα',
    subTitle: 'Επεισόδιο 4',
    description: 'Περιγραφή <δοκιμή>',
    category: 'ΕΙΔΗΣΕΙΣ',
    icon: 'https://example.com/programme.jpg',
  },
  {
    channelId: 'ant1plus_padel',
    start: new Date('2026-11-08T02:00:00Z'),
    stop: new Date('2026-11-08T03:00:00Z'),
    title: 'Padel',
  },
];

describe('escapeXml', () => {
  it('escapes all XML special characters', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f',
    );
  });
});

describe('buildXmltv', () => {
  const xml = buildXmltv(channels, programmes, {
    generatorName: 'test-generator',
    generatorUrl: 'https://example.com',
  });

  it('writes a valid XMLTV header', () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<!DOCTYPE tv SYSTEM "xmltv.dtd">');
    expect(xml).toContain(
      '<tv generator-info-name="test-generator" generator-info-url="https://example.com">',
    );
    expect(xml.endsWith('</tv>\n')).toBe(true);
  });

  it('writes channels with display names and icons', () => {
    expect(xml).toContain('  <channel id="ant1">');
    expect(xml).toContain('    <display-name>ANT1</display-name>');
    expect(xml).toContain('    <icon src="https://example.com/ant1.png"/>');
    expect(xml).toContain('  <channel id="ant1plus_padel">');
  });

  it('writes programmes with Athens timestamps and escaped metadata', () => {
    expect(xml).toContain(
      '  <programme start="20261108030000 +0200" stop="20261108040000 +0200" channel="ant1">',
    );
    expect(xml).toContain('    <title lang="el">Πρωινό &amp; Νέα</title>');
    expect(xml).toContain('    <sub-title lang="el">Επεισόδιο 4</sub-title>');
    expect(xml).toContain('    <desc lang="el">Περιγραφή &lt;δοκιμή&gt;</desc>');
    expect(xml).toContain('    <category lang="el">ΕΙΔΗΣΕΙΣ</category>');
    expect(xml).toContain('    <icon src="https://example.com/programme.jpg"/>');
  });

  it('skips programmes whose channel is not declared', () => {
    const orphan: EpgProgramme = {
      channelId: 'missing',
      start: new Date('2026-11-08T01:00:00Z'),
      stop: new Date('2026-11-08T02:00:00Z'),
      title: 'Should not appear',
    };
    const output = buildXmltv(channels, [...programmes, orphan]);
    expect(output).not.toContain('Should not appear');
  });
});

describe('gzipXml', () => {
  it('round-trips the XML document', () => {
    const xml = buildXmltv(channels, programmes);
    expect(gunzipSync(gzipXml(xml)).toString('utf8')).toBe(xml);
  });
});
