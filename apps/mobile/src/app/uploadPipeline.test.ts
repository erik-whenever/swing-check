import { describe, expect, it, vi } from 'vitest';
import type { Rule, SwingAnalysis } from '@swingcheck/core/types';
import {
  clampWindow,
  defaultSwingWindow,
  frameResize,
  runUploadAnalysis,
  selectFrameTimes,
  UploadCancelledError,
  UPLOAD_FRAME_COUNT,
  type PipelineProgress,
  type UploadDeps,
  type UploadJob,
} from './uploadPipeline';

const rule = (id: string): Rule => ({ id, title: id, description: '', phase: 'impact', weight: 2, active: true, libraryId: id });

const analysis: SwingAnalysis = {
  camera_angle_detected: 'down-the-line',
  frame_quality: 'good',
  frame_quality_notes: '',
  usable_phases_detected: [],
  focus_rule: { id: 'lib-a', verdict: 'fail', confidence: 0.9, relevant_frames: [3] },
  rules: [{ id: 'lib-b', verdict: 'pass', confidence: 0.8, relevant_frames: [] }],
  overall_assessment: 'Bra tempo.',
} as SwingAnalysis;

function job(): UploadJob {
  return {
    clip: { uri: 'file:///clip.mov', duration: 3, name: 'IMG_1' },
    window: { start: 0.5, end: 2.5 },
    angle: 'dtl',
    rules: [rule('lib-a'), rule('lib-b')],
    language: 'sv',
  };
}

function deps(over: Partial<UploadDeps> = {}): UploadDeps {
  return {
    frames: { grab: vi.fn(async (_uri: string, t: number) => ({ base64: `b64-${t.toFixed(3)}`, uri: `file:///f-${t}.jpg` })) },
    analyze: vi.fn(async () => analysis),
    persistMedia: vi.fn(async (id: string, _clipUri: string, frameUris: string[]) => ({
      videoUri: `doc/${id}/clip.mov`,
      frameUris: frameUris.map((_, i) => `doc/${id}/frame-${i}.jpg`),
    })),
    addSwing: vi.fn(async () => {}),
    newId: () => 'swing-1',
    now: () => 1_700_000_000_000,
    ...over,
  };
}

describe('swing window', () => {
  it('short clip → whole clip; long clip → middle 4 s', () => {
    expect(defaultSwingWindow(3)).toEqual({ start: 0, end: 3 });
    expect(defaultSwingWindow(10)).toEqual({ start: 3, end: 7 });
    expect(defaultSwingWindow(0)).toEqual({ start: 0, end: 0 });
  });
  it('clamps to the clip and falls back on an empty window', () => {
    expect(clampWindow({ start: -1, end: 9 }, 5)).toEqual({ start: 0, end: 5 });
    expect(clampWindow({ start: 2, end: 2 }, 3)).toEqual({ start: 0, end: 3 });
    expect(clampWindow(null, 3)).toEqual({ start: 0, end: 3 });
  });
});

describe('frameResize', () => {
  it('caps the longest edge, portrait included', () => {
    expect(frameResize(3840, 2160)).toEqual({ width: 1280 });
    expect(frameResize(1080, 1920)).toEqual({ height: 1280 });
    expect(frameResize(2160, 3840)).toEqual({ height: 1280 });
    expect(frameResize(720, 1280)).toBeNull();
  });
});

describe('selectFrameTimes', () => {
  it('spreads the frame budget evenly inside the window', () => {
    const t = selectFrameTimes({ start: 1, end: 3 });
    expect(t).toHaveLength(UPLOAD_FRAME_COUNT);
    expect(t[0]).toBe(1);
    expect(t[t.length - 1]).toBeLessThan(3);
    expect(t[t.length - 1]).toBeGreaterThan(2.99);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });
  it('a zero-length window gives one frame', () => {
    expect(selectFrameTimes({ start: 1, end: 1 })).toEqual([1]);
  });
});

describe('runUploadAnalysis', () => {
  it('grabs frames, analyses via the injected Worker call and saves the entry', async () => {
    const d = deps();
    const progress: PipelineProgress[] = [];
    const id = await runUploadAnalysis(job(), d, (p) => progress.push(p));

    expect(id).toBe('swing-1');
    expect(d.frames.grab).toHaveBeenCalledTimes(UPLOAD_FRAME_COUNT);
    expect(d.analyze).toHaveBeenCalledWith(expect.any(Array), job().rules, { cameraAngle: 'dtl', language: 'sv' });
    const sent = vi.mocked(d.analyze).mock.calls[0][0];
    expect(sent).toHaveLength(UPLOAD_FRAME_COUNT);
    expect(sent[0]).toBe('b64-0.500');

    expect(d.addSwing).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(d.addSwing).mock.calls[0][0];
    expect(entry).toMatchObject({
      id: 'swing-1',
      timestamp: 1_700_000_000_000,
      videoUri: 'doc/swing-1/clip.mov',
      overallAssessment: 'Bra tempo.',
      focusRuleId: 'lib-a',
      cameraAngle: 'dtl',
      ruleIds: ['lib-a', 'lib-b'],
      language: 'sv',
    });
    expect(entry.results.map((r) => r.id)).toEqual(['lib-a', 'lib-b']);
    expect(entry.frameUris).toHaveLength(UPLOAD_FRAME_COUNT);

    const last = progress[progress.length - 1];
    expect(last.progress).toBe(1);
    expect(last.steps.swing).toEqual({ status: 'done', detail: '0,5–2,5 s' });
    expect(last.steps.frames?.status).toBe('done');
    expect(last.steps.rules).toEqual({ status: 'done', detail: '2 st' });
    for (let i = 1; i < progress.length; i++) expect(progress[i].progress).toBeGreaterThanOrEqual(progress[i - 1].progress);
  });

  it('propagates an analysis error and saves nothing', async () => {
    const err = Object.assign(new Error('cap'), { name: 'UsageCapReachedError', scope: 'install' });
    const d = deps({ analyze: vi.fn(async () => Promise.reject(err)) });
    await expect(runUploadAnalysis(job(), d, () => {})).rejects.toBe(err);
    expect(d.persistMedia).not.toHaveBeenCalled();
    expect(d.addSwing).not.toHaveBeenCalled();
  });

  it('cancel during frame grabbing stops before the Worker is called', async () => {
    const controller = new AbortController();
    let n = 0;
    const d = deps({
      frames: {
        grab: vi.fn(async () => {
          if (++n === 3) controller.abort();
          return { base64: 'x', uri: 'u' };
        }),
      },
    });
    await expect(runUploadAnalysis(job(), d, () => {}, controller.signal)).rejects.toBeInstanceOf(UploadCancelledError);
    expect(n).toBe(3);
    expect(d.analyze).not.toHaveBeenCalled();
    expect(d.addSwing).not.toHaveBeenCalled();
  });

  it('a Worker answer arriving after cancel is dropped, not saved', async () => {
    const controller = new AbortController();
    const d = deps({
      analyze: vi.fn(async () => {
        controller.abort();
        return analysis;
      }),
    });
    await expect(runUploadAnalysis(job(), d, () => {}, controller.signal)).rejects.toBeInstanceOf(UploadCancelledError);
    expect(d.addSwing).not.toHaveBeenCalled();
  });
});
