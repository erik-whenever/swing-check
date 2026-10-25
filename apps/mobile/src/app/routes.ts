// Route names and params for the navigation shell (N-3.6). See docs/native/navigation.md.

import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  /** Uppladdning — "Sving" in the d1-v2 tab bar. */
  Swing: undefined;
  /** Livesession (G1, hands-free range). Placeholder until LiveSessionScreen is wired. */
  Session: undefined;
  Rules: undefined;
  History: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** Analys pågår — pushed from Uppladdning. */
  Analysis: undefined;
  /** Resultat for a stored history entry. `fromHistory` hides "Nästa sving". */
  Result: { entryId: string; fromHistory?: boolean };
  /** Regelbiblioteket — egna regler. Modal på iOS, öppnas från Regler ("+" / "Egna"). */
  RuleLibrary: undefined;
  /** Inställningar (språk, nivå, standardvinkel, medietak). Modal på iOS, öppnas från Historik. */
  Settings: undefined;
  /** Developer screen (pose/parity checks). Only registered in __DEV__. */
  Dev: undefined;
};
