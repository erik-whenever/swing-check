import { describe, expect, it } from 'vitest';
import { formatInstallId, isValidInstallId, resolveInstallId } from './installId';

const bytes = (fill: number) => new Uint8Array(16).fill(fill);

describe('formatInstallId', () => {
  it('sets the version-4 and variant bits whatever the input', () => {
    expect(formatInstallId(bytes(0x00))).toBe('00000000-0000-4000-8000-000000000000');
    expect(formatInstallId(bytes(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('produces ids that validate', () => {
    for (let i = 0; i < 50; i++) {
      const b = new Uint8Array(16).map(() => Math.floor(Math.random() * 256));
      expect(isValidInstallId(formatInstallId(b))).toBe(true);
    }
  });

  it('does not mutate the caller’s buffer', () => {
    const b = bytes(0xff);
    formatInstallId(b);
    expect(Array.from(b)).toEqual(Array(16).fill(0xff));
  });

  it('rejects a buffer that is not 16 bytes', () => {
    expect(() => formatInstallId(new Uint8Array(8))).toThrow(/16 bytes/);
  });
});

describe('isValidInstallId', () => {
  it.each([
    [null],
    [''],
    ['not-a-uuid'],
    ['00000000-0000-1000-8000-000000000000'], // version 1
    ['00000000-0000-4000-c000-000000000000'], // wrong variant
    ['FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF'], // uppercase is not what we issue
    [' 00000000-0000-4000-8000-000000000000'],
    [42],
  ])('rejects %j', (v) => {
    expect(isValidInstallId(v)).toBe(false);
  });
});

describe('resolveInstallId', () => {
  const rng = (n: number) => new Uint8Array(n).fill(0xab);

  it('keeps a valid stored id', () => {
    const stored = '12345678-90ab-4cde-8f01-234567890abc';
    expect(resolveInstallId(stored, rng)).toEqual({ id: stored, created: false });
  });

  it.each([[null], [undefined], ['garbage']])('mints a new id when stored is %j', (stored) => {
    const r = resolveInstallId(stored, rng);
    expect(r.created).toBe(true);
    expect(isValidInstallId(r.id)).toBe(true);
  });

  it('asks for exactly 16 bytes', () => {
    let asked = 0;
    resolveInstallId(null, (n) => {
      asked = n;
      return new Uint8Array(n);
    });
    expect(asked).toBe(16);
  });
});
