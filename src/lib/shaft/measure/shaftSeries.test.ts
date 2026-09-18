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
  isPhaseObserved,
  type PhaseSource,
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

describe('isPhaseObserved', () => {
  it('admits only a phase somebody or something actually saw', () => {
    expect(isPhaseObserved('observed')).toBe(true);
    // Both derived sources are refused. They are kept apart in the type because their
    // error profiles differ (see `PhaseSource`), not because one of them may be trusted.
    expect(isPhaseObserved('envelope-impact')).toBe(false);
    expect(isPhaseObserved('envelope-fallback')).toBe(false);
  });

  it('fails closed on a record that does not say', () => {
    // A series written before the field existed parses with `phaseSource: undefined`.
    // Reading that as observed would silently restore exactly the behaviour S-23 found
    // wrong on 13 of 22 frames, so absence must mean unobserved.
    expect(isPhaseObserved(undefined)).toBe(false);
    expect(isPhaseObserved('' as unknown as PhaseSource)).toBe(false);
  });
});
