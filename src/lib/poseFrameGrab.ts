// Frame grabber for the pose paths: seeks a hidden <video> to a list of timestamps
// and returns JPEG base64 for each — the same seek-and-draw pattern
// frameExtractor.ts uses, kept SEPARATE here so Stream D never touches
// frameExtractor.ts.
//
// Two callers, two shapes:
//  - the dev preview (D-2/D-4), which grabs from a whole clip whose timeline starts
//    at zero, and
//  - the continuous session path (D-5 pass 3), which grabs from a ~10 s WINDOW cut
//    out of a longer recording by videoChunkRing.
//
// THE WINDOW CASE NEEDS A TIME BASE. Swing times are in the recording clock (a swing
// at 34.2 s), but the blob is a slice starting at, say, 33.0 s. Whether the browser
// presents that slice on the ORIGINAL timeline (seek to 34.2) or rebased to zero
// (seek to 1.2) depends on the container and the engine, and guessing wrong grabs
// the wrong part of the swing. So we do not guess: pass `windowStartSec` and the
// grabber PROBES the loaded element — seek past the end, see where it lands, and
// compare that against both candidate end times. Cheap, and it answers with the
// browser's own behaviour rather than our model of it.

import { createLogger } from './logger';

const log = createLogger('FrameGrab');

/** Longest side (px) of the grabbed frame — matches frameExtractor's cap. */
const GRAB_MAX_WIDTH = 1280;
/**
 * A seek that never completes must not hang the analysis queue for the rest of the
 * session. A stalled seek costs one swing; a hung promise costs all of them.
 */
const SEEK_TIMEOUT_MS = 3000;
/** Seek target used to discover where the media actually ends. */
const PROBE_TIME_SEC = 1e6;

export interface GrabOptions {
  /**
   * Recording-clock second the blob's first frame corresponds to. Set this when the
   * blob is a WINDOW of a longer recording (`videoChunkRing.materialize`) and
   * `timesSec` are recording-clock times. Omit for whole clips.
   */
  windowStartSec?: number;
  /** Recording-clock second the window ends — the second half of the probe. */
  windowEndSec?: number;
}

export async function grabFramesAtTimes(
  videoBlob: Blob,
  timesSec: number[],
  quality = 0.8,
  options: GrabOptions = {},
): Promise<string[]> {
  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });
    await new Promise<void>((resolve) => {
      if (video.readyState >= 3) return resolve();
      video.oncanplaythrough = () => resolve();
      video.load();
    });

    // `offset` is subtracted from every requested time; `mediaEnd` is where the
    // media actually stops, which for a MediaRecorder blob is often NOT `duration`
    // (that reads Infinity until the container is fully parsed).
    const { offset, mediaEnd } = await resolveTimeBase(video, options);

    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth, GRAB_MAX_WIDTH);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
    const ctx = canvas.getContext('2d')!;

    const out: string[] = [];
    for (const time of timesSec) {
      const t = Math.min(mediaEnd - 0.05, Math.max(0, time - offset));
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      out.push(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decide whether the loaded blob presents the original recording timeline or one
 * rebased to zero, by seeking past the end and comparing where playback lands with
 * both candidate end times. Whole clips (no `windowStartSec`) skip the probe.
 */
async function resolveTimeBase(
  video: HTMLVideoElement,
  options: GrabOptions,
): Promise<{ offset: number; mediaEnd: number }> {
  const { windowStartSec, windowEndSec } = options;
  if (windowStartSec === undefined || windowEndSec === undefined) {
    return { offset: 0, mediaEnd: Number.isFinite(video.duration) ? video.duration : Infinity };
  }

  await seekTo(video, PROBE_TIME_SEC);
  const end = video.currentTime;
  const absoluteMiss = Math.abs(end - windowEndSec);
  const rebasedMiss = Math.abs(end - (windowEndSec - windowStartSec));
  const rebased = rebasedMiss < absoluteMiss;

  log.debug('Window time base resolved', {
    probedEndSec: round2(end),
    windowSec: [round2(windowStartSec), round2(windowEndSec)],
    base: rebased ? 'rebased-to-zero' : 'original-timeline',
    absoluteMiss: round2(absoluteMiss),
    rebasedMiss: round2(rebasedMiss),
  });

  return {
    offset: rebased ? windowStartSec : 0,
    mediaEnd: end > 0 ? end : windowEndSec - windowStartSec,
  };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onseeked = null;
      resolve();
    };
    const timer = setTimeout(() => {
      log.warn('Seek timed out', { requestedSec: round2(time), atSec: round2(video.currentTime) });
      done();
    }, SEEK_TIMEOUT_MS);
    video.onseeked = done;
    video.currentTime = time;
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
