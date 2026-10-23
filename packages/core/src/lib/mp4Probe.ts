// Read ISO-BMFF / QuickTime container metadata from a video Blob in the browser,
// without decoding a single frame. No dependencies, no dev-only imports.
//
// Two users. PRODUCTION (S-44): `readTimeStretch` decides whether an uploaded clip is an
// iOS Slo-Mo render whose timeline is stretched, so the segmenter can widen its upper
// time limits. DEV (S-42/S-43): the Container metadata panel shows everything, including
// decoded `mebx` samples (opt-in via `decodeMebx` — thousands of small reads).
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

// OSÄKER: `Blob.arrayBuffer()` och `TextDecoder` (nedan) saknas eller är ofullständiga i
// React Native/Hermes. Parsern läser via `ByteSource` och är ren; i appen behövs en
// filbaserad ByteSource och troligen en TextDecoder-polyfill. Ej verifierat på enhet.
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
  /** The same table with local ids and declared value types (`dtyp`). */
  mebxKeyTable: MebxKey[];
  /** Decoded timed-metadata samples (mebx tracks only), capped at MEBX_SAMPLE_LIMIT. */
  mebxSamples: MebxSample[];
  /** True when the track holds more samples than were decoded. */
  mebxTruncated: boolean;
}

export interface MebxKey {
  localId: number;
  key: string;
  /** QuickTime well-known type (namespace 0), or null if undeclared/non-standard. */
  dataType: number | null;
}

export interface MebxSample {
  /** Presentation start / duration in the track's own timeline, seconds. */
  timeSec: number;
  durSec: number;
  items: { key: string; value: MebxValue }[];
}

export type MebxValue = string | number | number[] | null;

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

/** First stsd entry: codec fourcc + (for mebx) the declared key table. */
function readStsd(
  v: DataView,
  b: Box,
): { codec: string; mebxKeys: string[]; mebxKeyTable: MebxKey[] } {
  // fullbox(4) + entry_count(4), then sample-entry boxes.
  const entries = [...children(v, b.start + 8, b.end)];
  if (entries.length === 0) return { codec: '', mebxKeys: [], mebxKeyTable: [] };
  const first = entries[0];
  const table: MebxKey[] = [];
  for (const e of entries) {
    if (e.type !== 'mebx') continue;
    // SampleEntry header: 6 reserved + 2 data_reference_index.
    const keys = [...children(v, e.start + 8, e.end)].find((c) => c.type === 'keys');
    if (!keys) continue;
    // Each entry is a box named by its local key id (u32), holding a `keyd`
    // (namespace fourcc + key value) and optionally a `dtyp` (namespace + type).
    for (const k of children(v, keys.start, keys.end)) {
      const keyd = child(v, k, 'keyd');
      if (!keyd || keyd.end - keyd.start <= 4) continue;
      const dtyp = child(v, k, 'dtyp');
      table.push({
        localId: v.getUint32(k.start - 4),
        key: text(v, keyd.start + 4, keyd.end),
        dataType:
          dtyp && dtyp.end - dtyp.start >= 8 && v.getUint32(dtyp.start) === 0
            ? v.getUint32(dtyp.start + 4)
            : null,
      });
    }
  }
  return { codec: first.type, mebxKeys: table.map((k) => k.key), mebxKeyTable: table };
}

/** Byte offset + size of every sample, from stsz/stsc/stco|co64. */
function readSampleTable(v: DataView, stbl: Box): { offset: number; size: number }[] {
  const stsz = child(v, stbl, 'stsz');
  const stsc = child(v, stbl, 'stsc');
  const stco = child(v, stbl, 'stco');
  const co64 = child(v, stbl, 'co64');
  if (!stsz || !stsc || (!stco && !co64)) return [];
  const fixed = v.getUint32(stsz.start + 4);
  const count = v.getUint32(stsz.start + 8);
  const sizes = Array.from({ length: count }, (_, i) =>
    fixed !== 0 ? fixed : v.getUint32(stsz.start + 12 + i * 4),
  );
  const chunks: number[] = [];
  if (stco) {
    const n = v.getUint32(stco.start + 4);
    for (let i = 0; i < n; i++) chunks.push(v.getUint32(stco.start + 8 + i * 4));
  } else if (co64) {
    const n = v.getUint32(co64.start + 4);
    for (let i = 0; i < n; i++) chunks.push(u64(v, co64.start + 8 + i * 8));
  }
  const runs: [number, number][] = []; // first_chunk (1-based), samples_per_chunk
  const n = v.getUint32(stsc.start + 4);
  for (let i = 0; i < n; i++) {
    const o = stsc.start + 8 + i * 12;
    runs.push([v.getUint32(o), v.getUint32(o + 4)]);
  }
  const out: { offset: number; size: number }[] = [];
  for (let r = 0; r < runs.length; r++) {
    const last = r + 1 < runs.length ? runs[r + 1][0] - 1 : chunks.length;
    for (let c = runs[r][0]; c <= last; c++) {
      let off = chunks[c - 1];
      for (let k = 0; k < runs[r][1] && out.length < count; k++) {
        const size = sizes[out.length];
        out.push({ offset: off, size });
        off += size;
      }
    }
  }
  return out;
}

/** Expanded stts: start time and duration (timescale units) of every sample. */
function sampleTimes(v: DataView, stts: Box): { t: number; d: number }[] {
  const out: { t: number; d: number }[] = [];
  const n = v.getUint32(stts.start + 4);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const count = v.getUint32(stts.start + 8 + i * 8);
    const delta = v.getUint32(stts.start + 12 + i * 8);
    for (let k = 0; k < count; k++, t += delta) out.push({ t, d: delta });
  }
  return out;
}

const hex = (v: DataView, p: number, len: number) => {
  const bytes = new Uint8Array(v.buffer, v.byteOffset + p, Math.min(len, 24));
  const h = [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `0x${h}${len > 24 ? '…' : ''} (${len} B)`;
};

function intValue(v: DataView, p: number, len: number, signed: boolean): number | null {
  if (len === 1) return signed ? v.getInt8(p) : v.getUint8(p);
  if (len === 2) return signed ? v.getInt16(p) : v.getUint16(p);
  if (len === 4) return signed ? v.getInt32(p) : v.getUint32(p);
  if (len === 8) return signed ? Number(v.getBigInt64(p)) : u64(v, p);
  return null;
}

/** One mebx value by its QuickTime well-known type; unknown types come back as hex. */
function readTypedValue(v: DataView, p: number, len: number, type: number | null): MebxValue {
  const floats = (n: number, w: 4 | 8) =>
    len >= n * w
      ? Array.from({ length: n }, (_, i) => (w === 4 ? v.getFloat32(p + i * 4) : v.getFloat64(p + i * 8)))
      : null;
  switch (type) {
    case 1:
      return text(v, p, p + len);
    case 23:
      return len === 4 ? v.getFloat32(p) : null;
    case 24:
      return len === 8 ? v.getFloat64(p) : null;
    case 21:
    case 65:
    case 66:
    case 67:
    case 74:
      return intValue(v, p, len, true);
    case 22:
    case 75:
    case 76:
    case 77:
    case 78:
      return intValue(v, p, len, false);
    case 70: // PointF32
    case 71: // DimensionsF32
      return floats(2, 4);
    case 72: // RectF32
      return floats(4, 4);
    case 79: // AffineTransformF64
      return floats(9, 8);
    default: {
      // Undeclared types: printable ASCII (e.g. segment-identifier's UUID) as text.
      const bytes = new Uint8Array(v.buffer, v.byteOffset + p, len);
      if (len > 0 && len <= 256 && bytes.every((b) => b >= 0x20 && b < 0x7f)) return text(v, p, p + len);
      return hex(v, p, len);
    }
  }
}

/** Cap per track — the 120 Hz telemetry tracks run to thousands of samples. */
export const MEBX_SAMPLE_LIMIT = 4000;

async function readMebxSamples(src: ByteSource, v: DataView, stbl: Box, t: TrackInfo) {
  const stts = child(v, stbl, 'stts');
  if (!stts) return;
  const table = readSampleTable(v, stbl);
  const times = sampleTimes(v, stts);
  const byId = new Map(t.mebxKeyTable.map((k) => [k.localId, k]));
  const n = Math.min(table.length, times.length, MEBX_SAMPLE_LIMIT);
  t.mebxTruncated = table.length > n;
  for (let i = 0; i < n; i++) {
    const s = table[i];
    // Each sample is its own small read: they are interleaved with video in mdat.
    const d = new DataView(await src.slice(s.offset, s.offset + s.size));
    const items: MebxSample['items'] = [];
    // A sample is a run of [size u32][local key id u32][value] boxes.
    let o = 0;
    while (o + 8 <= d.byteLength) {
      const size = d.getUint32(o);
      if (size < 8 || o + size > d.byteLength) break;
      const id = d.getUint32(o + 4);
      const key = byId.get(id);
      items.push({
        key: key?.key ?? `#${id}`,
        value: readTypedValue(d, o + 8, size - 8, key?.dataType ?? null),
      });
      o += size;
    }
    t.mebxSamples.push({ timeSec: times[i].t / t.timescale, durSec: times[i].d / t.timescale, items });
  }
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

export interface ProbeOptions {
  /** Decode every `mebx` sample (dev panel only — one small read per sample). */
  decodeMebx?: boolean;
}

export async function probeMp4(src: ByteSource, opts: ProbeOptions = {}): Promise<Mp4Probe> {
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
        mebxKeyTable: [],
        mebxSamples: [],
        mebxTruncated: false,
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
          if (t.codec === 'mebx' && opts.decodeMebx) await readMebxSamples(src, v, stbl, t);
        }
      }
      result.tracks.push(t);
    }
  }
  return result;
}

/** One stretch of the file's timeline: a steady playback factor, or a ramp between two. */
export interface StretchSegment {
  startSec: number;
  endSec: number;
  /** Steady factor (file time / capture time), or null for a ramp. */
  factor: number | null;
  /** Capture (wall-clock) time the segment covers, seconds. */
  captureSec: number;
}

/** Shortest run of samples that counts as a steady plateau rather than ramp noise. */
const PLATEAU_MIN_SAMPLES = 5;
/** How close (in factor units) a sample must be to an integer factor to be "steady". */
const PLATEAU_TOLERANCE = 0.15;

/**
 * Read the slow-mo stretch out of a constant-rate telemetry track.
 *
 * iPhone camera telemetry (`scene-illuminance`) is written at a fixed capture rate
 * (120 Hz). When iOS renders a Slo-Mo export it stretches the slowed interval on the
 * file's timeline — and the telemetry samples with it — so each sample's duration
 * divided by the base (unstretched) duration IS the local playback factor. Returns
 * [] when the track has too few samples to say anything.
 */
export function stretchProfile(samples: MebxSample[]): StretchSegment[] {
  // The last sample is truncated at the track end; leave it out of the base estimate.
  const durs = samples.slice(0, -1).map((s) => s.durSec);
  if (durs.length < PLATEAU_MIN_SAMPLES) return [];
  const min = Math.min(...durs);
  // Base = median of the deltas near the minimum (the unstretched capture rate).
  const near = durs.filter((d) => d <= min * 1.3).sort((a, b) => a - b);
  const base = near[Math.floor(near.length / 2)];
  // OSÄKER: assumes the file starts or ends at 1× — if the WHOLE clip is slowed the
  // base is already the stretched delta and every factor reads 1×. Not seen in the
  // 11 own Slo-Mo clips (all three with telemetry start and end at 1×).

  const steady = (d: number) => {
    const r = d / base;
    return Math.abs(r - Math.round(r)) <= PLATEAU_TOLERANCE ? Math.round(r) : null;
  };
  // Group consecutive samples by steady factor; short or non-integer runs are ramp.
  const runs: { from: number; to: number; factor: number | null }[] = [];
  samples.forEach((s, i) => {
    const f = i === samples.length - 1 ? (runs.at(-1)?.factor ?? null) : steady(s.durSec);
    const last = runs.at(-1);
    if (last && last.factor === f) last.to = i;
    else runs.push({ from: i, to: i, factor: f });
  });
  for (const r of runs) if (r.factor !== null && r.to - r.from + 1 < PLATEAU_MIN_SAMPLES) r.factor = null;

  const out: StretchSegment[] = [];
  for (const r of runs) {
    const startSec = samples[r.from].timeSec;
    const endSec = samples[r.to].timeSec + samples[r.to].durSec;
    const captureSec = (r.to - r.from + 1) * base;
    const last = out.at(-1);
    if (last && last.factor === r.factor) {
      last.endSec = endSec;
      last.captureSec += captureSec;
    } else {
      out.push({ startSec, endSec, factor: r.factor, captureSec });
    }
  }
  return out;
}

// ── Production: is this an iOS Slo-Mo render with a stretched timeline? (S-44) ──

export const SLOMO_INTENT_KEY = 'com.apple.quicktime.full-frame-rate-playback-intent';
/**
 * A rendered Slo-Mo export runs at an ordinary rate (30 fps in all 10 own renders and
 * Erik's phone pick); an UNRENDERED high-speed original stores every capture frame on
 * a real-time timeline at 100+ fps (3555: 119.9 fps, intent 0; 3655: 115.3, intent 1).
 * Only the rendered kind is stretched, so the flag alone is not enough: 3555 carries
 * intent 0 but its 0.775 s timeline is real time.
 */
const RENDERED_MAX_FPS = 90;

export interface TimeStretch {
  /** True only for intent 0 on an ordinary-rate video track — see RENDERED_MAX_FPS. */
  timeStretched: boolean;
  /** `full-frame-rate-playback-intent` from moov/meta, or null when absent. */
  intent: number | null;
  videoFps: number | null;
}

export function timeStretchOf(probe: Mp4Probe): TimeStretch {
  const item = probe.meta.find((m) => m.key === SLOMO_INTENT_KEY);
  const intent = typeof item?.value === 'number' ? item.value : null;
  const videoFps = probe.tracks.find((t) => t.handler === 'vide')?.stts?.fps ?? null;
  return {
    timeStretched: intent === 0 && videoFps !== null && videoFps < RENDERED_MAX_FPS,
    intent,
    videoFps,
  };
}

const NOT_STRETCHED: TimeStretch = { timeStretched: false, intent: null, videoFps: null };

/**
 * Read the stretch flag of an uploaded clip. Never throws: a file the parser cannot read
 * (WebM from MediaRecorder, a truncated upload) is treated as NOT stretched, which is
 * exactly today's behaviour.
 */
export async function readTimeStretch(blob: Blob): Promise<TimeStretch> {
  try {
    return timeStretchOf(await probeMp4(blobSource(blob)));
  } catch {
    return NOT_STRETCHED;
  }
}
