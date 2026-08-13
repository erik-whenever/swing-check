import { describe, expect, it } from 'vitest';
import {
  SLOWMO_ENVELOPE_THRESHOLD_SEC,
  deriveSlowmo,
} from './slowmo';

describe('deriveSlowmo', () => {
  describe('auto mode', () => {
    it('treats a normal-speed swing (~1.5 s) as not slow motion', () => {
      expect(deriveSlowmo(1.5, 'auto')).toBe(false);
    });

    it('treats a long slow-motion swing (~5 s) as slow motion', () => {
      expect(deriveSlowmo(5.0, 'auto')).toBe(true);
    });

    it('is exclusive at the threshold — exactly 3.0 s is not slow motion', () => {
      expect(deriveSlowmo(SLOWMO_ENVELOPE_THRESHOLD_SEC, 'auto')).toBe(false);
    });

    it('flips just above the threshold', () => {
      expect(deriveSlowmo(SLOWMO_ENVELOPE_THRESHOLD_SEC + 0.01, 'auto')).toBe(true);
    });

    it('reads a non-finite duration as normal, not slow motion', () => {
      expect(deriveSlowmo(Number.POSITIVE_INFINITY, 'auto')).toBe(false);
      expect(deriveSlowmo(Number.NaN, 'auto')).toBe(false);
    });

    it('reads a negative/zero duration as normal', () => {
      expect(deriveSlowmo(0, 'auto')).toBe(false);
      expect(deriveSlowmo(-1, 'auto')).toBe(false);
    });
  });

  describe('force overrides ignore the duration', () => {
    it('force-normal is always false, even for a 10 s envelope', () => {
      expect(deriveSlowmo(10, 'force-normal')).toBe(false);
    });

    it('force-slowmo is always true, even for a 0.5 s envelope', () => {
      expect(deriveSlowmo(0.5, 'force-slowmo')).toBe(true);
    });
  });
});
