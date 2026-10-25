// Tests for the pure state models from N-3.6 part 2 (settings, history, rules, error text).
import { describe, expect, it } from 'vitest';
import { ApiNotConfiguredError, UsageCapReachedError } from '@swingcheck/core/lib/api';
import { DEFAULT_MEDIA_CAP_MB } from '@swingcheck/core/lib/mediaRetention';
import { RULE_LIBRARY } from '@swingcheck/core/data/ruleLibrary';
import { analysisErrorView, classifyAnalysisError } from './errorText';
import { addHistoryEntry, historyStats, parseHistory, serializeHistory, type HistoryEntry } from './historyModel';
import { analysableRules, deriveActiveRules, toggleCustomRule } from './rulesModel';
import {
  applySettingsPatch,
  clampMediaCapMb,
  defaultSettings,
  MEDIA_CAP_MAX_MB,
  MEDIA_CAP_MIN_MB,
  parseSettings,
  sanitizeRuleIds,
  serializeSettings,
} from './settingsModel';

function entry(id: string, timestamp: number, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return { id, timestamp, videoUri: null, frameUris: [], results: [], overallAssessment: '', ...extra };
}

describe('settingsModel', () => {
  it('welcomeSeen: false by default, only literal true counts, survives a patch', () => {
    expect(defaultSettings().welcomeSeen).toBe(false);
    expect(parseSettings('{"welcomeSeen":"yes"}').welcomeSeen).toBe(false);
    expect(parseSettings('{"welcomeSeen":true}').welcomeSeen).toBe(true);
    expect(applySettingsPatch(defaultSettings(), { welcomeSeen: true }).welcomeSeen).toBe(true);
  });

  it('missing, empty or corrupt file → defaults', () => {
    expect(parseSettings(null)).toEqual(defaultSettings());
    expect(parseSettings('')).toEqual(defaultSettings());
    expect(parseSettings('{oops')).toEqual(defaultSettings());
    expect(parseSettings('{"version":2,"language":"en"}')).toEqual(defaultSettings());
  });

  it('round-trips and falls back field by field', () => {
    const s = { ...defaultSettings(), language: 'en' as const, level: 'advanced' as const };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
    const partial = parseSettings('{"language":"en","level":"pro","defaultAngle":"face-on"}');
    expect(partial).toMatchObject({ language: 'en', level: 'beginner', defaultAngle: 'face-on' });
  });

  it('clamps the media cap to range and step', () => {
    expect(clampMediaCapMb(1)).toBe(MEDIA_CAP_MIN_MB);
    expect(clampMediaCapMb(1e9)).toBe(MEDIA_CAP_MAX_MB);
    expect(clampMediaCapMb(274)).toBe(250);
    expect(clampMediaCapMb('x')).toBe(DEFAULT_MEDIA_CAP_MB);
  });

  it('keeps only known rule ids, first occurrence, in order', () => {
    const [a, b] = RULE_LIBRARY.map((r) => r.id);
    expect(sanitizeRuleIds([b, 'nope', a, b, 3])).toEqual([b, a]);
  });

  it('patches go through the same validation', () => {
    const next = applySettingsPatch(defaultSettings(), { language: 'xx' as never, mediaCapMb: 333 });
    expect(next.language).toBe(defaultSettings().language);
    expect(next.mediaCapMb).toBe(350);
  });
});

describe('historyModel', () => {
  it('corrupt file → empty; bad rows skipped one by one; duplicates collapse', () => {
    expect(parseHistory('nope')).toEqual([]);
    const raw = JSON.stringify({ version: 1, entries: [entry('a', 1), { id: 'x' }, entry('b', 2), entry('a', 9)] });
    expect(parseHistory(raw).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('round-trips with purge flags', () => {
    const list = [entry('a', 1, { videoPurged: true, framesPurged: true, language: 'en', cameraAngle: 'dtl' })];
    expect(parseHistory(serializeHistory(list))).toEqual(list);
  });

  it('add never drops another entry and keeps newest first', () => {
    const list = addHistoryEntry([entry('a', 1), entry('b', 3)], entry('c', 2));
    expect(list.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('stats count purged media', () => {
    expect(historyStats([entry('a', 1, { videoPurged: true }), entry('b', 2)])).toEqual({
      count: 2,
      videoPurged: 1,
      framesPurged: 0,
    });
  });
});

describe('rulesModel', () => {
  it('recommended mode yields rules for the angle, all unvalidated without V-1 data', () => {
    const set = deriveActiveRules({ settings: defaultSettings() });
    expect(set.mode).toBe('recommended');
    expect(set.empty).toBe(false);
    expect(set.rules.every((r) => r.validation === 'unvalidated' && r.matchesAngle)).toBe(true);
  });

  it('custom mode keeps the user order and flags rules the angle cannot judge', () => {
    const faceOnOnly = RULE_LIBRARY.find((r) => r.angles.length === 1 && r.angles[0] === 'face-on');
    const dtl = RULE_LIBRARY.find((r) => r.angles.includes('dtl'));
    if (!faceOnOnly || !dtl) throw new Error('library fixture changed');
    const settings = { ...defaultSettings(), ruleMode: 'custom' as const, customRuleIds: [faceOnOnly.id, dtl.id] };
    const set = deriveActiveRules({ settings, angle: 'dtl' });
    expect(set.rules.map((r) => r.libraryId)).toEqual([faceOnOnly.id, dtl.id]);
    expect(set.rules.map((r) => r.matchesAngle)).toEqual([false, true]);
    expect(analysableRules(set).map((r) => r.id)).toEqual([dtl.id]);
  });

  it('custom mode with nothing picked is empty', () => {
    const set = deriveActiveRules({ settings: { ...defaultSettings(), ruleMode: 'custom' } });
    expect(set.empty).toBe(true);
  });

  it('toggle appends and removes', () => {
    expect(toggleCustomRule(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleCustomRule(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('errorText', () => {
  it('maps the usage cap by scope, in the chosen language', () => {
    expect(classifyAnalysisError(new UsageCapReachedError('install'))).toBe('usage-cap-install');
    expect(classifyAnalysisError(new UsageCapReachedError('daily'))).toBe('usage-cap-daily');
    const view = analysisErrorView(new UsageCapReachedError('daily'), 'en');
    expect(view).toMatchObject({ kind: 'usage-cap-daily', retryable: false });
    expect(view.title).toMatch(/used up/);
  });

  it('falls back on the error name when instanceof fails (two copies of core)', () => {
    expect(classifyAnalysisError({ name: 'UsageCapReachedError', scope: 'install' })).toBe('usage-cap-install');
  });

  it('classifies the rest', () => {
    expect(classifyAnalysisError(new ApiNotConfiguredError())).toBe('not-configured');
    expect(classifyAnalysisError(new TypeError('Network request failed'))).toBe('network');
    expect(analysisErrorView(new Error('x'), 'sv')).toMatchObject({ kind: 'unknown', retryable: true });
  });
});
