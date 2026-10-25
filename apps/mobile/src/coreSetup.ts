// Startup wiring between the native shell and @swingcheck/core — the counterpart of the
// web's src/lib/coreSetup.ts. Imported first in index.ts, before anything renders.
//
// The Worker URL comes from EXPO_PUBLIC_API_URL (inlined by Expo at bundle time, e.g. in
// apps/mobile/.env or an EAS env). Without it the URL is empty: analyzeSwing then throws
// ApiNotConfiguredError before any request, and the rest of the app works locally as usual.
// The API key never reaches the app — all Anthropic traffic goes through the Worker.

import { configureApi } from '@swingcheck/core/lib/api';
import { DEFAULT_ANALYSIS_LANGUAGE, setAnalysisLanguage } from '@swingcheck/core/lib/language';
import { INSTALL_ID_HEADER } from '@swingcheck/core/lib/installId';
import { loadInstallId } from './installId';

/**
 * React Native's fetch sends no Origin header, and the Worker rejects a proxy call without
 * an allowed Origin (403 origin_not_allowed). The app therefore names itself; this value
 * must be on the Worker's ALLOWED_ORIGINS for analysis to work.
 */
// OSÄKER: that iOS (NSURLSession) and Android (OkHttp) pass a hand-set Origin through
// unchanged is expected but unverified on device — risk: 403 on the first real analysis,
// visible immediately; the fallback is a Worker-side change (docs/native/analys-lagring.md).
export const NATIVE_ORIGIN = 'swingcheck://se.swingcheck.app';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();

/**
 * Anonymous identity per installation (W-2). The Worker caps and logs cost per identity
 * once its side lands (docs/native/identitet-w2.md); until then it ignores the header.
 * Only the app sends it — the Worker's CORS does not allow the header, so the web must not.
 */
export const INSTALL_ID = loadInstallId();

configureApi({
  url: API_URL,
  logCost: __DEV__,
  headers: {
    Origin: NATIVE_ORIGIN,
    ...(INSTALL_ID ? { [INSTALL_ID_HEADER]: INSTALL_ID } : {}),
  },
});

// The one place the language is set; the prompt and TTS (ttsConfigFor) both read it.
// A user setting replaces this default in N-3.6.
setAnalysisLanguage(DEFAULT_ANALYSIS_LANGUAGE);
