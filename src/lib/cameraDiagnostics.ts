import { createLogger } from './logger';

const log = createLogger('cameraDiagnostics');

/** Guards the one-time run below. Module scope = one page load. */
let hasLogged = false;

/**
 * One-time diagnostics: enumerate all video devices and inspect the ALREADY ACTIVE
 * track's capabilities. Gated on VITE_DEV_PREVIEW only — `import.meta.env.DEV` is
 * false in every deployed build, so gating on it meant this never logged anywhere
 * it mattered.
 *
 * It must never call getUserMedia(): a second stream opened alongside the session's
 * live one can disturb or steal the active track on iOS.
 */
export async function logCameraCapabilities(track: MediaStreamTrack): Promise<void> {
  if (import.meta.env.VITE_DEV_PREVIEW !== 'true') {
    return;
  }

  // Once per page load. The caller is an effect keyed on `isStreaming`, so every
  // stream transition re-ran it — in production it logged the same capabilities
  // twice, and the device list cannot change while the page is loaded anyway.
  // The flag is set before the first await so two overlapping calls cannot race.
  if (hasLogged) return;
  hasLogged = true;

  try {
    // Enumerate all devices. This opens no stream.
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');

    log.warn('Camera enumeration', {
      totalDevices: devices.length,
      videoInputCount: videoInputs.length,
      devices: videoInputs.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || '(no label)',
        groupId: d.groupId || '(no group)',
      })),
    });

    const capabilities = track.getCapabilities?.();
    const settings = track.getSettings?.();

    const capabilityReport: Record<string, unknown> = {
      trackLabel: track.label,
      trackState: track.readyState,
    };

    if (capabilities) {
      // zoom is experimental and not in DOM types; cast to access.
      const capabilitiesAny = capabilities as unknown as Record<string, unknown>;
      const zoomCap = capabilitiesAny.zoom as { min: number; max: number; step: number } | undefined;
      capabilityReport.capabilities = {
        zoom: zoomCap ? { min: zoomCap.min, max: zoomCap.max, step: zoomCap.step } : undefined,
        width: capabilities.width ? { min: capabilities.width.min, max: capabilities.width.max } : undefined,
        height: capabilities.height ? { min: capabilities.height.min, max: capabilities.height.max } : undefined,
        frameRate: capabilities.frameRate ? { min: capabilities.frameRate.min, max: capabilities.frameRate.max } : undefined,
        facingMode: capabilities.facingMode || undefined,
        hasZoomCapability: !!zoomCap,
      };
      // The raw object too: the summary above only carries fields we already know
      // about, and the interesting ones are the ones we don't — notably any zoom
      // range reaching below 1.0, which means an ultra-wide lens is available.
      capabilityReport.capabilitiesRaw = capabilities;
    }

    if (settings) {
      // zoom is experimental and not in DOM types; cast to access.
      const settingsAny = settings as unknown as Record<string, unknown>;
      capabilityReport.settings = {
        zoom: settingsAny.zoom,
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        facingMode: settings.facingMode,
      };
      capabilityReport.settingsRaw = settings;
    }

    log.warn('Camera capabilities', capabilityReport);
  } catch (err) {
    log.warn('Camera diagnostics failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
