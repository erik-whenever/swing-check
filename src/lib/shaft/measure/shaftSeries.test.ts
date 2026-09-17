// The raw data layer carries no behaviour, so there is only one thing worth testing:
// that the phase set it redeclares has not drifted from the one the rest of the shaft
// track uses, and that the layer really is plain data.

import { describe, expect, it } from 'vitest';
import { SHAFT_PHASES } from '../../dataset/datasetTypes';
import {
  BODY_LANDMARK_NAMES,
  MEASUREMENT_PHASES,
  SHAFT_KEYPOINT_NAMES,
  emptyBodyReference,
} from './shaftSeries';

describe('MeasurementPhase', () => {
  it('is the annotation spec\'s eight phases, in swing order, identical to ShaftPhase', () => {
    // The duplication is deliberate — `datasetTypes.ts` is DEV-ONLY and reads
    // `import.meta.env` at module scope, and the raw layer must stay free of build
    // constants. This assertion is what keeps the copy honest.
    expect([...MEASUREMENT_PHASES]).toEqual([...SHAFT_PHASES]);
  });
});

describe('the fixed orders', () => {
  it('keeps the schema\'s keypoint order: butt → hosel → toe → heel', () => {
    expect([...SHAFT_KEYPOINT_NAMES]).toEqual(['butt', 'hosel', 'toe', 'heel']);
  });

  it('carries six body landmarks, not thirty-three', () => {
    expect(BODY_LANDMARK_NAMES).toHaveLength(6);
    expect(Object.keys(emptyBodyReference()).sort()).toEqual([...BODY_LANDMARK_NAMES].sort());
  });
});

describe('emptyBodyReference', () => {
  it('is all-null and a fresh object each time', () => {
    const a = emptyBodyReference();
    const b = emptyBodyReference();
    expect(Object.values(a).every((v) => v === null)).toBe(true);
    a.leftHip = { x: 1, y: 2 };
    expect(b.leftHip).toBeNull();
  });
});
