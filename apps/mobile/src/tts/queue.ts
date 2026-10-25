// Serialised, cancellable speech queue (N-3.6 part 8). Mirrors the web's enqueueSpeech /
// cancelSpeech (src/lib/tts.ts, ADR-003 §5): in a hands-free session swing N's feedback may
// still be speaking when swing N+1's analysis returns — it must finish, in swing order, not
// be cut off. "Läs upp" on the result screen instead replaces whatever is speaking (`say`).
//
// Pure: depends only on the `Speaker` interface and timers; unit-tested with a fake speaker.

import type { AnalysisLanguage } from '@swingcheck/core/lib/language';
import type { Utterance } from './script';
import { speakRequest, type Speaker } from './speaker';

export type JobOutcome = 'done' | 'cancelled';

export interface SpeechJobOptions {
  language: AnalysisLanguage;
  voiceId?: string;
}

interface Job {
  utterances: Utterance[];
  opts: SpeechJobOptions;
  resolve: (outcome: JobOutcome) => void;
}

/**
 * WATCHDOG, as on the web: an engine that drops its completion callback (iOS does) must not
 * wedge the queue for the rest of the session. Budget ≈ 10 chars/s, floor 5 s, ceiling 120 s;
 * on expiry the speaker is stopped and the next utterance starts.
 * OSÄKER: budget copied from the web's Web Speech tuning; expo-speech on iOS (AVSpeech) may
 * be more reliable and slower voices may need more. Risk: low — only a release valve.
 */
export const MS_PER_CHAR = 100;
export const WATCHDOG_FLOOR_MS = 5000;
export const WATCHDOG_CEILING_MS = 120000;

export function watchdogMs(text: string): number {
  return Math.min(WATCHDOG_CEILING_MS, Math.max(WATCHDOG_FLOOR_MS, text.length * MS_PER_CHAR));
}

export interface SpeechQueueOptions {
  onError?: (err: unknown, utterance: Utterance) => void;
}

export class SpeechQueue {
  private jobs: Job[] = [];
  private current: Job | null = null;
  /** Bumped by stop(); a running pump that sees a new generation abandons its job. */
  private generation = 0;

  constructor(
    private readonly speaker: Speaker,
    private readonly opts: SpeechQueueOptions = {},
  ) {}

  /** Queue after everything already queued; never interrupts. Resolves when spoken or cancelled. */
  enqueue(utterances: Utterance[], opts: SpeechJobOptions): Promise<JobOutcome> {
    return new Promise<JobOutcome>((resolve) => {
      this.jobs.push({ utterances, opts, resolve });
      void this.pump();
    });
  }

  /** Barge-in: stop everything (current and queued) and speak this instead. */
  say(utterances: Utterance[], opts: SpeechJobOptions): Promise<JobOutcome> {
    this.stop();
    return this.enqueue(utterances, opts);
  }

  /** Silence all of it: the current utterance and every queued job resolve 'cancelled'. */
  stop(): void {
    const hadWork = this.current !== null || this.jobs.length > 0;
    this.generation += 1;
    const dropped = this.jobs;
    this.jobs = [];
    const cur = this.current;
    this.current = null;
    if (hadWork) this.speaker.stop();
    cur?.resolve('cancelled');
    for (const j of dropped) j.resolve('cancelled');
  }

  /** Jobs waiting, excluding the one speaking. */
  get pending(): number {
    return this.jobs.length;
  }

  get busy(): boolean {
    return this.current !== null;
  }

  private async pump(): Promise<void> {
    if (this.current) return;
    const job = this.jobs.shift();
    if (!job) return;
    this.current = job;
    const gen = this.generation;

    for (const u of job.utterances) {
      if (gen !== this.generation) return; // stop() already resolved this job
      await this.speakOne(u, job.opts);
    }
    if (gen !== this.generation) return;
    this.current = null;
    job.resolve('done');
    void this.pump();
  }

  private async speakOne(u: Utterance, opts: SpeechJobOptions): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchdog = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.speaker.stop();
        resolve();
      }, watchdogMs(u.text));
    });
    try {
      await Promise.race([this.speaker.speak(speakRequest(u.text, opts.language, opts.voiceId)), watchdog]);
    } catch (err) {
      this.opts.onError?.(err, u);
    } finally {
      clearTimeout(timer);
    }
  }
}
