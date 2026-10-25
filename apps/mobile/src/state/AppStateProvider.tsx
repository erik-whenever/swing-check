// React binding for appStore (N-3.6). Put <AppStateProvider> once near the root (inside
// ThemeProvider); screens read state through the hooks in ./hooks. Local only: no
// network, no Supabase — the app works offline from first launch.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { enforceMediaCap } from '../mediaStore';
import { createAppStore, type AppStore } from './appStore';
import { createFileStore } from './fileStore';

const AppStoreContext = createContext<AppStore | null>(null);

export interface AppStateProviderProps {
  /** Inject a store (previews, tests); default is the expo-file-system one. */
  store?: AppStore;
  children: ReactNode;
}

function createDefaultStore(): AppStore {
  return createAppStore({ store: createFileStore(), enforceMediaCap });
}

export function AppStateProvider({ store: injected, children }: AppStateProviderProps) {
  const [store] = useState<AppStore>(() => injected ?? createDefaultStore());
  useEffect(() => {
    void store.hydrate();
  }, [store]);
  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

/** The store itself. Throws outside the provider — a missing provider is a wiring bug. */
export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore: wrap the app in <AppStateProvider>');
  return store;
}
