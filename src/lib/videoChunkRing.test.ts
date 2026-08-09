// Harness for the bounded video history (D-5 pass 3).
//
// The two properties worth locking are the ones the crash risk hangs on: the ring
// is bounded no matter how long the session runs, and the pinned init segment
// survives eviction so a late window is still decodable.

import { describe, expect, it } from 'vitest';
import { VideoChunkRing } from './videoChunkRing';

/** A chunk of `bytes` bytes — content is irrelevant, size is what the ring counts. */
function chunk(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

/** Feed `count` chunks of `dt` seconds each, starting at t = dt. */
function fill(ring: VideoChunkRing, count: number, dt = 0.1, bytes = 1000): void {
  for (let i = 1; i <= count; i++) ring.push(chunk(bytes), i * dt);
}

describe('VideoChunkRing', () => {
  it('keeps only the retention window, however long the session runs', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 5 });
    // 10 minutes at 100 ms chunks — the session length the clip path cannot hold.
    fill(ring, 6000);

    expect(ring.receivedCount).toBe(6000);
    expect(ring.spanSec).toBeLessThanOrEqual(5.2);
    // Bounded: ~50 chunks retained out of 6000 received, plus the pinned header.
    expect(ring.size).toBeLessThanOrEqual(52);
    expect(ring.evictedCount).toBeGreaterThan(5900);
  });

  it('holds constant memory: 10× the chunks costs the same bytes', () => {
    const short = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 5 });
    const long = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 5 });
    fill(short, 100);
    fill(long, 1000);
    expect(long.bytes).toBe(short.bytes);
  });

  it('cuts the tail at the requested end, not the whole ring', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 30 });
    fill(ring, 300); // 30 s at 100 ms

    const win = ring.materialize(20, 22);
    expect(win).not.toBeNull();
    // Everything after the window is dropped; everything before it is kept as the
    // decode chain, so the blob ends at 22 s but starts at the ring's oldest chunk.
    expect(win!.endSec).toBeCloseTo(22, 1);
    expect(win!.startSec).toBeCloseTo(0, 1);
    expect(win!.chunks).toBeLessThanOrEqual(221);
    expect(win!.truncatedStart).toBe(false);
    expect(win!.truncatedEnd).toBe(false);
  });

  it('keeps the whole decode chain from the ring start, not just the overlap', () => {
    // The production bug (session swing 12:11:55): a window of `header + the 3
    // overlapping chunks` is bytes-correct and undecodable, because iOS Safari's
    // ~1 s chunks carry no keyframe of their own. Every chunk since the init
    // segment has to be there.
    const ring = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 30 });
    fill(ring, 10, 1.0); // 10 chunks of 1 s — the shape iOS actually delivers

    // Overlaps only the last 3 chunks ([7,8], [8,9], [9,10]).
    const win = ring.materialize(7.5, 9.5)!;
    expect(win.chunks).toBe(10);
    expect(win.leadInChunks).toBe(7);
    expect(win.startSec).toBeCloseTo(0, 5);
    expect(win.endSec).toBeCloseTo(10, 5);
    // The requested start is still in the ring — a lead-in is not a truncation.
    expect(win.truncatedStart).toBe(false);
  });

  it('prepends the pinned init segment when it is outside the window', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 5 });
    fill(ring, 300); // 30 s recorded, 5 s retained — chunk 0 is long gone

    const win = ring.materialize(28, 29)!;
    // The header is evicted from the retention list but still prepended —
    // without it the fragments are undecodable bytes.
    expect(win.headerPrepended).toBe(true);
    expect(win.bytes).toBe((win.chunks + 1) * 1000);
  });

  it('does not duplicate the init segment when the window contains it', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 30 });
    fill(ring, 30); // 3 s — the header is still in range

    const win = ring.materialize(0, 1)!;
    expect(win.headerPrepended).toBe(false);
    expect(win.bytes).toBe(win.chunks * 1000);
  });

  it('reports truncation instead of silently returning a short window', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 5 });
    fill(ring, 300); // 30 s recorded, 5 s retained

    // Asking across the eviction boundary (retained is roughly [25, 30]): what
    // comes back is honest about the gap rather than pretending the requested
    // span was delivered.
    const win = ring.materialize(20, 27)!;
    expect(win.truncatedStart).toBe(true);
    expect(win.startSec).toBeGreaterThan(20);
    expect(win.endSec).toBeCloseTo(27, 1);
  });

  it('returns null when nothing overlaps the request', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 5 });
    fill(ring, 50); // up to 5 s
    expect(ring.materialize(60, 70)).toBeNull();
    expect(ring.materialize(5, 5)).toBeNull();
  });

  it('never evicts down to nothing mid-recording', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/mp4', retentionSec: 0.05 });
    fill(ring, 10, 1.0); // every chunk is 20× older than the retention window
    expect(ring.size).toBe(1);
    expect(ring.materialize(9, 11)).not.toBeNull();
  });

  it('chunk spans are contiguous and non-overlapping', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/webm', retentionSec: 30 });
    const a = ring.push(chunk(10), 0.1);
    const b = ring.push(chunk(10), 0.25);
    expect(a.startSec).toBe(0);
    expect(a.endSec).toBeCloseTo(0.1, 5);
    expect(b.startSec).toBeCloseTo(a.endSec, 5);
    expect(b.endSec).toBeCloseTo(0.25, 5);
  });

  it('clears back to empty', () => {
    const ring = new VideoChunkRing({ mimeType: 'video/mp4' });
    fill(ring, 50);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.bytes).toBe(0);
    expect(ring.materialize(0, 10)).toBeNull();
  });
});
