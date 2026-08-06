import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useRangeMode } from '../../hooks/useRangeMode';
import { extractFrames, ANALYSIS_FRAME_COUNT } from '../../lib/frameExtractor';
import { useSessionStore } from '../../store/session';
import { useSettingsStore } from '../../store/settings';
import { cancelSpeech, isSpeaking, speak, TTS_ANALYZING } from '../../lib/tts';
import { RecordButton } from './RecordButton';
import { CountdownStepper } from './CountdownStepper';
import { AnglePill } from '../AngleToggle';

const DEV_PREVIEW = import.meta.env.VITE_DEV_PREVIEW === 'true';

export function CameraView() {
  const {
    videoRef,
    isStreaming,
    isRecording,
    countdown,
    error,
    startStream,
    stopStream,
    startRecording,
    cancelCountdown,
    stopRecording,
  } = useCamera();

  const setCurrentVideoBlob = useSessionStore((s) => s.setCurrentVideoBlob);
  const setCurrentFrames = useSessionStore((s) => s.setCurrentFrames);
  const setCurrentFrameMeta = useSessionStore((s) => s.setCurrentFrameMeta);
  const setView = useSessionStore((s) => s.setView);
  const view = useSessionStore((s) => s.view);
  const isAnalyzing = useSessionStore((s) => s.isAnalyzing);
  const setCurrentAnalysis = useSessionStore((s) => s.setCurrentAnalysis);
  const setIsAnalyzing = useSessionStore((s) => s.setIsAnalyzing);

  // Session mode (hands-free multi-swing)
  const sessionActive = useSessionStore((s) => s.sessionActive);
  const swingNumber = useSessionStore((s) => s.swingNumber);
  const beginSwing = useSessionStore((s) => s.beginSwing);
  const startSession = useSessionStore((s) => s.startSession);
  const endSession = useSessionStore((s) => s.endSession);
  const autoRecordPending = useSessionStore((s) => s.autoRecordPending);
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

  const isCounting = countdown !== null;

  const processVideo = async (blob: Blob) => {
    setCurrentVideoBlob(blob);
    setProgress(0);
    try {
      const { selected, meta } = await extractFrames(blob, ANALYSIS_FRAME_COUNT, 0.8, {
        onProgress: setProgress,
      });
      setCurrentAnalysis(null);
      setCurrentFrames(selected);
      setCurrentFrameMeta(meta);

      if (DEV_PREVIEW) {
        setView('preview');
      } else {
        if (ttsEnabled) speak(TTS_ANALYZING);
        setIsAnalyzing(true);
        setView('analysis');
      }
    } catch (err) {
      console.error('Frame extraction failed:', err);
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

  // Start a recording, incrementing the session counter first when in a session.
  const startSwingRecording = useCallback(() => {
    if (sessionActive) beginSwing();
    startRecording(countdownSeconds);
  }, [sessionActive, beginSwing, startRecording, countdownSeconds]);

  const handleToggleRecord = async () => {
    if (isRecording) {
      const blob = await stopRecording();
      await processVideo(blob);
    } else if (isCounting) {
      cancelCountdown();
    } else {
      startSwingRecording();
    }
  };

  // Auto-start the next swing's recording when the analysis view requests it.
  useEffect(() => {
    if (!autoRecordPending) return;
    if (!isStreaming || isRecording || isCounting || isAnalyzing || progress !== null) return;
    clearAutoRecord();
    startSwingRecording();
  }, [
    autoRecordPending,
    isStreaming,
    isRecording,
    isCounting,
    isAnalyzing,
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
      setCurrentAnalysis(null);
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

  const toggleSession = () => {
    if (sessionActive) {
      endSession();
    } else {
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

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">REC</span>
          </div>
        )}

        {/* Session swing counter */}
        {sessionActive && (
          <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
            <span className="px-3 py-1 rounded-full bg-black/60 text-white text-sm font-semibold">
              🎯 Sving {Math.max(1, swingNumber)}
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
      </div>

      {/* Range mode + TTS controls */}
      <div className="flex-shrink-0 px-4 pt-3 flex items-center justify-between gap-2 bg-bg">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleRangeMode}
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
            onClick={() => setTtsEnabled(!ttsEnabled)}
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
          disabled={isAnalyzing || progress !== null}
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
        <RecordButton
          isRecording={isRecording}
          isCounting={isCounting}
          isStreaming={isStreaming}
          disabled={!isStreaming || isAnalyzing}
          onToggle={handleToggleRecord}
        />
        <CountdownStepper
          value={countdownSeconds}
          onChange={setCountdownSeconds}
          disabled={isRecording || isCounting || isAnalyzing || progress !== null}
        />
      </div>
    </div>
  );
}
