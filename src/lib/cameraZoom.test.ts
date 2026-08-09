// Harness for the wide-angle (0.5×) constraint.
//
// The thing worth guarding is not "we called applyConstraints" but the two ways
// this can go wrong on a real phone: a track whose zoom range does not reach 0.5
// (clamping, not a rejected constraint), and a track with no zoom at all — where
// the only correct behaviour is to leave the stream completely alone.

import { describe, expect, it, vi } from 'vitest';
import { applyCameraZoom, NORMAL_ZOOM, WIDE_ANGLE_ZOOM } from './cameraZoom';

interface FakeTrackOptions {
  zoom?: { min: number; max: number; step?: number };
  /** Zoom the track reports afterwards; defaults to what was requested. */
  reportedZoom?: number;
  reject?: string;
}

function fakeTrack(options: FakeTrackOptions) {
  let current = 1;
  const applyConstraints = vi.fn(async (constraints: unknown) => {
    if (options.reject) throw new Error(options.reject);
    const advanced = (constraints as { advanced?: Array<{ zoom?: number }> }).advanced;
    current = advanced?.[0]?.zoom ?? current;
  });

  return {
    label: 'Fake camera',
    applyConstraints,
    getCapabilities: () => (options.zoom ? { zoom: options.zoom } : {}),
    getSettings: () => ({ zoom: options.reportedZoom ?? current }),
  } as unknown as MediaStreamTrack & { applyConstraints: typeof applyConstraints };
}

describe('applyCameraZoom', () => {
  it('applies 0.5× when wide angle is on', async () => {
    const track = fakeTrack({ zoom: { min: 0.5, max: 10, step: 0.1 } });

    const outcome = await applyCameraZoom(track, true);

    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ zoom: WIDE_ANGLE_ZOOM }],
    });
    expect(outcome).toEqual({
      status: 'applied',
      requested: WIDE_ANGLE_ZOOM,
      actual: WIDE_ANGLE_ZOOM,
    });
  });

  it('applies 1× when wide angle is off', async () => {
    const track = fakeTrack({ zoom: { min: 0.5, max: 10 } });

    const outcome = await applyCameraZoom(track, false);

    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ zoom: NORMAL_ZOOM }],
    });
    expect(outcome).toMatchObject({ status: 'applied', requested: NORMAL_ZOOM });
  });

  it('clamps to the capability range instead of asking for an impossible zoom', async () => {
    // A phone without an ultra-wide lens: the widest it goes is 1×.
    const track = fakeTrack({ zoom: { min: 1, max: 5 } });

    const outcome = await applyCameraZoom(track, true);

    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 1 }] });
    expect(outcome).toMatchObject({ status: 'applied', requested: 1 });
  });

  it('touches nothing when the track reports no zoom capability', async () => {
    const track = fakeTrack({});

    const outcome = await applyCameraZoom(track, true);

    expect(track.applyConstraints).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'unsupported' });
  });

  it('reports the value the track actually settled on, not the one we asked for', async () => {
    // Safari may accept the constraint and keep a different lens — the whole point
    // of logging `actual` is that this case is visible in the field.
    const track = fakeTrack({ zoom: { min: 0.5, max: 10 }, reportedZoom: 1 });

    const outcome = await applyCameraZoom(track, true);

    expect(outcome).toEqual({ status: 'applied', requested: 0.5, actual: 1 });
  });

  it('survives a rejected constraint', async () => {
    const track = fakeTrack({ zoom: { min: 0.5, max: 10 }, reject: 'OverconstrainedError' });

    const outcome = await applyCameraZoom(track, true);

    expect(outcome).toMatchObject({ status: 'failed', requested: 0.5 });
  });
});
