// The derived measurements. Two things are being pinned: the arithmetic, and — at
// least as importantly — that every value states what it assumed and comes back null
// and flagged when the assumption does not hold.

import { describe, expect, it } from 'vitest';
import { angleDeg } from './angles';
import {
  ACROSS_THE_LINE_SIGN,
  MEASUREMENT_ASSUMPTIONS,
  ON_PLANE_BAND_DEG,
  buildShaftMeasurements,
  type MeasurementId,
} from './derived';
import { checkShaftSeries } from './plausibility';
import {
  type BodyReference,
  type MeasurementPhase,
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
      -right.topShaftOrientation.value!.deviationDeg,
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

    it('calls the hand-read frame across-the-line, positive', () => {
      const m = topOf(REFERENCE_BUTT, REFERENCE_HOSEL);
      expect(m.value!.category).toBe('across-the-line');
      expect(m.value!.deviationDeg).toBeGreaterThan(0);
      expect(m.value!.deviationDeg).toBeCloseTo(77.0, 1);
    });

    it('calls its mirror laid-off, negative', () => {
      const m = topOf(mirror(REFERENCE_BUTT), mirror(REFERENCE_HOSEL));
      expect(m.value!.category).toBe('laid-off');
      expect(m.value!.deviationDeg).toBeLessThan(0);
      expect(m.value!.deviationDeg).toBeCloseTo(-77.0, 1);
    });

    it('no longer holds the category below `usable` on its own account', () => {
      const m = topOf(REFERENCE_BUTT, REFERENCE_HOSEL);
      expect(m.quality.level).toBe('usable');
      expect(m.quality.reasons).toEqual([]);
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
