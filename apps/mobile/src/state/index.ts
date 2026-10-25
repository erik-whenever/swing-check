// Public surface of the app state (N-3.6). Screens import from here.
export { AppStateProvider, useAppStore, type AppStateProviderProps } from './AppStateProvider';
export {
  useActiveRules,
  useAppState,
  useHistory,
  useHistoryEntry,
  useHydrated,
  useRuleSelection,
  useSettings,
  type ActiveRulesOptions,
} from './hooks';
export type { AppState, AppStore, HydrationStatus, SettingsPatch } from './appStore';
export type { HistoryEntry } from './historyModel';
export type { AppSettings, RuleMode } from './settingsModel';
export { MEDIA_CAP_MAX_MB, MEDIA_CAP_MIN_MB, MEDIA_CAP_STEP_MB } from './settingsModel';
export { analysableRules, type ActiveRule, type ActiveRuleSet } from './rulesModel';
export { analysisErrorView, type AnalysisErrorKind, type AnalysisErrorView } from './errorText';
