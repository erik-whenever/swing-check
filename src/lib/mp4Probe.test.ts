import { describe, expect, it } from 'vitest';
import { readTimeStretch, stretchProfile, timeStretchOf, type MebxSample, type Mp4Probe } from '@swingcheck/core/lib/mp4Probe';
import { lowPitchRun, zeroCrossingProfile } from './audioProfile';

/** 120 Hz telemetry: n1 samples at 1×, a 3-sample ramp, n4 at 4×, ramp back, n1 at 1×. */
function telemetry(): MebxSample[] {
  const d = [
    ...Array(30).fill(1),
    1.5, 2, 3,
    ...Array(40).fill(4),
    3, 2, 1.5,
    ...Array(30).fill(1),
  ].map((f) => f / 120);
  let t = 0;
  return d.map((durSec) => {
    const s = { timeSec: t, durSec, items: [] };
    t += durSec;
    return s;
  });
}

describe('stretchProfile', () => {
  it('finds the 4× plateau, its ramps and its capture time', () => {
    const segs = stretchProfile(telemetry());
    expect(segs.map((s) => s.factor)).toEqual([1, null, 4, null, 1]);
    const plateau = segs[2];
    expect(plateau.startSec).toBeCloseTo((30 + 6.5) / 120, 6);
    expect(plateau.endSec - plateau.startSec).toBeCloseTo((40 * 4) / 120, 6);
    expect(plateau.captureSec).toBeCloseTo(40 / 120, 6);
  });

  it('reads a constant-rate track as one 1× segment', () => {
    const flat = Array.from({ length: 50 }, (_, i) => ({ timeSec: i / 120, durSec: 1 / 120, items: [] }));
    expect(stretchProfile(flat).map((s) => s.factor)).toEqual([1]);
  });

  it('says nothing about a single-sample track', () => {
    expect(stretchProfile([{ timeSec: 0, durSec: 19.3, items: [] }])).toEqual([]);
  });
});

describe('lowPitchRun', () => {
  it('finds a quarter-pitch stretch between full-pitch ends', () => {
    const sr = 8000;
    const tone = (hz: number, sec: number) =>
      Array.from({ length: sr * sec }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sr + 0.1));
    const x = Float32Array.from([...tone(1000, 1), ...tone(250, 3), ...tone(1000, 1)]);
    const run = lowPitchRun(zeroCrossingProfile(x, sr));
    expect(run).not.toBeNull();
    expect(run!.startSec).toBeCloseTo(1, 1);
    expect(run!.endSec).toBeCloseTo(4, 1);
    expect(run!.ratio).toBeCloseTo(4, 0);
  });
});

describe('timeStretchOf (S-44)', () => {
  const probe = (intent: number | null, fps: number | null): Mp4Probe => ({
    fileSize: 0,
    majorBrand: 'qt  ',
    compatibleBrands: [],
    topLevel: [],
    movieTimescale: 600,
    movieDuration: 0,
    movieDurationSec: 0,
    appleKeysRaw: [],
    meta:
      intent === null
        ? []
        : [{ key: 'com.apple.quicktime.full-frame-rate-playback-intent', where: 'moov/meta', value: intent }],
    tracks:
      fps === null
        ? []
        : [
            {
              trackId: 1, handler: 'vide', handlerName: '', codec: 'avc1', timescale: 600,
              duration: 0, durationSec: 0, edits: [], mebxKeys: [], mebxKeyTable: [],
              mebxSamples: [], mebxTruncated: false,
              stts: { sampleCount: 1, entries: 1, distinctDeltas: 1, minDelta: 20, medianDelta: 20, maxDelta: 20, fps },
            },
          ],
  });

  it('intent 0 on a 30 fps render → stretched (the phone pick, 3550 …)', () => {
    expect(timeStretchOf(probe(0, 30)).timeStretched).toBe(true);
  });
  it('intent 0 on a 120 fps original → NOT stretched (3555: real-time timeline)', () => {
    expect(timeStretchOf(probe(0, 119.94)).timeStretched).toBe(false);
  });
  it('intent 1 → not stretched (3655)', () => {
    expect(timeStretchOf(probe(1, 115.3)).timeStretched).toBe(false);
  });
  it('no key → not stretched (every ordinary clip)', () => {
    expect(timeStretchOf(probe(null, 30)).timeStretched).toBe(false);
  });
  it('unreadable blob → not stretched, never throws', async () => {
    const s = await readTimeStretch(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])]));
    expect(s).toEqual({ timeStretched: false, intent: null, videoFps: null });
  });
});
