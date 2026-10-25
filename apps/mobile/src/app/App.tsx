// App root (N-3.6 del 6, 9): ThemeProvider → AppStateProvider → SpeechProvider → navigation.

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppStateProvider } from '../state';
import { SpeechProvider } from '../tts';
import { ThemeProvider } from '../ui';
import { Navigation } from './Navigation';

export default function App() {
  return (
    <ThemeProvider>
      <AppStateProvider>
        <SpeechProvider>
          <SafeAreaProvider>
            <Navigation />
          </SafeAreaProvider>
        </SpeechProvider>
      </AppStateProvider>
    </ThemeProvider>
  );
}
