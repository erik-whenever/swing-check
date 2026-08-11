import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useRangeMode } from '../../hooks/useRangeMode';
import { useSessionCapture } from '../../hooks/useSessionCapture';
import { extractFrames, ANALYSIS_FRAME_COUNT } from '../../lib/frameExtractor';
import { logCameraCapabilities } from '../../lib/cameraDiagnostics';
import {
  useSessionStore,
  selectAnySwingBusy,
  swingFromExtraction,
} from '../../store/session';
import { useSettingsStore } from '../../store/settings';
import { cancelSpeech, isSpeaking, primeSpeech, speak, TTS_ANALYZING } from '../../lib/tts';
import { RecordButton } from './RecordButton';
import { RecordSettingsSheet } from './RecordSettingsSheet';
import { LiveSwingPanel } from './LiveSwingPanel';
import { SessionSwingList } from '../Session/SessionSwingList';
import { SessionSummaryCard } from '../Session/SessionSummaryCard';
import { AnglePill } from '../AngleToggle';
import { WideAngleToggle } from './WideAngleToggle';
import { useT } from '../../lib/i18n';
import { Button, Segmented } from '../ui';

const DEV_PREVIEW = import.meta.env.VITE_DEV_PREVIEW === 'true';

export function CameraView() {
  const t = useT();
  const {
    videoRef,
    streamRef,
    isStreaming,
    isRecording,
    countdown,
    error,
    startStream,
    stopStream,
    startRecording,
    cancelCountdown,
    stopRecording,
    chunkRingRef,
    recordingEpochMs,
    releaseChunkRing,
  } = useCamera();

  const setCurrentVideoBlob = useSessionStore((s) => s.setCurrentVideoBlob);
  const setView = useSessionStore((s) => s.setView);
  const view = useSessionStore((s) => s.view);
  const addSwing = useSessionStore((s) => s.addSwing);
  const updateSwing = useSessionStore((s) => s.updateSwing);
  const clearSwings = useSessionStore((s) => s.clearSwings);
  // Session-wide busy flag: any swing extracting or analyzing blocks capture.
  // Per-swing state lives on the swing itself (ADR-003 §5.4).
  const anySwingBusy = useSessionStore(selectAnySwingBusy);

  // Session mode (hands-free multi-swing)
  const sessionActive = useSessionStore((s) => s.sessionActive);
  const swingNumber = useSessionStore((s) => s.swingNumber);
  const startSession = useSessionStore((s) => s.startSession);
  const endSession = useSessionStore((s) => s.endSession);
  const autoRecordPending = useSessionStore((s) => s.autoRecordPending);
  // Set when the engine swallowed the first thing we tried to say (iOS gesture lock).
  const speechBlocked = useSessionStore((s) => s.speechBlocked);
  const clearAutoRecord = useSessionStore((s) => s.clearAutoRecord);
  const requestAutoRecord = useSessionStore((s) => s.requestAutoRecord);

  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);
  const countdownSeconds = useSettingsStore((s) => s.countdownSeconds);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    startStream();
    return () => stopStream();
  }, [startStream, stopStream]);

  // One-time camera diagnostics after stream is active. It inspects the track the
  // session is already using — opening a second stream here can steal the active
  // one on iOS. No track, no diagnostics: silently skipped.
  useEffect(() => {
    if (!isStreaming) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    void logCameraCapabilities(track);
  }, [isStreaming, streamRef]);

  const isCounting = countdown !== null;

  // ── Continuous session capture (ADR-003 §4 + §5, D-5 pass 3) ────────────────
  // Session mode IS continuous mode: the camera keeps rolling, the detector finds
  // each swing, and each swing is analyzed and spoken while the next one is being
  // hit. The clip flow (record → stop → analyze one swing) is untouched and is
  // still what runs whenever session mode is off.
  //
  // Detection also runs outside a session when the dev preview is on, but with
  // `captureEnabled` false: there is no chunk ring in clip mode, so there is
  // nothing to cut a window from — it detects and logs only, as in pass 2.
  const capture = useSessionCapture({
    videoRef,
    active: isRecording && (sessionActive || DEV_PREVIEW),
    captureEnabled: sessionActive,
    chunkRingRef,
    recordingEpochMs,
  });

  const processVideo = async (blob: Blob) => {
    setCurrentVideoBlob(blob);
    setProgress(0);
    // Single-swing flow: one clip becomes a session holding exactly one swing.
    // Segmentation (D-5 pass 2) will append several here from the same clip.
    clearSwings();
    const swingId = addSwing({ status: 'extracting' });
    try {
      const { selected, meta } = await extractFrames(blob, ANALYSIS_FRAME_COUNT, 0.8, {
        onProgress: setProgress,
      });
      updateSwing(swingId, {
        ...swingFromExtraction(selected, meta),
        status: DEV_PREVIEW ? 'detected' : 'analyzing',
      });

      if (DEV_PREVIEW) {
        setView('preview');
      } else {
        // Status flips to 'analyzing' above, before the view switch, so the
        // analysis view opens on its spinner instead of flashing "no analysis".
        if (ttsEnabled) speak(TTS_ANALYZING);
        setView('analysis');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Frame extraction failed:', err);
      updateSwing(swingId, { status: 'failed', error: msg });
    } finally {
      setProgress(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processVideo(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  // Start a recording. In a session it runs in 'session' mode — bounded chunk ring,
  // no whole-session blob — and the swing counter is driven by the DETECTOR
  // (`beginSwing` per detected swing) rather than by pressing record once.
  const startSwingRecording = useCallback(() => {
    // The list is NOT cleared here: a session can span several recordings (a break
    // to change club), and the swings already hit belong to the same session.
    // Clearing happens when the session starts.
    startRecording(countdownSeconds, sessionActive ? 'session' : 'clip');
  }, [sessionActive, startRecording, countdownSeconds]);

  // Stop a session recording and let the queued swings finish before the video ring
  // is released — a swing still waiting for its turn owns bytes in it.
  const finishSessionRecording = useCallback(async () => {
    await stopRecording();
    await capture.drain();
    releaseChunkRing();
  }, [stopRecording, capture, releaseChunkRing]);

  const handleToggleRecord = async () => {
    // FIRST statement, before any await: this is the gesture that unlocks speech
    // on iOS, and everything we ever speak happens in an async callback after it.
    primeSpeech();
    if (isRecording) {
      if (sessionActive) {
        // No clip to process: session mode never materializes the whole recording,
        // and every swing in it has already been analyzed on its own.
        await finishSessionRecording();
        return;
      }
      const blob = await stopRecording();
      if (blob) await processVideo(blob);
    } else if (isCounting) {
      cancelCountdown();
    } else {
      startSwingRecording();
    }
  };

  // Auto-start the next swing's recording when the analysis view requests it.
  useEffect(() => {
    if (!autoRecordPending) return;
    if (!isStreaming || isRecording || isCounting || anySwingBusy || progress !== null) return;
    clearAutoRecord();
    startSwingRecording();
  }, [
    autoRecordPending,
    isStreaming,
    isRecording,
    isCounting,
    anySwingBusy,
    progress,
    clearAutoRecord,
    startSwingRecording,
  ]);

  // Headset transport button (via Media Session in range mode).
  const handleHeadsetButton = () => {
    // While speaking, a press only interrupts speech — never starts recording.
    if (isSpeaking()) {
      cancelSpeech();
      return;
    }
    // Ignore presses during the countdown to avoid an accidental cancel.
    if (isCounting) return;
    if (isRecording) {
      handleToggleRecord(); // stop + analyze
      return;
    }
    // In a session, a press from the results overlay jumps straight to the next swing,
    // skipping the 3s auto-restart wait.
    if (sessionActive && view === 'analysis') {
      clearSwings();
      requestAutoRecord();
      setView('camera');
      return;
    }
    handleToggleRecord(); // normal start on the camera view
  };

  // Double-press (Media Session "nexttrack") ends the session hands-free.
  const handleSecondaryHeadset = () => {
    if (sessionActive) endSession();
  };

  const { rangeMode, toggleRangeMode } = useRangeMode(
    handleHeadsetButton,
    handleSecondaryHeadset,
  );

  const toggleSession = async () => {
    // Forced: iOS can re-lock the engine after the page has been backgrounded,
    // and a session is exactly the mode where silence is a total failure.
    primeSpeech(true);
    if (sessionActive) {
      // Ending a session while it is recording has to stop the recording too —
      // otherwise the camera keeps rolling into a ring nothing will ever read.
      if (isRecording) await finishSessionRecording();
      endSession();
    } else {
      clearSwings();
      startSession();
      // Ensure the headset loop is live so the session is truly hands-free.
      if (!rangeMode) toggleRangeMode();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* The viewfinder is a framed card, not a full-bleed black rectangle: the cream
          ground stays continuous, and the rounded frame is what the golfer aims into. */}
      <div className="relative flex-1 min-h-0 mx-[14px] mb-2 rounded-[20px] overflow-hidden
                      bg-raised border border-line flex items-center justify-center">
        {error ? (
          <div className="p-6 text-center">
            <p className="mb-1.5 text-sm font-semibold text-bad">{t('camera.error')}</p>
            <p className="mb-4 text-xs text-muted">{error}</p>
            <Button size="sm" onClick={startStream}>{t('camera.retry')}</Button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* Countdown overlay */}
        {isCounting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
            <span
              key={countdown}
              className="text-8xl font-semibold tabular-nums text-white animate-ping-once select-none"
              style={{ animationDuration: '0.6s' }}
            >
              {countdown === 0 ? 'GO' : countdown}
            </span>
          </div>
        )}

        {/* Processing / progress overlay */}
        {progress !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/65 px-8">
            <p className="text-sm font-medium text-white">{t('camera.processing')}</p>
            <div className="w-full max-w-xs h-1.5 rounded-pill bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-pill bg-white transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-white/70">{Math.round(progress * 100)} %</p>
          </div>
        )}

        {/* The most common reason an analysis is useless is a golfer half out of
            frame, so the instruction lives inside the frame. */}
        {!isRecording && !isCounting && progress === null && !error && (
          <div className="absolute inset-x-0 bottom-14 flex justify-center px-4 pointer-events-none">
            <span className="rounded-pill bg-surface/90 backdrop-blur px-3 py-1.5
                             text-[10px] font-medium text-accent-text text-center">
              {t('camera.frameHint')}
            </span>
          </div>
        )}

        {/* Current camera-angle badge — always visible before recording */}
        <div className="absolute bottom-3 left-3">
          <AnglePill angle={cameraAngle} />
        </div>

        {/* Wide-angle (0.5×) — framing is a viewfinder decision, so the control
            sits on the viewfinder, mirroring the angle badge. */}
        <div className="absolute bottom-3 right-3">
          <WideAngleToggle />
        </div>

        {/* Live detection readout (ADR-003 §4) — dev preview only. It renders the
            state the capture hook already produces; it does not run its own. */}
        {DEV_PREVIEW && (
          <LiveSwingPanel live={capture.live} queue={capture.queue} active={isRecording} />
        )}

        {/* Status strip: capture state only — am I rolling, and how many swings so far.
            Mode and settings state belong to the controls below; a headset pill up here
            was a second place to read the same thing, and in a session it was always on
            anyway. */}
        <div className="absolute top-3 inset-x-3 flex items-start gap-1.5 flex-wrap pointer-events-none">
          {isRecording && (
            <span className="flex items-center gap-1.5 rounded-pill bg-bad px-2.5 py-1
                             text-[10px] font-bold tracking-wide text-white">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              REC
            </span>
          )}
          {sessionActive && (
            <span className="rounded-pill bg-surface/90 backdrop-blur px-2.5 py-1
                             text-[10px] font-semibold text-accent-text">
              🎯 {t(swingNumber === 1 ? 'camera.swingCount' : 'camera.swingCountPlural', {
                count: swingNumber,
              })}
              {isRecording ? ` · ${t('camera.recording')}` : ''}
            </span>
          )}
        </div>

        {/* The engine never started the session's first utterance — without this
            the only symptom is silence, which reads as "the app is broken". */}
        {ttsEnabled && speechBlocked && (
          <div className="absolute bottom-3 inset-x-3 px-3 py-2 rounded-chip bg-gold
                          text-[11px] font-semibold text-white text-center shadow-lift">
            🔇 {t('camera.voiceBlocked')}
          </div>
        )}
      </div>

      {/* Session view: every swing of this session with its own status and verdict,
          filling in while the camera keeps rolling (ADR-003 §5). */}
      {sessionActive && (
        <div className="flex-shrink-0 border-t border-line bg-bg">
          <SessionSwingList />
        </div>
      )}

      {/* The summary of the session that just ended. Same numbers as the WARN line
          the log carries — the log is what gets read after a field test, this is what
          gets read at the range. */}
      {!sessionActive && (
        <div className="flex-shrink-0">
          <SessionSummaryCard />
        </div>
      )}

      {/* Mode row. Exactly ONE decision lives here — clip or continuous — because it is
          the only control on this screen that changes what the record button does. The
          rest (countdown, readout, headset button) are settings and sit behind the gear.
          Switching to "single swing" is also how a session ends, so there is no longer a
          second end-session control fighting with the first. */}
      <div className="flex-shrink-0 flex items-center gap-2 px-[18px] pt-2">
        <Segmented
          size="md"
          ariaLabel={t('camera.mode')}
          value={sessionActive ? 'session' : 'single'}
          onChange={(next) => {
            if ((next === 'session') !== sessionActive) void toggleSession();
          }}
          options={[
            { value: 'single', label: t('camera.mode.single') },
            { value: 'session', label: t('camera.mode.session') },
          ]}
          // A session must always be endable — that is how the golfer stops the camera.
          // Starting one mid-clip is what has to be blocked.
          disabled={
            !sessionActive &&
            (isRecording || isCounting || progress !== null || anySwingBusy)
          }
        />
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label={t('camera.settings')}
          aria-haspopup="dialog"
          className={`ml-auto flex-none grid place-items-center w-9 h-9 rounded-pill
                      transition-colors ${
                        // Tinted whenever something in there deviates from the default,
                        // so the gear itself reports that overrides are active.
                        rangeMode || !ttsEnabled
                          ? 'bg-accent-tint text-accent-text'
                          : 'bg-raised text-muted hover:text-fg'
                      }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
               strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* One line saying what the chosen mode actually does. "Session" meant nothing on
          its own — this is the cheapest place to say it. */}
      <p className="flex-shrink-0 px-[18px] pt-1.5 text-[10.5px] leading-[1.45] text-muted">
        {t(sessionActive ? 'camera.mode.sessionHint' : 'camera.mode.singleHint')}
      </p>

      {/* Action row. The record button owns the centre and nothing else competes with
          it for size — upload is a fallback, not a peer. */}
      <div className="flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-[18px] py-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={anySwingBusy || progress !== null || (sessionActive && isRecording)}
          className="justify-self-start text-[11px] font-semibold text-muted hover:text-fg
                     disabled:opacity-30 transition-colors"
        >
          {t('camera.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        {/* In a session `anySwingBusy` is almost always true — swings are analyzed
            while recording continues — so it must NOT gate the controls there, or
            the golfer could never stop the session. It still gates the clip flow,
            where busy genuinely means "this one recording is being processed". */}
        <RecordButton
          isRecording={isRecording}
          isCounting={isCounting}
          isStreaming={isStreaming}
          disabled={!isStreaming || (!sessionActive && anySwingBusy)}
          onToggle={handleToggleRecord}
        />
        {/* Balances the grid so the record button stays centred. */}
        <span aria-hidden />
      </div>

      <RecordSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        rangeMode={rangeMode}
        onToggleRangeMode={toggleRangeMode}
        sessionActive={sessionActive}
        countdownDisabled={
          isRecording || isCounting || progress !== null || (!sessionActive && anySwingBusy)
        }
      />
    </div>
  );
}
