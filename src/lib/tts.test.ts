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
  vi.stubGlobal('window', { speechSynthesis: synth });
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
