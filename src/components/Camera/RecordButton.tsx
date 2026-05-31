interface RecordButtonProps {
  isRecording: boolean;
  isCounting: boolean;
  isStreaming: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function RecordButton({
  isRecording,
  isCounting,
  isStreaming,
  disabled,
  onToggle,
}: RecordButtonProps) {
  const label = isRecording
    ? 'Stop recording'
    : isCounting
      ? 'Cancel countdown'
      : 'Start recording';

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center
                 disabled:opacity-30 transition-all active:scale-95"
      aria-label={label}
    >
      {isRecording ? (
        <span className="w-8 h-8 bg-red-500 rounded-sm" />
      ) : isCounting ? (
        <span className="w-14 h-14 rounded-full bg-yellow-500 animate-pulse" />
      ) : (
        <span
          className={`w-14 h-14 rounded-full ${
            isStreaming ? 'bg-red-500' : 'bg-slate-600'
          }`}
        />
      )}
    </button>
  );
}
