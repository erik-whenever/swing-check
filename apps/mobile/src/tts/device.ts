// Binds the TTS seam to the real engine (N-3.6 part 9). The only file in src/tts that imports
// a native module — keep it that way so the rest stays testable from the root vitest.

import * as Speech from 'expo-speech';

import { expoSpeechSpeaker, type Speaker } from './speaker';

/**
 * The speaker the app uses. One instance per app — there is one audio output.
 * OSÄKER: expo-speech's default iOS audio session is used (no `useApplicationAudioSession`
 * tuning, no explicit ducking of music). With earbuds on the range that should be right, but
 * it is unverified on device. Risk: medium for G1 — check on an iPhone with AirPods.
 */
export function createDefaultSpeaker(): Speaker {
  return expoSpeechSpeaker(Speech);
}
