// Dev-only frame grabber for the Pass 2 phase-weighted preview. Seeks a hidden
// <video> to a list of timestamps and returns JPEG base64 for each — the same
// seek-and-draw pattern frameExtractor.ts uses, kept SEPARATE here so Stream D
// never touches frameExtractor.ts. Only used behind VITE_DEV_PREVIEW to visualise
// the phase-weighted selection alongside Pass 1's even selection.

/** Longest side (px) of the grabbed frame — matches frameExtractor's cap. */
const GRAB_MAX_WIDTH = 1280;

export async function grabFramesAtTimes(
  videoBlob: Blob,
  timesSec: number[],
  quality = 0.8,
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

    const duration = video.duration;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth, GRAB_MAX_WIDTH);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
    const ctx = canvas.getContext('2d')!;

    const out: string[] = [];
    for (const time of timesSec) {
      const t = Math.min(duration - 0.05, Math.max(0, time));
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      out.push(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}
