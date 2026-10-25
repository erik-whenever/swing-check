// Screen-facing hooks over the app store (N-3.6). Thin on purpose: the logic lives in the
// pure models (settingsModel, historyModel, rulesModel) and appStore, which are tested.

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { RuleAccuracyMap, RulePhase } from '@swingcheck/core/lib/recommendRules';
import type { AppState, SettingsPatch } from './appStore';
import { useAppStore } from './AppStateProvider';
import { historyStats, type HistoryEntry } from './historyModel';
import { deriveActiveRules, toggleCustomRule, type ActiveRuleSet } from './rulesModel';
import type { AppSettings, RuleMode } from './settingsModel';

/** The whole state snapshot; re-renders on every change. Prefer the narrower hooks below. */
export function useAppState(): AppState {
  const store = useAppStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** `ready` is false until the files are loaded — show nothing user-specific before that. */
export function useHydrated(): boolean {
  return useAppState().status === 'ready';
}

export function useSettings(): {
  settings: AppSettings;
  updateSettings: (patch: SettingsPatch) => Promise<void>;
  ready: boolean;
} {
  const store = useAppStore();
  const { settings, status } = useAppState();
  return { settings, updateSettings: store.updateSettings, ready: status === 'ready' };
}

export function useHistory(): {
  entries: HistoryEntry[];
  stats: ReturnType<typeof historyStats>;
  addSwing: (entry: HistoryEntry) => Promise<void>;
  ready: boolean;
} {
  const store = useAppStore();
  const { history, status } = useAppState();
  const stats = useMemo(() => historyStats(history), [history]);
  return { entries: history, stats, addSwing: store.addSwing, ready: status === 'ready' };
}

/** One history entry by id, or undefined (unknown id or not loaded yet). */
export function useHistoryEntry(id: string | undefined): HistoryEntry | undefined {
  const { history } = useAppState();
  return useMemo(() => (id ? history.find((e) => e.id === id) : undefined), [history, id]);
}

export interface ActiveRulesOptions {
  /** The angle chosen for this recording; defaults to the settings' default angle. */
  angle?: CameraAngle;
  goalPhase?: RulePhase;
  /** V-1 measurements once they exist; until then every rule shows "ej validerad". */
  accuracy?: RuleAccuracyMap;
}

/** The rules the next analysis runs against (recommended set or the user's own pick). */
export function useActiveRules(options: ActiveRulesOptions = {}): ActiveRuleSet {
  const { settings } = useAppState();
  const { angle, goalPhase, accuracy } = options;
  return useMemo(
    () => deriveActiveRules({ settings, angle, goalPhase, accuracy }),
    [settings, angle, goalPhase, accuracy],
  );
}

/** Rule-picker actions: switch mode, toggle a library rule in the custom list. */
export function useRuleSelection(): {
  mode: RuleMode;
  customRuleIds: string[];
  setMode: (mode: RuleMode) => Promise<void>;
  toggleRule: (libraryId: string) => Promise<void>;
  setCustomRuleIds: (ids: string[]) => Promise<void>;
} {
  const store = useAppStore();
  const { settings } = useAppState();
  const setMode = useCallback((ruleMode: RuleMode) => store.updateSettings({ ruleMode }), [store]);
  const toggleRule = useCallback(
    // Derived at apply time, not from the render's snapshot, so two quick taps both count.
    (id: string) => store.updateSettings((s) => ({ customRuleIds: toggleCustomRule(s.customRuleIds, id) })),
    [store],
  );
  const setCustomRuleIds = useCallback((customRuleIds: string[]) => store.updateSettings({ customRuleIds }), [store]);
  return { mode: settings.ruleMode, customRuleIds: settings.customRuleIds, setMode, toggleRule, setCustomRuleIds };
}
