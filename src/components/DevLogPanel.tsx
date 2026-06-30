import { useEffect, useMemo, useState } from 'react';
import { getEntries, subscribe, type LogEntry, type LogLevel } from '../lib/logger';

const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

const LEVEL_COLOR: Record<LogLevel, string> = {
  DEBUG: 'text-slate-400',
  INFO: 'text-sky-400',
  WARN: 'text-amber-400',
  ERROR: 'text-red-400',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Floating dev-only log viewer. Mounted only when VITE_DEV_PREVIEW=true so we can
 * inspect the last 50 log entries directly on a phone, with no laptop attached.
 */
export function DevLogPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>(() => getEntries());
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');

  useEffect(() => subscribe(setEntries), []);

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.module);
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => levelFilter === 'ALL' || e.level === levelFilter)
      .filter((e) => moduleFilter === 'ALL' || e.module === moduleFilter)
      .slice()
      .reverse(); // newest first
  }, [entries, levelFilter, moduleFilter]);

  const errorCount = entries.filter((e) => e.level === 'ERROR').length;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = filtered
      .slice()
      .reverse() // oldest first for readability
      .map((e) => {
        const head = `${formatTime(e.timestamp)} ${e.level} [${e.module}] ${e.message}`;
        return e.data !== undefined ? `${head}\n${safeStringify(e.data)}` : head;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };

  return (
    <>
      {/* Floating launcher (bottom-left) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 left-3 z-50 px-3 py-2 rounded-full bg-slate-800/90 border
                     border-slate-600 text-xs font-mono font-semibold text-slate-200 shadow-lg
                     backdrop-blur flex items-center gap-1.5"
        >
          🐞 Logs
          {errorCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] leading-none">
              {errorCount}
            </span>
          )}
        </button>
      )}

      {/* Slide-in side panel (full height so long entries are always scrollable) */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col bg-slate-950/97
                    border-l border-slate-700 shadow-2xl backdrop-blur transition-transform
                    duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header + filters */}
        <div className="flex-shrink-0 p-2 border-b border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-300">
              Logs ({filtered.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopy}
                className="px-2 py-1 rounded bg-slate-800 text-xs text-slate-300"
              >
                {copied ? 'Copied ✓' : 'Copy 📋'}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 rounded bg-slate-800 text-xs text-slate-300"
              >
                Close ✕
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {(['ALL', ...LEVELS] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                  levelFilter === lvl
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="w-full px-2 py-1 rounded bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700"
          >
            <option value="ALL">All modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px] leading-snug">
          {filtered.length === 0 ? (
            <p className="text-slate-600 text-center py-4">No matching log entries.</p>
          ) : (
            filtered.map((e) => (
              <div key={e.id} className="border-b border-slate-900 pb-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-slate-600">{formatTime(e.timestamp)}</span>
                  <span className={`font-semibold ${LEVEL_COLOR[e.level]}`}>{e.level}</span>
                  <span className="text-emerald-500">[{e.module}]</span>
                </div>
                <div className="text-slate-200 break-words">{e.message}</div>
                {e.data !== undefined && (
                  <pre className="mt-0.5 text-slate-500 whitespace-pre-wrap break-all">
                    {safeStringify(e.data)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
