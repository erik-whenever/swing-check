import type { SwingRecord } from '../types';

/**
 * Share of assessable rules that passed, 0–1, or null when nothing was assessable.
 *
 * `cannot_determine` is excluded from BOTH sides of the ratio on purpose: a rule the
 * model could not judge is missing evidence, not a failure, and counting it as one
 * would punish the golfer for a bad camera angle.
 */
export function swingScore(record: SwingRecord): number | null {
  const pass = record.results.filter((r) => r.verdict === 'pass').length;
  const fail = record.results.filter((r) => r.verdict === 'fail').length;
  return pass + fail > 0 ? pass / (pass + fail) : null;
}
