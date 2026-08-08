// Harness for the serial analysis queue (D-5 pass 3).
//
// The requirements this locks: one task at a time, order preserved, and — the one
// that matters most in the field — a failing task does not stop the queue. A range
// session must survive one flaky Vision call.

import { describe, expect, it, vi } from 'vitest';
import { QueueClearedError, SerialQueue } from './analysisQueue';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('SerialQueue', () => {
  it('runs one task at a time, in order', async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = (name: string, ms: number) => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await tick(ms);
      order.push(name);
      concurrent--;
    };

    // Deliberately out of duration order: a concurrent queue would finish 'c' first.
    await Promise.all([
      queue.enqueue(task('a', 20)),
      queue.enqueue(task('b', 10)),
      queue.enqueue(task('c', 1)),
    ]);

    expect(order).toEqual(['a', 'b', 'c']);
    expect(maxConcurrent).toBe(1);
  });

  it('keeps draining after a task throws', async () => {
    const queue = new SerialQueue();
    const done: string[] = [];

    const failing = queue.enqueue(async () => {
      throw new Error('vision 503');
    });
    const after = queue.enqueue(async () => {
      done.push('next swing');
    });

    await expect(failing).rejects.toThrow('vision 503');
    await after;

    // The whole point: swing N failing does not end the session.
    expect(done).toEqual(['next swing']);
    expect(queue.stats.failed).toBe(1);
    expect(queue.stats.completed).toBe(1);
  });

  it('accepts new work while a task is running (detection never waits)', async () => {
    const queue = new SerialQueue();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const slow = queue.enqueue(() => gate);
    // Enqueue while the first task is still in flight — this is the detector
    // reporting swing N+1 mid-analysis.
    const later: string[] = [];
    const queued = queue.enqueue(async () => {
      later.push('n+1');
    });

    await tick();
    expect(queue.stats.busy).toBe(true);
    expect(queue.stats.depth).toBe(1);
    expect(later).toEqual([]);

    release();
    await slow;
    await queued;
    expect(later).toEqual(['n+1']);
  });

  it('reports the backlog high-water mark', async () => {
    const queue = new SerialQueue();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = queue.enqueue(() => gate);
    const rest = [
      queue.enqueue(async () => {}),
      queue.enqueue(async () => {}),
      queue.enqueue(async () => {}),
    ];
    await tick();
    expect(queue.stats.maxDepth).toBe(3);
    release();
    await Promise.all([first, ...rest]);
    expect(queue.stats.depth).toBe(0);
  });

  it('clear() rejects pending work but leaves the running task alone', async () => {
    const queue = new SerialQueue();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let ranAfterClear = false;

    const running = queue.enqueue(() => gate);
    const pending = queue.enqueue(async () => {
      ranAfterClear = true;
    });

    await tick();
    queue.clear();
    await expect(pending).rejects.toBeInstanceOf(QueueClearedError);

    release();
    await running; // the in-flight task still completes
    await tick();
    expect(ranAfterClear).toBe(false);
    expect(queue.stats.cleared).toBe(1);
  });

  it('notifies on every state change', async () => {
    const onChange = vi.fn();
    const queue = new SerialQueue({ onChange });
    await queue.enqueue(async () => {});
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ depth: 0, busy: false, completed: 1 });
  });
});
