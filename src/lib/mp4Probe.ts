// DEV-ONLY (VITE_DEV_PREVIEW) — read ISO-BMFF / QuickTime container metadata from a
// video Blob in the browser, without decoding a single frame.
//
// Exists to answer one question (slowmo-diagnosis.md §2): does the File that iOS hands
// <input type=file> still carry Apple's Slo-Mo traces — `com.apple.quicktime.*` keys,
// a `mebx` track, the real frame rate in `stts` — or has the OS stripped/re-rendered
// them on the way? Nothing in the analysis pipeline reads this; it is an inspection aid.
//
// Port of the scratchpad `mp4_probe.py` from the S-slowmo diagnosis (not committed
// then): same boxes, same derived numbers (fps = samples · timescale / Σdelta,
// distinct stts deltas). Only the top-level box headers and `moov` are read — `mdat`
// is skipped by offset, so a multi-hundred-MB clip costs a few kB of reads plus moov.

/** Byte source — a Blob in the browser, anything slice-able in tests. */
export interface ByteSource {
  size: number;
  slice(start: number, end: number): Promise<ArrayBuffer>;
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    slice: (start, end) => blob.slice(start, end).arrayBuffer(),
  };
}

export interface SttsStats {
  sampleCount: number;
  /** Number of stts entries (runs). */
  entries: number;
  /** Distinct sample deltas — 1 means a perfectly even frame rate. */
  distinctDeltas: number;
  minDelta: number;
  medianDelta: number;
  maxDelta: number;
  /** samples · timescale / Σdelta — the track's own average rate. */
  fps: number;
}

export interface EditEntry {
  segmentDuration: number;
  mediaTime: number;
  /** media_rate as a float; anything ≠ 1 would be an explicit playback-rate flag. */
  mediaRate: number;
}

export interface TrackInfo {
  trackId: number;
  handler: string;
  handlerName: string;
  /** First stsd sample-entry fourcc (avc1, hvc1, mebx, mp4a …). */
  codec: string;
  timescale: number;
  duration: number;
  durationSec: number;
  stts: SttsStats | null;
  edits: EditEntry[];
  /** Key names declared by a `mebx` sample entry's `keys` table. */
  mebxKeys: string[];
}

export interface MetaItem {
  key: string;
  /** Where the key was declared: moov/meta, udta/meta, trak#N/meta. */
  where: string;
  value: string | number | null;
}

export interface Mp4Probe {
  fileSize: number;
  majorBrand: string;
  compatibleBrands: string[];
  topLevel: string[];
  movieTimescale: number;
  movieDuration: number;
  movieDurationSec: number;
  tracks: TrackInfo[];
  /** Structured key/value metadata (keys + ilst). */
  meta: MetaItem[];
  /** Every `com.apple.quicktime.*` string found anywhere in moov (raw scan). */
  appleKeysRaw: string[];
}

interface Box {
  type: string;
  /** Payload start/end, relative to the DataView. */
  start: number;
  end: number;
}

const fourcc = (v: DataView, o: number) =>
  String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

function u64(v: DataView, o: number): number {
  return v.getUint32(o) * 2 ** 32 + v.getUint32(o + 4);
}

function* children(v: DataView, start: number, end: number): Generator<Box> {
  let o = start;
  while (o + 8 <= end) {
    let size = v.getUint32(o);
    const type = fourcc(v, o + 4);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) return;
      size = u64(v, o + 8);
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header || o + size > end) return; // truncated / not a box list
    yield { type, start: o + header, end: o + size };
    o += size;
  }
}

function child(v: DataView, b: Box, type: string): Box | undefined {
  for (const c of children(v, b.start, b.end)) if (c.type === type) return c;
  return undefined;
}

/** mvhd / mdhd share the layout: version, flags, times, timescale, duration. */
function readHeader(v: DataView, b: Box): { timescale: number; duration: number } {
  const version = v.getUint8(b.start);
  return version === 1
    ? { timescale: v.getUint32(b.start + 20), duration: u64(v, b.start + 24) }
    : { timescale: v.getUint32(b.start + 12), duration: v.getUint32(b.start + 16) };
}

function readStts(v: DataView, b: Box, timescale: number): SttsStats | null {
  const n = v.getUint32(b.start + 4);
  const runs: [number, number][] = [];
  let samples = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const o = b.start + 8 + i * 8;
    if (o + 8 > b.end) break;
    const count = v.getUint32(o);
    const delta = v.getUint32(o + 4);
    runs.push([count, delta]);
    samples += count;
    total += count * delta;
  }
  if (samples === 0) return null;
  const sorted = [...runs].sort((a, c) => a[1] - c[1]);
  // Median weighted by sample count, not by run.
  let acc = 0;
  let median = sorted[0][1];
  for (const [count, delta] of sorted) {
    acc += count;
    if (acc >= samples / 2) {
      median = delta;
      break;
    }
  }
  return {
    sampleCount: samples,
    entries: runs.length,
    distinctDeltas: new Set(runs.map((r) => r[1])).size,
    minDelta: sorted[0][1],
    medianDelta: median,
    maxDelta: sorted[sorted.length - 1][1],
    fps: total ? (samples * timescale) / total : 0,
  };
}

function readElst(v: DataView, b: Box): EditEntry[] {
  const version = v.getUint8(b.start);
  const n = v.getUint32(b.start + 4);
  const out: EditEntry[] = [];
  let o = b.start + 8;
  for (let i = 0; i < n; i++) {
    if (version === 1) {
      if (o + 20 > b.end) break;
      out.push({
        segmentDuration: u64(v, o),
        mediaTime: Number(v.getBigInt64(o + 8)),
        mediaRate: v.getInt16(o + 16) + v.getUint16(o + 18) / 65536,
      });
      o += 20;
    } else {
      if (o + 12 > b.end) break;
      out.push({
        segmentDuration: v.getUint32(o),
        mediaTime: v.getInt32(o + 4),
        mediaRate: v.getInt16(o + 8) + v.getUint16(o + 10) / 65536,
      });
      o += 12;
    }
  }
  return out;
}

const utf8 = new TextDecoder();
const text = (v: DataView, start: number, end: number) =>
  utf8.decode(new Uint8Array(v.buffer, v.byteOffset + start, Math.max(0, end - start)));

/** First stsd entry: codec fourcc + (for mebx) the declared key names. */
function readStsd(v: DataView, b: Box): { codec: string; mebxKeys: string[] } {
  // fullbox(4) + entry_count(4), then sample-entry boxes.
  const entries = [...children(v, b.start + 8, b.end)];
  if (entries.length === 0) return { codec: '', mebxKeys: [] };
  const first = entries[0];
  const mebxKeys: string[] = [];
  for (const e of entries) {
    if (e.type !== 'mebx') continue;
    // SampleEntry header: 6 reserved + 2 data_reference_index.
    const keys = [...children(v, e.start + 8, e.end)].find((c) => c.type === 'keys');
    if (!keys) continue;
    // Each entry is a box named by its local key id, holding a `keyd`
    // (namespace fourcc + key value).
    for (const k of children(v, keys.start, keys.end)) {
      const keyd = child(v, k, 'keyd');
      if (keyd && keyd.end - keyd.start > 4) mebxKeys.push(text(v, keyd.start + 4, keyd.end));
    }
  }
  return { codec: first.type, mebxKeys };
}

function readDataValue(v: DataView, d: Box): string | number | null {
  const type = v.getUint32(d.start) & 0xffffff;
  const p = d.start + 8; // type(4) + locale(4)
  const len = d.end - p;
  switch (type) {
    case 1: // UTF-8
      return text(v, p, d.end);
    case 21: // signed BE int
      return len === 1 ? v.getInt8(p) : len === 2 ? v.getInt16(p) : len === 4 ? v.getInt32(p) : len === 8 ? Number(v.getBigInt64(p)) : null;
    case 22: // unsigned BE int
      return len === 1 ? v.getUint8(p) : len === 2 ? v.getUint16(p) : len === 4 ? v.getUint32(p) : len === 8 ? u64(v, p) : null;
    case 23:
      return len === 4 ? v.getFloat32(p) : null;
    case 24:
      return len === 8 ? v.getFloat64(p) : null;
    default:
      return `[type ${type}, ${len} B]`;
  }
}

/** QuickTime `meta` (keys + ilst). Apple writes it without the fullbox header,
 *  ISO with — detect by whether the first 4 payload bytes look like a box size. */
function readMeta(v: DataView, b: Box, where: string, out: MetaItem[]) {
  let start = b.start;
  if (b.end - b.start >= 12 && v.getUint32(b.start) === 0) start += 4;
  const kids = [...children(v, start, b.end)];
  const keysBox = kids.find((c) => c.type === 'keys');
  const ilst = kids.find((c) => c.type === 'ilst');
  const names: string[] = [];
  if (keysBox) {
    const n = v.getUint32(keysBox.start + 4);
    let o = keysBox.start + 8;
    for (let i = 0; i < n && o + 8 <= keysBox.end; i++) {
      const size = v.getUint32(o);
      if (size < 8) break;
      names.push(text(v, o + 8, Math.min(o + size, keysBox.end)));
      o += size;
    }
  }
  const valued = new Set<number>();
  if (ilst) {
    for (const item of children(v, ilst.start, ilst.end)) {
      // Item boxes are named by their 1-based key index (as a u32, not ASCII).
      const idx = v.getUint32(item.start - 4);
      const data = child(v, item, 'data');
      const key = names[idx - 1] ?? item.type;
      valued.add(idx);
      out.push({ key, where, value: data ? readDataValue(v, data) : null });
    }
  }
  names.forEach((key, i) => {
    if (!valued.has(i + 1)) out.push({ key, where, value: null });
  });
}

function scanAppleKeys(bytes: Uint8Array): string[] {
  const found = new Set<string>();
  const needle = 'com.apple.quicktime.';
  const first = needle.charCodeAt(0);
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    let e = i + needle.length;
    while (e < bytes.length && /[A-Za-z0-9.\-_]/.test(String.fromCharCode(bytes[e]))) e++;
    found.add(String.fromCharCode(...bytes.subarray(i, e)));
    i = e - 1;
  }
  return [...found].sort();
}

export async function probeMp4(src: ByteSource): Promise<Mp4Probe> {
  const result: Mp4Probe = {
    fileSize: src.size,
    majorBrand: '',
    compatibleBrands: [],
    topLevel: [],
    movieTimescale: 0,
    movieDuration: 0,
    movieDurationSec: 0,
    tracks: [],
    meta: [],
    appleKeysRaw: [],
  };

  // Walk top-level box headers by offset; only ftyp and moov are read in full.
  let moov: DataView | null = null;
  let o = 0;
  while (o + 8 <= src.size) {
    const h = new DataView(await src.slice(o, Math.min(o + 16, src.size)));
    let size = h.getUint32(0);
    const type = fourcc(h, 4);
    let header = 8;
    if (size === 1 && h.byteLength >= 16) {
      size = u64(h, 8);
      header = 16;
    } else if (size === 0) {
      size = src.size - o;
    }
    if (size < header) break;
    result.topLevel.push(type);
    if (type === 'ftyp') {
      const f = new DataView(await src.slice(o + header, Math.min(o + size, src.size)));
      result.majorBrand = fourcc(f, 0);
      for (let i = 8; i + 4 <= f.byteLength; i += 4) result.compatibleBrands.push(fourcc(f, i));
    } else if (type === 'moov' && !moov) {
      moov = new DataView(await src.slice(o + header, Math.min(o + size, src.size)));
    }
    o += size;
  }
  if (!moov) return result;

  const v = moov;
  result.appleKeysRaw = scanAppleKeys(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));

  for (const b of children(v, 0, v.byteLength)) {
    if (b.type === 'mvhd') {
      const { timescale, duration } = readHeader(v, b);
      result.movieTimescale = timescale;
      result.movieDuration = duration;
      result.movieDurationSec = timescale ? duration / timescale : 0;
    } else if (b.type === 'meta') {
      readMeta(v, b, 'moov/meta', result.meta);
    } else if (b.type === 'udta') {
      const m = child(v, b, 'meta');
      if (m) readMeta(v, m, 'udta/meta', result.meta);
    } else if (b.type === 'trak') {
      const t: TrackInfo = {
        trackId: 0,
        handler: '',
        handlerName: '',
        codec: '',
        timescale: 0,
        duration: 0,
        durationSec: 0,
        stts: null,
        edits: [],
        mebxKeys: [],
      };
      const tkhd = child(v, b, 'tkhd');
      if (tkhd) t.trackId = v.getUint32(tkhd.start + (v.getUint8(tkhd.start) === 1 ? 20 : 12));
      const elst = child(v, b, 'edts') && child(v, child(v, b, 'edts')!, 'elst');
      if (elst) t.edits = readElst(v, elst);
      const tmeta = child(v, b, 'meta');
      if (tmeta) readMeta(v, tmeta, `trak#${t.trackId}/meta`, result.meta);
      const mdia = child(v, b, 'mdia');
      if (mdia) {
        const mdhd = child(v, mdia, 'mdhd');
        if (mdhd) {
          Object.assign(t, readHeader(v, mdhd));
          t.durationSec = t.timescale ? t.duration / t.timescale : 0;
        }
        const hdlr = child(v, mdia, 'hdlr');
        if (hdlr) {
          t.handler = fourcc(v, hdlr.start + 8);
          // QuickTime writes a Pascal string (length byte first), ISO a C string.
          let name = text(v, hdlr.start + 24, hdlr.end);
          if (name.length > 0 && name.charCodeAt(0) < 32) name = name.slice(1);
          t.handlerName = name.split('\0')[0];
        }
        const stbl = child(v, mdia, 'minf') && child(v, child(v, mdia, 'minf')!, 'stbl');
        if (stbl) {
          const stsd = child(v, stbl, 'stsd');
          if (stsd) Object.assign(t, readStsd(v, stsd));
          const stts = child(v, stbl, 'stts');
          if (stts) t.stts = readStts(v, stts, t.timescale);
        }
      }
      result.tracks.push(t);
    }
  }
  return result;
}
