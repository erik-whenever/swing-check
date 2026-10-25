// Stub for the upload → analysis pipeline (N-3.6 del 6). Nothing here touches the network.
//
// TODO(N-3.x): pick a clip (expo-image-picker / camera roll), run poseSegments for the swing
// window, extract key frames, then call the Worker via @swingcheck/core and store the result
// with useHistory().addSwing. Until then the containers only show the screens.
//
// OSÄKER: the real pipeline's shape (progress events per step, cancellation) is a guess based
// on AnalysisScreen's four steps. Risk: low — only this stub and AnalysisContainer change.

import type { AnalysisStepId, AnalysisStepState } from '../screens/AnalysisScreen';

export interface PipelineProgress {
  steps: Partial<Record<AnalysisStepId, AnalysisStepState>>;
  progress: number;
  remainingSeconds: number | null;
}

/** False until the pipeline exists; the "Bedöm svingen" button stays disabled outside dev. */
export const UPLOAD_PIPELINE_AVAILABLE = false;

/** The idle state AnalysisScreen shows while the pipeline is a stub. */
export function idleProgress(): PipelineProgress {
  return { steps: {}, progress: 0, remainingSeconds: null };
}

/**
 * Starts an analysis. Stub: reports the idle state once and never finishes — no network,
 * no Claude call. Returns a cancel function.
 */
export function startUploadAnalysis(onProgress: (p: PipelineProgress) => void): () => void {
  onProgress(idleProgress());
  return () => {};
}
