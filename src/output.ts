import { gzipSync } from 'node:zlib';

/** Compress an XMLTV document with the maximum gzip level. */
export function gzipXml(xml: string): Buffer {
  return gzipSync(Buffer.from(xml, 'utf8'), { level: 9 });
}
