interface RecordButtonProps {
  isRecording: boolean;
  isCounting: boolean;
  isStreaming: boolean;
  disabled: boolean;
  onToggle: () => void;
}

/**
 * The one big target on the camera screen: a cream ring with a green core.
 *
 * The state is carried by the CORE's shape (disc → rounded square → pulsing gold),
 * not by hue alone — this is pressed at arm's length in daylight, where a colour
 * change on a 44px dot is not a state you can read.
 */
export function RecordButton({
  isRecording,
  isCounting,
  isStreaming,
  disabled,
  onToggle,
}: RecordButtonProps) {
  const label = isRecording
    ? 'Stoppa inspelning'
    : isCounting
      ? 'Avbryt nedräkning'
      : 'Starta inspelning';

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      aria-label={label}
      className="relative w-16 h-16 rounded-full bg-surface border-2 border-accent
                 grid place-items-center shadow-cta
                 disabled:opacity-30 transition-transform active:scale-95"
    >
      {/* A breathing halo while rolling, so a tripod-mounted phone shows it is live
          from where the golfer actually stands. */}
      {isRecording && (
        <span className="absolute inset-0 rounded-full bg-accent animate-rec-halo" aria-hidden />
      )}
      <span
        className={`relative transition-all duration-300 ${
          isRecording
            ? 'w-6 h-6 rounded-[7px] bg-accent'
            : isCounting
              ? 'w-11 h-11 rounded-full bg-gold animate-pulse'
              : `w-11 h-11 rounded-full ${isStreaming ? 'bg-accent' : 'bg-line'}`
        }`}
        aria-hidden
      />
    </button>
  );
}
