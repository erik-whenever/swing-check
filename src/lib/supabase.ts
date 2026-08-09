// Supabase client + swing-history persistence helpers.
//
// Supabase is an OPTIONAL backend layer on top of the existing IndexedDB cache. When the
// VITE_SUPABASE_* env vars are absent (e.g. local dev without a project) the client is
// null and every helper degrades to a no-op, so the IndexedDB-only flow is unchanged.
//
// Only swing METADATA + results are stored remotely — video blobs and base64 frames stay
// local in IndexedDB. There is no auth yet, so user_id is always null for now.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SwingRecord } from '../types';
import type { CameraAngle } from './cameraAngle';
import { createLogger } from './logger';

const log = createLogger('Supabase');

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// TILLFÄLLIGT AV. Supabase-projektet är oåtkomligt och lagret ger inget värde
// förrän auth finns (Ström B: magic link + user_id). Sätt till false när
// auth-grunden landar och projektet är verifierat nåbart igen.
const SUPABASE_DISABLED = true;

/** The shared client, or null when Supabase is not configured. */
export const supabase: SupabaseClient | null =
  SUPABASE_DISABLED || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY
    ? null
    : createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/** True when a Supabase project is configured and history should sync remotely. */
export function isSupabaseEnabled(): boolean {
  return supabase !== null;
}

const TABLE = 'swing_records';

/** Shape of a row in the `swing_records` table. */
interface SwingRow {
  id: string;
  user_id: string | null;
  created_at: string;
  camera_angle: string | null;
  focus_rule_id: string | null;
  overall_assessment: string | null;
  frame_quality: string | null;
  results: SwingRecord['results'];
  cannot_determine_reasons: string[] | null;
}

/**
 * Upsert a swing's metadata + results to Supabase. Fire-and-forget: any failure is logged
 * and swallowed so the IndexedDB save (the source of truth) is never affected.
 */
export async function saveSwingToSupabase(record: SwingRecord): Promise<void> {
  if (!supabase) return;
  try {
    const row: SwingRow = {
      id: record.id,
      user_id: null,
      created_at: new Date(record.timestamp).toISOString(),
      camera_angle: record.cameraAngle ?? null,
      focus_rule_id: record.focusRuleId ?? null,
      overall_assessment: record.overallAssessment,
      frame_quality: null,
      results: record.results,
      cannot_determine_reasons: null,
    };
    const { error } = await supabase.from(TABLE).upsert(row);
    if (error) {
      log.warn('Failed to save swing to Supabase', { id: record.id, error: error.message });
    } else {
      log.debug('Swing synced to Supabase', { id: record.id });
    }
  } catch (err) {
    log.warn('Supabase save threw', { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Load swing metadata from Supabase, newest first. Returns partial SwingRecords (no video
 * blob / frames — those live only in IndexedDB and are merged in by the caller). Returns
 * null when Supabase is unavailable or the query fails, signalling the caller to fall back
 * to IndexedDB.
 */
export async function loadSwingsFromSupabase(limit: number): Promise<SwingRecord[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      log.warn('Failed to load swings from Supabase', { error: error.message });
      return null;
    }
    return (data as SwingRow[]).map((row) => ({
      id: row.id,
      timestamp: Date.parse(row.created_at),
      // Placeholder — hydrated from IndexedDB by id when available locally.
      videoBlob: new Blob([]),
      frames: [],
      results: row.results ?? [],
      focusRuleId: row.focus_rule_id ?? undefined,
      overallAssessment: row.overall_assessment ?? '',
      cameraAngle: (row.camera_angle as CameraAngle) ?? undefined,
    }));
  } catch (err) {
    log.warn('Supabase load threw', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
