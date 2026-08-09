import { createLogger } from './logger';

const log = createLogger('cameraDiagnostics');

/**
 * One-time diagnostics: enumerate all video devices and their capabilities.
 * Logs after camera permission is granted and the stream is active.
 * Runs only in development behind VITE_DEV_PREVIEW to avoid noise in production.
 */
export async function logCameraCapabilities(): Promise<void> {
  const isDev = import.meta.env.DEV;
  const showPreview = import.meta.env.VITE_DEV_PREVIEW;

  if (!isDev || !showPreview) {
    return;
  }

  try {
    // Enumerate all devices.
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

    // Introspect the active video stream's track capabilities.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      log.warn('Camera diagnostics', { message: 'No active video track found' });
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const capabilities = videoTrack.getCapabilities?.();
    const settings = videoTrack.getSettings?.();

    const capabilityReport: Record<string, unknown> = {
      trackLabel: videoTrack.label,
      trackState: videoTrack.readyState,
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
    }

    log.warn('Camera capabilities', capabilityReport);

    // Clean up the diagnostic stream.
    stream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    log.warn('Camera diagnostics failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
