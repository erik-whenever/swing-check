// The derived measurements. Two things are being pinned: the arithmetic, and — at
// least as importantly — that every value states what it assumed and comes back null
// and flagged when the assumption does not hold.

import { describe, expect, it } from 'vitest';
import { angleDeg } from './angles';
import {
  ACROSS_THE_LINE_SIGN,
  MEASUREMENT_ASSUMPTIONS,
  NEAR_VERTICAL_GATE_DEG,
  ON_PLANE_BAND_DEG,
  buildShaftMeasurements,
  type MeasurementId,
} from './derived';
import { checkShaftSeries } from './plausibility';
import {
  type BodyReference,
  type MeasurementPhase,
  type PhaseSource,
  type ShaftFrameSample,
  type ShaftSwingSeries,
} from './shaftSeries';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const IMAGE = { width: 1080, height: 1920 };
const CONF = 0.99;

/** Torso of 400 px: shoulders at y=700, hips at y=1100, both centred on x=540. */
function body(): BodyReference {
  return {
    leftShoulder: { x: 500, y: 700 },
    rightShoulder: { x: 580, y: 700 },
    leftHip: { x: 510, y: 1100 },
    rightHip: { x: 570, y: 1100 },
    leftWrist: { x: 540, y: 950 },
    rightWrist: { x: 550, y: 950 },
  };
}
const TORSO_PX = 400;
const HIP_MID = { x: 540, y: 1100 };

interface Spec {
  tSec: number;
  phase: MeasurementPhase;
  /**
   * Defaults to `observed`, and that default is load-bearing for the rest of the file:
   * a top-anchored measurement only answers with a number when the `top` was observed
   * (`topFrame` in `derived.ts`), so every fixture that pins arithmetic has to say a
   * human or a detector saw the phase. The cases where it did not are pinned in
   * *Fasens förtroende* below, and they set this explicitly.
   */
  phaseSource?: PhaseSource;
  /** Shaft LINE tilt on screen, degrees, anticlockwise-up (the human convention). */
  tiltDeg: number;
  /** Where the butt sits, image px. The hosel follows from the tilt. */
  butt?: { x: number; y: number };
  withBody?: boolean;
  conf?: number;
}

function frame(spec: Spec): ShaftFrameSample {
  const butt = { ...(spec.butt ?? { x: 400, y: 900 }), conf: spec.conf ?? CONF };
  // Screen tilt → image direction: y grows downward, so the sign flips.
  const rad = (-spec.tiltDeg * Math.PI) / 180;
  const hosel = {
    x: butt.x + Math.cos(rad) * 600,
    y: butt.y + Math.sin(rad) * 600,
    conf: spec.conf ?? CONF,
  };
  return {
    tSec: spec.tSec,
    phase: spec.phase,
    phaseSource: spec.phaseSource ?? 'observed',
    butt,
    hosel,
    toe: null,
    heel: null,
    shaftAngleDeg: angleDeg(butt, hosel),
    bladeAngleDeg: null,
    body: spec.withBody === false ? null : body(),
  };
}

function series(
  frames: ShaftFrameSample[],
  cameraAngle: ShaftSwingSeries['cameraAngle'] = 'dtl',
): ShaftSwingSeries {
  return {
    clipName: 'fixture.mp4',
    swingIndex: 0,
    cameraAngle,
    imageSize: IMAGE,
    model: { file: 'shaft-test.onnx', keypoints: 2 },
    frames,
    producedAt: '2026-09-17T00:00:00.000Z',
  };
}

/** A backswing that crosses horizontal at t = 0.2, tops out, then comes down. */
function swing(topTilt = 0): ShaftFrameSample[] {
  return [
    frame({ tSec: 0.0, phase: 'address', tiltDeg: -75 }),
    frame({ tSec: 0.1, phase: 'backswing', tiltDeg: -40 }),
    frame({ tSec: 0.2, phase: 'backswing', tiltDeg: -3 }),
    frame({ tSec: 0.3, phase: 'backswing', tiltDeg: 35 }),
    frame({ tSec: 0.4, phase: 'top', tiltDeg: topTilt + 4 }),
    frame({ tSec: 0.5, phase: 'top', tiltDeg: topTilt }),
    frame({ tSec: 0.6, phase: 'downswing', tiltDeg: 30 }),
    frame({ tSec: 0.7, phase: 'downswing', tiltDeg: -10 }),
    frame({ tSec: 0.8, phase: 'downswing', tiltDeg: -50 }),
    frame({ tSec: 0.9, phase: 'impact', tiltDeg: -72 }),
  ];
}

function build(frames: ShaftFrameSample[], cameraAngle: ShaftSwingSeries['cameraAngle'] = 'dtl') {
  return buildShaftMeasurements(checkShaftSeries(series(frames, cameraAngle)), {
    handedness: 'right',
  });
}

// ── The assumption table ─────────────────────────────────────────────────────

describe('MEASUREMENT_ASSUMPTIONS', () => {
  it('declares every measurement a projection, and names what it projects', () => {
    for (const [id, a] of Object.entries(MEASUREMENT_ASSUMPTIONS)) {
      expect(a.projection, id).toBe(true);
      expect(a.projectionOf, id).toBeTruthy();
    }
  });

  it('leans on no sole point anywhere — that is the blade decision, as data', () => {
    for (const [id, a] of Object.entries(MEASUREMENT_ASSUMPTIONS)) {
      expect(a.requiresPoints, id).not.toContain('toe');
      expect(a.requiresPoints, id).not.toContain('heel');
    }
  });

  it('travels with every measurement the builder produces', () => {
    const set = build(swing());
    const measurements = [
      set.shaftAngleByPhase,
      set.shaftPositionAtP2,
      set.shaftPositionAtP4,
      set.topShaftOrientation,
      set.clubheadPath,
      set.swingPlaneTilt,
    ];
    expect(measurements).toHaveLength(Object.keys(MEASUREMENT_ASSUMPTIONS).length);
    for (const m of measurements) {
      expect(m.assumes).toBe(MEASUREMENT_ASSUMPTIONS[m.id as MeasurementId]);
    }
  });
});

// ── Shaft angle per phase ────────────────────────────────────────────────────

describe('shaft angle by phase', () => {
  it('reports one directed angle per phase present, and only those', () => {
    const value = build(swing()).shaftAngleByPhase.value!;
    expect(Object.keys(value).sort()).toEqual(['address', 'backswing', 'downswing', 'impact', 'top']);
    expect(value.backswing!.n).toBe(3);
    // The medoid of the three backswing frames is the middle one (-40, -3, 35 on screen
    // → 40, 3, -35 in the image convention).
    expect(value.backswing!.medianDeg).toBeCloseTo(3, 6);
    expect(value.address!.n).toBe(1);
  });

  it('marks a phase `uncertain` when any contributing frame was', () => {
    const frames = swing();
    frames[1] = frame({ tSec: 0.1, phase: 'backswing', tiltDeg: -40, conf: 0.4 });
    const m = build(frames).shaftAngleByPhase;
    expect(m.value!.backswing!.level).toBe('uncertain');
    expect(m.value!.top!.level).toBe('usable');
    expect(m.quality.level).toBe('uncertain');
  });

  it('is rejected, not empty, when nothing survived the check', () => {
    const frames = swing().map((f) => ({ ...f, butt: null, shaftAngleDeg: null }));
    const m = build(frames).shaftAngleByPhase;
    expect(m.value).toBeNull();
    expect(m.quality).toEqual({ level: 'rejected', reasons: ['no-usable-frames'] });
  });

  it('is computable from face-on too — the angle is not a down-the-line measurement', () => {
    expect(build(swing(), 'face-on').shaftAngleByPhase.value).not.toBeNull();
  });
});

// ── P2 and P4 ────────────────────────────────────────────────────────────────

describe('shaft position at P2', () => {
  it('picks the backswing frame closest to horizontal, not the top', () => {
    const m = build(swing()).shaftPositionAtP2;
    expect(m.value!.tSec).toBe(0.2);
    expect(m.value!.orientationDeg).toBeCloseTo(-3, 6);
  });

  it('places the shaft in torso lengths from the mid-hip', () => {
    const v = build(swing()).shaftPositionAtP2.value!;
    // The butt sits at (400, 900) on every fixture frame.
    expect(v.butt.u).toBeCloseTo((400 - HIP_MID.x) / TORSO_PX, 6);
    expect(v.butt.v).toBeCloseTo((900 - HIP_MID.y) / TORSO_PX, 6);
    // v is negative because the butt is ABOVE the hips and image y grows downward.
    expect(v.butt.v).toBeLessThan(0);
  });

  it('is rejected outright from face-on, where the instant is foreshortened', () => {
    const m = build(swing(), 'face-on').shaftPositionAtP2;
    expect(m.value).toBeNull();
    expect(m.quality).toEqual({ level: 'rejected', reasons: ['camera-angle-mismatch'] });
  });

  it('is computed but marked `uncertain` when the view is simply not known', () => {
    // Mismatch and unknown are different failures — the value might be right here.
    const m = build(swing(), null).shaftPositionAtP2;
    expect(m.value).not.toBeNull();
    expect(m.quality.level).toBe('uncertain');
    expect(m.quality.reasons).toEqual(['camera-angle-unknown']);
  });

  it('is rejected when no frame carries the backswing phase', () => {
    const m = build(swing().filter((f) => f.phase !== 'backswing')).shaftPositionAtP2;
    expect(m.value).toBeNull();
    expect(m.quality.reasons).toContain('phase-missing');
  });

  it('is rejected when the pose is missing, rather than defaulting a body frame', () => {
    const frames = swing().map((f) => ({ ...f, body: null }));
    const m = build(frames).shaftPositionAtP2;
    expect(m.value).toBeNull();
    expect(m.quality.reasons).toContain('body-reference-missing');
  });
});

describe('shaft position at P4', () => {
  it('takes the LAST frame the phase labelling calls top', () => {
    const m = build(swing()).shaftPositionAtP4;
    expect(m.value!.tSec).toBe(0.5);
    expect(m.frameIndices).toEqual([5]);
  });

  it('is rejected when the swing has no top frame', () => {
    const m = build(swing().filter((f) => f.phase !== 'top')).shaftPositionAtP4;
    expect(m.value).toBeNull();
    expect(m.quality.reasons).toContain('phase-missing');
  });
});

// ── Fasens förtroende ────────────────────────────────────────────────────────

// WHAT THESE PIN, AND WHY THEY ARE WORTH A BLOCK OF THEIR OWN.
//
// S-23 took the 22 frames the production path picks as `top` and had them read by eye:
// 13 of them were not the top (docs/shaft/phase-audit/resultat.md). None was flagged,
// because `plausibility.ts` checks whether the POINTS are plausible and has nothing to
// say about whether the MOMENT is. Three spikes (S-27, S-28, S-29) then failed to
// recover the top from the shaft signal, so nothing derived can stand in for it.
//
// The rule these tests hold in place: a measurement anchored at the top answers with a
// number when — and only when — the `top` was observed. Everything else comes back null
// with `top-phase-not-observed`, which is a different absence from `phase-missing` and
// says so.
describe('a top nobody observed', () => {
  /** The same swing, with the `top` frames' phase derived rather than seen. */
  const derivedTop = (source: PhaseSource) =>
    swing().map((f) => (f.phase === 'top' ? { ...f, phaseSource: source } : f));

  describe.each([['envelope-fallback'], ['envelope-impact']] as const)(
    'from %s',
    (source: PhaseSource) => {
      it('gives shaft-position-p4 no number at all', () => {
        const m = build(derivedTop(source)).shaftPositionAtP4;
        expect(m.value).toBeNull();
        expect(m.quality.level).toBe('rejected');
        expect(m.quality.reasons).toContain('top-phase-not-observed');
        // Not the same absence as a swing with no top frame, and the flag says which.
        expect(m.quality.reasons).not.toContain('phase-missing');
        // The frames it declined to read are named, so a caller can say which.
        expect(m.frameIndices).toEqual([4, 5]);
      });

      it('gives top-shaft-orientation no category and no deviation', () => {
        const m = build(derivedTop(source)).topShaftOrientation;
        expect(m.value).toBeNull();
        expect(m.quality.reasons).toContain('top-phase-not-observed');
        expect(m.frameIndices).toEqual([4, 5]);
      });

      it('drops the `top` bucket from shaft-angle-by-phase and keeps the rest', () => {
        const m = build(derivedTop(source)).shaftAngleByPhase;
        expect(Object.keys(m.value!).sort()).toEqual([
          'address',
          'backswing',
          'downswing',
          'impact',
        ]);
        expect(m.value!.top).toBeUndefined();
        expect(m.quality.reasons).toContain('top-phase-not-observed');
        // The other buckets are untouched, values and all — the rule is about the top.
        expect(m.value!.backswing!.n).toBe(3);
        expect(m.value!.backswing!.medianDeg).toBeCloseTo(3, 6);
      });
    },
  );

  it('is a different reason from a swing that has no top frame at all', () => {
    const none = build(swing().filter((f) => f.phase !== 'top')).shaftPositionAtP4;
    expect(none.quality.reasons).toContain('phase-missing');
    expect(none.quality.reasons).not.toContain('top-phase-not-observed');
    expect(none.frameIndices).toEqual([]);
  });

  it('reads the LAST observed top, not the last top', () => {
    // t = 0.4 observed, t = 0.5 derived. The later frame is not a better reading of the
    // top, it is an unverified one — so the earlier, observed frame is what is measured.
    const frames = swing();
    frames[5] = frame({ tSec: 0.5, phase: 'top', tiltDeg: 0, phaseSource: 'envelope-impact' });
    const m = build(frames).shaftPositionAtP4;
    expect(m.value!.tSec).toBe(0.4);
    expect(m.frameIndices).toEqual([4]);
  });

  it('still answers with a number when the top WAS observed', () => {
    // The control on every assertion above: the gate is the phase's provenance and
    // nothing else. Same swing, same pixels, `observed` — and every top-anchored value
    // is back.
    const set = build(swing(ON_PLANE_BAND_DEG + 5));
    expect(set.shaftPositionAtP4.value!.tSec).toBe(0.5);
    expect(set.shaftPositionAtP4.quality.level).toBe('usable');
    expect(set.topShaftOrientation.value!.category).toBe('across-the-line');
    expect(set.topShaftOrientation.value!.deviationDeg).not.toBeNull();
    expect(set.shaftAngleByPhase.value!.top!.n).toBe(2);
    for (const m of [set.shaftPositionAtP4, set.topShaftOrientation, set.shaftAngleByPhase]) {
      expect(m.quality.reasons).not.toContain('top-phase-not-observed');
    }
  });

  it('treats a series with no phaseSource at all as unobserved, never as observed', () => {
    // A series JSON-parsed from a file written before the field existed. `undefined` has
    // to fail closed: the record does not say who saw the phase, so nobody did.
    const frames = swing().map((f) =>
      f.phase === 'top' ? ({ ...f, phaseSource: undefined } as unknown as ShaftFrameSample) : f,
    );
    expect(build(frames).topShaftOrientation.value).toBeNull();
    expect(build(frames).topShaftOrientation.quality.reasons).toContain('top-phase-not-observed');
  });
});

// ── Across-the-line vs laid-off ──────────────────────────────────────────────

describe('top shaft orientation', () => {
  it('splits across-the-line, on-plane and laid-off around the band', () => {
    const at = (tilt: number) => build(swing(tilt)).topShaftOrientation.value!;
    expect(at(ON_PLANE_BAND_DEG + 5).category).toBe('across-the-line');
    expect(at(0).category).toBe('on-plane');
    expect(at(-(ON_PLANE_BAND_DEG + 5)).category).toBe('laid-off');
    // Just inside the band is on-plane, just outside is not. The exact edge is left
    // untested on purpose: the tilt is reconstructed through two trig calls and lands
    // within a float of the boundary, so an edge assertion would pin rounding, not
    // behaviour.
    expect(at(ON_PLANE_BAND_DEG - 0.1).category).toBe('on-plane');
    expect(at(ON_PLANE_BAND_DEG + 0.1).category).toBe('across-the-line');
  });

  it('mirrors for a left-handed player', () => {
    const checked = checkShaftSeries(series(swing(20)));
    const right = buildShaftMeasurements(checked, { handedness: 'right' });
    const left = buildShaftMeasurements(checked, { handedness: 'left' });
    expect(right.topShaftOrientation.value!.category).toBe('across-the-line');
    expect(left.topShaftOrientation.value!.category).toBe('laid-off');
    expect(left.topShaftOrientation.value!.deviationDeg).toBeCloseTo(
      -right.topShaftOrientation.value!.deviationDeg!,
      6,
    );
    expect(ACROSS_THE_LINE_SIGN.right).toBe(-ACROSS_THE_LINE_SIGN.left);
  });

  // The sign convention itself, pinned on geometry rather than on a tilt argument.
  //
  // `ACROSS_THE_LINE_SIGN` was a stated convention until it was checked against
  // `049-88216ea7_s00_f05` (batch-03, `dtl`, right-handed), a top of the backswing Erik
  // read by eye as slightly across the line. The two cases below carry that frame's own
  // pixels and their mirror image, so they fail if the table is flipped — which is the
  // only thing standing between this measurement and a confidently inverted label.
  //
  // ONE FRAME, AND ONLY THE ACROSS-THE-LINE HALF OF IT. The laid-off case is the mirror
  // by construction; nobody has read a laid-off top by eye. See `ACROSS_THE_LINE_SIGN`.
  describe('the sign convention, against the reference frame', () => {
    const REFERENCE_IMAGE = { width: 460, height: 854 };
    /** The reference frame's own detection: club end up and to the RIGHT of the grip. */
    const REFERENCE_BUTT = { x: 126.027, y: 194.819 };
    const REFERENCE_HOSEL = { x: 155.474, y: 67.021 };
    /** Mirrored about the image's vertical: club end up and to the LEFT. */
    const mirror = (p: { x: number; y: number }) => ({ x: REFERENCE_IMAGE.width - p.x, y: p.y });

    function topOf(butt: { x: number; y: number }, hosel: { x: number; y: number }) {
      const b = { ...butt, conf: CONF };
      const h = { ...hosel, conf: CONF };
      const top: ShaftFrameSample = {
        tSec: 0.5,
        phase: 'top',
        phaseSource: 'observed',
        butt: b,
        hosel: h,
        toe: null,
        heel: null,
        shaftAngleDeg: angleDeg(b, h),
        bladeAngleDeg: null,
        body: body(),
      };
      const checked = checkShaftSeries({
        ...series([top]),
        imageSize: REFERENCE_IMAGE,
      });
      return buildShaftMeasurements(checked, { handedness: 'right' }).topShaftOrientation;
    }

    // THE GATE SWALLOWED THE REFERENCE, AND THAT IS THE POINT.
    //
    // The frame the sign convention was born from sits 77.0° from the horizontal — 13.0°
    // from the fold — and `NEAR_VERTICAL_GATE_DEG` is 16. So the measurement no longer
    // calls it either way, and the two assertions that used to pin `across-the-line` on
    // these pixels now pin `cannot-determine` on them instead. Nothing about the sign
    // changed; what changed is that this frame is no longer considered answerable, which
    // is precisely what the blind round found about frames at this tilt.
    //
    // The convention itself is pinned further down, on hand-read frames that lie OUTSIDE
    // the gate — stronger evidence than this one ever was, and on both directions.
    it('now refuses the reference frame: it sits inside the near-vertical gate', () => {
      const m = topOf(REFERENCE_BUTT, REFERENCE_HOSEL);
      expect(m.value!.category).toBe('cannot-determine');
      expect(m.value!.deviationDeg).toBeNull();
      expect(m.value!.distanceToVerticalDeg).toBeCloseTo(13.0, 1);
      expect(m.quality.reasons).toContain('top-shaft-near-vertical');
    });

    it('refuses its mirror too, at the same distance from vertical', () => {
      const m = topOf(mirror(REFERENCE_BUTT), mirror(REFERENCE_HOSEL));
      expect(m.value!.category).toBe('cannot-determine');
      expect(m.value!.deviationDeg).toBeNull();
      expect(m.value!.distanceToVerticalDeg).toBeCloseTo(13.0, 1);
    });

    it('does not downgrade the flag on the gate\'s account', () => {
      // `cannot-determine` is a finding, not a doubt: the level still reflects only the
      // camera gate and the frame's own flag, and the reason carries the rest.
      const m = topOf(REFERENCE_BUTT, REFERENCE_HOSEL);
      expect(m.quality.level).toBe('usable');
      expect(m.quality.reasons).toEqual(['top-shaft-near-vertical']);
    });
  });

  // ── The blind round ────────────────────────────────────────────────────────
  //
  // Eleven down-the-line tops read by eye with the computed values hidden
  // (`docs/shaft/across-sign-blind.md`, scored in `docs/shaft/across-sign-result.md`).
  // Each case below carries the frame's own `butt`/`hosel` out of
  // `data/shaft/training/batch-0*/prelabel.xml`, so these run the real detector output
  // through the real path. Flip `ACROSS_THE_LINE_SIGN` and the direction cases fail.
  //
  // The twelfth judged frame, `img-3641-adde195e_s00_f02`, is deliberately absent: the eye
  // refused it because it is a follow-through wearing a derived `top` label, which is a
  // phase problem and not a measurement limit. It belongs to the phase work, not here.
  describe('the blind round', () => {
    interface Judged {
      id: string;
      image: { width: number; height: number };
      butt: { x: number; y: number };
      hosel: { x: number; y: number };
      /** What the eye said, with the numbers hidden. */
      eye: 'across' | 'laid-off' | 'too-near-vertical';
    }

    /** Called by eye, and far enough from the fold that the gate lets the call stand. */
    const CALLED_OUTSIDE_GATE: Judged[] = [
      {
        id: 'img-4949-218bb1b6_s00_f02',
        image: { width: 720, height: 1280 },
        butt: { x: 179.54, y: 507.23 },
        hosel: { x: 139.62, y: 370.33 },
        eye: 'laid-off',
      },
      {
        id: 'img-5425-f0abd4a8_s02_f02',
        image: { width: 720, height: 1280 },
        butt: { x: 181.36, y: 362.98 },
        hosel: { x: 144.51, y: 235.67 },
        eye: 'laid-off',
      },
      {
        id: '090-971827ab_s03_f03',
        image: { width: 1080, height: 1920 },
        butt: { x: 218.78, y: 778.33 },
        hosel: { x: 254.22, y: 757.4 },
        eye: 'across',
      },
    ];

    /**
     * Called by eye, but nearer the fold than the gate allows. The gate wins on purpose:
     * the eye could read these two, and at 10,9° and 11,1° from vertical it could not read
     * others, so the call is not reproducible at that tilt. Refusing them is the
     * conservative direction `NEAR_VERTICAL_GATE_DEG` was chosen for.
     */
    const CALLED_INSIDE_GATE: Judged[] = [
      {
        id: '082-a6b3c908_s01_f02',
        image: { width: 1080, height: 1920 },
        butt: { x: 286.39, y: 689.06 },
        hosel: { x: 250.81, y: 503.68 },
        eye: 'laid-off',
      },
      {
        id: '049-88216ea7_s00_f04',
        image: { width: 460, height: 854 },
        butt: { x: 132.75, y: 190.34 },
        hosel: { x: 159.38, y: 54.78 },
        eye: 'across',
      },
    ];

    /** Refused by eye as too near vertical — and inside the gate, so refused here too. */
    const REFUSED_BY_EYE_AND_GATE: Judged[] = [
      {
        id: 'img-5385-1f59ec8d_s00_f01',
        image: { width: 720, height: 1280 },
        butt: { x: 210.78, y: 213.81 },
        hosel: { x: 219.62, y: 178.79 },
        eye: 'too-near-vertical',
      },
      {
        id: '045-224bdedb_s00_f01',
        image: { width: 1080, height: 1920 },
        butt: { x: 418.74, y: 732.8 },
        hosel: { x: 413.07, y: 691.26 },
        eye: 'too-near-vertical',
      },
      {
        id: 'img-1558-8e59ca37_s02_f03',
        image: { width: 720, height: 1280 },
        butt: { x: 199.02, y: 492.23 },
        hosel: { x: 184.89, y: 408.03 },
        eye: 'too-near-vertical',
      },
      {
        id: '032-dc66dfc3_s00_f02',
        image: { width: 1080, height: 1920 },
        butt: { x: 321.19, y: 454.48 },
        hosel: { x: 269.28, y: 134.68 },
        eye: 'too-near-vertical',
      },
    ];

    function orientationOf(j: Judged) {
      const b = { ...j.butt, conf: CONF };
      const h = { ...j.hosel, conf: CONF };
      const top: ShaftFrameSample = {
        tSec: 0.5,
        phase: 'top',
        phaseSource: 'observed',
        butt: b,
        hosel: h,
        toe: null,
        heel: null,
        shaftAngleDeg: angleDeg(b, h),
        bladeAngleDeg: null,
        body: body(),
      };
      const checked = checkShaftSeries({ ...series([top]), imageSize: j.image });
      return buildShaftMeasurements(checked, { handedness: 'right' }).topShaftOrientation;
    }

    it.each(CALLED_OUTSIDE_GATE)('agrees with the eye on $id', (j) => {
      const m = orientationOf(j);
      expect(m.value!.category).toBe(j.eye === 'across' ? 'across-the-line' : 'laid-off');
      expect(m.value!.deviationDeg).not.toBeNull();
      expect(Math.sign(m.value!.deviationDeg!)).toBe(j.eye === 'across' ? 1 : -1);
      expect(m.value!.distanceToVerticalDeg).toBeGreaterThan(NEAR_VERTICAL_GATE_DEG);
    });

    it.each(CALLED_INSIDE_GATE)('refuses $id although the eye called it', (j) => {
      const m = orientationOf(j);
      expect(m.value!.category).toBe('cannot-determine');
      expect(m.value!.deviationDeg).toBeNull();
      expect(m.value!.distanceToVerticalDeg).toBeLessThanOrEqual(NEAR_VERTICAL_GATE_DEG);
      expect(m.quality.reasons).toContain('top-shaft-near-vertical');
    });

    it.each(REFUSED_BY_EYE_AND_GATE)('refuses $id, as the eye did', (j) => {
      const m = orientationOf(j);
      expect(m.value!.category).toBe('cannot-determine');
      expect(m.value!.deviationDeg).toBeNull();
      expect(m.quality.reasons).toContain('top-shaft-near-vertical');
    });

    /**
     * THE ONE THE GATE MISSES, AND IT IS IN THE SUITE ON PURPOSE.
     *
     * `img-5384-acea6a74_s00_f02` sits 16,076° from the vertical. The eye refused it; the
     * gate at 16 lets it through by 0,076°. That is not a rounding accident to be nudged
     * away — it is the overlap the blind round measured, in one frame: the same tilt was
     * called by eye on one frame and refused on another, so no threshold reproduces the
     * eye, and moving the gate to catch this one would swallow two frames the eye DID
     * call. The case is pinned so that the miss is visible and deliberate rather than
     * discovered later as a surprise.
     */
    it('lets the shallowest refused frame through, by 0.076°', () => {
      const m = orientationOf({
        id: 'img-5384-acea6a74_s00_f02',
        image: { width: 720, height: 1280 },
        butt: { x: 299.39, y: 224.71 },
        hosel: { x: 287.39, y: 183.07 },
        eye: 'too-near-vertical',
      });
      expect(m.value!.distanceToVerticalDeg).toBeCloseTo(16.076, 2);
      expect(m.value!.distanceToVerticalDeg).toBeGreaterThan(NEAR_VERTICAL_GATE_DEG);
      expect(m.value!.category).toBe('laid-off');
    });

    /**
     * The known blind spot at the OTHER end, carried as a test so it stays known.
     * `040-42b11ae6_s00_f03` has the shaft 2,1° from the horizontal — the club parallel to
     * the ground — where across/laid-off is decided in the horizontal plane and a 2D tilt
     * cannot carry it. The eye called it `laid-off`; the measurement says `on-plane` and
     * asserts no direction. `ON_PLANE_BAND_DEG` is what keeps it honest there, and it is
     * untouched: one frame is not grounds for moving a threshold.
     */
    it('still answers on-plane, not a direction, at the horizontal end', () => {
      const m = orientationOf({
        id: '040-42b11ae6_s00_f03',
        image: { width: 1080, height: 1920 },
        butt: { x: 459.41, y: 700.84 },
        hosel: { x: 400.48, y: 702.96 },
        eye: 'laid-off',
      });
      expect(m.value!.category).toBe('on-plane');
      expect(m.value!.deviationDeg).toBeCloseTo(2.06, 1);
      expect(m.value!.distanceToVerticalDeg).toBeGreaterThan(NEAR_VERTICAL_GATE_DEG);
    });
  });

  it('is rejected when nobody said which way round the player stands', () => {
    const m = buildShaftMeasurements(checkShaftSeries(series(swing())), {}).topShaftOrientation;
    expect(m.value).toBeNull();
    expect(m.quality.reasons).toContain('handedness-unknown');
  });

  it('is rejected from face-on', () => {
    const m = build(swing(20), 'face-on').topShaftOrientation;
    expect(m.value).toBeNull();
    expect(m.quality.reasons).toEqual(['camera-angle-mismatch']);
  });
});

// ── Clubhead path ────────────────────────────────────────────────────────────

describe('clubhead path', () => {
  it('tracks the HOSEL, in body units, in time order, with its phase', () => {
    const m = build(swing()).clubheadPath;
    expect(m.value).toHaveLength(10);
    expect(m.value!.map((p) => p.tSec)).toEqual(swing().map((f) => f.tSec));
    expect(m.value![0].phase).toBe('address');
    const first = swing()[0];
    expect(m.value![0].u).toBeCloseTo((first.hosel!.x - HIP_MID.x) / TORSO_PX, 6);
  });

  it('skips the frames with no pose and says that it did', () => {
    const frames = swing();
    frames[3] = { ...frames[3], body: null };
    const m = build(frames).clubheadPath;
    expect(m.value).toHaveLength(9);
    expect(m.quality.level).toBe('uncertain');
    expect(m.quality.reasons).toContain('body-reference-missing');
  });
});

// ── Swing plane tilt ─────────────────────────────────────────────────────────

describe('swing plane tilt', () => {
  it('fits the backswing and the downswing separately', () => {
    const m = build(swing()).swingPlaneTilt;
    expect(m.value!.backswing!.n).toBe(3);
    expect(m.value!.downswing!.n).toBe(3);
    expect(m.value!.backswing!.tiltDeg).toBeGreaterThan(-90);
    expect(m.value!.backswing!.rmsResidualTorsoLengths).toBeGreaterThanOrEqual(0);
  });

  it('reports the tilt of a hand-built straight path exactly', () => {
    // Four hosel positions on a 45°-up line on screen. The butt is moved rather than
    // the tilt so the hosel traces a known straight track.
    const frames: ShaftFrameSample[] = [0, 1, 2, 3].map((i) =>
      frame({
        tSec: i * 0.1,
        phase: 'backswing',
        tiltDeg: 0,
        butt: { x: 300 + i * 50, y: 1000 - i * 50 },
      }),
    );
    const fit = build(frames).swingPlaneTilt.value!.backswing!;
    expect(fit.tiltDeg).toBeCloseTo(45, 6);
    expect(fit.rmsResidualTorsoLengths).toBeCloseTo(0, 10);
  });

  it('marks the value `uncertain` when only one of the two halves could be fitted', () => {
    const m = build(swing().filter((f) => f.phase !== 'downswing')).swingPlaneTilt;
    expect(m.value!.backswing).not.toBeNull();
    expect(m.value!.downswing).toBeNull();
    expect(m.quality.level).toBe('uncertain');
    expect(m.quality.reasons).toContain('insufficient-frames');
  });

  it('is rejected when neither half has enough points to be a line', () => {
    const frames = swing().filter((f) => f.phase === 'top' || f.phase === 'address');
    const m = build(frames).swingPlaneTilt;
    expect(m.value).toBeNull();
    expect(m.quality.reasons).toContain('insufficient-frames');
  });
});

// ── The gate is not optional ─────────────────────────────────────────────────

describe('the measurement set', () => {
  it('carries the model identity and the check\'s verdict alongside the values', () => {
    const set = build(swing());
    expect(set.model).toEqual({ file: 'shaft-test.onnx', keypoints: 2 });
    expect(set.cameraAngle).toBe('dtl');
    expect(set.handedness).toBe('right');
    expect(set.clipName).toBe('fixture.mp4');
  });

  it('exposes no blade-derived value at all', () => {
    const set = build(swing());
    expect(Object.keys(set).some((k) => k.toLowerCase().includes('blade'))).toBe(false);
  });
});
