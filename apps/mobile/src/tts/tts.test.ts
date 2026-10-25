// Tests for the TTS layer from N-3.6 part 8: script builder and the serialised queue.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuleResult, SwingAnalysis } from '@swingcheck/core/types';
import { buildSpeechScript, firstSentence, phraseUtterance, type Utterance } from './script';
import { SpeechQueue, WATCHDOG_FLOOR_MS, watchdogMs } from './queue';
import {
  expoSpeechSpeaker,
  loggingSpeaker,
  type SpeakRequest,
  type Speaker,
  type SpeechEngine,
  type SpeechEngineOptions,
} from './speaker';

function rule(id: string, verdict: RuleResult['verdict'], extra: Partial<RuleResult> = {}): RuleResult {
  return { id, verdict, confidence: 0.8, relevant_frames: [], ...extra };
}

function analysis(rules: RuleResult[], extra: Partial<SwingAnalysis> = {}): SwingAnalysis {
  return {
    camera_angle_detected: 'down-the-line',
    frame_quality: 'good',
    frame_quality_notes: '',
    usable_phases_detected: [],
    rules,
    overall_assessment: 'Stabil sving.',
    ...extra,
  };
}

const texts = (u: Utterance[]) => u.map((x) => x.text);

describe('buildSpeechScript — live', () => {
  it('intro + one short verdict per rule, observation first sentence as fallback', () => {
    const a = analysis([
      rule('a', 'fail', { short_verdict: 'Händerna för lågt' }),
      rule('b', 'pass', { observation: 'Bra rotation. Fortsätt så.' }),
      rule('c', 'pass'),
    ]);
    expect(texts(buildSpeechScript(a, { variant: 'live', language: 'sv' }))).toEqual([
      'Sving analyserat.',
      'Händerna för lågt',
      'Bra rotation.',
    ]);
  });

  it('focus mode reads only the focus rule; swing number names the swing', () => {
    const a = analysis([rule('a', 'fail', { short_verdict: 'X' })], {
      focus_rule: rule('f', 'fail', { short_verdict: 'Fokus' }),
    });
    const s = buildSpeechScript(a, { variant: 'live', language: 'sv', focusRuleId: 'f', swingNumber: 3 });
    expect(texts(s)).toEqual(['Sving 3 klart.', 'Fokus']);
    expect(s.map((u) => u.kind)).toEqual(['intro', 'verdict']);
  });

  it('language switches the fixed phrases', () => {
    const s = buildSpeechScript(analysis([]), { variant: 'live', language: 'en', swingNumber: 2 });
    expect(texts(s)).toEqual(['Swing 2 done.']);
  });
});

describe('buildSpeechScript — full', () => {
  it('overall, then failed rules with observation and drill (drill_suggestion over suggestion)', () => {
    const a = analysis([
      rule('a', 'fail', { observation: 'Höften öppnar tidigt.', drill_suggestion: 'Drill A', suggestion: 'S' }),
      rule('b', 'fail', { short_verdict: 'Kort B', suggestion: 'Förslag B' }),
      rule('c', 'pass', { observation: 'Bra.' }),
    ]);
    const s = buildSpeechScript(a, { variant: 'full', language: 'sv' });
    expect(texts(s)).toEqual([
      'Sving analyserat.',
      'Stabil sving.',
      'Höften öppnar tidigt.',
      'Drill A',
      'Kort B',
      'Förslag B',
    ]);
  });

  it('all pass → no-issues phrase', () => {
    const s = buildSpeechScript(analysis([rule('a', 'pass')]), { variant: 'full', language: 'en' });
    expect(texts(s)).toEqual(['Swing analysed.', 'Stabil sving.', 'No faults found.']);
  });

  it('unjudged rules are named (title, else short verdict), never "no faults"', () => {
    const a = analysis([rule('a', 'cannot_determine'), rule('b', 'cannot_determine', { short_verdict: 'Okänd' })], {
      overall_assessment: '  ',
    });
    const s = buildSpeechScript(a, {
      variant: 'full',
      language: 'sv',
      ruleTitle: (id) => (id === 'a' ? 'Höftrotation' : undefined),
    });
    expect(texts(s)).toEqual(['Sving analyserat.', 'Kunde inte bedömas:', 'Höftrotation', 'Okänd']);
  });

  it('focus_rule is included first, and alone in focus mode', () => {
    const f = rule('f', 'fail', { observation: 'Fokusfel.' });
    const a = analysis([rule('a', 'fail', { observation: 'Annat fel.' })], { focus_rule: f });
    expect(texts(buildSpeechScript(a, { variant: 'full', language: 'sv' })).slice(2)).toEqual([
      'Fokusfel.',
      'Annat fel.',
    ]);
    expect(texts(buildSpeechScript(a, { variant: 'full', language: 'sv', focusRuleId: 'f' })).slice(2)).toEqual([
      'Fokusfel.',
    ]);
  });
});

describe('script helpers', () => {
  it('firstSentence', () => {
    expect(firstSentence(' Ett. Två. ')).toBe('Ett.');
    expect(firstSentence('Ingen punkt')).toBe('Ingen punkt');
  });
  it('phraseUtterance', () => {
    expect(phraseUtterance('en', 'failed')).toEqual({ kind: 'status', text: 'The analysis failed, try again' });
  });
});

/** A speaker whose utterances finish only when the test says so. */
function manualSpeaker() {
  const spoken: SpeakRequest[] = [];
  const finishers: (() => void)[] = [];
  let stops = 0;
  const speaker: Speaker = {
    speak(req) {
      spoken.push(req);
      return new Promise<void>((resolve) => finishers.push(resolve));
    },
    stop() {
      stops += 1;
      finishers.splice(0).forEach((f) => f());
    },
  };
  return {
    speaker,
    spoken,
    finishNext: () => finishers.shift()?.(),
    get stops() {
      return stops;
    },
  };
}

const u = (...t: string[]): Utterance[] => t.map((text) => ({ kind: 'verdict', text }));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('SpeechQueue', () => {
  afterEach(() => vi.useRealTimers());

  it('serialises jobs in order and passes locale from the language', async () => {
    const m = manualSpeaker();
    const q = new SpeechQueue(m.speaker);
    const p1 = q.enqueue(u('a1', 'a2'), { language: 'sv' });
    const p2 = q.enqueue(u('b1'), { language: 'en', voiceId: 'v1' });
    await flush();
    expect(m.spoken.map((s) => s.text)).toEqual(['a1']);
    expect(q.pending).toBe(1);
    m.finishNext();
    await flush();
    m.finishNext();
    await expect(p1).resolves.toBe('done');
    await flush();
    expect(m.spoken.map((s) => s.text)).toEqual(['a1', 'a2', 'b1']);
    expect(m.spoken[0].locale).toBe('sv-SE');
    expect(m.spoken[2]).toMatchObject({ locale: 'en-US', voiceId: 'v1' });
    m.finishNext();
    await expect(p2).resolves.toBe('done');
    expect(q.busy).toBe(false);
  });

  it('stop cancels current and queued jobs and stops the speaker', async () => {
    const m = manualSpeaker();
    const q = new SpeechQueue(m.speaker);
    const p1 = q.enqueue(u('a1', 'a2'), { language: 'sv' });
    const p2 = q.enqueue(u('b1'), { language: 'sv' });
    await flush();
    q.stop();
    await expect(p1).resolves.toBe('cancelled');
    await expect(p2).resolves.toBe('cancelled');
    await flush();
    expect(m.spoken.map((s) => s.text)).toEqual(['a1']);
    expect(m.stops).toBe(1);
    expect(q.busy).toBe(false);
    q.stop(); // idle stop does not poke the engine
    expect(m.stops).toBe(1);
  });

  it('say barges in: the old job is cancelled and the new one speaks', async () => {
    const m = manualSpeaker();
    const q = new SpeechQueue(m.speaker);
    const p1 = q.enqueue(u('old1', 'old2'), { language: 'sv' });
    await flush();
    const p2 = q.say(u('new'), { language: 'sv' });
    await expect(p1).resolves.toBe('cancelled');
    await flush();
    expect(m.spoken.map((s) => s.text)).toEqual(['old1', 'new']);
    m.finishNext();
    await expect(p2).resolves.toBe('done');
  });

  it('watchdog releases an utterance whose engine never finishes', async () => {
    vi.useFakeTimers();
    const speaker: Speaker = { speak: vi.fn(() => new Promise<void>(() => {})), stop: vi.fn() };
    const q = new SpeechQueue(speaker);
    const p = q.enqueue(u('x', 'y'), { language: 'sv' });
    await vi.advanceTimersByTimeAsync(WATCHDOG_FLOOR_MS);
    expect(speaker.speak).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(WATCHDOG_FLOOR_MS);
    await expect(p).resolves.toBe('done');
    expect(speaker.stop).toHaveBeenCalledTimes(2);
  });

  it('an engine error is reported and the queue moves on', async () => {
    const onError = vi.fn();
    const speaker: Speaker = {
      speak: vi.fn((req: SpeakRequest) => (req.text === 'bad' ? Promise.reject(new Error('boom')) : Promise.resolve())),
      stop: vi.fn(),
    };
    const q = new SpeechQueue(speaker, { onError });
    await expect(q.enqueue(u('bad', 'ok'), { language: 'sv' })).resolves.toBe('done');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(speaker.speak).toHaveBeenCalledTimes(2);
  });

  it('watchdog budget is clamped', () => {
    expect(watchdogMs('kort')).toBe(WATCHDOG_FLOOR_MS);
    expect(watchdogMs('x'.repeat(100))).toBe(10000);
    expect(watchdogMs('x'.repeat(5000))).toBe(120000);
  });

  it('logging speaker logs and resolves at once', async () => {
    const lines: string[] = [];
    const q = new SpeechQueue(loggingSpeaker({ log: (l) => lines.push(l) }));
    await expect(q.enqueue(u('Hej'), { language: 'sv' })).resolves.toBe('done');
    expect(lines).toEqual(['[tts sv-SE] Hej']);
  });
});

describe('expoSpeechSpeaker', () => {
  function fakeEngine(autoDone = false) {
    const calls: { text: string; opts: SpeechEngineOptions }[] = [];
    const engine: SpeechEngine = {
      speak: vi.fn((text: string, opts: SpeechEngineOptions = {}) => {
        calls.push({ text, opts });
        if (autoDone) queueMicrotask(() => opts.onDone?.());
      }),
      stop: vi.fn(() => Promise.resolve()),
    };
    return { engine, calls };
  }

  it('passes locale/voice and resolves on onDone', async () => {
    const { engine, calls } = fakeEngine();
    const p = expoSpeechSpeaker(engine).speak({ text: 'Hej', language: 'sv', locale: 'sv-SE', voiceId: 'v1' });
    expect(calls[0]).toMatchObject({ text: 'Hej', opts: { language: 'sv-SE', voice: 'v1' } });
    calls[0].opts.onDone?.();
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects on onError', async () => {
    const { engine, calls } = fakeEngine();
    const p = expoSpeechSpeaker(engine).speak({ text: 'x', language: 'sv', locale: 'sv-SE' });
    calls[0].opts.onError?.(new Error('engine'));
    await expect(p).rejects.toThrow('engine');
  });

  it('stop() settles the pending speak at once; a late callback cannot settle the next one', async () => {
    const { engine, calls } = fakeEngine();
    const s = expoSpeechSpeaker(engine);
    const first = s.speak({ text: 'a', language: 'sv', locale: 'sv-SE' });
    s.stop();
    await expect(first).resolves.toBeUndefined();
    expect(engine.stop).toHaveBeenCalledTimes(1);
    const second = s.speak({ text: 'b', language: 'sv', locale: 'sv-SE' });
    let secondDone = false;
    void second.then(() => (secondDone = true));
    calls[0].opts.onStopped?.(); // stale callback from the first utterance
    await Promise.resolve();
    await Promise.resolve();
    expect(secondDone).toBe(false);
    calls[1].opts.onDone?.();
    await expect(second).resolves.toBeUndefined();
  });

  it('drives the queue end to end with the language from core', async () => {
    const { engine, calls } = fakeEngine(true);
    const q = new SpeechQueue(expoSpeechSpeaker(engine));
    await expect(q.enqueue(u('ett', 'två'), { language: 'en' })).resolves.toBe('done');
    expect(calls.map((c) => [c.text, c.opts.language])).toEqual([
      ['ett', 'en-US'],
      ['två', 'en-US'],
    ]);
  });
});
