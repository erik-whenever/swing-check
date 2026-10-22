/// <reference types="node" />
// Local-only verification against Erik's own clips (data/shaft/clips/own/, gitignored).
// Skips itself when the clips are absent, so CI and other machines are unaffected.
import { existsSync, openAsBlob } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blobSource, probeMp4 } from './mp4Probe';

const DIR = 'data/shaft/clips/own';
const has = (f: string) => existsSync(`${DIR}/${f}`);
const probe = async (f: string) => probeMp4(blobSource(await openAsBlob(`${DIR}/${f}`)));
const video = (p: Awaited<ReturnType<typeof probe>>) => p.tracks.find((t) => t.handler === 'vide')!;

describe('mp4Probe vs slowmo-diagnosis.md', () => {
  it.skipIf(!has('IMG_3550.MOV'))('IMG_3550.MOV — flat slow-mo: 30 fps, 1 delta, 6.17 s, Apple key', async () => {
    const p = await probe('IMG_3550.MOV');
    console.log(JSON.stringify(p, null, 1));
    expect(video(p).codec).toBe('hvc1');
    expect(video(p).stts!.fps).toBeCloseTo(30, 2);
    expect(video(p).stts!.distinctDeltas).toBe(1);
    expect(p.movieDurationSec).toBeCloseTo(6.17, 1);
    expect(p.appleKeysRaw).toContain('com.apple.quicktime.full-frame-rate-playback-intent');
  });

  it.skipIf(!has('IMG_3555.MOV'))('IMG_3555.MOV — real high-speed: 119.94 fps, 2 deltas, 0.78 s', async () => {
    const p = await probe('IMG_3555.MOV');
    console.log(JSON.stringify(p, null, 1));
    expect(video(p).stts!.fps).toBeCloseTo(119.94, 1);
    expect(video(p).stts!.distinctDeltas).toBe(2);
    expect(p.movieDurationSec).toBeCloseTo(0.78, 1);
    expect(p.appleKeysRaw).toContain('com.apple.quicktime.full-frame-rate-playback-intent');
  });

  it.skipIf(!has('IMG_5410.MP4'))('IMG_5410.MP4 — ordinary 30 fps, avc1, no Apple slow-mo key', async () => {
    const p = await probe('IMG_5410.MP4');
    console.log(JSON.stringify(p, null, 1));
    expect(video(p).codec).toBe('avc1');
    expect(video(p).stts!.fps).toBeCloseTo(30, 1);
    expect(p.appleKeysRaw).not.toContain('com.apple.quicktime.full-frame-rate-playback-intent');
  });
});
