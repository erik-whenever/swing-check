# TTS-lagret (N-3.6 del 8–9)

`apps/mobile/src/tts/` — talad feedback för resultatskärmens **"Läs upp"** och **livesessionen** (hörlursläge, G1). Samma lager för båda; bara manusvarianten skiljer. Rent TS, inga expo-importer → vitest från roten (`tts.test.ts`).

```
SwingAnalysis + språk ──buildSpeechScript──▶ Utterance[] ──SpeechQueue──▶ Speaker ──▶ motor
```

## Manus — `script.ts`

`buildSpeechScript(analysis, { variant, language, swingNumber?, focusRuleId?, ruleTitle? })` → ordnade `{ kind, text }`. Tomma texter emitteras aldrig.

| Variant | Används av | Innehåll |
|---|---|---|
| `live` | Livesession (G1) | Intro ("Sving 3 klart." med `swingNumber`) + `short_verdict` per regel (första meningen av `observation` som reserv). Fokusläge: bara `focus_rule`. |
| `full` | "Läs upp" | Intro, `overall_assessment`, per underkänd regel `observation` (reserv `short_verdict`) + `drill_suggestion`/`suggestion`, sedan "Kunde inte bedömas:" + regelnamn. Inga fel och inget obedömt → "Inga fel hittades." |

- **Språket är en parameter** (`AnalysisLanguage` från `packages/core/src/lib/language.ts`). Containern skickar samma värde som prompten byggdes med (`AppSettings.language`) — modellens ord och de fasta fraserna blandar aldrig språk. Locale till motorn kommer från `ttsConfigFor(language)`.
- **Fasta fraser** (`PHRASES`, sv/en): svenska är ordagrant webbens (`src/lib/tts.ts`). `phraseUtterance()` för statusrader (analyserar, misslyckades, nästa sving).
- Obedömda regler sägs alltid — "inga fel" när inget kunde bedömas vore vilseledande (samma regel som webben).

**Varför en spegel och inte import:** webbens fraslogik ligger i `src/lib/tts.ts`, kopplad till zustand-storarna och hårdkodad svenska — den går inte att importera och flyttas inte nu. `// OSÄKER` i `script.ts`: risk för drift; flytta till `packages/core` när webben görs språkmedveten (webben importerar då core, inte tvärtom).

## Speaker — `speaker.ts`

```ts
interface Speaker {
  speak(req: SpeakRequest): Promise<void>; // löser när klar ELLER stoppad; reject = motorfel
  stop(): void;                             // pågående speak() ska då lösas
}
// SpeakRequest = { text, language, locale, voiceId? }
```

`expoSpeechSpeaker(engine)` — adapter över expo-speech; motorn injiceras (`SpeechEngine`) så `speaker.ts` aldrig importerar native-kod och testas med falsk motor. `speak` → `Speech.speak(text, { language: locale, voice: voiceId, onDone, onStopped, onError })`; löses på `onDone`/`onStopped`, rejectas på `onError`. `stop()` löser pågående `speak` direkt (väntar inte på `onStopped`, som iOS kan tappa); sena callbacks rör bara sin egen closure.

`createDefaultSpeaker()` i `device.ts` (enda filen som importerar `expo-speech`) = `expoSpeechSpeaker(Speech)`. `loggingSpeaker()` finns kvar för förhandsvisningar/test. En instans per app (en ljudutgång).

## Kö — `queue.ts`

`new SpeechQueue(speaker, { onError? })`:

- `enqueue(utterances, { language, voiceId? })` — FIFO, avbryter aldrig. Livesessionen: sving N talar klart innan N+1 (ADR-003 §5, som webbens `enqueueSpeech`).
- `say(...)` — barge-in: stoppar allt och talar detta. "Läs upp".
- `stop()` — tystar allt; nuvarande och köade jobb löser `'cancelled'`. Hörlursknapp/stoppknapp.
- `pending`, `busy`.
- **Watchdog** per yttrande (≈10 tecken/s, golv 5 s, tak 120 s): en motor som tappar sin klar-signal stoppas och kön går vidare i stället för att tystna resten av sessionen. `// OSÄKER`: budgeten är webbens Web Speech-trimning.
- Motorfel → `onError`, kön fortsätter.

## App-koppling — `SpeechProvider.tsx` (del 9)

`<SpeechProvider>` (i `App.tsx`, innanför `AppStateProvider`) äger **en** `SpeechQueue` över `createDefaultSpeaker()`. `useSpeech()` ger `{ queue, language, readAloud, enqueueLive, stop }`; språket kommer från `settings.language` (core `AnalysisLanguage` → `ttsConfigFor().locale`).

- Resultat "Läs upp" → `readAloud(analys, { focusRuleId, ruleTitle })` = `say` med variant `full`. Lämnar man skärmen tystnar uppläsningen.
- Livesession → `enqueueLive(analys, { swingNumber, … })` = `enqueue` med variant `live`. **Inte kopplad än** — TODO i `LiveSessionContainer` tills livepipelinen (N-3.4) finns. Paus/Avsluta anropar `stop()`.

`buildSpeechScript` tar `SpeechSource` (`rules`, `focus_rule`, `overall_assessment`) så en sparad `HistoryEntry` räcker.

## Kvar att verifiera på enhet

expo-speech `~58.0.3` installerad (ny dev-build krävs). Röstval (`getAvailableVoicesAsync()` filtrerat på `langPrefix`) ej gjort — motorns standardröst för locale används. Verifiera på iOS: hörlurar, tyst-läge-omkopplaren (AVAudioSession-kategori — `// OSÄKER` i `device.ts`, standard-ljudsession används), skärm låst under session.

Ingen gesture-unlock behövs (det är en Web Speech/iOS Safari-begränsning, inte native).
