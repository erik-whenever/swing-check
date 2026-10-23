// Unit tests for the minimal ZIP writer (zip.ts).
//
// A hand-rolled archive format is worth exactly as much as the guarantee that a real
// unzip can read it, so these assert the BYTES against the spec (APPNOTE 4.3.7) rather
// than round-tripping through the same code that wrote them: signatures, the CRC-32
// against a published vector, the central directory's count and offset.

import { describe, it, expect } from 'vitest';
import { base64ToBytes, buildZip, crc32 } from './zip';

const enc = new TextEncoder();

async function bytesOf(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

describe('crc32', () => {
  it('matches the published vector for "123456789"', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('buildZip', () => {
  it('writes a local file header, the stored bytes and an end record', async () => {
    const data = enc.encode('hello');
    const view = await bytesOf(buildZip([{ path: 'frames/a.jpg', data }]));

    expect(view.getUint32(0, true)).toBe(0x04034b50); // local file header
    expect(view.getUint16(8, true)).toBe(0); // method 0 = stored
    expect(view.getUint32(14, true)).toBe(crc32(data));
    expect(view.getUint32(18, true)).toBe(data.length); // compressed size
    expect(view.getUint32(22, true)).toBe(data.length); // uncompressed size
    expect(view.getUint16(26, true)).toBe('frames/a.jpg'.length);

    // End of central directory: last 22 bytes, one entry, and an offset that lands
    // on the central directory signature.
    const eocd = view.byteLength - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(1); // total entries
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(view.getUint32(eocd + 12, true)).toBe(eocd - cdOffset); // central dir size
  });

  it('records every entry and points each central header at its local header', async () => {
    const entries = [
      { path: 'manifest.json', data: enc.encode('{}') },
      { path: 'frames/a.jpg', data: enc.encode('aaaa') },
      { path: 'frames/b.jpg', data: enc.encode('bb') },
    ];
    const view = await bytesOf(buildZip(entries));

    const eocd = view.byteLength - 22;
    expect(view.getUint16(eocd + 8, true)).toBe(entries.length);
    expect(view.getUint16(eocd + 10, true)).toBe(entries.length);

    let cursor = view.getUint32(eocd + 16, true);
    for (const entry of entries) {
      expect(view.getUint32(cursor, true)).toBe(0x02014b50);
      const nameLen = view.getUint16(cursor + 28, true);
      expect(nameLen).toBe(entry.path.length);
      // The recorded local-header offset must actually hold a local header.
      const local = view.getUint32(cursor + 42, true);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      expect(view.getUint32(local + 14, true)).toBe(crc32(entry.data));
      cursor += 46 + nameLen;
    }
    expect(cursor).toBe(eocd);
  });

  it('writes an empty but valid archive for no entries', async () => {
    const view = await bytesOf(buildZip([]));
    expect(view.byteLength).toBe(22);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
    expect(view.getUint16(10, true)).toBe(0);
  });

  it('clamps pre-1980 dates instead of wrapping the DOS year field', async () => {
    const view = await bytesOf(buildZip([{ path: 'a', data: enc.encode('x') }], new Date(1970, 0, 1)));
    expect(view.getUint16(12, true) >> 9).toBe(0); // year 1980
  });
});

describe('base64ToBytes', () => {
  it('round-trips the base64 the frame grabber returns', () => {
    expect(Array.from(base64ToBytes('aGVsbG8='))).toEqual(Array.from(enc.encode('hello')));
  });
});
