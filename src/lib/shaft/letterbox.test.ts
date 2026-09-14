// Unit tests for the letterbox transform (letterbox.ts).
//
// The round trip is the point. A detector that letterboxes correctly but inverts
// the transform sloppily produces points that look right — stable, on the golfer,
// roughly shaft-shaped — and are wrong by the pad width in one axis. Nothing
// downstream can tell; the angle just quietly drifts. So every shape the app
// actually feeds it (portrait phone, landscape, already square, upscaled) is
// checked both ways.

import { describe, it, expect } from 'vitest';
import { computeLetterbox, imageToModel, modelToImage } from './letterbox';

const SIZE = 960;

/** The shapes this chain really sees: phone portrait, web landscape, square, small. */
const SHAPES: [number, number][] = [
  [1080, 1920],
  [720, 818],
  [1920, 1080],
  [960, 960],
  [640, 480],
  [321, 577],
];

describe('computeLetterbox', () => {
  it('preserves aspect ratio and fills one axis exactly', () => {
    for (const [w, h] of SHAPES) {
      const t = computeLetterbox(w, h, SIZE);
      expect(Math.max(t.drawWidth, t.drawHeight)).toBe(SIZE);
      // Aspect preserved to within the rounding of a single pixel.
      expect(t.drawWidth / t.drawHeight).toBeCloseTo(w / h, 2);
    }
  });

  it('centres the image, leaving padding on the short axis only', () => {
    const portrait = computeLetterbox(1080, 1920, SIZE);
    expect(portrait.padY).toBe(0);
    expect(portrait.padX).toBeGreaterThan(0);
    // Both sides padded: left pad + drawn width + right pad = the square.
    expect(portrait.padX * 2 + portrait.drawWidth).toBeGreaterThanOrEqual(SIZE - 1);

    const landscape = computeLetterbox(1920, 1080, SIZE);
    expect(landscape.padX).toBe(0);
    expect(landscape.padY).toBeGreaterThan(0);
  });

  it('scales up a source smaller than the square (Ultralytics scaleup=True)', () => {
    const t = computeLetterbox(480, 270, SIZE);
    expect(t.scale).toBeGreaterThan(1);
    expect(t.drawWidth).toBe(SIZE);
  });

  it('is a no-op transform for an already-square source', () => {
    const t = computeLetterbox(SIZE, SIZE, SIZE);
    expect(t).toMatchObject({ scale: 1, padX: 0, padY: 0, drawWidth: SIZE, drawHeight: SIZE });
  });

  it('rejects a degenerate source size', () => {
    expect(() => computeLetterbox(0, 100, SIZE)).toThrow();
    expect(() => computeLetterbox(100, -1, SIZE)).toThrow();
  });
});

describe('image ⇄ model round trip', () => {
  it('returns the original point for every shape and corner', () => {
    for (const [w, h] of SHAPES) {
      const t = computeLetterbox(w, h, SIZE);
      const points = [
        { x: 0, y: 0 },
        { x: w, y: h },
        { x: w / 2, y: h / 2 },
        { x: 1, y: h - 1 },
        { x: w * 0.37, y: h * 0.91 },
      ];
      for (const p of points) {
        const back = modelToImage(t, imageToModel(t, p));
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  it('maps the image corners onto the drawn rectangle inside the square', () => {
    const t = computeLetterbox(1080, 1920, SIZE);
    const topLeft = imageToModel(t, { x: 0, y: 0 });
    const bottomRight = imageToModel(t, { x: 1080, y: 1920 });
    expect(topLeft).toMatchObject({ x: t.padX, y: t.padY });
    expect(bottomRight.x).toBeCloseTo(t.padX + t.drawWidth, 0);
    expect(bottomRight.y).toBeCloseTo(t.padY + t.drawHeight, 0);
  });

  it('inverts the padding — not just the scale', () => {
    // The bug this module exists to prevent: dividing by the scale and forgetting
    // the pad. For a portrait frame the pad is ~210 px, so the two disagree hugely.
    const t = computeLetterbox(1080, 1920, SIZE);
    const modelPoint = { x: 480, y: 500 };
    const correct = modelToImage(t, modelPoint);
    const scaleOnly = { x: modelPoint.x / t.scale, y: modelPoint.y / t.scale };
    expect(Math.abs(correct.x - scaleOnly.x)).toBeGreaterThan(100);
    expect(correct.y).toBeCloseTo(scaleOnly.y, 6); // no padding on the long axis
  });

  it('keeps a shaft angle intact through the transform', () => {
    // A uniform scale plus a translation cannot change an angle; a stretch can.
    // This is the property the rules ultimately depend on.
    const t = computeLetterbox(1080, 1920, SIZE);
    const butt = { x: 400, y: 600 };
    const hosel = { x: 700, y: 1400 };
    const angle = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    expect(angle(imageToModel(t, butt), imageToModel(t, hosel))).toBeCloseTo(
      angle(butt, hosel),
      6,
    );
  });
});
