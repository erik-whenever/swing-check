// Bounded-history guard for the live capture path (D-5 pass 2, ADR-003 §4 + Risker §2).
//
// The whole reason this class exists is the memory bound, so that is what the tests
// assert: the slot array never grows, the oldest sample is the one that goes, and the
// chronological order survives wraparound. A ring buffer that silently reorders after
// wrap would feed `detectSessionSwings` a non-monotonic time series, which is a failure
// mode that would look like bad detection rather than like a data-structure bug.

import { describe, expect, it } from 'vitest';
import { PoseRingBuffer, DEFAULT_RING_CAPACITY } from './poseRingBuffer';
import type { PoseSample } from './poseTrajectory';

/** A sample carrying only what these tests read — the landmark payload is irrelevant. */
function sample(t: number): PoseSample {
  return { t, landmarks: [] };
}

describe('PoseRingBuffer', () => {
  it('rejects a nonsensical capacity instead of degrading silently', () => {
    expect(() => new PoseRingBuffer(0)).toThrow();
    expect(() => new PoseRingBuffer(-1)).toThrow();
    expect(() => new PoseRingBuffer(2.5)).toThrow();
  });

  it('is empty on construction', () => {
    const b = new PoseRingBuffer(4);
    expect(b.size).toBe(0);
    expect(b.toArray()).toEqual([]);
    expect(b.oldest).toBeNull();
    expect(b.newest).toBeNull();
    expect(b.spanSec).toBe(0);
  });

  it('keeps chronological order before it is full', () => {
    const b = new PoseRingBuffer(4);
    b.push(sample(1));
    b.push(sample(2));
    expect(b.toArray().map((s) => s.t)).toEqual([1, 2]);
    expect(b.oldest!.t).toBe(1);
    expect(b.newest!.t).toBe(2);
    expect(b.spanSec).toBe(1);
  });

  // THE property: memory is constant, and it is the OLDEST sample that goes.
  it('caps at capacity and evicts oldest-first', () => {
    const b = new PoseRingBuffer(3);
    for (let i = 1; i <= 10; i++) b.push(sample(i));
    expect(b.size).toBe(3);
    expect(b.toArray().map((s) => s.t)).toEqual([8, 9, 10]);
    expect(b.evictedCount).toBe(7);
  });

  // A wraparound that reorders would hand the detector a non-monotonic series —
  // it would read as garbage motion, not as a bug in here.
  it('stays chronological across many wraparounds', () => {
    const b = new PoseRingBuffer(5);
    for (let i = 0; i < 137; i++) b.push(sample(i / 15));
    const times = b.toArray().map((s) => s.t);
    expect(times).toHaveLength(5);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    expect(b.newest!.t).toBeCloseTo(136 / 15, 10);
    expect(b.oldest!.t).toBeCloseTo(132 / 15, 10);
  });

  it('reports the span it currently holds, not the span it has seen', () => {
    const b = new PoseRingBuffer(3);
    for (let i = 0; i < 100; i++) b.push(sample(i));
    // 3 slots at 1 s apart → 2 s held, regardless of the 99 s that went through it.
    expect(b.spanSec).toBe(2);
  });

  it('clear() returns it to the empty state', () => {
    const b = new PoseRingBuffer(3);
    for (let i = 0; i < 10; i++) b.push(sample(i));
    b.clear();
    expect(b.size).toBe(0);
    expect(b.evictedCount).toBe(0);
    expect(b.toArray()).toEqual([]);
    b.push(sample(42));
    expect(b.toArray().map((s) => s.t)).toEqual([42]);
  });

  it('defaults to ~30 s of history at ACTIVE_FPS', () => {
    expect(new PoseRingBuffer().capacity).toBe(DEFAULT_RING_CAPACITY);
    expect(DEFAULT_RING_CAPACITY / 15).toBeGreaterThanOrEqual(30);
  });
});
