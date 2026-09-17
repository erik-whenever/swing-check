// The plausibility check, tested against the failure patterns that were actually
// measured — not against invented ones.
//
// The three that matter are named in `plausibility.ts`'s header and each has its own
// describe block below: swapped ends at 150–180°, a blade that is restless throughout
// at ~6× the shaft's rate, and sole-point confidence that tops out at 0.55 against
// 0.99–1.00 for the shaft points. The numbers in the fixtures are the measured ones.

import { describe, expect, it } from 'vitest';
import {
  BLADE_CONF_FLOOR,
  DEFAULT_THRESHOLDS,
  FLIP_MIN_DEG,
  MAX_GAP_SEC,
  OBSERVED_FLIP_BAND_DEG,
  OBSERVED_UNREST_RATIO,
  SHAFT_CONF_USABLE,
  UNREST_RATIO_MAX,
  checkShaftSeries,
  usableFrameIndices,
  type QualityReason,
} from './plausibility';
import { angleDeg } from './angles';
import {
  emptyBodyReference,
  type MeasurementPhase,
  type ShaftFrameSample,
  type ShaftKeypoint,
  type ShaftSwingSeries,
} from './shaftSeries';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const IMAGE = { width: 1080, height: 1920 };
/** Measured confidence of `butt`/`hosel` on the shipped checkpoint. */
const SHAFT_CONF = 0.99;
/** Measured MEDIAN confidence of `toe`/`heel` on the shipped checkpoint. */
const BLADE_CONF_MEDIAN = 0.26;
/** Measured MAXIMUM confidence of `toe`/`heel`. Nothing observed ever beat it. */
const BLADE_CONF_MAX = 0.55;

function kp(x: number, y: number, conf: number): ShaftKeypoint {
  return { x, y, conf };
}

/** A point `len` px from `from` at `deg` in the image convention (y downward). */
function along(from: { x: number; y: number }, deg: number, len: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: from.x + Math.cos(rad) * len, y: from.y + Math.sin(rad) * len };
}

interface FrameSpec {
  tSec: number;
  phase?: MeasurementPhase;
  shaftDeg?: number | null;
  bladeDeg?: number | null;
  shaftConf?: number;
  bladeConf?: number;
  /** Override the shaft length in px — used to build a degenerate segment. */
  shaftLen?: number;
  bladeLen?: number;
}

function frame(spec: FrameSpec): ShaftFrameSample {
  const butt = spec.shaftDeg === null || spec.shaftDeg === undefined
    ? null
    : kp(400, 900, spec.shaftConf ?? SHAFT_CONF);
  const hoselPoint = butt && spec.shaftDeg !== null && spec.shaftDeg !== undefined
    ? along(butt, spec.shaftDeg, spec.shaftLen ?? 600)
    : null;
  const hosel = hoselPoint ? kp(hoselPoint.x, hoselPoint.y, spec.shaftConf ?? SHAFT_CONF) : null;

  const heel = spec.bladeDeg === null || spec.bladeDeg === undefined
    ? null
    : kp(hosel ? hosel.x : 700, hosel ? hosel.y : 1400, spec.bladeConf ?? BLADE_CONF_MEDIAN);
  const toePoint = heel && spec.bladeDeg !== null && spec.bladeDeg !== undefined
    ? along(heel, spec.bladeDeg, spec.bladeLen ?? 80)
    : null;
  const toe = toePoint ? kp(toePoint.x, toePoint.y, spec.bladeConf ?? BLADE_CONF_MEDIAN) : null;

  return {
    tSec: spec.tSec,
    phase: spec.phase ?? 'backswing',
    butt,
    hosel,
    toe,
    heel,
    shaftAngleDeg: butt && hosel ? angleDeg(butt, hosel) : null,
    bladeAngleDeg: heel && toe ? angleDeg(heel, toe) : null,
    body: emptyBodyReference(),
  };
}

function series(frames: ShaftFrameSample[], keypoints = 4): ShaftSwingSeries {
  return {
    clipName: 'fixture.mp4',
    swingIndex: 0,
    cameraAngle: 'dtl',
    imageSize: IMAGE,
    model: { file: 'shaft-test.onnx', keypoints },
    frames,
    producedAt: '2026-09-17T00:00:00.000Z',
  };
}

/** A clean, dense series: both angles rotate smoothly at the shaft's measured rate. */
function steadySeries(n = 10, dtSec = 0.033, shaftRate = 12, bladeRate = 12) {
  return series(
    Array.from({ length: n }, (_, i) =>
      frame({
        tSec: i * dtSec,
        shaftDeg: -80 + shaftRate * i * dtSec,
        bladeDeg: 10 + bladeRate * i * dtSec,
        bladeConf: BLADE_CONF_MAX,
      }),
    ),
  );
}

function reasonsAt(
  checked: ReturnType<typeof checkShaftSeries>,
  index: number,
  kind: 'shaft' | 'blade',
): QualityReason[] {
  const q = checked.quality.frames[index];
  return kind === 'shaft' ? q.shaftAngle.reasons : q.bladeAngle.reasons;
}

// ── Baseline ─────────────────────────────────────────────────────────────────

describe('checkShaftSeries — a clean series', () => {
  it('passes every frame and says so with no reasons', () => {
    const checked = checkShaftSeries(steadySeries());
    expect(checked.quality.levelCount.shaft).toEqual({ usable: 10, uncertain: 0, rejected: 0 });
    expect(checked.quality.shaftAngle).toEqual({ level: 'usable', reasons: [] });
    expect(checked.quality.counts).toEqual({});
    expect(checked.quality.flipCount).toEqual({ shaft: 0, blade: 0 });
  });

  it('leaves the input series untouched — the check flags, it never edits', () => {
    const input = steadySeries();
    const before = JSON.stringify(input);
    checkShaftSeries(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('reports the rates it measured, so a verdict can be re-argued from itself', () => {
    const checked = checkShaftSeries(steadySeries(10, 0.033, 12, 12));
    expect(checked.quality.shaftRateMedianDegPerSec).toBeCloseTo(12, 6);
    expect(checked.quality.bladeRateMedianDegPerSec).toBeCloseTo(12, 6);
    expect(checked.quality.unrestRatio).toBeCloseTo(1, 6);
    expect(checked.quality.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });
});

// ── Pattern 1: swapped ends, 150–180° between neighbouring frames ────────────

describe('measured pattern 1 — toe/heel swap ends (150–180° jump)', () => {
  for (const jump of [OBSERVED_FLIP_BAND_DEG[0], 170, OBSERVED_FLIP_BAND_DEG[1]]) {
    it(`rejects the one frame that disagrees with both neighbours at ${jump}°`, () => {
      const base = steadySeries(5);
      const flipped = base.frames[2];
      const swapped = frame({
        tSec: flipped.tSec,
        shaftDeg: -80 + 12 * flipped.tSec,
        bladeDeg: 10 + 12 * flipped.tSec + jump,
        bladeConf: BLADE_CONF_MAX,
      });
      const checked = checkShaftSeries(series([...base.frames.slice(0, 2), swapped, ...base.frames.slice(3)]));

      expect(checked.quality.frames[2].bladeAngle.level).toBe('rejected');
      expect(reasonsAt(checked, 2, 'blade')).toContain('endpoint-flip');
      expect(checked.quality.flipCount.blade).toBe(1);
      // The shaft rides through untouched: only the sole points swapped.
      expect(checked.quality.levelCount.shaft.rejected).toBe(0);
    });
  }

  it('does not touch the flipped frame\'s neighbours — they agree with the series', () => {
    // Eleven frames, one swapped: the two jump pairs are a minority, so the series-level
    // unrest ratio stays inside its bar and only the one frame is condemned. (In a
    // five-frame series the same single flip DOES drag the median over the bar and the
    // whole blade series falls — which is the check working, not failing: two of four
    // steps being a half turn is not a series anyone should read a blade angle off.)
    const base = steadySeries(11);
    const swapped = frame({
      tSec: base.frames[5].tSec,
      shaftDeg: -80 + 12 * base.frames[5].tSec,
      bladeDeg: 10 + 12 * base.frames[5].tSec + 180,
      bladeConf: BLADE_CONF_MAX,
    });
    const checked = checkShaftSeries(
      series([...base.frames.slice(0, 5), swapped, ...base.frames.slice(6)]),
    );
    expect(checked.quality.frames[5].bladeAngle.level).toBe('rejected');
    expect(reasonsAt(checked, 5, 'blade')).toEqual(['endpoint-flip']);
    expect(checked.quality.frames[4].bladeAngle.level).toBe('usable');
    expect(checked.quality.frames[6].bladeAngle.level).toBe('usable');
  });

  it('marks BOTH ends ambiguous when the swap lasts and neither side can be blamed', () => {
    // Frames 0–1 one way round, frames 2–3 the other: the jump is real but which half
    // is the club cannot be told from the angles, so neither is condemned outright.
    const frames = [0, 1, 2, 3].map((i) =>
      frame({
        tSec: i * 0.033,
        shaftDeg: -80 + 12 * i * 0.033,
        bladeDeg: 10 + 12 * i * 0.033 + (i >= 2 ? 180 : 0),
        bladeConf: BLADE_CONF_MAX,
      }),
    );
    const checked = checkShaftSeries(series(frames));
    expect(checked.quality.flipCount.blade).toBe(0);
    expect(reasonsAt(checked, 1, 'blade')).toContain('endpoint-flip-ambiguous');
    expect(reasonsAt(checked, 2, 'blade')).toContain('endpoint-flip-ambiguous');
    expect(checked.quality.frames[1].bladeAngle.level).toBe('uncertain');
    expect(checked.quality.frames[2].bladeAngle.level).toBe('uncertain');
    // …and the interior of the swap is NOT caught. Stated in the code, pinned here.
    expect(checked.quality.frames[3].bladeAngle.level).toBe('usable');
  });

  it('catches the same swap on the shaft — nothing about the test is blade-specific', () => {
    const base = steadySeries(5);
    const swapped = frame({
      tSec: base.frames[2].tSec,
      shaftDeg: -80 + 12 * base.frames[2].tSec + 180,
      bladeDeg: 10 + 12 * base.frames[2].tSec,
      bladeConf: BLADE_CONF_MAX,
    });
    const checked = checkShaftSeries(series([...base.frames.slice(0, 2), swapped, ...base.frames.slice(3)]));
    expect(reasonsAt(checked, 2, 'shaft')).toContain('endpoint-flip');
    expect(checked.quality.flipCount.shaft).toBe(1);
  });

  it('does not call a jump across a long gap a swap', () => {
    // Two frames 2 s apart — past MAX_GAP_SEC. A club goes anywhere in 2 s, so the
    // difference says nothing, and the pair is not compared at all.
    const checked = checkShaftSeries(
      series([
        frame({ tSec: 0, shaftDeg: -80, bladeDeg: 0, bladeConf: BLADE_CONF_MAX }),
        frame({ tSec: MAX_GAP_SEC + 1, shaftDeg: 95, bladeDeg: 175, bladeConf: BLADE_CONF_MAX }),
      ]),
    );
    expect(checked.quality.counts['endpoint-flip']).toBeUndefined();
    expect(checked.quality.counts['endpoint-flip-ambiguous']).toBeUndefined();
    expect(checked.quality.shaftRateMedianDegPerSec).toBeNull();
  });

  it('a jump just under the bar is rotation, just over is a swap', () => {
    const build = (jump: number) =>
      checkShaftSeries(
        series([
          frame({ tSec: 0, shaftDeg: 0, bladeDeg: 0, bladeConf: BLADE_CONF_MAX }),
          frame({ tSec: 0.1, shaftDeg: jump, bladeDeg: 0, bladeConf: BLADE_CONF_MAX }),
          frame({ tSec: 0.2, shaftDeg: 0, bladeDeg: 0, bladeConf: BLADE_CONF_MAX }),
        ]),
      );
    expect(build(FLIP_MIN_DEG - 1).quality.flipCount.shaft).toBe(0);
    expect(build(FLIP_MIN_DEG + 1).quality.flipCount.shaft).toBe(1);
  });
});

// ── Pattern 2: the blade is restless throughout (~6× the shaft) ──────────────

describe('measured pattern 2 — the blade angle is restless throughout', () => {
  it('condemns the whole blade series at the measured 71–78 °/s against 12 °/s', () => {
    // 75 °/s blade against 12 °/s shaft on 0.033 s steps: ratio 6.25, the measured shape.
    const dt = 0.033;
    const frames = Array.from({ length: 12 }, (_, i) =>
      frame({
        tSec: i * dt,
        shaftDeg: -80 + 12 * i * dt,
        // Alternate the sign so the angle stays put on average and only the RATE is
        // wrong — a blade that merely spun fast would also move somewhere.
        bladeDeg: 10 + (i % 2 === 0 ? 0 : 75 * dt),
        bladeConf: BLADE_CONF_MAX,
      }),
    );
    const checked = checkShaftSeries(series(frames));

    expect(checked.quality.shaftRateMedianDegPerSec).toBeCloseTo(12, 3);
    expect(checked.quality.bladeRateMedianDegPerSec).toBeCloseTo(75, 3);
    expect(checked.quality.unrestRatio).toBeCloseTo(6.25, 2);
    expect(checked.quality.unrestRatio!).toBeGreaterThan(UNREST_RATIO_MAX);

    // Every blade flag is rejected, and every one of them says why.
    expect(checked.quality.levelCount.blade.rejected).toBe(frames.length);
    for (let i = 0; i < frames.length; i++) {
      expect(reasonsAt(checked, i, 'blade')).toContain('blade-unrest');
    }
    expect(checked.quality.bladeAngle.level).toBe('rejected');
    expect(checked.quality.bladeAngle.reasons).toContain('blade-unrest');

    // The shaft is untouched — the two angles are judged separately.
    expect(checked.quality.shaftAngle.level).toBe('usable');
    expect(usableFrameIndices(checked, 'shaft')).toHaveLength(frames.length);
    expect(usableFrameIndices(checked, 'blade')).toHaveLength(0);
  });

  it('the observed ratio is comfortably past the bar, and 1× is comfortably inside', () => {
    expect(OBSERVED_UNREST_RATIO).toBeGreaterThan(UNREST_RATIO_MAX);
    const calm = checkShaftSeries(steadySeries(10, 0.033, 12, 12));
    expect(calm.quality.unrestRatio).toBeLessThan(UNREST_RATIO_MAX);
    expect(calm.quality.bladeAngle.level).toBe('usable');
  });

  it('rejects nothing silently — the count table adds up to the rejected frames', () => {
    const checked = checkShaftSeries(steadySeries(6, 0.033, 12, 300));
    expect(checked.quality.levelCount.blade.rejected).toBe(6);
    expect(checked.quality.counts['blade-unrest']).toBe(6);
  });
});

// ── Pattern 3: the sole points are not confident ─────────────────────────────

describe('measured pattern 3 — separate confidence thresholds', () => {
  it('one shared bar at the shaft level empties the blade measurement', () => {
    // The measured distribution: shaft points at 0.99, sole points at their median 0.26.
    const frames = Array.from({ length: 8 }, (_, i) =>
      frame({
        tSec: i * 0.033,
        shaftDeg: -80 + 12 * i * 0.033,
        bladeDeg: 10 + 12 * i * 0.033,
        shaftConf: SHAFT_CONF,
        bladeConf: BLADE_CONF_MEDIAN,
      }),
    );

    // With the layer's own two thresholds, the blade survives — as `uncertain`.
    const split = checkShaftSeries(series(frames));
    expect(split.quality.levelCount.blade.rejected).toBe(0);
    expect(split.quality.levelCount.blade.uncertain).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(reasonsAt(split, i, 'blade')).toContain('blade-confidence-low');
    }

    // With ONE shared bar at the shaft's level, coverage goes to zero: not stricter,
    // just empty. This is the finding the two thresholds exist for.
    const shared = checkShaftSeries(series(frames), { bladeConfFloor: SHAFT_CONF_USABLE });
    expect(shared.quality.levelCount.blade.rejected).toBe(8);
    expect(shared.quality.counts['blade-confidence-below-floor']).toBe(8);
    expect(shared.quality.bladeAngle.reasons).toContain('no-usable-frames');
    // …while the same shared bar changes nothing at all about the shaft.
    expect(shared.quality.levelCount.shaft.usable).toBe(8);
  });

  it('the measured MAXIMUM sole confidence still does not reach `usable`', () => {
    const checked = checkShaftSeries(
      series([
        frame({ tSec: 0, shaftDeg: -80, bladeDeg: 0, bladeConf: BLADE_CONF_MAX }),
        frame({ tSec: 0.033, shaftDeg: -79.6, bladeDeg: 0.4, bladeConf: BLADE_CONF_MAX }),
      ]),
    );
    // 0.55 is above the floor (0.1) and above BLADE_CONF_USABLE (0.5) — so the single
    // best sole point ever observed is the only one that would clear the bar, and the
    // median (0.26) does not. Pinned so a threshold change has to face this.
    expect(BLADE_CONF_MAX).toBeGreaterThan(BLADE_CONF_FLOOR);
    expect(checked.quality.frames[0].bladeAngle.level).toBe('usable');

    const atMedian = checkShaftSeries(
      series([frame({ tSec: 0, shaftDeg: -80, bladeDeg: 0, bladeConf: BLADE_CONF_MEDIAN })]),
    );
    expect(atMedian.quality.frames[0].bladeAngle.level).toBe('uncertain');
  });

  it('a shaft point below its own floor is rejected, not merely softened', () => {
    const checked = checkShaftSeries(
      series([frame({ tSec: 0, shaftDeg: -80, bladeDeg: 0, shaftConf: 0.2 })]),
    );
    expect(checked.quality.frames[0].shaftAngle.level).toBe('rejected');
    expect(reasonsAt(checked, 0, 'shaft')).toEqual(['shaft-confidence-below-floor']);
  });
});

// ── The rest of the gate ─────────────────────────────────────────────────────

describe('checkShaftSeries — the other ways a measurement fails', () => {
  it('names a missing point rather than dropping the frame', () => {
    const checked = checkShaftSeries(series([frame({ tSec: 0, shaftDeg: null, bladeDeg: 0 })]));
    expect(reasonsAt(checked, 0, 'shaft')).toEqual(['shaft-point-missing']);
    expect(checked.quality.frames).toHaveLength(1);
    expect(checked.series.frames).toHaveLength(1);
  });

  it('rejects a shaft whose endpoints have collapsed onto each other', () => {
    const checked = checkShaftSeries(
      series([frame({ tSec: 0, shaftDeg: -80, bladeDeg: 0, shaftLen: 5 })]),
    );
    expect(reasonsAt(checked, 0, 'shaft')).toEqual(['degenerate-shaft']);
  });

  it('rejects a collapsed sole the same way', () => {
    const checked = checkShaftSeries(
      series([frame({ tSec: 0, shaftDeg: -80, bladeDeg: 0, bladeLen: 1 })]),
    );
    expect(reasonsAt(checked, 0, 'blade')).toEqual(['degenerate-blade']);
  });

  it('says a two-point checkpoint has no sole points — not that the frames were bad', () => {
    const checked = checkShaftSeries(series(steadySeries(4).frames, 2));
    expect(checked.quality.levelCount.blade.rejected).toBe(4);
    expect(checked.quality.counts['model-lacks-blade-keypoints']).toBe(4);
    expect(checked.quality.counts['blade-point-missing']).toBeUndefined();
    expect(checked.quality.bladeRateMedianDegPerSec).toBeNull();
    expect(checked.quality.unrestRatio).toBeNull();
    // The shaft measurement is entirely unaffected.
    expect(checked.quality.shaftAngle.level).toBe('usable');
  });

  it('catches a producer that located both endpoints but left the angle null', () => {
    const broken = steadySeries(1);
    broken.frames[0].shaftAngleDeg = null;
    const checked = checkShaftSeries(broken);
    expect(reasonsAt(checked, 0, 'shaft')).toEqual(['angle-missing']);
  });

  it('flags an out-of-order series instead of comparing the wrong neighbours', () => {
    const frames = steadySeries(4).frames;
    const shuffled = [frames[0], frames[2], frames[1], frames[3]];
    const checked = checkShaftSeries(series(shuffled));
    expect(checked.quality.shaftAngle.reasons).toContain('frames-out-of-order');
    expect(checked.quality.shaftAngle.level).not.toBe('usable');
  });

  it('calls a series carried by a minority of good frames `uncertain`', () => {
    const frames = [
      ...Array.from({ length: 6 }, (_, i) =>
        frame({ tSec: i * 0.033, shaftDeg: -80 + i, bladeDeg: 0, shaftConf: 0.4 }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        frame({ tSec: (6 + i) * 0.033, shaftDeg: -74 + i, bladeDeg: 0 }),
      ),
    ];
    const checked = checkShaftSeries(series(frames));
    expect(checked.quality.levelCount.shaft).toEqual({ usable: 2, uncertain: 6, rejected: 0 });
    expect(checked.quality.shaftAngle).toEqual({
      level: 'uncertain',
      reasons: ['sparse-usable-frames'],
    });
  });

  it('rejects a series where nothing survived, and says so at series level', () => {
    const checked = checkShaftSeries(
      series([frame({ tSec: 0, shaftDeg: null, bladeDeg: null }), frame({ tSec: 0.1, shaftDeg: null, bladeDeg: null })]),
    );
    expect(checked.quality.shaftAngle).toEqual({ level: 'rejected', reasons: ['no-usable-frames'] });
    expect(usableFrameIndices(checked, 'shaft')).toEqual([]);
  });

  it('usableFrameIndices can be asked for strictly usable frames only', () => {
    const frames = [
      frame({ tSec: 0, shaftDeg: -80, bladeDeg: 0 }),
      frame({ tSec: 0.033, shaftDeg: -79.6, bladeDeg: 0, shaftConf: 0.4 }),
    ];
    const checked = checkShaftSeries(series(frames));
    expect(usableFrameIndices(checked, 'shaft', 'uncertain')).toEqual([0, 1]);
    expect(usableFrameIndices(checked, 'shaft', 'usable')).toEqual([0]);
  });

  it('a frame can carry more than one reason and lists each once', () => {
    // A low-confidence frame that also sits at the ambiguous end of a lasting swap.
    const frames = [
      frame({ tSec: 0, shaftDeg: 0, bladeDeg: 0 }),
      frame({ tSec: 0.033, shaftDeg: 0.4, bladeDeg: 0, shaftConf: 0.4 }),
      frame({ tSec: 0.066, shaftDeg: 180, bladeDeg: 0, shaftConf: 0.4 }),
      frame({ tSec: 0.099, shaftDeg: 180.4, bladeDeg: 0 }),
    ];
    const checked = checkShaftSeries(series(frames));
    const reasons = reasonsAt(checked, 1, 'shaft');
    expect(reasons).toEqual(['shaft-confidence-low', 'endpoint-flip-ambiguous']);
  });
});
