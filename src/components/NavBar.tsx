import { AngleToggle } from './AngleToggle';

/** Persistent top bar shown on every screen: logo on the left, angle toggle on the right. */
export function NavBar() {
  return (
    <header className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2.5
                       border-b border-slate-800 bg-slate-900 safe-top">
      <div className="flex items-center gap-1.5 select-none">
        <span className="text-emerald-400 text-lg leading-none">⛳</span>
        <span className="font-bold tracking-tight">SwingCheck</span>
      </div>
      <AngleToggle />
    </header>
  );
}
