// TTS layer (N-3.6 parts 8–9): script builder → queue → Speaker (expo-speech). See docs/native/tts.md.
export * from './script';
export * from './speaker';
export * from './queue';
export { createDefaultSpeaker } from './device';
export { SpeechProvider, useSpeech, type SpeechApi } from './SpeechProvider';
