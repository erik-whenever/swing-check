import { describe, expect, it } from 'vitest';

import { capChangeWarning, capOptions, formatBytes, formatMb, storageSummary } from './settingsLogic';

const MB = 1024 * 1024;

describe('formatMb / formatBytes', () => {
  it('visar MB under 1000 och GB med decimalkomma över', () => {
    expect(formatMb(300)).toBe('300 MB');
    expect(formatMb(1000)).toBe('1 GB');
    expect(formatMb(1536)).toBe('1,5 GB');
  });
  it('visar "< 1 MB" för små men icke-tomma storlekar', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(200_000)).toBe('< 1 MB');
    expect(formatBytes(124 * MB)).toBe('124 MB');
  });
});

describe('capOptions', () => {
  it('ger förvalen i ordning', () => {
    expect(capOptions(300).map((o) => o.value)).toEqual(['150', '300', '600', '1000']);
  });
  it('tar med ett sparat tak utanför förvalen', () => {
    expect(capOptions(450).map((o) => o.value)).toEqual(['150', '300', '450', '600', '1000']);
  });
});

describe('storageSummary', () => {
  it('ger etikett och andel, klampad till 1', () => {
    expect(storageSummary(150 * MB, 300)).toEqual({ label: '150 MB av 300 MB', fraction: 0.5 });
    expect(storageSummary(900 * MB, 300).fraction).toBe(1);
  });
});

describe('capChangeWarning', () => {
  it('varnar bara när lagrat överstiger det nya taket', () => {
    expect(capChangeWarning(100 * MB, 150)).toBeNull();
    expect(capChangeWarning(150 * MB, 150)).toBeNull();
    const w = capChangeWarning(400 * MB, 300);
    expect(w).toContain('400 MB');
    expect(w).toContain('Resultaten sparas alltid');
  });
});
