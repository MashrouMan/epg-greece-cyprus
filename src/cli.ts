import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { selectSources, SOURCES } from './config.js';
import { mergeSourceResults } from './merge.js';
import { gzipXml } from './output.js';
import { buildXmltv } from './xmltv.js';

interface CliOptions {
  outDir: string;
  sourceIds?: string[];
  help: boolean;
}

const USAGE = `epg-greece-cyprus

Generate epg.xml and epg.xml.gz for Greek and Cypriot channels.

Usage:
  npm run epg -- [options]

Options:
  --out <dir>       Output directory (default: epg)
  --source <ids>    Comma-separated source ids (default: all)
  --help            Show this help

Available sources:
${SOURCES.map((source) => `  ${source.id.padEnd(12)} ${source.name}`).join('\n')}
`;

function parseArgs(argv: string[]): CliOptions {
  let outDir = 'epg';
  let sourceIds: string[] | undefined;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      break;
    }
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (argument === '--out') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--out requires a directory');
      }
      outDir = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--out=')) {
      outDir = argument.slice('--out='.length);
      continue;
    }
    if (argument === '--source') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--source requires one or more comma-separated source ids');
      }
      sourceIds = value.split(',').map((id) => id.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (argument.startsWith('--source=')) {
      sourceIds = argument
        .slice('--source='.length)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  return { outDir, sourceIds, help };
}

async function writeFileAtomic(path: string, data: string | Buffer): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, data);
  await rename(temporaryPath, path);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatCoverage(programmes: { start: Date; stop: Date }[]): string {
  if (programmes.length === 0) {
    return 'no programmes';
  }
  const starts = programmes.map((programme) => programme.start.getTime());
  const stops = programmes.map((programme) => programme.stop.getTime());
  return `${new Date(Math.min(...starts)).toISOString()} -> ${new Date(Math.max(...stops)).toISOString()}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const sources = selectSources(options.sourceIds);
  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });

  const results = [];
  for (const source of sources) {
    process.stdout.write(`Fetching ${source.name}...\n`);
    results.push(await source.fetch());
  }

  const merged = mergeSourceResults(results);
  if (merged.channels.length === 0) {
    throw new Error('No channels were produced by the selected sources');
  }
  if (merged.programmes.length === 0) {
    throw new Error('No programmes were produced by the selected sources');
  }

  const xml = buildXmltv(merged.channels, merged.programmes);
  const gzip = gzipXml(xml);
  const channelList = `${merged.channels.map((channel) => channel.id).join('\n')}\n`;

  await writeFileAtomic(join(outDir, 'epg.xml'), xml);
  await writeFileAtomic(join(outDir, 'epg.xml.gz'), gzip);
  await writeFileAtomic(join(outDir, 'channel-list.txt'), channelList);

  process.stdout.write(
    `Parsed ${merged.channels.length} channels and ${merged.programmes.length} programmes.\n`,
  );
  process.stdout.write(`Coverage: ${formatCoverage(merged.programmes)}\n`);
  if (merged.warnings.length > 0) {
    process.stdout.write(`Warnings (${merged.warnings.length}):\n`);
    for (const warning of merged.warnings.slice(0, 20)) {
      process.stdout.write(`  - ${warning}\n`);
    }
    if (merged.warnings.length > 20) {
      process.stdout.write(`  ... and ${merged.warnings.length - 20} more\n`);
    }
  }
  process.stdout.write(`Wrote ${join(outDir, 'epg.xml')} (${formatBytes(Buffer.byteLength(xml))})\n`);
  process.stdout.write(`Wrote ${join(outDir, 'epg.xml.gz')} (${formatBytes(gzip.length)})\n`);
  process.stdout.write(`Wrote ${join(outDir, 'channel-list.txt')} (${merged.channels.length} channels)\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`epg: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
