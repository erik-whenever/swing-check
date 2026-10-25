# TTS-lagret (N-3.6 del 8)

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

`loggingSpeaker()` loggar och löser direkt — **standard nu** (`createDefaultSpeaker()`). En instans per app (en ljudutgång).

## Kö — `queue.ts`

`new SpeechQueue(speaker, { onError? })`:

- `enqueue(utterances, { language, voiceId? })` — FIFO, avbryter aldrig. Livesessionen: sving N talar klart innan N+1 (ADR-003 §5, som webbens `enqueueSpeech`).
- `say(...)` — barge-in: stoppar allt och talar detta. "Läs upp".
- `stop()` — tystar allt; nuvarande och köade jobb löser `'cancelled'`. Hörlursknapp/stoppknapp.
- `pending`, `busy`.
- **Watchdog** per yttrande (≈10 tecken/s, golv 5 s, tak 120 s): en motor som tappar sin klar-signal stoppas och kön går vidare i stället för att tystna resten av sessionen. `// OSÄKER`: budgeten är webbens Web Speech-trimning.
- Motorfel → `onError`, kön fortsätter.

## Koppla in expo-speech (ej gjort)

Medvetet uppskjutet: ett nytt native-beroende parallellt med navigationsarbetet krockar i `apps/mobile/package-lock.json`. När navigationen är mergad:

1. `cd apps/mobile && npx expo install expo-speech` (egen commit; ny dev-build krävs).
2. I `speaker.ts` (markerat `TODO(N-3.6 TTS-motor)`): `expoSpeechSpeaker()` som mappar `speak` → `Speech.speak(text, { language: locale, voice: voiceId, onDone, onStopped, onError })` (promise löses på `onDone`/`onStopped`, rejectas på `onError`) och `stop` → `Speech.stop()`.
3. `createDefaultSpeaker()` returnerar den. Röstval: `Speech.getAvailableVoicesAsync()` filtrerat på `ttsConfigFor(language).langPrefix`.
4. Verifiera på iOS-enhet: hörlurar, tyst-läge-omkopplaren (AVAudioSession-kategori — `// OSÄKER`, kan kräva inställning för att höras i tyst läge), skärm låst under session.

Ingen gesture-unlock behövs (det är en Web Speech/iOS Safari-begränsning, inte native).

## Inte här

Ingen container kopplar in lagret ännu — resultatskärmen och livesessionen ägs av andra delar (`src/screens/`, navigation). De tar `buildSpeechScript` + en delad `SpeechQueue`.
