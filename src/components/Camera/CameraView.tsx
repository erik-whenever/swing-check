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
import { CountdownStepper } from './CountdownStepper';
import { LiveSwingPanel } from './LiveSwingPanel';
import { SessionSwingList } from '../Session/SessionSwingList';
import { SessionSummaryCard } from '../Session/SessionSummaryCard';
import { AnglePill } from '../AngleToggle';

const DEV_PREVIEW = import.meta.env.VITE_DEV_PREVIEW === 'true';

export function CameraView() {
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
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled);
  const ttsMode = useSettingsStore((s) => s.ttsMode);
  const setTtsMode = useSettingsStore((s) => s.setTtsMode);
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);
  const countdownSeconds = useSettingsStore((s) => s.countdownSeconds);
  const setCountdownSeconds = useSettingsStore((s) => s.setCountdownSeconds);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

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
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="p-4 text-center">
            <p className="text-red-400 mb-2">Camera error</p>
            <p className="text-sm text-muted">{error}</p>
            <button
              onClick={startStream}
              className="mt-4 px-4 py-2 bg-accent-press rounded-lg text-sm"
            >
              Retry
            </button>
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
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span
              key={countdown}
              className="text-8xl font-bold text-white animate-ping-once select-none"
              style={{ animationDuration: '0.6s' }}
            >
              {countdown === 0 ? 'GO' : countdown}
            </span>
          </div>
        )}

        {/* Processing / progress overlay */}
        {progress !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-8">
            <p className="text-sm font-medium text-white">Bearbetar film…</p>
            <div className="w-full max-w-xs h-2 rounded-full bg-raised overflow-hidden">
              <div
                className="h-full bg-accent-hover transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-fg-dim">{Math.round(progress * 100)}%</p>
          </div>
        )}

        {/* Current camera-angle badge — always visible before recording */}
        <div className="absolute bottom-4 left-4">
          <AnglePill angle={cameraAngle} />
        </div>

        {/* Live detection readout (ADR-003 §4) — dev preview only. It renders the
            state the capture hook already produces; it does not run its own. */}
        {DEV_PREVIEW && (
          <LiveSwingPanel live={capture.live} queue={capture.queue} active={isRecording} />
        )}

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">REC</span>
          </div>
        )}

        {/* Session swing counter — driven by the DETECTOR in continuous mode, so it
            counts swings actually found, not recordings started. */}
        {sessionActive && (
          <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
            <span className="px-3 py-1 rounded-full bg-black/60 text-white text-sm font-semibold">
              🎯 {swingNumber} sving{swingNumber === 1 ? '' : 'ar'}
              {isRecording ? ' · spelar in' : ''}
            </span>
          </div>
        )}

        {/* Persistent range-mode banner */}
        {rangeMode && (
          <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-accent/90
                          text-xs font-semibold text-white shadow-lg flex items-center gap-1.5">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Hörlursläge aktivt 🎧
          </div>
        )}

        {/* The engine never started the session's first utterance — without this
            the only symptom is silence, which reads as "the app is broken". */}
        {ttsEnabled && speechBlocked && (
          <div className="absolute bottom-4 inset-x-4 px-3 py-2 rounded-lg bg-amber-500/95
                          text-xs font-semibold text-black text-center shadow-lg">
            🔇 Rösten blockerades av webbläsaren — tryck på Röst på
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

      {/* Range mode + TTS controls */}
      <div className="flex-shrink-0 px-4 pt-3 flex items-center justify-between gap-2 bg-bg">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              primeSpeech(true);
              toggleRangeMode();
            }}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              rangeMode
                ? 'bg-accent text-on-accent'
                : 'bg-raised text-fg-dim hover:bg-raised-hi'
            }`}
          >
            🎧 {rangeMode ? 'Hörlursläge på' : 'Hörlursläge'}
          </button>
          <button
            onClick={toggleSession}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              sessionActive
                ? 'bg-accent text-on-accent'
                : 'bg-raised text-fg-dim hover:bg-raised-hi'
            }`}
          >
            🎯 {sessionActive ? 'Avsluta session' : 'Sessionsläge'}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              primeSpeech(true);
              setTtsEnabled(!ttsEnabled);
            }}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              ttsEnabled
                ? 'bg-raised-hi text-fg'
                : 'bg-surface text-faint hover:bg-raised'
            }`}
          >
            Röst {ttsEnabled ? 'på' : 'av'}
          </button>
          {ttsEnabled && (
            <div className="flex rounded-lg overflow-hidden border border-line text-xs font-semibold">
              {(['quick', 'detailed'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTtsMode(mode)}
                  className={`px-3 py-2 transition-colors ${
                    ttsMode === mode
                      ? 'bg-accent text-on-accent'
                      : 'bg-surface text-muted hover:bg-raised'
                  }`}
                >
                  {mode === 'quick' ? 'Kort' : 'Detalj'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 py-6 flex items-center justify-center gap-6 bg-bg">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={anySwingBusy || progress !== null || (sessionActive && isRecording)}
          className="px-3 py-2 bg-raised hover:bg-raised-hi rounded-lg text-xs font-medium
                     disabled:opacity-30 transition-colors"
        >
          Upload Video
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
        <CountdownStepper
          value={countdownSeconds}
          onChange={setCountdownSeconds}
          disabled={
            isRecording || isCounting || progress !== null || (!sessionActive && anySwingBusy)
          }
        />
      </div>
    </div>
  );
}
