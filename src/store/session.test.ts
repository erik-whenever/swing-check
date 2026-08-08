// Regression guard for the D-5 pass 1 state layer (ADR-003 §5.4).
//
// The point of the list is that swings have INDEPENDENT lifecycles: swing N+1 can
// be detected while N is still analyzing. The old singular store made that
// impossible by construction, so these tests assert the property directly rather
// than just exercising the setters. The store is plain Zustand — `getState()`
// works without React, so no DOM is needed here.

import { describe, expect, it, beforeEach } from 'vitest';
import {
  useSessionStore,
  selectAnySwingBusy,
  selectPrimarySwing,
  swingFromExtraction,
} from './session';
import type { FrameMeta } from '../lib/frameExtractor';
import type { SwingAnalysis } from '../types';

const store = () => useSessionStore.getState();

/** Minimal FrameMeta — only the fields the derivation reads actually matter. */
function meta(timeSec: number, phase?: FrameMeta['phase']): FrameMeta {
  return {
    b64: '',
    score: 0,
    isAddress: phase === 'address',
    isSwingStart: false,
    candidateIndex: 0,
    phase,
    timeSec,
  };
}

const ANALYSIS = { overall_assessment: 'ok' } as unknown as SwingAnalysis;

beforeEach(() => {
  useSessionStore.setState({ swings: [] });
});

describe('session swing list', () => {
  it('adds a swing with safe defaults and returns its id', () => {
    const id = store().addSwing();
    const swing = store().swings[0];
    expect(swing.id).toBe(id);
    expect(swing.status).toBe('detected');
    expect(swing.frames).toEqual([]);
    expect(swing.analysis).toBeNull();
    expect(swing.error).toBeNull();
    expect(swing.envelopeSec).toBeNull();
    expect(swing.impactSec).toBeNull();
  });

  it('patches one swing without touching its siblings', () => {
    const a = store().addSwing();
    const b = store().addSwing();
    store().updateSwing(b, { status: 'analyzing' });
    expect(store().swings.find((w) => w.id === a)!.status).toBe('detected');
    expect(store().swings.find((w) => w.id === b)!.status).toBe('analyzing');
  });

  it('keeps object identity for untouched swings (selector stability)', () => {
    const a = store().addSwing();
    const before = store().swings.find((w) => w.id === a)!;
    store().addSwing();
    store().updateSwing(store().swings[1].id, { status: 'done' });
    expect(store().swings.find((w) => w.id === a)!).toBe(before);
  });

  it('ignores a patch for an unknown id', () => {
    store().addSwing();
    const before = store().swings;
    store().updateSwing('no-such-id', { status: 'failed' });
    expect(store().swings).toEqual(before);
  });

  // THE property the refactor exists for: analysing swing 1 must not block
  // detecting swing 2. Under the old singular store this was unrepresentable.
  it('lets swing N+1 be detected while swing N is analyzing', () => {
    const first = store().addSwing({ status: 'analyzing', frames: ['a'] });
    const second = store().addSwing({ status: 'detected' });
    expect(store().swings).toHaveLength(2);
    store().updateSwing(first, { status: 'done', analysis: ANALYSIS });
    expect(store().swings.find((w) => w.id === second)!.status).toBe('detected');
    expect(store().swings.find((w) => w.id === first)!.analysis).toBe(ANALYSIS);
  });

  it('removes and clears', () => {
    const a = store().addSwing();
    store().addSwing();
    store().removeSwing(a);
    expect(store().swings).toHaveLength(1);
    store().clearSwings();
    expect(store().swings).toEqual([]);
  });
});

describe('selectors', () => {
  it('selectPrimarySwing is the first swing, null when empty', () => {
    expect(selectPrimarySwing(store())).toBeNull();
    const a = store().addSwing();
    store().addSwing();
    expect(selectPrimarySwing(store())!.id).toBe(a);
  });

  it('selectAnySwingBusy covers extracting and analyzing only', () => {
    expect(selectAnySwingBusy(store())).toBe(false);
    const a = store().addSwing({ status: 'detected' });
    expect(selectAnySwingBusy(store())).toBe(false);
    store().updateSwing(a, { status: 'extracting' });
    expect(selectAnySwingBusy(store())).toBe(true);
    store().updateSwing(a, { status: 'analyzing' });
    expect(selectAnySwingBusy(store())).toBe(true);
    store().updateSwing(a, { status: 'done' });
    expect(selectAnySwingBusy(store())).toBe(false);
    store().updateSwing(a, { status: 'failed' });
    expect(selectAnySwingBusy(store())).toBe(false);
  });
});

describe('swingFromExtraction', () => {
  it('derives the frame span and the impact-labelled timestamp', () => {
    const out = swingFromExtraction(
      ['f1', 'f2', 'f3'],
      [meta(6.78, 'address'), meta(7.85, 'impact'), meta(8.31, 'follow-through')],
    );
    expect(out.envelopeSec).toEqual([6.78, 8.31]);
    expect(out.impactSec).toBe(7.85);
    expect(out.frames).toEqual(['f1', 'f2', 'f3']);
  });

  // No `impact` phase means the envelope had no confident impact — that must stay
  // null rather than degrade to "nearest frame" (ADR-002: impact is polish).
  it('leaves impactSec null when no frame is labelled impact', () => {
    const out = swingFromExtraction(['f1'], [meta(3.53), meta(4.27)]);
    expect(out.envelopeSec).toEqual([3.53, 4.27]);
    expect(out.impactSec).toBeNull();
  });

  it('leaves both null when no frame carries a timestamp', () => {
    const out = swingFromExtraction([], []);
    expect(out.envelopeSec).toBeNull();
    expect(out.impactSec).toBeNull();
  });
});
