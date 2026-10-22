/// <reference types="node" />
// Local-only verification against Erik's own clips (data/shaft/clips/own/, gitignored).
// Skips itself when the clips are absent, so CI and other machines are unaffected.
import { existsSync, openAsBlob } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blobSource, probeMp4, readTimeStretch, stretchProfile } from './mp4Probe';

const DIR = 'data/shaft/clips/own';
const has = (f: string) => existsSync(`${DIR}/${f}`);
const probe = async (f: string) =>
  probeMp4(blobSource(await openAsBlob(`${DIR}/${f}`)), { decodeMebx: true });
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

  // S-43: the stretch read from scene-illuminance timing (see slowmo-diagnosis.md §5).
  it.skipIf(!has('IMG_3550.MOV'))('IMG_3550.MOV — 4× plateau 0.93–5.43 s from telemetry timing', async () => {
    const p = await probe('IMG_3550.MOV');
    const t = p.tracks.find((t) => t.mebxKeys.includes('com.apple.quicktime.scene-illuminance'))!;
    const plateau = stretchProfile(t.mebxSamples).find((s) => s.factor === 4)!;
    expect(plateau.startSec).toBeCloseTo(0.929, 2);
    expect(plateau.endSec).toBeCloseTo(5.427, 2);
    expect(plateau.captureSec).toBeCloseTo(135 / 120, 2);
  });

  it.skipIf(!has('IMG_3655.MOV'))('IMG_3655.MOV — real high-speed: telemetry is 1× throughout', async () => {
    const p = await probe('IMG_3655.MOV');
    const t = p.tracks.find((t) => t.mebxKeys.includes('com.apple.quicktime.scene-illuminance'))!;
    expect(stretchProfile(t.mebxSamples).map((s) => s.factor)).toEqual([1]);
  });

  it.skipIf(!has('IMG_3557.MOV'))('IMG_3557.MOV — no telemetry track, segment-identifier is a bare UUID', async () => {
    const p = await probe('IMG_3557.MOV');
    expect(p.tracks.some((t) => t.mebxKeys.includes('com.apple.quicktime.scene-illuminance'))).toBe(false);
    const seg = p.tracks.find((t) => t.mebxKeys.includes('com.apple.quicktime.segment-identifier'))!;
    expect(seg.mebxSamples).toHaveLength(1);
    expect(String(seg.mebxSamples[0].items[0].value)).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-/);
  });

  // S-44: the production flag on every own clip — exactly the 9 rendered Slo-Mo files.
  it.skipIf(!has('IMG_3550.MOV'))('readTimeStretch flags exactly the 9 rendered Slo-Mo clips (not 3555, not 3655)', async () => {
    const { readdirSync } = await import('node:fs');
    const flagged: string[] = [];
    for (const f of readdirSync(DIR).sort()) {
      if ((await readTimeStretch(await openAsBlob(`${DIR}/${f}`))).timeStretched) flagged.push(f);
    }
    expect(flagged).toEqual([
      'IMG_3550.MOV', 'IMG_3556.MOV', 'IMG_3557.MOV', 'IMG_3558.MOV', 'IMG_3569.MOV',
      'IMG_3575.MOV', 'IMG_3583.MOV', 'IMG_3587.MOV', 'IMG_3597.MOV',
    ]);
  });
});
