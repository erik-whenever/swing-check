import { describe, expect, it } from 'vitest';
import { DEFAULT_MEDIA_CAP_MB, mbToBytes, planMediaRetention, type MediaFootprint } from './mediaRetention';

const MB = 1024 * 1024;
const swing = (id: string, timestamp: number, videoMb: number, framesMb: number): MediaFootprint => ({
  id,
  timestamp,
  videoBytes: videoMb * MB,
  framesBytes: framesMb * MB,
});

describe('planMediaRetention', () => {
  it('purges nothing at or under the cap', () => {
    const plan = planMediaRetention([swing('a', 1, 40, 5), swing('b', 2, 40, 5)], 90 * MB);
    expect(plan.purges).toEqual([]);
    expect(plan.totalBytesAfter).toBe(90 * MB);
  });

  it('drops video from the oldest swing first, and only as much as needed', () => {
    // Input deliberately out of order: age decides, not position.
    const plan = planMediaRetention(
      [swing('new', 3, 40, 5), swing('old', 1, 40, 5), swing('mid', 2, 40, 5)],
      100 * MB,
    );
    expect(plan.purges).toEqual([{ id: 'old', purgeVideo: true, purgeFrames: false }]);
    expect(plan.totalBytesAfter).toBe(95 * MB);
  });

  it('drops every video before any frames', () => {
    // 3 × (40 + 5) = 135. With all videos gone 15 remain; the cap is 12 → frames of the oldest.
    const plan = planMediaRetention([swing('a', 1, 40, 5), swing('b', 2, 40, 5), swing('c', 3, 40, 5)], 12 * MB);
    expect(plan.purges).toEqual([
      { id: 'a', purgeVideo: true, purgeFrames: true },
      { id: 'b', purgeVideo: true, purgeFrames: false },
      { id: 'c', purgeVideo: true, purgeFrames: false },
    ]);
    expect(plan.totalBytesAfter).toBe(10 * MB);
  });

  it('skips swings whose video is already gone', () => {
    const plan = planMediaRetention([swing('purged', 1, 0, 5), swing('b', 2, 40, 5)], 20 * MB);
    expect(plan.purges).toEqual([{ id: 'b', purgeVideo: true, purgeFrames: false }]);
  });

  it('empties all media with a zero cap, and treats bad sizes as 0', () => {
    const plan = planMediaRetention(
      [swing('a', 1, 1, 1), { id: 'x', timestamp: 2, videoBytes: NaN, framesBytes: -5 }],
      0,
    );
    expect(plan.purges).toEqual([{ id: 'a', purgeVideo: true, purgeFrames: true }]);
    expect(plan.totalBytesAfter).toBe(0);
  });

  it('only ever plans media: purge entries carry no result or metadata fields', () => {
    const plan = planMediaRetention([swing('a', 1, 50, 5)], 10 * MB);
    for (const p of plan.purges) expect(Object.keys(p).sort()).toEqual(['id', 'purgeFrames', 'purgeVideo']);
  });
});

describe('mbToBytes', () => {
  it('converts the default cap to bytes and clamps negatives', () => {
    expect(mbToBytes(DEFAULT_MEDIA_CAP_MB)).toBe(300 * MB);
    expect(mbToBytes(-1)).toBe(0);
  });
});
