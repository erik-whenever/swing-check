// BOUNDED landmark history for the live capture path (ADR-003 §4, D-5 pass 2).
//
// The clip path keeps every sample of a clip in one array, which is fine when the
// clip ends. A range session does not end — the camera rolls for 30+ minutes — so
// an unbounded array is a leak with a countdown on it (ADR-003 Risker §2: a leak
// kills the tab in iOS Safari). This buffer therefore has CONSTANT memory by
// construction: a pre-sized slot array that overwrites its oldest entry, never a
// growing list that is trimmed afterwards.
//
// Measured cost: a PoseSample (33 landmarks) is ~4.3 kB, so the 450-sample default
// (~30 s at ACTIVE_FPS) is ~1.9 MB and stays there whether the session runs for one
// minute or one hour.
//
// The capacity is in SAMPLES, not seconds, and the live loop samples at two
// different rates (guard 5 fps / active 15 fps). So the buffer's time span breathes:
// ~30 s while a swing is being captured, up to ~90 s of quiet history at guard rate.
// That is the right way round — the span shrinks exactly when the samples are dense
// enough to matter, and memory never moves.
//
// Pure data structure: no pose, no React, no timers. Unit-testable.

import type { PoseSample } from './poseTrajectory';

/** ~30 s at ACTIVE_FPS (15) — comfortably longer than any single swing plus its
 *  address hold and settle, which is all the detector ever needs to see at once. */
export const DEFAULT_RING_CAPACITY = 450;

export class PoseRingBuffer {
  readonly capacity: number;
  private readonly slots: (PoseSample | undefined)[];
  /** Index the next push writes to. */
  private write = 0;
  /** Number of filled slots (saturates at capacity). */
  private filled = 0;
  /** Samples dropped by overwrite — diagnostic, proves the bound is real. */
  private evicted = 0;

  constructor(capacity: number = DEFAULT_RING_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`PoseRingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.slots = new Array<PoseSample | undefined>(capacity);
  }

  push(sample: PoseSample): void {
    if (this.filled === this.capacity) this.evicted++;
    this.slots[this.write] = sample;
    this.write = (this.write + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  /** Samples in chronological order (oldest → newest). Copies references only. */
  toArray(): PoseSample[] {
    const out: PoseSample[] = new Array(this.filled);
    // When not yet full the oldest sample is at 0; once full it is at `write`.
    const start = this.filled === this.capacity ? this.write : 0;
    for (let i = 0; i < this.filled; i++) {
      out[i] = this.slots[(start + i) % this.capacity]!;
    }
    return out;
  }

  get size(): number {
    return this.filled;
  }

  get evictedCount(): number {
    return this.evicted;
  }

  get oldest(): PoseSample | null {
    if (this.filled === 0) return null;
    const start = this.filled === this.capacity ? this.write : 0;
    return this.slots[start]!;
  }

  get newest(): PoseSample | null {
    if (this.filled === 0) return null;
    return this.slots[(this.write - 1 + this.capacity) % this.capacity]!;
  }

  /** Seconds between the oldest and newest sample currently held. */
  get spanSec(): number {
    const a = this.oldest;
    const b = this.newest;
    return a && b ? b.t - a.t : 0;
  }

  clear(): void {
    this.slots.fill(undefined);
    this.write = 0;
    this.filled = 0;
    this.evicted = 0;
  }
}
