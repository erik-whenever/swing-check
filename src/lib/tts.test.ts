// Harness for the serialized speech queue (D-5 pass 3).
//
// The requirement: two analyses must NEVER speak at the same time. In a session,
// swing N's feedback is often still being read when swing N+1's verdict returns,
// and the old barge-in behaviour would have cut swing N off mid-sentence.
//
// A fake speech engine stands in for `window.speechSynthesis`: it records what was
// spoken and when, and (crucially) can be told to drop an `onend` — the iOS Safari
// failure mode the watchdog exists for.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuleResult, SwingAnalysis } from '../types';

interface FakeUtterance {
  text: string;
  onstart?: () => void;
  onend?: () => void;
  onerror?: () => void;
}

class FakeSynth {
  spoken: string[] = [];
  /** Utterances handed over but not yet ended. */
  queueInternal: FakeUtterance[] = [];
  speaking = false;
  pending = false;
  /** When true, utterances never fire onend — the wedged-engine case. */
  swallowEnd = false;

  getVoices() {
    return [];
  }

  speak(u: FakeUtterance) {
    this.spoken.push(u.text);
    this.queueInternal.push(u);
    this.speaking = true;
    u.onstart?.();
  }

  /** Complete every outstanding utterance, oldest first. */
  finishAll() {
    if (this.swallowEnd) return;
    const outstanding = this.queueInternal.splice(0);
    for (const u of outstanding) u.onend?.();
    this.speaking = false;
  }

  cancel() {
    const outstanding = this.queueInternal.splice(0);
    this.speaking = false;
    for (const u of outstanding) u.onend?.();
  }
}

let synth: FakeSynth;

beforeEach(async () => {
  vi.resetModules();
  synth = new FakeSynth();
  // The zustand stores tts.ts reads from are `persist`-wrapped and resolve their
  // storage off `window`; give them somewhere harmless to write so a setState in a
  // test doesn't blow up on missing storage.
  const kv = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => kv.get(k) ?? null,
    setItem: (k: string, v: string) => void kv.set(k, v),
    removeItem: (k: string) => void kv.delete(k),
  };
  vi.stubGlobal('window', { speechSynthesis: synth, localStorage });
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      voice: unknown = null;
      lang = '';
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function loadTts() {
  return await import('./tts');
}

describe('serialized speech queue', () => {
  it('never lets a second analysis start before the first has finished', async () => {
    const { enqueueSpeech } = await loadTts();

    enqueueSpeech(['Sving 1 klart.', 'Höften öppnar för tidigt.']);
    enqueueSpeech(['Sving 2 klart.', 'Bättre.']);

    // Only swing 1 has reached the engine — swing 2 is queued, not spoken over it.
    expect(synth.spoken).toEqual(['Sving 1 klart.', 'Höften öppnar för tidigt.']);

    synth.finishAll();
    expect(synth.spoken).toEqual([
      'Sving 1 klart.',
      'Höften öppnar för tidigt.',
      'Sving 2 klart.',
      'Bättre.',
    ]);
  });

  it('reports completion per job, in order', async () => {
    const { enqueueSpeech } = await loadTts();
    const ended: string[] = [];

    enqueueSpeech(['ett'], { onEnd: () => ended.push('one') });
    enqueueSpeech(['två'], { onEnd: () => ended.push('two') });
    enqueueSpeech(['tre'], { onEnd: () => ended.push('three') });

    expect(ended).toEqual([]);
    // One `finishAll` per job: the engine only ever completes what it already
    // holds, and the next job is handed over inside that completion.
    synth.finishAll();
    expect(ended).toEqual(['one']);
    synth.finishAll();
    synth.finishAll();
    expect(ended).toEqual(['one', 'two', 'three']);
  });

  it('cancelSpeech drops the whole queue, not just the current sentence', async () => {
    const { enqueueSpeech, cancelSpeech, pendingSpeechCount } = await loadTts();

    enqueueSpeech(['Sving 1 klart.']);
    enqueueSpeech(['Sving 2 klart.']);
    enqueueSpeech(['Sving 3 klart.']);
    expect(pendingSpeechCount()).toBe(2);

    cancelSpeech();
    expect(pendingSpeechCount()).toBe(0);

    // Nothing further reaches the engine after the user asked for silence.
    synth.finishAll();
    expect(synth.spoken).toEqual(['Sving 1 klart.']);
  });

  it('releases the queue when the engine drops onend (iOS wedge)', async () => {
    vi.useFakeTimers();
    const { enqueueSpeech } = await loadTts();
    synth.swallowEnd = true;

    enqueueSpeech(['kort']);
    enqueueSpeech(['nästa sving']);
    expect(synth.spoken).toEqual(['kort']);

    // Without the watchdog the session would stay silent from here on.
    await vi.advanceTimersByTimeAsync(6000);
    expect(synth.spoken).toEqual(['kort', 'nästa sving']);
  });

  it('an empty job does not stall the queue', async () => {
    const { enqueueSpeech } = await loadTts();
    enqueueSpeech([]);
    enqueueSpeech(['efter tomt']);
    expect(synth.spoken).toEqual(['efter tomt']);
  });

  it('speakSequence still barges in — the single-swing path is unchanged', async () => {
    const { speakSequence } = await loadTts();
    speakSequence(['första']);
    speakSequence(['andra']);
    // cancel() ran before 'andra', so nothing is left over from 'första'.
    expect(synth.spoken).toEqual(['första', 'andra']);
    expect(synth.queueInternal.map((u) => u.text)).toEqual(['andra']);
  });

  it('calls onEnd even with no speech engine, so a queue cannot deadlock', async () => {
    vi.stubGlobal('window', {});
    const { speakSequence } = await loadTts();
    const onEnd = vi.fn();
    speakSequence(['tyst enhet'], { onEnd });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

// ── buildSpeechParts ─────────────────────────────────────────────────────────
// The dangerous case is `cannot_determine`: the model saying "I could not judge
// this" must never be spoken as "inga fel hittades".

function result(over: Partial<RuleResult> & { id: string }): RuleResult {
  return {
    verdict: 'pass',
    confidence: 0.9,
    relevant_frames: [1],
    visual_evidence: '',
    observation: '',
    ...over,
  };
}

function analysis(rules: RuleResult[], focus?: RuleResult): SwingAnalysis {
  return {
    camera_angle_detected: 'face-on',
    frame_quality: 'good',
    frame_quality_notes: '',
    usable_phases_detected: [],
    rules,
    focus_rule: focus,
    overall_assessment: '',
  };
}

describe('buildSpeechParts — detailed mode', () => {
  it('says "inga fel" only when nothing failed AND nothing was left unjudged', async () => {
    const { buildSpeechParts } = await loadTts();
    const parts = buildSpeechParts(
      analysis([result({ id: 'a' }), result({ id: 'b' })]),
      'detailed',
    );
    expect(parts).toEqual(['Sving analyserat.', 'Inga fel hittades.']);
  });

  it('reads out cannot_determine instead of claiming no faults were found', async () => {
    const { buildSpeechParts, TTS_UNDETERMINED } = await loadTts();
    const parts = buildSpeechParts(
      analysis([
        result({ id: 'a' }),
        result({
          id: 'b',
          verdict: 'cannot_determine',
          short_verdict: 'Handleden skymd i toppen',
        }),
      ]),
      'detailed',
    );
    expect(parts).not.toContain('Inga fel hittades.');
    expect(parts).toEqual([
      'Sving analyserat.',
      TTS_UNDETERMINED,
      'Handleden skymd i toppen',
    ]);
  });

  it('names an unjudged rule by its title when the rule still exists', async () => {
    const { buildSpeechParts, TTS_UNDETERMINED } = await loadTts();
    const { useRulesStore } = await import('../store/rules');
    useRulesStore.setState({
      rules: [
        {
          id: 'r1',
          title: 'Huvudet stilla genom slaget',
          description: '',
          phase: 'impact',
          weight: 2,
          active: true,
        },
      ],
    });

    const parts = buildSpeechParts(
      analysis([
        result({ id: 'r1', verdict: 'cannot_determine', short_verdict: 'Oklart' }),
      ]),
      'detailed',
    );
    expect(parts).toEqual([
      'Sving analyserat.',
      TTS_UNDETERMINED,
      'Huvudet stilla genom slaget',
    ]);
  });

  it('reads failed rules first, then the unjudged ones', async () => {
    const { buildSpeechParts, TTS_UNDETERMINED } = await loadTts();
    const parts = buildSpeechParts(
      analysis([
        result({
          id: 'a',
          verdict: 'fail',
          observation: 'Höften öppnar för tidigt.',
          drill_suggestion: 'Gör pausövningen.',
        }),
        result({ id: 'b', verdict: 'cannot_determine', short_verdict: 'Armen utanför bild' }),
      ]),
      'detailed',
    );
    expect(parts).toEqual([
      'Sving analyserat.',
      'Höften öppnar för tidigt.',
      'Gör pausövningen.',
      TTS_UNDETERMINED,
      'Armen utanför bild',
    ]);
  });

  it('covers the focus rule too when it is the one that could not be judged', async () => {
    const { buildSpeechParts, TTS_UNDETERMINED } = await loadTts();
    const focus = result({
      id: 'f',
      verdict: 'cannot_determine',
      short_verdict: 'För mörkt vid nedslag',
    });
    const parts = buildSpeechParts(analysis([], focus), 'detailed', 'f');
    expect(parts).toEqual([
      'Sving analyserat.',
      TTS_UNDETERMINED,
      'För mörkt vid nedslag',
    ]);
  });
});

describe('buildSpeechParts — quick mode', () => {
  it('falls back to the first sentence of the observation, not the whole paragraph', async () => {
    const { buildSpeechParts } = await loadTts();
    const parts = buildSpeechParts(
      analysis([
        result({
          id: 'a',
          verdict: 'fail',
          observation:
            'Händerna är för lågt i toppen. Det gör att klubban tappar vinkel, vilket kostar fart genom bollen.',
        }),
      ]),
      'quick',
    );
    expect(parts).toEqual(['Sving analyserat.', 'Händerna är för lågt i toppen.']);
  });

  it('prefers short_verdict when the model provided one', async () => {
    const { buildSpeechParts } = await loadTts();
    const parts = buildSpeechParts(
      analysis([
        result({
          id: 'a',
          verdict: 'fail',
          short_verdict: 'Händerna för lågt i toppen',
          observation: 'En lång förklaring. Med flera meningar.',
        }),
      ]),
      'quick',
    );
    expect(parts).toEqual(['Sving analyserat.', 'Händerna för lågt i toppen']);
  });
});
