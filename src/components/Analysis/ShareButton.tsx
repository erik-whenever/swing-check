import { useState } from 'react';
import { useSessionStore } from '../../store/session';
import { useRulesStore } from '../../store/rules';
import { useToastStore } from '../../store/toast';
import { exportSwingClip, isClipExportSupported, type OverlayLine } from '../../lib/videoExport';
import type { RuleResult } from '../../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('ShareButton');

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports the current swing as a short clip with the result overlay burned in and shares it
 * via the Web Share API, falling back to a download when file-sharing isn't available.
 */
export function ShareButton() {
  const videoBlob = useSessionStore((s) => s.currentVideoBlob);
  const analysis = useSessionStore((s) => s.currentAnalysis);
  const rules = useRulesStore((s) => s.rules);
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState(false);

  // Nothing to share, or the export pipeline isn't supported here.
  if (!videoBlob || !analysis || !isClipExportSupported()) return null;

  const ruleTitle = (r: RuleResult): string =>
    rules.find((rule) => rule.id === r.id)?.title || r.short_verdict || 'Regel';

  const handleShare = async () => {
    setBusy(true);
    try {
      const results: RuleResult[] = [
        ...(analysis.focus_rule ? [analysis.focus_rule] : []),
        ...analysis.rules,
      ];
      const lines: OverlayLine[] = results.map((r) => ({
        label: ruleTitle(r),
        verdict: r.verdict,
      }));

      const { blob, ext } = await exportSwingClip(videoBlob, lines);
      const file = new File([blob], `swingcheck-sving.${ext}`, { type: blob.type });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'SwingCheck',
          text: 'Min golfsving 🏌️',
        });
      } else {
        triggerDownload(blob, file.name);
        showToast('Klippet nedladdat');
      }
    } catch (err) {
      // User cancelling the native share sheet throws AbortError — not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      log.error('Share failed', { error: err instanceof Error ? err.message : String(err) });
      showToast('Kunde inte dela klippet');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={busy}
      className="w-full py-3 bg-accent hover:bg-accent-hover text-on-accent rounded-lg text-sm
                 font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
    >
      {busy ? (
        <>
          <span className="w-4 h-4 border-2 border-on-accent border-t-transparent rounded-full animate-spin" />
          Skapar klipp…
        </>
      ) : (
        <>📤 Dela sving</>
      )}
    </button>
  );
}
