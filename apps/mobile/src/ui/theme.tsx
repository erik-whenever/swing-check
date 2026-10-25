import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useOutfitFonts } from './fonts';
import { palettes, radius, shadows, space, type ColorScheme, type Palette } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  shadows: (typeof shadows)[ColorScheme];
  space: typeof space;
  radius: typeof radius;
  /** true när Outfit är laddad; annars renderas Outfit-varianter i systemfont. */
  fontsReady: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

function makeTheme(scheme: ColorScheme, fontsReady: boolean): Theme {
  return { scheme, colors: palettes[scheme], shadows: shadows[scheme], space, radius, fontsReady };
}

interface ProviderProps {
  /** Tvinga ett schema, t.ex. `'dark'` runt livesessionen (alltid mörk). Utelämnat = följer systemet. */
  scheme?: ColorScheme;
  children: ReactNode;
}

/**
 * Lägg en ThemeProvider i roten (laddar Outfit). Nästlade providers ärver fontstatus
 * och kan tvinga schema: `<ThemeProvider scheme="dark">…livesession…</ThemeProvider>`.
 */
export function ThemeProvider({ scheme, children }: ProviderProps) {
  const parent = useContext(ThemeContext);
  return parent ? (
    <NestedProvider parent={parent} scheme={scheme}>
      {children}
    </NestedProvider>
  ) : (
    <RootProvider scheme={scheme}>{children}</RootProvider>
  );
}

function RootProvider({ scheme, children }: ProviderProps) {
  const system = useColorScheme();
  const fontsReady = useOutfitFonts();
  const resolved: ColorScheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const theme = useMemo(() => makeTheme(resolved, fontsReady), [resolved, fontsReady]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

function NestedProvider({ parent, scheme, children }: ProviderProps & { parent: Theme }) {
  const system = useColorScheme();
  const resolved: ColorScheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const theme = useMemo(() => makeTheme(resolved, parent.fontsReady), [resolved, parent.fontsReady]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * Aktuellt tema. Utan provider: följer systemschemat med systemfont, så att
 * komponenterna fungerar även i t.ex. DevScreen innan roten är omkopplad.
 */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  const system = useColorScheme();
  const fallback = useMemo(() => makeTheme(system === 'dark' ? 'dark' : 'light', false), [system]);
  return ctx ?? fallback;
}
