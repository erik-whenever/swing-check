const phaseColors: Record<string, string> = {
  address: 'bg-blue-900 text-blue-300',
  backswing: 'bg-purple-900 text-purple-300',
  top: 'bg-indigo-900 text-indigo-300',
  downswing: 'bg-amber-900 text-amber-300',
  impact: 'bg-red-900 text-red-300',
  follow: 'bg-green-900 text-green-300',
};

export function RuleBadge({ phase }: { phase: string }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
        phaseColors[phase] || 'bg-raised text-fg-dim'
      }`}
    >
      {phase}
    </span>
  );
}
