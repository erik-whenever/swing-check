// DEV-ONLY (VITE_DEV_PREVIEW) — turn video files into a shaft-annotation dataset.
//
// THE CHAIN IS PRODUCTION'S, VERBATIM. Nothing about frame selection is reimplemented
// here; this file is glue:
//
//   extractPoseTrajectory()   pose samples for the whole clip        (poseTrajectory.ts)
//     → detectSessionSwings() one segment per swing, gated           (poseSegments.ts)
//       → collectDatasetSwings() re-judge the rejects, looser        (datasetGate.ts — dev only)
//         → selectEnvelopeFrames(envelope, ANALYSIS_FRAME_COUNT, …)  (poseEnvelopeSelection.ts)
//           → cullToPhaseTargets(…, MAX_FRAMES_PER_SWING, state)     (phaseQuota.ts — dev only)
//             → grabFramesAtTimes(quality 0.92, full frame)          (poseFrameGrab.ts)
//
// That matters more than convenience: a shaft detector will run on the frames
// production sends, so the dataset has to be drawn from the same selection. Two steps
// are dev-side only, and neither reaches into production:
//
//   - the GATE, which takes swings production's `isSwing` refused (clipped tail, slow
//     motion past the 3 s cap) because a labelling budget and an analysis budget want
//     different things. `isSwing` is untouched; the extra swings are tagged `gate`.
//   - the CULL, which subsets those 32 frames down to a number a human can annotate.
//     It removes frames, it never picks different ones. Its phase deficit runs across
//     the WHOLE export, so the light phases get their share (see phaseQuota.ts).
//
// FULL RESOLUTION, NO CROP. `maxOutputSide: Infinity` and no `cropBounds`, so the JPEG
// is the source frame untouched. The Ström E crop is right for the Vision call (it
// pays per pixel) and wrong here: annotating a shaft means placing two points to
// sub-shaft-width accuracy, and a downscale or a crop throws away exactly the pixels
// that decision rests on. Quality 0.92 for the same reason.
//
// Reads production, feeds nothing back into it: no store writes, no Vision call, no
// SwingRecord.

import { ANALYSIS_FRAME_COUNT } from '../frameExtractor';
import { createLogger } from '../logger';
import { grabFramesAtTimes } from '../poseFrameGrab';
import { selectEnvelopeFrames } from '../poseEnvelopeSelection';
import { detectSessionSwings } from '../poseSegments';
import { extractPoseTrajectory } from '../poseTrajectory';
import { derivePhase } from './datasetPhase';
import {
  DATASET_MAX_ENVELOPE_SEC,
  DATASET_MIN_ENVELOPE_SEC,
  MULTI_SWING_SUSPECT_SEC,
  collectDatasetSwings,
  gateCounts,
  type DatasetGate,
} from './datasetGate';
import {
  APP_VERSION,
  SHAFT_PHASES,
  frameId,
  type ClipSource,
  type DatasetManifest,
  type FrameMetadata,
  type ShaftPhase,
} from './datasetTypes';
import {
  MAX_FRAMES_PER_SWING,
  PHASE_TARGET_WEIGHTS,
  createPhaseQuotaState,
  cullToPhaseTargets,
  tallyPhases,
  type PhaseQuotaState,
} from './phaseQuota';
import {
  SLOWMO_ENVELOPE_THRESHOLD_SEC,
  SLOWMO_FRAME_CAP_FRAC,
  deriveSlowmo,
  type SlowmoMode,
} from './slowmo';
import { base64ToBytes, buildZip, type ZipEntry } from './zip';

const log = createLogger('DatasetExtract');

/** JPEG quality for the exported frames — high, because annotation needs the detail. */
export const FRAME_QUALITY = 0.92;

/** One clip queued for extraction, with the attributes the user set for it. */
export interface ClipInput {
  file: File;
  source: ClipSource;
  /**
   * How slow motion is decided for this clip's swings: `auto` derives it per swing from
   * the envelope duration, the force modes override it. Slow motion itself is a per-SWING
   * property (a clip can hold both), so this is only the override, not the answer.
   */
  slowmoMode: SlowmoMode;
  notes: string;
}

/** One exported frame: its manifest record plus the JPEG it describes. */
export interface ExtractedFrame {
  meta: FrameMetadata;
  jpegBase64: string;
}

export interface SwingResult {
  swingIndex: number;
  envelopeSec: [number, number];
  impactSec: number | null;
  /** Frames `selectEnvelopeFrames` returned, before the cull — for the summary. */
  selectedCount: number;
  /** Which gate admitted this swing (see datasetGate.ts). */
  gate: DatasetGate;
  /** Envelope had no settled finish. Accepted here, rejected by production. */
  clippedTail: boolean;
  /** Envelope long enough to possibly hold more than one swing — needs a human eye. */
  suspectMultiSwing: boolean;
  frames: ExtractedFrame[];
}

export interface ClipResult {
  clipName: string;
  poseSamples: number;
  swings: SwingResult[];
  /** Candidates the segmentation gate rejected, with reasons — a zero-swing clip
   *  must be diagnosable without opening the log panel. */
  rejected: string[];
  /** Set when the clip failed outright (unreadable file, pose crash). */
  error?: string;
}

export interface DatasetRun {
  extractedAt: string;
  clips: ClipResult[];
  /** Every frame across every clip, in clip → swing → time order. */
  frames: ExtractedFrame[];
  /** Frames per phase, and the same as a percentage next to the spec's targets. */
  distribution: PhaseDistribution[];
  /** Share of frames drawn from slow-motion swings, against the spec's 15 % cap. */
  slowmo: SlowmoSummary;
  /** How many swings each acceptance gate contributed across the whole run. */
  gates: GateSummary;
}

/** Swing counts per acceptance gate — the run's answer to "how much did we loosen?". */
export interface GateSummary {
  /** Swings production's `isSwing` accepted unchanged. */
  production: number;
  /** Swings only the dataset-relaxed gate accepted. */
  relaxed: number;
  /** Swings flagged `suspectMultiSwing`, across both gates. */
  suspectMultiSwing: number;
}

export interface SlowmoSummary {
  /** Frames whose swing was flagged slow motion. */
  frames: number;
  /** Share of the run's frames, percent. */
  pct: number;
  /** The spec's cap, percent. */
  capPct: number;
  /** True when `pct` exceeds `capPct` — the run leans too hard on slow motion. */
  overCap: boolean;
}

export interface PhaseDistribution {
  phase: ShaftPhase;
  count: number;
  /** Share of the run's frames, percent. */
  actualPct: number;
  /** The spec's target share, percent. */
  targetPct: number;
}

export interface ExtractProgress {
  clipIndex: number;
  clipCount: number;
  clipName: string;
  stage: 'pose' | 'grabbing' | 'done';
  /** 0–1 within the current stage; only the pose stage reports intermediate values. */
  fraction: number;
}

/**
 * Run the chain over every clip. Never throws: a clip that fails is recorded with its
 * error and the run continues, because losing nine clips to one unreadable file is a
 * bad trade when each clip costs minutes of pose inference.
 */
export async function extractDataset(
  clips: ClipInput[],
  options: { onProgress?: (p: ExtractProgress) => void; signal?: AbortSignal } = {},
): Promise<DatasetRun> {
  const { onProgress, signal } = options;
  const results: ClipResult[] = [];
  const frames: ExtractedFrame[] = [];
  const startedAt = new Date();
  // The phase deficit runs across the WHOLE export, clips included — otherwise a light
  // phase like `finish` never wins a deal and the dataset simply lacks it. Threaded
  // through every cull below; `cullToPhaseTargets` never mutates what it is handed.
  let quota: PhaseQuotaState = createPhaseQuotaState();

  for (const [clipIndex, clip] of clips.entries()) {
    if (signal?.aborted) break;
    const clipName = clip.file.name;
    const report = (stage: ExtractProgress['stage'], fraction: number) =>
      onProgress?.({ clipIndex, clipCount: clips.length, clipName, stage, fraction });

    try {
      report('pose', 0);
      const samples = await extractPoseTrajectory(clip.file, {
        onProgress: (f) => report('pose', f),
      });
      if (signal?.aborted) break;

      const session = detectSessionSwings(samples);
      // Production's verdict first, then the dev gate over what it rejected. Ordered by
      // envelope start, so `swingIndex` — and therefore every frame id — is time-ordered
      // regardless of which gate found the swing.
      const detected = collectDatasetSwings(session);
      report('grabbing', 0);

      const swings: SwingResult[] = [];
      for (const [swingIndex, swing] of detected.swings.entries()) {
        if (signal?.aborted) break;
        // Exactly production's call — bounded to this segment, budget ANALYSIS_FRAME_COUNT.
        const selection = selectEnvelopeFrames(
          swing.envelope,
          ANALYSIS_FRAME_COUNT,
          swing.candidate.startSec,
          swing.candidate.endSec,
        );
        const phased = selection.picks.map((pick) => ({
          t: pick.t,
          phase: derivePhase(pick.t, swing.envelope),
        }));
        const culled = cullToPhaseTargets(phased, MAX_FRAMES_PER_SWING, quota);
        const kept = culled.kept;
        quota = culled.state;

        const envelopeSec: [number, number] = [
          swing.envelope.startSec,
          swing.envelope.finishSec,
        ];
        // Slow motion is decided PER SWING from how long its envelope lasts (or forced
        // by the clip's mode) — a clip can carry both a normal and a slow rep.
        const envelopeDurationSec = envelopeSec[1] - envelopeSec[0];
        const slowmo = deriveSlowmo(envelopeDurationSec, clip.slowmoMode);
        const { frames: jpegs } = await grabFramesAtTimes(
          clip.file,
          kept.map((k) => k.t),
          FRAME_QUALITY,
          { maxOutputSide: Number.POSITIVE_INFINITY },
        );
        if (signal?.aborted) break;

        const swingFrames: ExtractedFrame[] = kept.map((pick, frameIndex) => ({
          jpegBase64: jpegs[frameIndex],
          meta: {
            id: frameId(clipName, swingIndex, frameIndex),
            clipName,
            swingIndex,
            frameIndex,
            tSec: round3(pick.t),
            phase: pick.phase,
            envelopeSec: [round3(envelopeSec[0]), round3(envelopeSec[1])],
            impactSec: swing.impactSec === null ? null : round3(swing.impactSec),
            source: clip.source,
            slowmo,
            envelopeDurationSec: round3(envelopeDurationSec),
            slowmoMode: clip.slowmoMode,
            gate: swing.gate,
            clippedTail: swing.envelope.clippedTail,
            hasConfidentImpact: swing.impactSec !== null,
            suspectMultiSwing: swing.suspectMultiSwing,
            notes: clip.notes,
          },
        }));

        swings.push({
          swingIndex,
          envelopeSec,
          impactSec: swing.impactSec,
          selectedCount: selection.picks.length,
          gate: swing.gate,
          clippedTail: swing.envelope.clippedTail,
          suspectMultiSwing: swing.suspectMultiSwing,
          frames: swingFrames,
        });
        frames.push(...swingFrames);
        report('grabbing', (swingIndex + 1) / detected.swings.length);
      }

      results.push({
        clipName,
        poseSamples: samples.length,
        swings,
        // Only what NEITHER gate wanted — the reason is the relaxed gate's, since that
        // is the one that had the final say.
        rejected: detected.rejected.map(
          (r) => `[${r.candidate.startSec.toFixed(2)}–${r.candidate.endSec.toFixed(2)}] ${r.reason}`,
        ),
      });

      // WARN so it surfaces in the in-app panel — the extractor runs on a phone too.
      const counts = gateCounts(detected.swings);
      log.warn('Clip extracted', {
        clipName,
        poseSamples: samples.length,
        swings: detected.swings.length,
        viaProductionGate: counts.production,
        viaRelaxedGate: counts.relaxed,
        suspectMultiSwing: counts.suspectMultiSwing,
        rejected: detected.rejected.length,
        frames: swings.reduce((sum, s) => sum + s.frames.length, 0),
        segmentationReason: session.segmentation.reason ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ clipName, poseSamples: 0, swings: [], rejected: [], error: message });
      log.error('Clip failed', { clipName, error: message });
    }
    report('done', 1);
  }

  return {
    extractedAt: startedAt.toISOString(),
    clips: results,
    frames,
    distribution: distribution(frames.map((f) => f.meta)),
    slowmo: slowmoSummary(frames.map((f) => f.meta)),
    gates: gateCounts(results.flatMap((c) => c.swings)),
  };
}

/** Slow-motion frame share of a run, against the spec's cap. */
export function slowmoSummary(metas: { slowmo: boolean }[]): SlowmoSummary {
  const total = metas.length;
  const frames = metas.filter((m) => m.slowmo).length;
  const pct = total > 0 ? round1((frames / total) * 100) : 0;
  const capPct = round1(SLOWMO_FRAME_CAP_FRAC * 100);
  return { frames, pct, capPct, overCap: pct > capPct };
}

/** Phase mix of a run, as counts and as percentages against the spec's targets. */
export function distribution(metas: { phase: ShaftPhase }[]): PhaseDistribution[] {
  const tally = tallyPhases(metas.map((m) => ({ t: 0, phase: m.phase })));
  const total = metas.length;
  const weightSum = SHAFT_PHASES.reduce((sum, p) => sum + PHASE_TARGET_WEIGHTS[p], 0);
  return SHAFT_PHASES.map((phase) => ({
    phase,
    count: tally[phase],
    actualPct: total > 0 ? round1((tally[phase] / total) * 100) : 0,
    targetPct: round1((PHASE_TARGET_WEIGHTS[phase] / weightSum) * 100),
  }));
}

/** The ZIP: `frames/<id>.jpg` for every frame plus `manifest.json`. */
export function buildDatasetZip(run: DatasetRun): Blob {
  const manifest: DatasetManifest = {
    appVersion: APP_VERSION,
    extractedAt: run.extractedAt,
    frameQuality: FRAME_QUALITY,
    maxFramesPerSwing: MAX_FRAMES_PER_SWING,
    slowmoThresholdSec: SLOWMO_ENVELOPE_THRESHOLD_SEC,
    phaseTargets: PHASE_TARGET_WEIGHTS,
    relaxedEnvelopeSecRange: [DATASET_MIN_ENVELOPE_SEC, DATASET_MAX_ENVELOPE_SEC],
    multiSwingSuspectSec: MULTI_SWING_SUSPECT_SEC,
    clipCount: run.clips.length,
    swingCount: run.clips.reduce((sum, c) => sum + c.swings.length, 0),
    swingsByGate: run.gates,
    frameCount: run.frames.length,
    frames: run.frames.map((f) => f.meta),
  };

  const entries: ZipEntry[] = run.frames.map((f) => ({
    path: `frames/${f.meta.id}.jpg`,
    data: base64ToBytes(f.jpegBase64),
  }));
  entries.push({
    path: 'manifest.json',
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });

  return buildZip(entries, new Date(run.extractedAt));
}

/** File name for the download: dataset date, so two exports never collide. */
export function datasetFileName(run: DatasetRun): string {
  return `shaft-dataset-${run.extractedAt.slice(0, 19).replace(/[:T]/g, '')}.zip`;
}

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
