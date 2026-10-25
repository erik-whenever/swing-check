// Expo implementations of the upload pipeline's injected dependencies (N-3.6 del 12).
// The orchestration itself is pure and tested in uploadPipeline.ts.

import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { getThumbnailAsync } from 'expo-video-thumbnails';

import { ANGLE_TO_PROMPT } from '@swingcheck/core/lib/cameraAngle';
import { analyzeSwing } from '@swingcheck/core/lib/api';
import {
  FRAME_JPEG_QUALITY,
  frameResize,
  type FrameSource,
  type PickedClip,
  type UploadDeps,
} from './uploadPipeline';
import type { HistoryEntry } from '../state/historyModel';

/** Opens the camera roll (videos only). null when the user cancels. */
export async function pickClip(): Promise<PickedClip | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const name = (asset.fileName ?? 'Klipp').replace(/\.[^.]+$/, '');
  // expo-image-picker reports duration in ms.
  return { uri: asset.uri, duration: (asset.duration ?? 0) / 1000, name };
}

/**
 * Interim frame source: a still at the given time via AVAssetImageGenerator
 * (expo-video-thumbnails), longest edge scaled to ≤1280 px and re-encoded as JPEG 0.8 like the web.
 * N-3.4's native `capture` replaces this behind the same FrameSource interface.
 */
// OSÄKER: AVAssetImageGenerator's default tolerance may snap to a nearby keyframe instead of
// the exact time. Risk: medium — neighbouring frames can repeat in a fast swing; visible in the
// phase strip, and N-3.4 replaces this source.
export const thumbnailFrameSource: FrameSource = {
  async grab(clipUri, timeSec) {
    const thumb = await getThumbnailAsync(clipUri, { time: Math.round(timeSec * 1000), quality: 1 });
    const ctx = ImageManipulator.manipulate(thumb.uri);
    const resize = frameResize(thumb.width, thumb.height);
    if (resize) ctx.resize(resize);
    const ref = await ctx.renderAsync();
    const saved = await ref.saveAsync({ compress: FRAME_JPEG_QUALITY, format: SaveFormat.JPEG, base64: true });
    deleteQuietly(thumb.uri);
    if (!saved.base64) throw new Error('Frame encoding returned no data');
    return { base64: saved.base64, uri: saved.uri };
  },
};

function deleteQuietly(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Cache files; the OS clears them anyway.
  }
}

const MEDIA_DIR = 'media';

/** Moves the clip copy and frames into documents/media/<id>/ so they survive cache clears. */
async function persistMedia(id: string, clipUri: string, frameUris: string[]) {
  const dir = new Directory(Paths.document, MEDIA_DIR, id);
  dir.create({ intermediates: true, idempotent: true });
  let videoUri: string | null = null;
  try {
    const src = new File(clipUri);
    const ext = src.extension || '.mov';
    const dest = new File(dir, `clip${ext}`);
    src.copy(dest);
    videoUri = dest.uri;
  } catch (err) {
    // The analysis is still worth keeping without its video.
    console.warn('[upload] could not store clip', String(err));
  }
  const kept: string[] = [];
  frameUris.forEach((uri, i) => {
    try {
      const dest = new File(dir, `frame-${String(i).padStart(2, '0')}.jpg`);
      new File(uri).move(dest);
      kept.push(dest.uri);
    } catch (err) {
      console.warn('[upload] could not store frame', String(err));
    }
  });
  return { videoUri, frameUris: kept };
}

export function createUploadDeps(addSwing: (entry: HistoryEntry) => Promise<void>): UploadDeps {
  return {
    frames: thumbnailFrameSource,
    analyze: (frames, rules, { cameraAngle, language }) =>
      analyzeSwing(frames, rules, { cameraAngle: ANGLE_TO_PROMPT[cameraAngle], language }),
    persistMedia,
    addSwing,
    newId: randomUUID,
    now: Date.now,
  };
}
