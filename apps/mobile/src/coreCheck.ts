// Proof that @swingcheck/core runs in Hermes: the rule library and the envelope detector
// on a frozen pose series, compared with what Node gives for the same input.
import { RULE_LIBRARY } from '@swingcheck/core/data/ruleLibrary';
import type { PoseSample } from '@swingcheck/core/lib/poseSample';
import { detectSwingEnvelope } from '@swingcheck/core/lib/poseEnvelope';
// Relative, not through the package: core's exports map only covers `.ts` sources, and the
// fixture is test data that the app should not get a public path to. Dev screen only.
import fixture from '../../../packages/core/src/lib/__fixtures__/dtl-full.json';

/** Node (tsx) on the same fixture, 2026-10-24. */
const NODE = { rules: 14, startSec: 6.78489, impactSec: 7.84919, finishSec: 8.31482 };

export interface CoreCheck {
  rules: number;
  valid: boolean;
  startSec: number;
  impactSec: number | null;
  finishSec: number;
  matchesNode: boolean;
  ms: number;
}

export function runCoreCheck(): CoreCheck {
  const t0 = performance.now();
  const envelope = detectSwingEnvelope((fixture as { samples: PoseSample[] }).samples);
  const ms = performance.now() - t0;
  const impactSec = envelope.impact?.timeSec ?? null;
  const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-4;
  return {
    rules: RULE_LIBRARY.length,
    valid: envelope.valid,
    startSec: envelope.startSec,
    impactSec,
    finishSec: envelope.finishSec,
    matchesNode:
      RULE_LIBRARY.length === NODE.rules &&
      envelope.valid &&
      close(envelope.startSec, NODE.startSec) &&
      close(impactSec, NODE.impactSec) &&
      close(envelope.finishSec, NODE.finishSec),
    ms,
  };
}
