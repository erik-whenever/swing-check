// App root (N-3.6 del 6): ThemeProvider → AppStateProvider → navigation.

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppStateProvider } from '../state';
import { ThemeProvider } from '../ui';
import { Navigation } from './Navigation';

export default function App() {
  return (
    <ThemeProvider>
      <AppStateProvider>
        <SafeAreaProvider>
          <Navigation />
        </SafeAreaProvider>
      </AppStateProvider>
    </ThemeProvider>
  );
}
