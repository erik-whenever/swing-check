# SwingCheck — Handoff / Överlämning

> Aktuell kontext för en ny session. Läs tillsammans med [BACKLOG.md](BACKLOG.md) (auktoritativ för gjort/kvar).
> Stabil arkitektur: [../KONTEXT.md](../KONTEXT.md). Senast uppdaterad: 2026-08-08.

## Tech stack
- **Frontend:** React 19 + TypeScript + Vite 8, Tailwind v4, Zustand (vissa stores `persist`:ade).
- **Backend:** En Cloudflare Worker (`worker/worker.ts`) — proxy mot Anthropic + `/api/log` → D1.
- **AI:** Claude Sonnet 4.5 (`claude-sonnet-4-5`) med prompt caching.
- **Lagring:** IndexedDB (`idb-keyval`) som källa till sanning; Supabase valfri metadataspegling.
- **PWA:** `vite-plugin-pwa`, `registerType: 'prompt'`.

## Fungerar

- **Bildruteval via pose-envelope (Ström D, primär väg).** `frameExtractor.ts` → `selectViaPose`
  (`detectSwingEnvelope` + `selectEnvelopeFrames`). Pixel-diff (`selectViaMotion`) är **fallback**
  och triggar bara vid pose-fel eller `envelope.valid === false` — tyst för användaren, men loggad
  (`log.warn('Frame selection', {path:'pose'|'motion'})`) så fallback-frekvensen är mätbar i fält.
  **Fältverifierad på iPhone:** GPU-delegat, 14,9 fps, 18–21 ms inferens.
- Kamera/inspelning, Claude-analys via Worker-proxy med prompt caching (`api.ts`, `prompt.ts`).
- **Vidvinkel (0,5×)** — `settings.wideAngle` (persisterad) → `lib/cameraZoom.ts` sätter
  `zoom` på den **redan aktiva** videospårningen (ingen enhetsväxling; diagnostiken visar
  `min 0.5 / max 10` på bakre trippelkameran). Halverar ungefär nödvändigt avstånd på range.
  Appliceras i `useCamera` **bara när ingen inspelning pågår** — `applyConstraints` formar om
  exakt den spårning MediaRecorder läser, så ett linsbyte mitt i svingen skulle förstöra klippet.
  En växling under en session tappas inte utan **skjuts upp** till nästa inspelningsstart.
  Saknad zoom-capability = tyst hoppa över (WARN en gång). `Camera zoom applied` loggas på
  **WARN** med både begärt och faktiskt värde (`getSettings().zoom`) — Safari får acceptera
  constrainten och ändå behålla linsen, och `matched:false` är enda sättet att se det i fält.
  Toggle: `components/Camera/WideAngleToggle.tsx` (0.5× / 1×, i sökarens nedre högra hörn).
  Testad i `lib/cameraZoom.test.ts` (klampning, saknad capability, avvikande faktiskt värde).
- Regler: egna + regelbibliotek med drills, kameravinkel-filtrering.
- Historik i IndexedDB + valfri Supabase-spegling av metadata.
- TTS-uppläsning (quick/detailed), val av röst; serialiserad kö i sessionsläge.
- Kontinuerligt sessionsläge (D-5) — se *Pågående*.
- i18n (browser-/geo-detektering), tema + accentfärg, PWA-uppdateringsbanner.

### Regressionsharness — verifiera med `npm test`, inte för hand
Frysta landmark-fixturer i `src/lib/__fixtures__/` (`dtl-full`, `dtl-clipped`, `face-on`,
`session-multi`) körs genom exakt produktionskedjan av `poseEnvelopeRegression.test.ts`,
`poseSegments.test.ts` och `liveSwingDetector.test.ts` (golden envelope/impact/frameCount,
±2 frames tolerans). **Detta ersätter den gamla manuella klippverifieringen** — kör `npm test`
före varje ändring i pose-logiken. Nya fixturer exporteras med knappen i dev-previewen
(`FramePreview.tsx`, bakom `VITE_DEV_PREVIEW`). Dok: [pose-detection.md](pose-detection.md).

## Arkitekturbeslut som styr pose-arbetet

- **[ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md) — envelope som primär selektor.**
  Fas-viktad selektion var skör; envelopen (start = address-avfärd via hastighets-onset backad bakåt,
  finish = high-settle *efter* downswing-passagen) är primär. Värsta fall blir "uniform över svingen",
  aldrig "missad impact". **Impact är polish, aldrig bärande.**
- **[ADR-003](decisions/ADR-003-draft.md) — N svingar i en ström** (hela ADR:n byggd 2026-08-08).
  Segmentering (`poseSegments.ts`) wrappar envelope-logiken i stället för att skriva om den:
  stillnadsöar → burstar → `isSwing`-grind per kandidat. Tre bärande beslut:
  1. **Segmentering före envelope** — `detectSwingEnvelope` är singleton-tillstånd och kollapsar tyst
     över flera svingar; den körs oförändrat *per segment*.
  2. **Impact ingår inte i acceptanskriteriet** — grinden vilar på envelope-struktur
     (valid, ej clippedTail, varaktighet, exkursion, peak, cooldown).
  3. **Handpositionen är en visibility-viktad mittpunkt av båda handlederna.** `primary ?? backup`
     bytte handled per frame och injicerade avståndet mellan handlederna som skenbar hastighet —
     klippets högsta, tagen för impact efter varenda sving.

**Durabla principer** (dyrköpta, gäller framåt): bind gränser till svingsekvensen, aldrig till en
enkel tröskel-passage; varje gräns med ett minimum måste också ha ett maximum; kompensera aldrig en
trasig signal med lösare trösklar.

## Pågående

### Ström D — klar och mergad till `main`
Envelope-selektionen är i produktion, fältverifierad, enhetstestad och regressionsskyddad.
Detaljerad patch-för-patch-historik finns i [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md),
[ADR-003](decisions/ADR-003-draft.md) och [BACKLOG.md](BACKLOG.md) D-1…D-4 — den duplicerades inte hit.

### D-5 — kontinuerligt sessionsläge (ADR-003 §4 + §5)
- **Pass 1 klar** — `store/session.ts` bär `swings: SessionSwing[]`, en livscykel per sving.
  Den globala `isAnalyzing` är borta; det sessionsvida härleds via `selectAnySwingBusy`.
  Ett klipp = en session med exakt en sving → enkelsvingsflödet funktionellt oförändrat.
  `SwingRecord`-formatet orört, sparad historik läses som förut.
- **Pass 2 klar** — live-pose utan seek: `poseRingBuffer.ts` (bunden landmark-historik, ~30 s,
  konstant ~1,9 MB), `livePoseLoop.ts` (rAF + tvåstegstakt 5→15 fps vid rörelse),
  `liveSwingDetector.ts` (inkrementell `detectSessionSwings` + dedupe). Live ger **exakt** samma
  resultat som batch mot alla fixturer. Detektionskostnad 0,4 ms avg. Latens 0,6–1,1 s efter impact
  och det är strukturellt korrekt — grinden förkastar `clippedTail`, så finishen måste sätta sig först.
- **Pass 3 — pågående (kod committad `cbade28`, ej fältverifierad).** Kedjan
  `detektor (rAF)` → *klipp fönster ur chunk-ringen* → `analyskö (seriell)` → `TTS-kö (FIFO)`.
  `videoChunkRing.ts` (bundet ~30 s-fönster, **init-segmentet pinnas** — utan `ftyp`/`moov` är senare
  chunks obrukbara bytes), `analysisQueue.ts` (en sving i taget mot Vision, ett fel stoppar aldrig kön),
  `useSessionCapture.ts` (orkestrering), `Session/SessionSwingList.tsx` (rad per sving, status + latenskedja).
  **`// OSÄKER:`** fMP4-fönsterklippet är giltigt per konstruktion men **ej verifierat på iOS-hårdvara**
  — probe + `Session swing N captured`-loggen finns för att göra ett fel synligt i stället för tyst.
  **Kvar: Erik kör en session på iPhone, 3 svingar utan att stoppa inspelningen**, och läser talad
  feedback per sving, sessionsvyns rader, latenskedjan samt `windowMb`/`ringRetainedMb`.
  - **Avkodningsbugg fixad (2026-08-09).** Fältfallet `windowSec [3.25, 6.42] · chunks 3 ·
    headerPrepended true` gav 17 identiska adressbilder och "no visible swing movement" från Vision:
    `materialize()` valde bara de *överlappande* chunksen, och iOS Safaris ~1 s-chunks (oavsett
    `TIMESLICE_MS=100`) saknar egna nyckelbilder — de kräver kedjan från init-segmentet. Nu tas
    **alla** chunks från `chunks[0]` fram till fönstrets slut; `truncatedStart` betyder bara
    "starten är evict:ad". Kostnaden syns som `leadInChunks` i `Session swing N captured`.
    Retentionen (30 s) sätter fortfarande minnestaket.
- **Pass 4 klar (2026-08-09) — sessionssammanfattning.** `lib/sessionStats.ts` (ren
  modul-singleton, ingen ny store) samlar under sessionen och loggar **en WARN-rad
  `Session summary`** vid `endSession()`: `durationSec`, `swingsDetected/Analyzed/Failed`,
  `detectedMs`/`framesMs`/`visionMs` som `{median, p95}`, `spokenMedianMs`, `poseDetectionRate`,
  `achievedFpsMedian`, `ringEvicted`, `maxWindowMb`, `totalCostUsd`, `failureReasons`.
  **Det är raden att utvärdera ett fälttest mot** — de per-sving-rader som redan finns är rätt
  granularitet för en sving och fel för en 20-minuterssession. Livscykeln ligger i storen
  (`startSession`→`begin()`, `endSession`→`end()`, `lastSummary` för UI:t) eftersom `endSession`
  anropas från tre ställen. Additivt: `api.ts` `options.onUsage` (kostnaden var beräknad men
  aldrig returnerad) och `useLiveSwingDetection.onStats` (vidarebefordrar `LivePoseLoop.onStats`).
  Samma siffror visas på kameravyn efter avslutad session via `Session/SessionSummaryCard.tsx`.

### Ström A — Voice-start
A-1 + A-2 klara (`useMicTrigger`, `EnergyTrigger` + `useEnergyTrigger`): adaptiv amplitud-trigger med
cooldown, kalibrering och TTS-ack. **Ej enhets-/fältverifierad** (mäts i A-5). Nästa: A-3 (röststart i
sessionsläge + `swingStartTimestamp`). Detaljer: [voice-start.md](voice-start.md).
> Notera: ADR-003 omdefinierar röst till **sessionskontroll** ("starta session"), inte per-slag-trigger.

## Öppna trådar

- **Termik vid långa sessioner otestad.** Live-inferens + analysanrop delar GPU; ingen mätning finns
  av vad 10–20 minuters kontinuerlig session gör med telefonens temperatur och takt.
  `Live pose stats` (WARN, var 5:e sek) loggar `achievedFps`/`saturated` för just detta.
- **Pose körs två gånger per klipp** — en gång för selektionen (`poseTrajectory`) och en gång för
  skelett-overlayen i previewen. Dubbelkostnaden är känd och inte adresserad.
- **Supabase: RLS på `swing_records` är på men saknar policies** → alla läsningar nekas och faller
  tyst tillbaka till IndexedDB. **Ingen autentisering** — rader har `user_id = null`. (Ström B)
- **Namnkrock: branchen `stream-e`** användes för D-5-arbetet, men `stream-e` i BACKLOG är
  **Ström E — Vision-kostnad** (E-1 resolution-cap). Döp om branchen eller strömmen innan E-1 startar.
- **iOS Safari PWA ej verifierad** (installation/standalone/splash/safe-area). (Ström C)
- Takt-trösklarna i live-vägen är härledda ur **klipp-fixturer, inte live-kamerabrus** — `// OSÄKER:`-märkta.
- `analysisAngle` ligger fortfarande globalt, inte per sving.

## Bakgrund: varför pixel-diff inte räcker (fallback-vägen)
> Gäller nu **enbart** fallbacken. Full historik: [ADR-0001](adr/0001-motion-based-swing-detection.md).

En pixel-diff-metrik **kan inte se ballträffen**: vid impact rör sig bara en tunn, snabb klubba, så
impact ligger i en motion-*dal* medan follow-throughs kroppsrotation dominerar kurvan. "Motion-toppen
= impact" är därför fundamentalt fel. Fallbacken ankrar i stället på **address-stillheten** (längsta
stilla sekvensen; impact ≈ första rörliga bildrutan efter) och tar ett ±1,2 s-fönster runt den.
Tunables överst i `frameExtractor.ts`. Detta är precis begränsningen som motiverade Ström D.

**Verifiering:** `npm run dev` (aldrig en build — SW-cache serverar gammal kod).
`VITE_DEV_PREVIEW=true` ger bildrute-preview, segmenteringsvy och 🐞 Logs-panelen (visar WARN).

## Komponentstruktur
> Endast de mest centrala filerna; full karta finns i koden.

- `src/App.tsx` — vy-routing via `session`-storens `view` (ingen router).
- `src/store/` — `session` (`swings: SessionSwing[]`, ADR-003 §5.4), `settings`, `rules`, `onboarding`, `toast`.
- `src/hooks/` — `useCamera` (`RecordMode`: klipp **och** session/chunk-ring), `useHistory`, `useRangeMode`,
  `useMicTrigger`/`useEnergyTrigger` (Ström A), `useLiveSwingDetection` (D-5 p2), `useSessionCapture` (D-5 p3).
- `src/lib/` — `frameExtractor`, `api`, `prompt`, `cameraAngle`, `cameraZoom`, `supabase`, `tts`, `i18n`, `logger`, `geo`,
  `audioTrigger`; pose: `poseDetector`/`poseTrajectory`/`poseConnections`/`poseEnvelope`/
  `poseEnvelopeSelection`/`poseSegments`/`poseFrameGrab`; live: `poseRingBuffer`/`livePoseLoop`/
  `liveSwingDetector`; session: `videoChunkRing`/`analysisQueue`/`sessionStats`.
- `src/components/` — `Camera/`, `Analysis/`, `Session/`, `Rules/`, `History/`, `Home/`, `Settings/`, `Onboarding/`.
- `worker/worker.ts` — Anthropic-proxy + `/api/log` (D1).

## Miljövariabler
| Variabel | Krävs | Syfte |
| --- | --- | --- |
| `VITE_API_URL` | ja | Worker-endpoint som proxar Anthropic. |
| `VITE_SUPABASE_URL` | nej | Cross-device-historik (med nyckeln nedan). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nej | Publishable key för Supabase. |
| `VITE_DEV_PREVIEW` | nej | Bildrute-preview, segmenteringsvy + 🐞 Logs-panel. |
| `ANTHROPIC_API_KEY` | ja (Worker) | Secret i Workern — når aldrig klienten. |
| `LOG_READ_KEY` | nej (Worker) | Skyddar `GET /api/log`. |

> **Pose-assets:** `public/wasm/` + `public/models/*.task` är gitignorade och byggs av
> `npm run pose:assets` (körs som `prebuild`). Saknas de i en deploy dör pose-init på båda delegaterna.
