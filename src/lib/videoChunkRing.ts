// BOUNDED video history for the continuous session path (ADR-003 §4.3, D-5 pass 3).
//
// WHY THIS EXISTS. `useCamera` used to push every `ondataavailable` chunk into one
// array and only turn it into a Blob when recording stopped. That is correct for a
// clip and fatal for a session: the inventory measured 150–350 MB for a range
// session held in RAM, which is the crash the iOS tab dies from. A session never
// stops, so "keep it all and slice later" has no later.
//
// So the same thing `poseRingBuffer.ts` does for landmarks, this does for video:
// keep a BOUNDED trailing window of timestamped chunks, and materialize only the
// ~10 s around a detected swing into a Blob. The whole session is never resident.
//
// THE HEADER CHUNK IS PINNED. MediaRecorder's first chunk carries the container's
// init segment — `ftyp`+`moov` for fragmented MP4 (Safari/iOS), the EBML header and
// first cluster for WebM. Without it, later chunks are undecodable bytes. So the
// first chunk is held outside the eviction list forever (one chunk, ~tens of kB) and
// prepended to every materialized window that does not already contain it. That is
// the same shape DASH/HLS use: init segment + a subset of media fragments.
//
// // OSÄKER: a subset of fMP4 fragments after the init segment is a valid file by
// construction, but browsers differ in whether the resulting timeline keeps the
// ORIGINAL decode times or is rebased to zero. This module does not guess — it
// reports the window's real bounds and `poseFrameGrab` probes the loaded video to
// find out which base it got. Risk if the probe is wrong: frames grabbed from the
// wrong part of the window, visible immediately in the dev preview.
//
// Pure data structure: no MediaRecorder, no React, no timers. Unit-testable.

/** One `ondataavailable` payload plus the recording-clock span it covers. */
export interface TimedChunk {
  blob: Blob;
  /** Seconds since recording start (inclusive). */
  startSec: number;
  /** Seconds since recording start (exclusive-ish — the next chunk starts here). */
  endSec: number;
}

export interface MaterializedWindow {
  blob: Blob;
  /** Actual media start of the returned blob, recording clock. */
  startSec: number;
  /** Actual media end of the returned blob, recording clock. */
  endSec: number;
  /** Media chunks in the window (excluding a prepended header). */
  chunks: number;
  bytes: number;
  /** True when the pinned init segment had to be prepended. */
  headerPrepended: boolean;
  /** True when the requested start had already been evicted. */
  truncatedStart: boolean;
  /** True when the requested end has not been recorded yet. */
  truncatedEnd: boolean;
}

/**
 * TRAILING RETENTION (seconds). Must comfortably exceed the detection latency
 * (0.6–1.1 s after impact, structural — see liveSwingDetector.ts) plus the widest
 * window we ever materialize. 30 s is ~25× the latency; the cost of being generous
 * is a few MB of Blob references, and the cost of being tight is a lost swing.
 */
export const DEFAULT_RETENTION_SEC = 30;

export class VideoChunkRing {
  readonly retentionSec: number;
  readonly mimeType: string;

  /** The init segment. Pinned: never evicted, always decodable. */
  private header: TimedChunk | null = null;
  /** Trailing window, chronological. */
  private chunks: TimedChunk[] = [];
  /** End of the newest chunk — the recording clock as this ring knows it. */
  private cursorSec = 0;

  private received = 0;
  private receivedBytes = 0;
  private evicted = 0;
  private evictedBytes = 0;

  constructor(options: { mimeType: string; retentionSec?: number }) {
    this.mimeType = options.mimeType;
    this.retentionSec = options.retentionSec ?? DEFAULT_RETENTION_SEC;
    if (!(this.retentionSec > 0)) {
      throw new Error(`VideoChunkRing retentionSec must be > 0, got ${this.retentionSec}`);
    }
  }

  /**
   * Append a chunk that covers everything since the previous one.
   *
   * @param blob the `ondataavailable` payload.
   * @param atSec recording-clock time the chunk arrived. Chunk spans are derived
   *   from arrival times rather than parsed from the container: with a 100 ms
   *   timeslice the error is one timeslice, and the window we cut is seconds wide.
   */
  push(blob: Blob, atSec: number): TimedChunk {
    const chunk: TimedChunk = {
      blob,
      startSec: this.cursorSec,
      endSec: Math.max(atSec, this.cursorSec),
    };
    this.cursorSec = chunk.endSec;
    this.received++;
    this.receivedBytes += blob.size;
    if (!this.header) this.header = chunk;
    this.chunks.push(chunk);
    this.evict();
    return chunk;
  }

  private evict(): void {
    const cutoff = this.cursorSec - this.retentionSec;
    // Keep at least one chunk so a window request can never see an empty ring
    // mid-recording.
    while (this.chunks.length > 1 && this.chunks[0].endSec < cutoff) {
      const dropped = this.chunks.shift()!;
      this.evicted++;
      this.evictedBytes += dropped.blob.size;
    }
  }

  /**
   * Cut a playable blob covering `[startSec, endSec]` of the recording clock.
   * Returns null when the ring holds nothing overlapping the request — which is
   * either "too early" (nothing recorded yet) or "too late" (already evicted).
   */
  materialize(startSec: number, endSec: number): MaterializedWindow | null {
    if (!(endSec > startSec)) return null;
    const selected = this.chunks.filter((c) => c.endSec > startSec && c.startSec < endSec);
    if (selected.length === 0) return null;

    const headerPrepended = this.header !== null && !selected.includes(this.header);
    const parts: Blob[] = headerPrepended ? [this.header!.blob, ...selected.map((c) => c.blob)] : selected.map((c) => c.blob);

    return {
      blob: new Blob(parts, { type: this.mimeType }),
      startSec: selected[0].startSec,
      endSec: selected[selected.length - 1].endSec,
      chunks: selected.length,
      bytes: parts.reduce((n, b) => n + b.size, 0),
      headerPrepended,
      truncatedStart: selected[0].startSec > startSec + 1e-6,
      truncatedEnd: selected[selected.length - 1].endSec < endSec - 1e-6,
    };
  }

  /** Chunks currently retained (the pinned header is not counted separately). */
  get size(): number {
    return this.chunks.length;
  }

  /** Bytes currently retained, including the pinned header when it was evicted. */
  get bytes(): number {
    const held = this.chunks.reduce((n, c) => n + c.blob.size, 0);
    const pinned =
      this.header && !this.chunks.includes(this.header) ? this.header.blob.size : 0;
    return held + pinned;
  }

  /** Seconds of media currently retained. */
  get spanSec(): number {
    if (this.chunks.length === 0) return 0;
    return this.chunks[this.chunks.length - 1].endSec - this.chunks[0].startSec;
  }

  /** Oldest recording-clock second still materializable. */
  get oldestSec(): number {
    return this.chunks.length > 0 ? this.chunks[0].startSec : 0;
  }

  /** Newest recording-clock second the ring has seen. */
  get newestSec(): number {
    return this.cursorSec;
  }

  get evictedCount(): number {
    return this.evicted;
  }

  get evictedBytesCount(): number {
    return this.evictedBytes;
  }

  get receivedCount(): number {
    return this.received;
  }

  get receivedBytesCount(): number {
    return this.receivedBytes;
  }

  clear(): void {
    this.header = null;
    this.chunks = [];
    this.cursorSec = 0;
    this.received = 0;
    this.receivedBytes = 0;
    this.evicted = 0;
    this.evictedBytes = 0;
  }
}
