// DEV-ONLY — minimal ZIP writer (store method, no compression).
//
// WHY NOT A LIBRARY. The payload is JPEG plus a small JSON file. JPEG is already
// entropy-coded, so deflating it buys ~0–2 % and costs a dependency, a worker, and a
// second implementation of the archive format in the bundle. Without compression a ZIP
// is a header, the bytes, a central directory and an end record — about 120 lines,
// with CRC-32 the only real algorithm. That is the whole reason no zip dependency was
// added: there is nothing left for one to do.
//
// SCOPE, honestly stated: store method only, no ZIP64, no encryption, no streaming.
// The archive is built in memory, so it is bounded by what the tab can hold, and
// anything over 4 GiB is REFUSED rather than written as a corrupt ZIP64-less archive
// (`buildZip` throws). For a hand-annotation dataset — a few hundred frames at a time —
// neither limit is close.
//
// Reference: PKWARE APPNOTE 4.3.7 (local file header 0x04034b50, central directory
// 0x02014b50, end of central directory 0x06054b50).

/** One file in the archive. `path` uses forward slashes, as the format requires. */
export interface ZipEntry {
  path: string;
  data: Bytes;
}

/**
 * Byte buffer backed by a plain ArrayBuffer. Bare `Uint8Array` widens to
 * `ArrayBufferLike` — possibly a SharedArrayBuffer — which `Blob` does not accept.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Above this the format needs ZIP64 fields this writer does not emit. */
const ZIP64_LIMIT = 0xffffffff;

/** General purpose bit 11 — file names and comments are UTF-8. */
const FLAG_UTF8 = 0x0800;
/** Compression method 0 = stored. */
const METHOD_STORE = 0;
/** "MS-DOS / OS-2", the value every writer uses for the low byte of version-made-by. */
const VERSION_MADE_BY = 0x0314;
/** 2.0 — the minimum a reader needs for anything this writes. */
const VERSION_NEEDED = 20;

export function buildZip(entries: ZipEntry[], date: Date = new Date()): Blob {
  const { time: dosTime, date: dosDate } = toDosDateTime(date);
  const encoder = new TextEncoder();

  const parts: Bytes[] = [];
  const central: Bytes[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    if (offset > ZIP64_LIMIT || size > ZIP64_LIMIT) {
      throw new Error('Archive exceeds 4 GiB — ZIP64 is not implemented; export fewer clips');
    }

    const local = new Writer(30 + name.length);
    local.u32(0x04034b50);
    local.u16(VERSION_NEEDED);
    local.u16(FLAG_UTF8);
    local.u16(METHOD_STORE);
    local.u16(dosTime);
    local.u16(dosDate);
    local.u32(crc);
    local.u32(size); // compressed
    local.u32(size); // uncompressed — identical, the data is stored
    local.u16(name.length);
    local.u16(0); // extra field length
    local.bytes(name);

    const header = new Writer(46 + name.length);
    header.u32(0x02014b50);
    header.u16(VERSION_MADE_BY);
    header.u16(VERSION_NEEDED);
    header.u16(FLAG_UTF8);
    header.u16(METHOD_STORE);
    header.u16(dosTime);
    header.u16(dosDate);
    header.u32(crc);
    header.u32(size);
    header.u32(size);
    header.u16(name.length);
    header.u16(0); // extra field length
    header.u16(0); // file comment length
    header.u16(0); // disk number start
    header.u16(0); // internal attributes
    header.u32(0); // external attributes
    header.u32(offset); // offset of the local header
    header.bytes(name);

    parts.push(local.done(), entry.data);
    central.push(header.done());
    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new Writer(22);
  end.u32(0x06054b50);
  end.u16(0); // this disk
  end.u16(0); // disk with the central directory
  end.u16(entries.length);
  end.u16(entries.length);
  end.u32(centralSize);
  end.u32(offset); // central directory offset
  end.u16(0); // comment length

  return new Blob([...parts, ...central, end.done()], { type: 'application/zip' });
}

/** Little-endian byte writer over a fixed-size buffer. */
class Writer {
  private view: DataView;
  private buf: Bytes;
  private pos = 0;

  constructor(size: number) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.buf.length;
  }

  u16(v: number): void {
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
  }

  u32(v: number): void {
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
  }

  bytes(v: Bytes): void {
    this.buf.set(v, this.pos);
    this.pos += v.length;
  }

  done(): Bytes {
    return this.buf;
  }
}

/**
 * MS-DOS date/time (APPNOTE 4.4.6). Two-second resolution, epoch 1980 — dates before
 * that cannot be represented, so they clamp rather than wrap into a nonsense year.
 */
function toDosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  table = t;
  return t;
}

/** CRC-32 (IEEE 802.3, reflected), the checksum the ZIP format specifies. */
export function crc32(data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Decode a base64 payload (what `grabFramesAtTimes` returns) into archive bytes. */
export function base64ToBytes(b64: string): Bytes {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
