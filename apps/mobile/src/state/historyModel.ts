// Pure model for the local swing history (N-3.6) — the native counterpart of the web's
// SwingRecord: media are file URIs instead of Blobs/data URLs, and the shape extends
// StoredSwingMedia (mediaStore.ts) so retention runs on it directly. No expo imports.
//
// Invariant: an entry's results and metadata are never dropped — only its media, by
// retention, which flags videoPurged/framesPurged ("video rensad" in the history).

import type { AnalysisLanguage } from '@swingcheck/core/lib/language';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { RuleResult } from '@swingcheck/core/types';

export interface HistoryEntry {
  id: string;
  /** Recording time (ms). */
  timestamp: number;
  /** null once purged (or never stored). */
  videoUri: string | null;
  frameUris: string[];
  results: RuleResult[];
  overallAssessment: string;
  focusRuleId?: string;
  cameraAngle?: CameraAngle;
  sessionId?: string;
  /** Library ids the swing was analysed against. */
  ruleIds?: string[];
  /** Language the analysis was written in. */
  language?: AnalysisLanguage;
  videoPurged?: boolean;
  framesPurged?: boolean;
}

export interface HistoryFile {
  version: 1;
  entries: HistoryEntry[];
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/** One stored entry, or null when it lacks what a history row needs (id, time, results). */
export function sanitizeEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!isString(v.id) || v.id === '') return null;
  if (typeof v.timestamp !== 'number' || !Number.isFinite(v.timestamp)) return null;
  if (!Array.isArray(v.results)) return null;
  const entry: HistoryEntry = {
    id: v.id,
    timestamp: v.timestamp,
    videoUri: isString(v.videoUri) ? v.videoUri : null,
    frameUris: Array.isArray(v.frameUris) ? v.frameUris.filter(isString) : [],
    // OSÄKER: results are trusted as written by this app (checked only as an array).
    // Risk: low — the file is app-private and written only through addHistoryEntry.
    results: v.results as RuleResult[],
    overallAssessment: isString(v.overallAssessment) ? v.overallAssessment : '',
  };
  if (isString(v.focusRuleId)) entry.focusRuleId = v.focusRuleId;
  if (v.cameraAngle === 'dtl' || v.cameraAngle === 'face-on') entry.cameraAngle = v.cameraAngle;
  if (isString(v.sessionId)) entry.sessionId = v.sessionId;
  if (Array.isArray(v.ruleIds)) entry.ruleIds = v.ruleIds.filter(isString);
  if (v.language === 'sv' || v.language === 'en') entry.language = v.language;
  if (v.videoPurged === true) entry.videoPurged = true;
  if (v.framesPurged === true) entry.framesPurged = true;
  return entry;
}

/** Newest first; ties broken by id so the order is stable. */
export function sortHistory(entries: readonly HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
}

/**
 * Missing/corrupt file → empty history. Bad entries are skipped one by one, so one broken
 * row never costs the user the rest of their history.
 */
export function parseHistory(raw: string | null | undefined): HistoryEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as HistoryFile).entries)
      ? (parsed as HistoryFile).entries
      : [];
  const byId = new Map<string, HistoryEntry>();
  for (const item of list) {
    const e = sanitizeEntry(item);
    if (e && !byId.has(e.id)) byId.set(e.id, e);
  }
  return sortHistory([...byId.values()]);
}

export function serializeHistory(entries: readonly HistoryEntry[]): string {
  const file: HistoryFile = { version: 1, entries: [...entries] };
  return JSON.stringify(file);
}

/** Add (or replace by id) one entry. Never removes another entry. */
export function addHistoryEntry(entries: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return sortHistory([entry, ...entries.filter((e) => e.id !== entry.id)]);
}

/** Counts for the history header / storage setting. */
export function historyStats(entries: readonly HistoryEntry[]): {
  count: number;
  videoPurged: number;
  framesPurged: number;
} {
  return {
    count: entries.length,
    videoPurged: entries.filter((e) => e.videoPurged).length,
    framesPurged: entries.filter((e) => e.framesPurged).length,
  };
}
