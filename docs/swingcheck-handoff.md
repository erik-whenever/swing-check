# SwingCheck — Handoff / Överlämning

> Aktuell kontext för en ny session. Läs tillsammans med [BACKLOG.md](BACKLOG.md) (auktoritativ för gjort/kvar).
> Stabil arkitektur: [../KONTEXT.md](../KONTEXT.md). Senast uppdaterad: 2026-07-01.

## Tech stack
- **Frontend:** React 19 + TypeScript + Vite 8, Tailwind v4, Zustand (vissa stores `persist`:ade).
- **Backend:** En Cloudflare Worker (`worker/worker.ts`) — proxy mot Anthropic + `/api/log` → D1.
- **AI:** Claude Sonnet 4.5 (`claude-sonnet-4-5`) med prompt caching.
- **Lagring:** IndexedDB (`idb-keyval`) som källa till sanning; Supabase valfri metadataspegling.
- **PWA:** `vite-plugin-pwa`, `registerType: 'prompt'`.

## Fungerar
> Funktionerna finns i kod och är mergade (PR #9–#15). Fält-/enhetsverifiering spåras i [BACKLOG.md](BACKLOG.md).

- Kamera/inspelning, rörelsebaserad bildruteval (`frameExtractor.ts`).
- Claude-analys via Worker-proxy med prompt caching (`api.ts`, `prompt.ts`).
- Regler: egna + regelbibliotek med drills, kameravinkel-filtrering.
- Historik i IndexedDB + valfri Supabase-spegling av metadata.
- TTS-uppläsning (quick/detailed), val av röst.
- Handsfri sessionsläge (autospela in nästa sving).
- i18n (browser-/geo-detektering), tema + accentfärg, PWA-uppdateringsbanner.

## Pågående

### Roadmap (2026-07-07)
- [ROADMAP.md](ROADMAP.md) sekvenserar G1 (personligt rangebruk) → G2 (instruktörssamarbete) med explicita beslutsforkar: pose time-boxad till 2026-07-31 (annars trim-slider), G1-scopefrys vid fältverifierad fångst (senast 2026-08-15), E-1 resolution-cap villkorslöst, WASM-självhost in i D-2. Prioritetsordning: A-3 → A-5/C-2 → E-1 → D-2/D-3 → B → G2. Pose omklassad till primärt G2-tillgång; G1-fångsten ankras på rösttriggern.

### Pågående: Pose-estimering (Ström D)
- **Status:** D-1 pass 1 + D-2 pass 2 (del b) klara. `@mediapipe/tasks-vision` integrerat **vid sidan om** `frameExtractor.ts` (rör den ej). `lib/poseDetector.ts` (singleton, GPU→CPU-fallback, WASM från jsDelivr-CDN), `lib/poseTrajectory.ts` (seekar dold video ~15 fps, 33 punkter/sampel), `lib/poseConnections.ts`. `FramePreview.tsx` ritar skelett-overlay bakom `VITE_DEV_PREVIEW` (dynamisk import → lazy chunk). Modell hämtas via `npm run pose:model` (gitignorad). Laddnings-/inferenstid loggas.
- **Pass 2 (fas-viktad selektion):** *Rättelse — pose drev aldrig selektionen; `frameExtractor.ts` (pixel-diff) väljer de 10 frames som skickas till Claude, pose var overlay-only.* Pass 2 bygger första pose-drivna selektionen som **alternativ**: `lib/posePhases.ts` (`detectSwingPhases` — svingfaser ur handled 15/16), `lib/poseFrameSelection.ts` (`selectPhaseWeightedFrames` — fas-viktad allokering, impact-kluster, graceful even-fallback), `lib/poseFrameGrab.ts`. A/B-toggle Even↔Phase-weighted i dev-preview (default even); summary + `PoseSelect` WARN-logg med fas-gränser/allokering/timestamps. Når **ej** default-vägen (pass 3, gated på Eriks verifiering). Bygger + lintar rent; **ej fältverifierad**.
- **Pass 2-buggfix (2026-07-08):** verkligt 30fps-klipp visade `top`/`impact`/`ft` kollapsade till klippslutet (top 3.00 · impact 3.07 · ft 3.07) → fallbacken missade impact. Leadhypotes: apex (min y) låste på follow-through-**finishen**, inte baksvingstoppen. Åtgärdat med `vy>0`-gate + min-downswing-tid + uniform fallback.
- **Pass 3 — ARKITEKTUR-INVERTERING (2026-07-14, [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md)):** tre rundor heuristik-patchning visade att fas-viktad-som-primär är skör; root cause = global min-y låser på finishen, inte toppen — och finishen är den *mest* tillförlitliga landmarken. **Fas-viktad-som-primär ersatt av envelope-som-primär.** `posePhases.ts`→`poseEnvelope.ts` (`detectSwingEnvelope`: start=baksving-onset, finish=globalt min-y+settle med avklippt-skydd, confident-only impact via nedåtpass nära address-höjd). `poseFrameSelection.ts`→`poseEnvelopeSelection.ts` (`selectEnvelopeFrames`: uniform-inom-envelopen baslinje + impact-kluster endast när confident; `impactClusterApplied`). A/B-toggle nu **even ↔ envelope** (default even). Konsekvens: värsta fall = "uniform över svingen", inte "missad impact". Bakom `VITE_DEV_PREVIEW`, `frameExtractor.ts` orörd. Logik-sanity-testad (syntetiska banor); bygger + lintar rent; **ej fältverifierad**.
- **D-2 (a) WASM-självhost klar (2026-08-02):** WASM-runtimen självhostas nu (`public/wasm/` via `npm run pose:wasm`/`scripts/copy-pose-wasm.mjs`, gitignorad); `FilesetResolver.forVisionTasks('/wasm')` → egen origin, **inga jsDelivr-requests**. `vite.config.ts`→`workbox` precachar modell + SIMD-wasm (`maximumFileSizeToCacheInBytes` 12 MB), runtime-cachar nosimd. `npm run pose:assets` (model+wasm) körs före build. Byggverifierat (precache 17.7 MB/19 entries); **ej browser-/offline-fältverifierad**.
- **Pass 3 finish-kollaps-fix (2026-08-02, ADR-002 *Uppföljning*):** verkligt DTL-klipp kollapsade envelopen till `[6.98→7.38]` (bara baksvingen, "no descending pass"). Root cause: globalt min-y har TVÅ jämförbara maxima (baksvingstopp + finish) → finishen snappade bakåt till toppen och tömde det bundna impact-fönstret. Fix (strukturell): finish binds till svingsekvensen — downswing-passagen hittas FÖRST över hela spannet, finish = high-settle EFTER den. Endast `poseEnvelope.ts`; `FINISH_MIN_HOLD_FRAMES` in, `APEX_PLATEAU_TOL`/`SETTLE_MIN_FRAMES` ut. Build+lint rena; **ej fältverifierad**.
- **Pass 3 start-fix (2026-08-02, ADR-002 *Uppföljning*):** spegelbild-bugg i andra änden — samma DTL-klipp startade envelopen mitt i baksvingen och missade take-away (klubban redan lyft). Root cause: `start` = backsving-hastighetströskel; take-away är långsam → under tröskel → start hoppade in efter take-away. Fix (strukturell): start = address-AVFÄRDEN — första framen vars wrist-Y lämnar platå-medel-Y > `ADDRESS_DEPART_TOL` (0.03). Endast `poseEnvelope.ts`; downswing/finish orört. Build+lint rena; **ej fältverifierad**. Durabel princip generaliserad: bind BÅDE start och finish till svingsekvensen, aldrig till hastighetströsklar (långsamma faser — take-away, transition — ligger under tröskel och kapas).
- **Pass 3 start-fix waggle (2026-08-02, ADR-002 *Uppföljning*):** efter start-fixen fyrade starten för TIDIGT — ~3 waggle-frames före take-away på samma DTL-klipp `[1.60→8.38]`. Root cause: `ADDRESS_DEPART_TOL` är en enkel tröskel-passage → pre-sving-jitter triggade start. Fix (samma min-hold-anda som finish-fixen): start = första framen i en körning av `START_MIN_SUSTAIN_FRAMES` (3) frames där wrist-Y ligger över platån i take-away-riktning (uppåt) > `ADDRESS_DEPART_TOL`; en blip som återgår nollställer körningen. Endast `poseEnvelope.ts`; downswing/impact/finish orört. Build ren, poseEnvelope.ts lint-ren; **ej fältverifierad**. Skärper durabel princip: bind aldrig en gräns till en enkel tröskel-passage — kräv ett ihållande, riktat skeende (min-hold i båda ändar).
- **Pass 3 start-fix inverterad → sedan REVERT:AT (2026-08-02, ADR-002 *Uppföljning*):** waggle-fixen ovan överkorrigerade (start nära baksvingstoppen; take-away ej monoton vid 15 fps). Ersattes först av `WAGGLE_LOOKAHEAD_FRAMES` (tolerant lookahead) — men det gjorde starten katastrofalt sen IGEN (`[7.18→8.38]`, första framen mitt i baksvingen). Root cause: i DTL rör sig take-away nästan rakt BAKÅT → y kryper knappt över tröskeln, så varje y-baserat waggle-test (sustain ELLER lookahead) läser take-away som waggle-retur och kapar den. **Y-only är fel signal för take-away-start i DTL.** Slutlig fix: **inget waggle-filter** — start = första address-avfärden, ofiltrerad → `[1.60→8.38]` (hela svingen, ~3 tidiga adress-frames = accepterad early-bias, princip #3). Känd svaghet: waggle kan ge några extra adress-frames tills en bättre signal (riktning i planet) finns. `poseEnvelope.ts` enbart. Build+lint rena; **ej fältverifierad**.
- **Pass 3 dev-preview frame-budget → 20 (2026-08-02):** envelope-selektionens frame-antal höjt 10→20 via EN exporterad konstant `ENVELOPE_FRAME_BUDGET` (poseEnvelopeSelection.ts), konsumerad av `FramePreview` — sizer både selektion + grid-rendering (previewen visar alla 20). Allokeringen skalar parametriskt; impact-klustret får fortsatt `IMPACT_CLUSTER_BUDGET_FRAC` (0.4 → 8/20). Dev-preview only; `frameExtractor.ts`/Vision-anropet orört. Build+lint rena.
- **Pass 3 start-fix SLUTLIG — hastighet, inte Y (2026-08-02, ADR-002 *Uppföljning: wrist-Y ... oanvändbar för start* + princip #2b):** TEMP-diagnostik (bakom `VITE_DEV_PREVIEW`, `[START-DIAG]`-loggar) på DTL-klippet (144 frames) avgjorde efter fyra gissningar. Data: 6,9 s adress där wrist-Y **driftar** `0.380→0.425` (0.045 > TOL 0.03) → bidir fyrar på driften (`t=1.60`), riktat kräver stigande händer (`t=7.18`). Wrist-SPEED separerar rent. Fix: `ADDRESS_DEPART_TOL`-logiken ut ur start; start = hastighetsbaserad onset (`speedSm ≥ speedThresh`) **backad bakåt** medan föregående `speedSm > START_QUIET_FLOOR` (ny tunbar 0.04) → frame 102–103 (`t≈6.78–6.85`). Vänder "aldrig hastighet för start" (rätt observation, fel slutsats): position mot platå-medel misslyckas fundamentalt (drift), hastighet är rätt signal — läs onset + backa. Bonus: impact = framen där y **korsar tillbaka genom addressY** (ej `passIdx`/max-vy). `ADDRESS_DEPART_TOL` + diagnostiken kvar tills Erik verifierat. `poseEnvelope.ts` enbart; downswing/finish orört. Build+lint rena; **ej fältverifierad**.
- **Pass 3 falsk impact på avklippt klipp (2026-08-05, ADR-002 *Uppföljning: falsk impact på avklippt klipp*):** avklippt DTL-klipp (slutar före träff) gav `[3.53→4.27] · clipped tail · impact 4.27` — impact pinnad till sista framen. Root cause: impact-crossing-fixen hade kvar fallback `impactIdx = passIdx`. Fix (3 lager → `impact=null` → uniform baslinje): (1) ingen fallback (`impactIdx` startar `-1`, sätts bara av faktisk korsning inom envelopen); (2) `clippedTail=true` ⇒ aldrig verifierad impact; (3) slut-marginal `IMPACT_END_MARGIN_FRAMES` (2). Verifierat syntetiskt (esbuild+node): full → confident impact, avklippt → `clippedTail`, `impact=null`. `poseEnvelope.ts` enbart; `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda. Build+lint rena; **ej fältverifierad**.
- **Nästa:** Erik verifierar via `npm run dev` (envelope-toggle på): (a) avklippt klipp → "envelope · uniform baseline · clipped tail" utan impact, frames jämnt över `[3.53→4.27]`; (b) oavklippt DTL → `[6.72→8.38]`, impact 7.78; läs `[START-DIAG]`-loggarna (`startSecChosen ≈ 6.8`, `spd`-rampen) → **ta bort TEMP-diagnostiken + `ADDRESS_DEPART_TOL`**; enhetstest på envelope-/settle-/impact-logiken; 20-klipp-utvärdering + D-3-cutover. Detaljer i [pose-detection.md](pose-detection.md).

### Pågående: Voice-start
- **Ström A, status:** A-1 + A-2 klara. A-1 `useMicTrigger` gör mic-capture + normaliserad RMS-energiström (0–1). A-2 lägger `EnergyTrigger` (`src/lib/audioTrigger.ts`, ren/testbar) + `useEnergyTrigger` (`src/hooks/useEnergyTrigger.ts`) ovanpå: adaptiv baslinje-trigger på amplitud-spik, cooldown, kalibrering, TTS-ack "Startar inspelning" + puls, läs/skrivbar config (`thresholdFactor`/`cooldownMs`/`absoluteFloor`). Bygger + lintar rent; **ej enhets-/fältverifierad** (iOS-tap + range-brus mäts i A-5, kräver Eriks telefon via `npm run dev`). Nästa: A-3 (integrera röststart i session-läge + `swingStartTimestamp`). Detaljer i [voice-start.md](voice-start.md).

## Kritiskt olöst

### Swing detection
> Tidigare egen handoff (`swing-detection-handoff.md`), nu inlemmad här. Senast uppdaterad: 2026-06-01.

**Mål:** `src/lib/frameExtractor.ts` ska välja 10 bildrutor som faktiskt täcker svingen
(address → backswing → top → downswing → impact → follow-through). För klipp längre än
~6 s valde den gamla logiken fel. Vald väg: **rörelsebaserad omarbetning utan nya beroenden**
(framför pose-estimering), för scenariot *en riktig sving + lång setup*. Se även [ADR-0001](adr/0001-motion-based-swing-detection.md).

**Kärninsikten (viktigast):** en pixel-diff-rörelsemetrik **kan inte se ballträffen**. Vid
impact rör sig bara en tunn, snabb klubba → få pixlar ändras → impact ligger i en motion-**dal**.
Den stora kroppsrotationen i **follow-through** dominerar metriken. Därför är "hitta motion-toppen =
impact" fundamentalt fel — den landar på follow-through. Det metriken *ser* pålitligt: **address** =
den långa stillheten före svingen; **follow-through** = den stora rörelsen efter impact; **impact** =
övergången mellan dem. → Vi ankrar på **address-stillheten**, inte motion-toppen.

**Nuvarande approach (implementerad i `frameExtractor.ts`):**
1. Nedskalad motion-canvas (~360 px) — vid full 1080p gör sensor-/codec-brus att ~12 % av pixlarna
   "ändras" varje bildruta även när allt är stilla; nedskalning medelvärdar bort det.
2. Motion-metrik = andel centrumviktade pixlar vars luma ändrats över tröskel, efter subtraktion av
   global ljusförskjutning (robust mot autoexponering/vitbalans).
3. Grov skanning av hela klippet (12 fps, capped) → utjämnad motion-kurva.
4. Address = längsta sammanhängande "stilla"-sekvens; `impact ≈ första rörliga bildrutan efter`.
   Fallback till global motion-topp om ingen tydlig stillhet finns.
5. Fönster = `[impact − 1.2 s, impact + 1.2 s]`, trimmat om rörelsen lägger sig igen.
6. 10 bildrutor jämnt spridda; närmast uppskattad impact tvingas till `impact`-etiketten.

Tunables överst i filen: `SWING_PRE_SEC`, `SWING_POST_SEC`, `MIN_STILL_SEC`, `SETTLE_SKIP_SEC`,
`MOTION_PIXEL_THRESHOLD`, `MOTION_MAX_DIM`.

**Status:** Address-ankrad detektering bygger + lintar rent, men är **inte verifierad** på testklipp
av användaren. Förväntat resultat på testklippet (9.58 s, impact ≈ 6–7 s): frames ~5.8–8.2 s.
Om den ändå missar svingen → **eskalera till pose-estimering** (MediaPipe Tasks Vision / MoveNet
in-browser) för att spåra klubba/händer och hitta impact direkt. **Denna eskalering utforskas nu i
Ström D** (byggs vid sidan om `frameExtractor.ts`); se [pose-detection.md](pose-detection.md).

**Verifiering:** `npm run dev` (ej build — SW-cache). `VITE_DEV_PREVIEW=true` visar bildrute-preview +
🐞 Logs. Ladda upp klipp, filtrera modul `FrameExtractor`, läs WARN `"Swing detection summary"`
(`impactSec`, `frameTimesSec`, `curveDigest`, `usedFallback`).

**Återstående städning:** WARN-loggarna `"Swing detection summary"` + `curveDigest` + `topPeaks` är
tuning-debug — nedgradera till `debug` eller ta bort före merge. Ändringarna lever okommittade i
working tree på `main`; gren av innan commit.

_(Övriga kritiska/olösta punkter fylls i allteftersom de uppstår.)_

## Känd teknisk skuld
> Sammanställd från [BACKLOG.md](BACKLOG.md); fylls på vid behov.

- **RLS på `swing_records` är på men saknar policies** → alla läsningar nekas, faller tyst tillbaka till IndexedDB. (Ström B)
- **Ingen autentisering** — Supabase-rader har `user_id = null`. (Ström B)
- ~~App-ikon är emoji (🏌️) med renderingsrisk per plattform.~~ **Löst (C-1):** emoji renderas till statiska PNG:er vid bygge (ingen runtime-varians); dedikerad full-bleed maskable-ikon tillagd. (Ström C)
- **iOS Safari PWA ej verifierad** (installation/standalone/splash/safe-area). (Ström C)
- **Okommitterad swingdetektering** i working tree + kvarvarande tuning-WARN-loggar (se ovan).

## Komponentstruktur
> Endast de mest centrala filerna; full karta finns i koden.

- `src/App.tsx` — vy-routing via `session`-storens `view` (ingen router).
- `src/store/` — `session`, `settings`, `rules`, `onboarding`, `toast` (Zustand).
- `src/hooks/` — `useCamera`, `useHistory`, `useRangeMode`, `useMicTrigger` (Ström A, mic-capture + RMS-energiström), `useEnergyTrigger` (Ström A, energi-trigger ovanpå A-1).
- `src/lib/` — `frameExtractor`, `api`, `prompt`, `cameraAngle`, `supabase`, `tts`, `i18n`, `logger`, `geo`, `audioTrigger` (Ström A, `EnergyTrigger`), `poseDetector`/`poseTrajectory`/`poseConnections`/`poseEnvelope`/`poseEnvelopeSelection`/`poseFrameGrab` (Ström D, pose-estimering).
- `src/components/` — `Camera/`, `Analysis/`, `Rules/`, `History/`, `Home/`, `Settings/`, `Onboarding/`.
- `src/data/ruleLibrary.ts` — fördefinierade regler + drills.
- `worker/worker.ts` — Anthropic-proxy + `/api/log` (D1).

_(Nya filer från Ström A/B/C läggs till av respektive session — t.ex. `hooks/useMicTrigger.ts`, `store/auth.ts`.)_

## Miljövariabler
| Variabel | Krävs | Syfte |
| --- | --- | --- |
| `VITE_API_URL` | ja | Worker-endpoint som proxar Anthropic. |
| `VITE_SUPABASE_URL` | nej | Cross-device-historik (med nyckeln nedan). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nej | Publishable key för Supabase. |
| `VITE_DEV_PREVIEW` | nej | Bildrute-preview + 🐞 Logs-panel. |
| `ANTHROPIC_API_KEY` | ja (Worker) | Secret i Workern — når aldrig klienten. |
| `LOG_READ_KEY` | nej (Worker) | Skyddar `GET /api/log`. |
