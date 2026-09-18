// The adapter. Its whole job is to lose nothing on the way across the seam, so the
// tests are about what survives: the two directed angles, the confidences, the model
// identity, and the difference between "no pose" and "a pose the model is guessing at".

import { describe, expect, it } from 'vitest';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { ShaftDetection } from '../shaftDetector';
import {
  MIN_LANDMARK_VISIBILITY,
  buildShaftSwingSeries,
  type DetectedFrame,
} from './fromDetection';

const IMAGE = { width: 1080, height: 1920 };

function detection(over: Partial<ShaftDetection> = {}): ShaftDetection {
  return {
    butt: { x: 400, y: 900, conf: 0.99 },
    hosel: { x: 700, y: 1400, conf: 0.98 },
    toe: null,
    heel: null,
    boxConf: 0.9,
    inferenceMs: 12,
    preprocessMs: 3,
    imageSize: IMAGE,
    provider: 'wasm',
    modelKeypoints: 2,
    ...over,
  };
}

/** 33 landmarks, all fully visible, normalised. */
function landmarks(visibility = 1): NormalizedLandmark[] {
  return Array.from({ length: 33 }, (_, i) => ({
    x: 0.5 + i / 1000,
    y: 0.4 + i / 1000,
    z: 0,
    visibility,
  })) as NormalizedLandmark[];
}

const IDENTITY = {
  clipName: 'clip.mp4',
  swingIndex: 1,
  cameraAngle: 'dtl' as const,
  modelFile: 'shaft-v2.onnx',
  producedAt: '2026-09-17T00:00:00.000Z',
};

function frames(): DetectedFrame[] {
  return [
    { tSec: 0.2, phase: 'backswing', phaseSource: 'envelope-impact', detection: detection(), landmarks: landmarks() },
    { tSec: 0.0, phase: 'address', phaseSource: 'envelope-impact', detection: detection(), landmarks: landmarks() },
  ];
}

describe('buildShaftSwingSeries', () => {
  it('sorts by time and carries the identity the detector does not know', () => {
    const s = buildShaftSwingSeries(frames(), IDENTITY);
    expect(s.frames.map((f) => f.tSec)).toEqual([0, 0.2]);
    expect(s.clipName).toBe('clip.mp4');
    expect(s.swingIndex).toBe(1);
    expect(s.cameraAngle).toBe('dtl');
    expect(s.producedAt).toBe('2026-09-17T00:00:00.000Z');
  });

  it('records which model produced it, by name and by keypoint count', () => {
    const s = buildShaftSwingSeries(frames(), IDENTITY);
    expect(s.model).toEqual({ file: 'shaft-v2.onnx', keypoints: 2, provider: 'wasm' });
  });

  it('computes both angles in the schema\'s directions: butt → hosel, heel → toe', () => {
    const four = detection({
      toe: { x: 760, y: 1420, conf: 0.4 },
      heel: { x: 700, y: 1400, conf: 0.3 },
      modelKeypoints: 4,
    });
    const s = buildShaftSwingSeries([{ tSec: 0, phase: 'top', phaseSource: 'envelope-impact', detection: four }], {
      ...IDENTITY,
      modelFile: 'shaft-v3.onnx',
    });
    const f = s.frames[0];
    // butt (400,900) → hosel (700,1400): atan2(500, 300).
    expect(f.shaftAngleDeg).toBeCloseTo((Math.atan2(500, 300) * 180) / Math.PI, 10);
    // heel (700,1400) → toe (760,1420): atan2(20, 60).
    expect(f.bladeAngleDeg).toBeCloseTo((Math.atan2(20, 60) * 180) / Math.PI, 10);
    expect(f.toe!.conf).toBe(0.4);
  });

  it('leaves an angle null when the model did not locate both of its points', () => {
    const s = buildShaftSwingSeries([{ tSec: 0, phase: 'top', phaseSource: 'envelope-impact', detection: detection() }], IDENTITY);
    expect(s.frames[0].bladeAngleDeg).toBeNull();
    expect(s.frames[0].toe).toBeNull();
    expect(s.frames[0].shaftAngleDeg).not.toBeNull();
  });

  it('scales landmarks into the frame\'s own pixel space', () => {
    const s = buildShaftSwingSeries([
      { tSec: 0, phase: 'top', phaseSource: 'envelope-impact', detection: detection(), landmarks: landmarks() },
    ], IDENTITY);
    // Landmark 11 is the left shoulder.
    expect(s.frames[0].body!.leftShoulder).toEqual({
      x: (0.5 + 11 / 1000) * IMAGE.width,
      y: (0.4 + 11 / 1000) * IMAGE.height,
    });
  });

  it('drops a landmark the model is not confident about, rather than trusting it', () => {
    const s = buildShaftSwingSeries([
      {
        tSec: 0,
        phase: 'top',
        phaseSource: 'envelope-impact',
        detection: detection(),
        landmarks: landmarks(MIN_LANDMARK_VISIBILITY - 0.01),
      },
    ], IDENTITY);
    expect(Object.values(s.frames[0].body!).every((v) => v === null)).toBe(true);
  });

  it('distinguishes no pose from an unconfident one', () => {
    const s = buildShaftSwingSeries([
      { tSec: 0, phase: 'top', phaseSource: 'envelope-impact', detection: detection(), landmarks: null },
    ], IDENTITY);
    expect(s.frames[0].body).toBeNull();
  });

  it('defaults producedAt to now when the caller does not pin it', () => {
    const rest = { ...IDENTITY };
    delete (rest as Partial<typeof IDENTITY>).producedAt;
    const s = buildShaftSwingSeries(frames(), rest);
    expect(Date.parse(s.producedAt)).not.toBeNaN();
  });

  it('refuses an empty swing', () => {
    expect(() => buildShaftSwingSeries([], IDENTITY)).toThrow(/no frames/);
  });

  it('refuses frames that disagree about the image size', () => {
    const odd = detection({ imageSize: { width: 720, height: 1280 } });
    expect(() =>
      buildShaftSwingSeries(
        [
          { tSec: 0, phase: 'address', phaseSource: 'envelope-impact', detection: detection() },
          { tSec: 0.1, phase: 'top', phaseSource: 'envelope-impact', detection: odd },
        ],
        IDENTITY,
      ),
    ).toThrow(/one pixel space/);
  });
});
