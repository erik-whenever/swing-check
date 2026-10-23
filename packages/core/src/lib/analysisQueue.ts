// SERIAL TASK QUEUE for per-swing analysis (ADR-003 §5, D-5 pass 3).
//
// The requirement it exists for: ONE swing at a time goes to Vision, while
// detection of swing N+1 continues unimpeded. Those two halves pull in opposite
// directions, and the split is what resolves them — detection runs on the rAF loop
// and only ever ENQUEUES; everything expensive (frame grab, the network call, the
// spoken feedback) drains from here, one at a time, off the detection path.
//
// Serial rather than concurrent on purpose: two Vision calls in flight would race
// for the same phone's uplink and the same GPU the live inference is using, and
// their spoken results would collide. Depth is measured (`maxDepth`) rather than
// capped — a queue that silently drops swings is exactly the kind of quiet failure
// ADR-003 exists to remove.
//
// A FAILING TASK NEVER STOPS THE QUEUE. The rejection is delivered to that task's
// caller and the next task starts regardless: one swing failing on a flaky range
// connection must not end the session.
//
// Pure: no React, no timers, no DOM. Unit-testable.

/** Thrown into pending tasks that `clear()` removed before they ran. */
export class QueueClearedError extends Error {
  constructor() {
    super('Queue cleared before task started');
    this.name = 'QueueClearedError';
  }
}

interface QueueEntry<T = unknown> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export interface QueueStats {
  /** Tasks waiting, excluding the one running. */
  depth: number;
  /** True while a task is running. */
  busy: boolean;
  /** Highest depth seen since construction — the backlog evidence. */
  maxDepth: number;
  started: number;
  completed: number;
  failed: number;
  cleared: number;
}

export class SerialQueue {
  private entries: QueueEntry[] = [];
  private running = false;
  private maxDepthSeen = 0;
  private started = 0;
  private completed = 0;
  private failed = 0;
  private clearedCount = 0;

  /** Called after every state change, so a UI can show the backlog honestly. */
  private readonly onChange?: (stats: QueueStats) => void;

  constructor(options: { onChange?: (stats: QueueStats) => void } = {}) {
    this.onChange = options.onChange;
  }

  /**
   * Append a task. Resolves/rejects with the task's own outcome; the queue keeps
   * draining either way.
   */
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.entries.push({
        task: task as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      if (this.entries.length > this.maxDepthSeen) this.maxDepthSeen = this.entries.length;
      this.emit();
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emit();
    try {
      for (;;) {
        const entry = this.entries.shift();
        if (!entry) break;
        this.started++;
        this.emit();
        try {
          entry.resolve(await entry.task());
          this.completed++;
        } catch (err) {
          this.failed++;
          entry.reject(err);
        }
        this.emit();
      }
    } finally {
      this.running = false;
      this.emit();
    }
  }

  /**
   * Drop everything not yet started. The running task is NOT aborted — it owns
   * network and DOM state this queue cannot safely unwind; it finishes and its
   * caller decides what to do with the result.
   */
  clear(): void {
    const dropped = this.entries.splice(0);
    this.clearedCount += dropped.length;
    for (const entry of dropped) entry.reject(new QueueClearedError());
    this.emit();
  }

  get stats(): QueueStats {
    return {
      depth: this.entries.length,
      busy: this.running,
      maxDepth: this.maxDepthSeen,
      started: this.started,
      completed: this.completed,
      failed: this.failed,
      cleared: this.clearedCount,
    };
  }

  private emit(): void {
    this.onChange?.(this.stats);
  }
}
