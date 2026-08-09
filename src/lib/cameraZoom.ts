import { createLogger } from './logger';

const log = createLogger('cameraZoom');

/**
 * Ultra-wide. The diagnostics of the active track ("Bakre trippelkamera") report
 * zoom `min 0.5 / max 10`, and 0.5 is the ultra-wide lens — it roughly halves the
 * distance the phone has to stand from the golfer for the whole swing to fit,
 * which is the real usability problem on a range. No device switch is involved:
 * the zoom is a constraint on the track that is already streaming.
 */
export const WIDE_ANGLE_ZOOM = 0.5;
/** The default lens. */
export const NORMAL_ZOOM = 1;

/** What `zoom` looks like in `getCapabilities()` — it is not in the DOM types. */
interface ZoomCapability {
  min: number;
  max: number;
  step?: number;
}

export type ZoomOutcome =
  /** Constraint accepted. `actual` is what the track reports afterwards. */
  | { status: 'applied'; requested: number; actual: number | undefined }
  /** Track exposes no zoom capability — nothing to do, and not an error. */
  | { status: 'unsupported' }
  /** The track rejected the constraint. */
  | { status: 'failed'; requested: number; error: string };

/**
 * A track without zoom is a normal outcome (desktop webcams, older phones), so it
 * must not spam the log on every stream — warn once per page load and stay quiet.
 */
let warnedUnsupported = false;

/**
 * Apply the wide-angle zoom to a live video track.
 *
 * Must only be called while NOT recording: `applyConstraints` reshapes the track
 * the MediaRecorder is reading, and a lens change mid-swing would corrupt the clip
 * the analysis depends on. `useCamera` enforces that; this function does not.
 */
export async function applyCameraZoom(
  track: MediaStreamTrack,
  wideAngle: boolean,
): Promise<ZoomOutcome> {
  // zoom is experimental and absent from the DOM types; cast the same way
  // cameraDiagnostics.ts does.
  const capabilities = track.getCapabilities?.() as unknown as
    | Record<string, unknown>
    | undefined;
  const zoomCap = capabilities?.zoom as ZoomCapability | undefined;

  if (!zoomCap || typeof zoomCap.min !== 'number' || typeof zoomCap.max !== 'number') {
    if (!warnedUnsupported) {
      warnedUnsupported = true;
      log.warn('Zoom not supported by this track — wide angle skipped', {
        trackLabel: track.label,
      });
    }
    return { status: 'unsupported' };
  }

  const desired = wideAngle ? WIDE_ANGLE_ZOOM : NORMAL_ZOOM;
  const requested = Math.min(zoomCap.max, Math.max(zoomCap.min, desired));

  try {
    await track.applyConstraints({
      advanced: [{ zoom: requested }],
    } as unknown as MediaTrackConstraints);

    const settings = track.getSettings?.() as unknown as Record<string, unknown> | undefined;
    const actual = typeof settings?.zoom === 'number' ? (settings.zoom as number) : undefined;

    // WARN, not INFO: production drops everything below WARN, and the whole point
    // of this line is to see in the field whether the constraint actually took —
    // Safari is free to accept it and quietly keep the old lens.
    log.warn('Camera zoom applied', {
      wideAngle,
      desired,
      requested,
      actual,
      // `actual !== requested` means the constraint was honoured on paper only.
      matched: actual === requested,
      capability: { min: zoomCap.min, max: zoomCap.max, step: zoomCap.step },
    });

    return { status: 'applied', requested, actual };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('Camera zoom failed', { wideAngle, requested, error: message });
    return { status: 'failed', requested, error: message };
  }
}
