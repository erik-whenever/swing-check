// The shaft measurement layer, in one import.
//
// THE ORDER OF THE THREE MODULES IS THE CONTRACT:
//
//   shaftSeries.ts   pure data — what the detector produced for one swing
//        ↓           (fromDetection.ts is the only seam back to the runtime)
//   plausibility.ts  the gate — every measurement leaves here flagged
//        ↓           (its `CheckedShaftSwingSeries` is unforgeable elsewhere)
//   derived.ts       the five measurements that are honest in 2D, each carrying
//                    what it assumes
//
// Rules live above this file and have not been written yet. What each measurement is,
// what it presupposes, and what cannot be derived from two points in 2D at all — the
// clubface angle, club path in degrees in-to-out, angle of attack — is written down in
// docs/shaft/datamodell.md. The second list matters as much as the first.

export * from './shaftSeries';
export * from './angles';
export * from './plausibility';
export * from './derived';
export * from './fromDetection';
