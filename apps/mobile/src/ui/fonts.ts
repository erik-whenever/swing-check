import { useFonts } from 'expo-font';
import { Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';

import { outfit } from './tokens';

/**
 * Laddar de Outfit-vikter som typskalan använder. Returnerar true när de är klara.
 * Vid fel (t.ex. dev-klient byggd före expo-font) faller Text tillbaka till systemfont —
 * appen blockeras aldrig av fontladdning.
 */
export function useOutfitFonts(): boolean {
  const [loaded, error] = useFonts({
    [outfit[500]]: Outfit_500Medium,
    [outfit[600]]: Outfit_600SemiBold,
    [outfit[700]]: Outfit_700Bold,
  });
  if (error) {
    // OSÄKER: fel loggas bara i dev. Risk låg — fallbacken är SF Pro i samma vikt.
    if (__DEV__) console.warn('[ui] Outfit kunde inte laddas, systemfont används', error);
    return false;
  }
  return loaded;
}
